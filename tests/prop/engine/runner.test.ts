/**
 * The spec of a run: its phases, its counts and each of its outcomes. The
 * counts are those of the definition's reference implementation on the
 * same bodies and seeds.
 */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  Case,
  DECODE,
  Generating,
  MAX_CHOICES,
  Replaying,
} from "../../../src/prop/engine/case.js";
import {
  type Choice,
  FloatBounds,
  IntegerBounds,
} from "../../../src/prop/engine/choice.js";
import { Sizes } from "../../../src/prop/engine/collection.js";
import {
  type Body,
  type Execution,
  execute,
  type Phase,
  type Status,
} from "../../../src/prop/engine/execution.js";
import {
  Bool,
  Float,
  Integer,
  List,
  SampledFrom,
} from "../../../src/prop/engine/generator.js";
import {
  concludeCase,
  DEFAULT_CASES,
  knownCases,
  type Outcome,
  type Requirement,
  resolve,
  run,
  runStored,
  type Settings,
  shortfallOf,
  Tally,
  Values,
} from "../../../src/prop/engine/runner.js";
import { caseSource } from "../../../src/prop/engine/source.js";
import { decode } from "../../../src/prop/engine/token.js";
import { TraceError, Tracing } from "../../../src/prop/engine/trace.js";
import { drive } from "../../../src/prop/engine/work.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

const SEED = 7n;
const DIGIT = new Integer(new IntegerBounds(0n, 9n));
const DIGITS = new List(DIGIT, new Sizes(0, 8));
const BOOLEAN = new Bool({ num: 1n, den: 2n });
const THREE = new SampledFrom([1n, 2n, 3n]);
const WIDE = new Integer(new IntegerBounds(0n, 2n ** 32n));
const MILLION = 1_000_000n;

/** Returns a body of a function that returns nothing. */
function body(fn: (c: Case) => void): Body {
  return (c) => {
    fn(c);
    return undefined;
  };
}

/** Returns integer choices of values. */
function integers(...values: bigint[]): Choice[] {
  return values.map((value) => ({ kind: "integer", value }));
}

/** The calls of the body that a run made, each with its phase and its status. */
class Seen {
  readonly calls: [Phase, Status][] = [];

  /** Keeps one call. */
  readonly observer = (phase: Phase, execution: Execution): void => {
    this.calls.push([phase, execution.status]);
  };

  /** The phase of every call, in order. */
  get phases(): Phase[] {
    return this.calls.map(([phase]) => phase);
  }
}

/** Returns the outcome of a run. */
function ran(of: Body, settings: Settings, seen?: Seen): Promise<Outcome> {
  return drive(run(of, settings, seen?.observer));
}

const passes = body((c) => {
  c.draw(DIGITS, "digits");
});

const aboveMillion = body((c) => {
  if (c.draw(WIDE, "n") > MILLION) c.fail("big");
});

/** A body that classifies each tenth of the wide integers. */
const tenths = body((c) => {
  if (c.draw(WIDE, "n") % 10n === 0n) c.classify("tenth");
});

describe("runner", () => {
  describe("DEFAULT_CASES", () => {
    it("aims for 100 valid cases", ({ seat }) => {
      check.equal(seat, DEFAULT_CASES, 100, "the cases");
    });
  });

  describe("new Values", () => {
    it("keeps the values of the draws", ({ seat }) => {
      check.equal(seat, new Values([1n, "x"]).values, [1n, "x"], "two values");
    });
  });

  describe("resolve", () => {
    it("fills in every default", ({ seat }) => {
      check.equal(
        seat,
        resolve({ seed: SEED }),
        {
          seed: SEED,
          cases: 100,
          maxChoices: MAX_CHOICES,
          requirements: [],
          traces: [],
          examples: [],
          stored: [],
          shrink: 2000,
          shrinkTime: 0,
          explain: true,
          replay: undefined,
        },
        "the defaults",
      );
    });

    it("throws a RangeError for a run of no case", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => resolve({ seed: SEED, cases: 0 })),
        "prop: a run of 0 cases tests nothing",
        "the refusal",
      );
    });
  });

  describe("knownCases", () => {
    it("returns the stored cases after every case of the example phase", ({ seat }) => {
      const known = knownCases(
        resolve({
          seed: SEED,
          traces: [[{ label: "n", value: 5n }]],
          examples: [integers(3n), new Values([4n])],
          stored: [integers(6n)],
        }),
      );

      check.equal(
        seat,
        known.map(([phase, provider]) => [phase, provider.constructor.name]),
        [
          ["example", Tracing.name],
          ["example", "Replaying"],
          ["example", "Valuing"],
          ["stored", "Replaying"],
        ],
        "four cases",
      );
    });
  });

  describe("new Tally", () => {
    it("counts no case of its seed", ({ seat }) => {
      const tally = new Tally(SEED);

      check.equal(
        seat,
        [tally.seed, tally.valid, tally.rejected, tally.requested, tally.labels.size],
        [SEED, 0, 0, false, 0],
        "nothing counted",
      );
    });
  });

  describe("Tally.failureWithoutCounterexample", () => {
    it("returns rejected for more than ten rejections per valid case", async ({
      seat,
    }) => {
      const tally = new Tally(SEED);
      const rejects = body((c) => {
        c.draw(DIGIT, "n");
        c.assume(false);
      });
      tally.take(await drive(execute(passes, new Replaying([]), MAX_CHOICES)));
      for (let i = 0; i < 10; i += 1)
        tally.take(await drive(execute(rejects, new Replaying([]), MAX_CHOICES)));
      const atLimit = tally.failureWithoutCounterexample();
      tally.take(await drive(execute(rejects, new Replaying([]), MAX_CHOICES)));

      check.equal(
        seat,
        [atLimit, tally.failureWithoutCounterexample()?.kind],
        [undefined, "rejected"],
        "ten per valid case, then eleven",
      );
    });

    it("returns vacuous for a run whose cases requested no input", async ({ seat }) => {
      const tally = new Tally(SEED);
      tally.take(
        await drive(
          execute(
            body(() => undefined),
            new Replaying([]),
            MAX_CHOICES,
          ),
        ),
      );

      check.equal(
        seat,
        tally.failureWithoutCounterexample()?.kind,
        "vacuous",
        "nothing drawn",
      );
    });
  });

  describe("shortfallOf", () => {
    it("returns the first requirement that the counts leave unmet", ({ seat }) => {
      const tally = new Tally(SEED);
      tally.valid = 10;
      tally.labels.set("seven", 1);
      const requirements: Requirement[] = [
        { label: "seven", share: 0.1 },
        { label: "never", share: 0.5 },
      ];

      check.equal(
        seat,
        shortfallOf(tally, requirements, true, true),
        [
          {
            requirement: { label: "never", share: 0.5 },
            counted: 0,
            valid: 10,
            verdict: "unmet",
          },
          false,
        ],
        "the second requirement",
      );
    });

    it("reports that the counts meet every requirement", ({ seat }) => {
      const tally = new Tally(SEED);
      tally.valid = 10;
      tally.labels.set("seven", 1);

      check.equal(
        seat,
        shortfallOf(tally, [{ label: "seven", share: 0.1 }], true, true),
        [undefined, true],
        "all met",
      );
    });
  });

  describe("run", () => {
    it("passes a body that never fails after the default number of cases", async ({
      seat,
    }) => {
      const outcome = await ran(passes, { seed: SEED });

      check.equal(
        seat,
        [outcome.kind, outcome.cases],
        ["passed", 100],
        "100 valid cases",
      );
    });

    it("passes an exhausted domain after its inputs", async ({ seat }) => {
      const outcome = await ran(
        body((c) => {
          c.draw(BOOLEAN, "flag");
          c.draw(THREE, "one of three");
        }),
        { seed: SEED },
      );

      check.equal(seat, [outcome.kind, outcome.cases], ["passed", 6], "six inputs");
    });

    it("counts no repeated case", async ({ seat }) => {
      const outcome = await ran(
        body((c) => {
          c.draw(BOOLEAN, "flag");
        }),
        { seed: SEED },
      );

      check.equal(seat, outcome.cases, 2, "a boolean has two inputs");
    });

    it("stops generating after ten times the cases", async ({ seat }) => {
      let calls = 0;
      const one = new Float(new FloatBounds(1, 1));
      const outcome = await ran(
        body((c) => {
          calls += 1;
          c.draw(one, "one");
        }),
        { seed: SEED, cases: 20 },
      );

      check.equal(
        seat,
        [outcome.kind, outcome.cases, calls],
        ["passed", 1, 1 + 4 + 10 * 20],
        "the simplest case, the edges and 200 random cases",
      );
    });

    it("finds a failure on the empty input in the simplest case", async ({ seat }) => {
      const outcome = await ran(
        body((c) => {
          if (c.draw(DIGITS, "digits").length === 0) c.fail("empty");
        }),
        { seed: SEED },
      );

      check.equal(
        seat,
        [outcome.kind, outcome.cases, outcome.failing?.case.choices],
        ["counterexample", 0, integers(0n)],
        "the first case",
      );
    });

    it("finds an overflow at the maximum in an edge case", async ({ seat }) => {
      const outcome = await ran(
        body((c) => {
          if (c.draw(WIDE, "n") === 2n ** 32n) c.fail("overflow");
        }),
        { seed: SEED },
      );

      check.equal(
        seat,
        [outcome.kind, outcome.cases],
        ["counterexample", 3],
        "edge case 1 after three valid cases",
      );
    });

    it("reports the case and the identity of a random failure", async ({ seat }) => {
      const outcome = await ran(
        body((c) => {
          const digits = c.draw(DIGITS, "digits");
          if (digits.reduce((sum, digit) => sum + digit, 0n) > 10n) c.fail("sum-above");
        }),
        { seed: SEED },
      );
      const drawn = outcome.failing?.case.draws[0]?.value as bigint[];

      check.equal(
        seat,
        [
          outcome.kind,
          outcome.failing?.failure?.identity,
          drawn.reduce((sum, digit) => sum + digit, 0n) > 10n,
        ],
        ["counterexample", "sum-above", true],
        "a sum above 10",
      );
    });

    it("runs a stored failing case before any generated case", async ({ seat }) => {
      const outcome = await ran(
        body((c) => {
          if (c.draw(DIGIT, "n") === 7n) c.fail("seven");
        }),
        { seed: SEED, stored: [integers(7n)] },
      );

      check.equal(
        seat,
        [outcome.kind, outcome.cases, outcome.stored.length],
        ["counterexample", 0, 1],
        "the stored case",
      );
    });

    it("decodes random case i from the stream of the seed plus i", async ({ seat }) => {
      const execution = await drive(
        execute(passes, new Generating(caseSource(SEED, 3n)), MAX_CHOICES),
      );

      check.equal(
        seat,
        execution.case.draws[0]?.value,
        DIGITS[DECODE](new Case(new Generating(caseSource(SEED, 3n)))),
        "the same digits",
      );
    });

    it("fills a prefix case with target choices after its random prefix", async ({
      seat,
    }) => {
      const nonzeroThenZero = body((c) => {
        const n = c.draw(WIDE, "n");
        if (n !== 0n && c.draw(WIDE, "m") === 0n) c.fail("zero after nonzero");
      });
      const outcome = await ran(nonzeroThenZero, { seed: SEED, shrink: 0 });
      const first = WIDE[DECODE](new Case(new Generating(caseSource(SEED, 0n))));

      check.equal(
        seat,
        [outcome.kind, outcome.cases, outcome.failing?.case.choices],
        ["counterexample", 2, integers(first, 0n)],
        "prefix case 0",
      );
    });

    it("runs a prefix case while the valid cases equal the limit", async ({ seat }) => {
      const nonzeroThenZero = body((c) => {
        const n = c.draw(WIDE, "n");
        if (n !== 0n && c.draw(WIDE, "m") === 0n) c.fail("zero after nonzero");
      });
      const outcome = await ran(nonzeroThenZero, { seed: SEED, cases: 20, shrink: 0 });

      check.equal(
        seat,
        [outcome.kind, outcome.cases],
        ["counterexample", 2],
        "20 cases allow two",
      );
    });

    it("runs every edge case when the random cases stop first", async ({ seat }) => {
      const seen = new Seen();
      const outcome = await ran(
        body((c) => {
          c.draw(WIDE, "n");
        }),
        { seed: SEED, cases: 1 },
        seen,
      );

      check.equal(
        seat,
        [outcome.kind, seen.phases],
        ["passed", ["simplest", "edge", "edge", "edge", "edge"]],
        "the simplest case, then four edges",
      );
    });

    it("ends the run at an edge case after the random cases stop", async ({ seat }) => {
      const seen = new Seen();
      const outcome = await ran(
        body((c) => {
          if (c.draw(WIDE, "n") === 2n ** 32n) c.fail("overflow");
        }),
        { seed: SEED, cases: 1, shrink: 0 },
        seen,
      );

      check.equal(
        seat,
        [outcome.kind, seen.phases],
        ["counterexample", ["simplest", "edge", "edge"]],
        "the edge of the maximum",
      );
    });

    it("returns rejected for a body that rejects every case", async ({ seat }) => {
      const outcome = await ran(
        body((c) => {
          c.draw(DIGITS, "digits");
          c.assume(false);
        }),
        { seed: SEED, cases: 10 },
      );

      check.equal(seat, outcome.kind, "rejected", "every case rejected");
    });

    it("returns rejected for cases past their cap", async ({ seat }) => {
      check.equal(
        seat,
        (await ran(passes, { seed: SEED, maxChoices: 3 })).kind,
        "rejected",
        "lists overrun three choices",
      );
    });

    it("returns vacuous for a body that requests no input", async ({ seat }) => {
      const outcome = await ran(
        body(() => undefined),
        { seed: SEED },
      );

      check.equal(
        seat,
        [outcome.kind, outcome.cases],
        ["vacuous", 1],
        "one case and nothing drawn",
      );
    });

    it("passes a body that only reads the random source", async ({ seat }) => {
      const outcome = await ran(
        body((c) => {
          c.random();
        }),
        { seed: SEED },
      );

      check.equal(
        seat,
        [outcome.kind, outcome.cases],
        ["passed", 100],
        "its choices are inputs",
      );
    });

    it("returns flaky for a body that requests different choices", async ({ seat }) => {
      let calls = 0;
      const outcome = await ran(
        body((c) => {
          calls += 1;
          if (calls === 1) c.draw(DIGIT, "n");
          else c.draw(BOOLEAN, "n");
        }),
        { seed: SEED },
      );

      check.equal(
        seat,
        [outcome.kind, outcome.divergence?.index],
        ["flaky", 0],
        "the first request diverges",
      );
    });

    it("returns flaky for a failure whose replay passes", async ({ seat }) => {
      let calls = 0;
      const outcome = await ran(
        body((c) => {
          calls += 1;
          c.draw(WIDE, "n");
          if (calls === 2) c.fail("second");
        }),
        { seed: SEED },
      );

      check.equal(
        seat,
        [outcome.kind, outcome.divergence?.what],
        ["flaky", "verdict"],
        "the replay passes",
      );
    });

    it("passes a requirement that the share meets", async ({ seat }) => {
      const even = body((c) => {
        if (c.draw(WIDE, "n") % 2n === 0n) c.classify("even");
      });
      const outcome = await ran(even, {
        seed: SEED,
        requirements: [{ label: "even", share: 0.2 }],
      });

      check.equal(
        seat,
        [outcome.kind, outcome.cases],
        ["passed", 100],
        "half the integers are even",
      );
    });

    it("returns coverage-unmet for a label never counted", async ({ seat }) => {
      const outcome = await ran(passes, {
        seed: SEED,
        requirements: [{ label: "never", share: 0.5 }],
      });

      check.equal(
        seat,
        [
          outcome.kind,
          outcome.shortfall?.requirement.label,
          outcome.shortfall?.counted,
        ],
        ["coverage-unmet", "never", 0],
        "the label and its count",
      );
    });

    it("compares the exact shares of an exhausted domain", async ({ seat }) => {
      const sevens = body((c) => {
        if (c.draw(DIGIT, "n") === 7n) c.classify("seven");
      });
      const met = await ran(sevens, {
        seed: SEED,
        requirements: [{ label: "seven", share: 0.1 }],
      });
      const unmet = await ran(sevens, {
        seed: SEED,
        requirements: [{ label: "seven", share: 0.2 }],
      });

      check.equal(
        seat,
        [met.kind, unmet.kind, unmet.cases],
        ["passed", "coverage-unmet", 10],
        "10% of ten digits",
      );
    });

    it("runs an undecided requirement up to the last check", async ({ seat }) => {
      const outcome = await ran(tenths, {
        seed: SEED,
        cases: 50,
        requirements: [{ label: "tenth", share: 0.1 }],
      });

      check.equal(seat, outcome.cases, 400, "eight times the cases");
    });

    it("decides an undecided requirement by its share at the last check", async ({
      seat,
    }) => {
      const outcome = await ran(tenths, {
        seed: SEED,
        cases: 50,
        requirements: [{ label: "tenth", share: 0.12 }],
      });

      check.equal(
        seat,
        [
          outcome.shortfall?.counted,
          outcome.shortfall?.valid,
          outcome.shortfall?.verdict,
        ],
        [43, 400, "unmet"],
        "43 of 400 is below nine tenths of 12%",
      );
    });

    it("runs the random cases after the first check as coverage cases", async ({
      seat,
    }) => {
      const seen = new Seen();
      await ran(
        tenths,
        { seed: SEED, cases: 50, requirements: [{ label: "tenth", share: 0.1 }] },
        seen,
      );
      const first = seen.phases.indexOf("coverage");

      check.equal(
        seat,
        [
          seen.calls.slice(0, first).filter(([, status]) => status === "passed").length,
          [...new Set(seen.phases.slice(first))],
        ],
        [50, ["coverage"]],
        "50 valid cases before the first coverage case",
      );
    });

    it("runs the examples and the stored cases first", async ({ seat }) => {
      const seen = new Seen();
      let calls = 0;
      await ran(
        body((c) => {
          calls += 1;
          c.draw(WIDE, "n");
        }),
        {
          seed: SEED,
          cases: 1,
          examples: [integers(5n)],
          stored: [integers(3n), integers(4n)],
        },
        seen,
      );

      check.equal(
        seat,
        [seen.phases.slice(0, 4), seen.calls.length],
        [["example", "stored", "stored", "simplest"], calls],
        "the known cases first",
      );
    });

    it("runs a trace before the examples", async ({ seat }) => {
      const seen = new Seen();
      const values: unknown[] = [];
      await ran(
        body((c) => {
          values.push(c.draw(WIDE, "n"));
        }),
        {
          seed: SEED,
          cases: 1,
          traces: [[{ label: "n", value: 5n }]],
          examples: [integers(3n)],
        },
        seen,
      );

      check.equal(
        seat,
        [seen.phases.slice(0, 3), values.slice(0, 2)],
        [
          ["example", "example", "simplest"],
          [5n, 3n],
        ],
        "the trace, then the example",
      );
    });

    it("throws a TraceError for a trace that the body cannot follow", async ({
      seat,
    }) => {
      const seen = new Seen();
      const err = await check.rejectsWith(
        seat,
        () =>
          ran(
            body((c) => {
              c.draw(WIDE, "n");
            }),
            { seed: SEED, traces: [[{ label: "m", value: 5n }]] },
            seen,
          ),
        "the trace is refused",
      );

      check.errorIs(seat, err, TraceError, "the error is a TraceError");
      check.isEmpty(seat, seen.calls, "no case ran");
    });

    it("follows a random case by its prefix case", async ({ seat }) => {
      const seen = new Seen();
      await ran(
        body((c) => {
          c.draw(WIDE, "n");
          c.draw(WIDE, "m");
        }),
        { seed: SEED },
        seen,
      );

      check.equal(
        seat,
        seen.phases.slice(1, 3),
        ["random", "prefix"],
        "random case 0 and its prefix",
      );
    });

    it("shrinks a failure after its replay before its explanation", async ({
      seat,
    }) => {
      const seen = new Seen();
      const outcome = await ran(aboveMillion, { seed: SEED }, seen);
      const replay = seen.phases.indexOf("replay");
      const after = seen.phases.slice(replay + 1);
      const shrinks = after.filter((phase) => phase === "shrink").length;

      check.equal(
        seat,
        [seen.calls[replay - 1]?.[1], after, after.length - shrinks > 0, after.length],
        [
          "failed",
          [
            ...new Array<Phase>(shrinks).fill("shrink"),
            ...new Array<Phase>(after.length - shrinks).fill("explain"),
          ],
          true,
          outcome.runs,
        ],
        "the shrink runs, then the explain runs",
      );
    });

    it("runs each filling of a draw as an explain run", async ({ seat }) => {
      const seen = new Seen();
      await ran(
        body((c) => {
          c.draw(WIDE, "n");
          c.fail("always");
        }),
        { seed: SEED },
        seen,
      );

      check.equal(
        seat,
        seen.phases,
        ["simplest", "replay", "shrink", "explain", "explain", "explain", "explain"],
        "four fillings",
      );
    });

    it("ends the explain phase with the step to the nearest passing value", async ({
      seat,
    }) => {
      const seen = new Seen();
      const tenThousand = new Integer(new IntegerBounds(0n, 10_000n));
      await ran(
        body((c) => {
          if (c.draw(tenThousand, "n") > 1000n) c.fail("big");
        }),
        { seed: SEED },
        seen,
      );

      check.equal(seat, seen.calls.at(-1), ["explain", "passed"], "the step passes");
    });

    it("explains nothing when the explanation is off", async ({ seat }) => {
      const outcome = await ran(aboveMillion, { seed: SEED, explain: false });

      check.equal(
        seat,
        [outcome.kind, outcome.explanation],
        ["counterexample", []],
        "no explanation",
      );
    });

    it("replays nothing without shrinking", async ({ seat }) => {
      const seen = new Seen();
      const outcome = await ran(aboveMillion, { seed: SEED, shrink: 0 }, seen);

      check.equal(
        seat,
        [
          seen.calls.at(-1)?.[1],
          seen.phases.includes("replay"),
          outcome.explanation,
          outcome.token === undefined,
        ],
        ["failed", false, [], false],
        "the first failing case, with its token",
      );
    });

    it("runs the one case of a replay under the phase token", async ({ seat }) => {
      const seen = new Seen();
      const outcome = await ran(
        aboveMillion,
        { seed: SEED, replay: integers(MILLION + 1n) },
        seen,
      );

      check.equal(
        seat,
        [seen.calls, outcome.kind, outcome.token === undefined],
        [[["token", "failed"]], "counterexample", false],
        "one token case",
      );
    });

    it("passes a replay that passes", async ({ seat }) => {
      check.equal(
        seat,
        (await ran(aboveMillion, { seed: SEED, replay: integers(1n) })).kind,
        "passed",
        "1 is no failure",
      );
    });

    it("returns vacuous for a replay that requests no input", async ({ seat }) => {
      check.equal(
        seat,
        (
          await ran(
            body(() => undefined),
            { seed: SEED, replay: [] },
          )
        ).kind,
        "vacuous",
        "nothing drawn",
      );
    });

    it("counts a passing example of values as a valid case", async ({ seat }) => {
      const outcome = await ran(
        body((c) => {
          c.draw(BOOLEAN, "flag");
        }),
        { seed: SEED, examples: [new Values([true])] },
      );

      check.equal(
        seat,
        [outcome.kind, outcome.cases],
        ["passed", 3],
        "two inputs and the example",
      );
    });

    it("reports a failing example of values as found", async ({ seat }) => {
      const seen = new Seen();
      const outcome = await ran(
        aboveMillion,
        { seed: SEED, examples: [new Values([MILLION + 5n])] },
        seen,
      );

      check.equal(
        seat,
        [
          seen.calls,
          outcome.kind,
          outcome.valued,
          outcome.token,
          outcome.runs,
          outcome.others,
          outcome.failing?.case.choices,
          outcome.failing?.case.draws[0]?.value,
        ],
        [
          [["example", "failed"]],
          "counterexample",
          true,
          undefined,
          0,
          [],
          [],
          MILLION + 5n,
        ],
        "no replay, shrink or explain run",
      );
    });

    it("shrinks a failing example of choices", async ({ seat }) => {
      const outcome = await ran(aboveMillion, {
        seed: SEED,
        examples: [integers(MILLION + 5n)],
      });

      check.equal(
        seat,
        [
          outcome.valued,
          outcome.token === undefined,
          outcome.failing?.case.draws[0]?.value,
        ],
        [false, false, MILLION + 1n],
        "the minimal case",
      );
    });

    it("returns a token that replays the counterexample", async ({ seat }) => {
      const outcome = await ran(aboveMillion, { seed: SEED });
      const replayed = await drive(
        execute(
          aboveMillion,
          new Replaying(decode(outcome.token as string)),
          MAX_CHOICES,
        ),
      );

      check.equal(
        seat,
        replayed.case.draws[0]?.value,
        MILLION + 1n,
        "the minimal value",
      );
    });

    it("reports the other identities that the shrink found", async ({ seat }) => {
      const small = new Integer(new IntegerBounds(0n, 1000n));
      const outcome = await ran(
        body((c) => {
          const value = c.draw(small, "x");
          if (value % 2n === 1n) c.fail("odd");
          if (value > 50n) c.fail("big");
        }),
        { seed: SEED },
      );
      const found = new Map(
        [outcome.failing, ...outcome.others].map((one) => [
          one?.failure?.identity,
          one?.case.draws[0]?.value,
        ]),
      );

      check.equal(
        seat,
        Object.fromEntries(found),
        { big: 52n, odd: 1n },
        "both identities, shrunk",
      );
    });
  });

  describe("runStored", () => {
    it("counts the stored cases that pass", async ({ seat }) => {
      const outcome = await drive(
        runStored(aboveMillion, { seed: SEED, stored: [integers(1n), integers(2n)] }),
      );

      check.equal(
        seat,
        [outcome.kind, outcome.cases, outcome.stored.length],
        ["passed", 2, 2],
        "two stored cases",
      );
    });

    it("reports the first failing stored case as found with its token", async ({
      seat,
    }) => {
      const seen = new Seen();
      const outcome = await drive(
        runStored(
          aboveMillion,
          { seed: SEED, stored: [integers(1n), integers(MILLION + 9n), integers(3n)] },
          seen.observer,
        ),
      );

      check.equal(
        seat,
        [outcome.kind, outcome.stored.length, outcome.token === undefined, seen.phases],
        ["counterexample", 2, false, ["stored", "stored"]],
        "no shrink",
      );
    });

    it("runs neither a trace nor an example", async ({ seat }) => {
      const seen = new Seen();
      await drive(
        runStored(
          aboveMillion,
          {
            seed: SEED,
            examples: [integers(5n)],
            traces: [[{ label: "n", value: 5n }]],
          },
          seen.observer,
        ),
      );

      check.isEmpty(seat, seen.calls, "nothing ran");
    });
  });

  describe("concludeCase", () => {
    it("shrinks a failed case that a run did not find", async ({ seat }) => {
      const failing = await drive(
        execute(aboveMillion, new Replaying(integers(MILLION * 5n)), MAX_CHOICES),
      );
      const outcome = await drive(concludeCase(aboveMillion, { seed: SEED }, failing));

      check.equal(
        seat,
        [outcome.kind, outcome.cases, outcome.failing?.case.draws[0]?.value],
        ["counterexample", 0, MILLION + 1n],
        "the minimal case",
      );
    });
  });
});
