/**
 * The spec of a campaign: a run that explores for a span of time and keeps
 * the cases that show new behaviour. Each campaign but one measures its
 * budget on a clock that advances by one at each reading, so a budget of
 * n + 1 runs n cases after the known ones.
 */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { type CampaignSettings, campaign } from "../../../src/prop/engine/campaign.js";
import {
  Case,
  DECODE,
  type Decoder,
  Generating,
} from "../../../src/prop/engine/case.js";
import {
  type Choice,
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
} from "../../../src/prop/engine/choice.js";
import { Sizes } from "../../../src/prop/engine/collection.js";
import type { Body, Execution, Phase } from "../../../src/prop/engine/execution.js";
import { Bytes, Float, Integer, List } from "../../../src/prop/engine/generator.js";
import { type Outcome, Values } from "../../../src/prop/engine/runner.js";
import { caseSource } from "../../../src/prop/engine/source.js";
import { drive } from "../../../src/prop/engine/work.js";
import { test as it } from "../../../src/vitest.js";

const SEED = 7n;
const WIDE = new Integer(new IntegerBounds(0n, 1_000_000_000n));
const DIGITS = new List(new Integer(new IntegerBounds(0n, 9n)), new Sizes(0, 5));
const UNIT = new Float(new FloatBounds(0, 1));
const BYTES = new Bytes(new SequenceBounds(256, 0, 4));
const HIGH = 900_000_000n;

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

/** Returns settings of a campaign that runs count cases after the known ones, on a clock of one tick per reading. */
function ticks(
  count: number,
  settings: Partial<CampaignSettings> = {},
): CampaignSettings {
  let time = 0;
  return {
    seed: SEED,
    ...settings,
    budget: count + 1,
    now: () => {
      time += 1;
      return time;
    },
  };
}

/** Returns the outcome of a campaign, and the phase and the execution of every call. */
async function explored(
  of: Body,
  settings: CampaignSettings,
): Promise<[Outcome, [Phase, Execution][]]> {
  const calls: [Phase, Execution][] = [];
  const outcome = await drive(
    campaign(of, settings, (phase, execution) => calls.push([phase, execution])),
  );
  return [outcome, calls];
}

/** Returns the first value that each random call drew. */
function firsts(calls: readonly [Phase, Execution][]): unknown[] {
  return calls
    .filter(([phase]) => phase === "random")
    .map(([, execution]) => execution.case.draws[0]?.value);
}

/** Returns the share of values that equal an earlier value of the list. */
function repeatedShare(values: readonly unknown[]): number {
  const seen = new Set<unknown>();
  let repeats = 0;
  for (const value of values) {
    if (seen.has(value)) repeats += 1;
    seen.add(value);
  }
  return repeats / values.length;
}

/** A body that draws two wide integers and shows nothing new. */
const plain = body((c) => {
  c.draw(WIDE, "n");
  c.draw(WIDE, "m");
});

describe("campaign", () => {
  describe("campaign", () => {
    it("runs cases until its budget has passed", async ({ seat }) => {
      const [outcome, calls] = await explored(plain, ticks(25));

      check.equal(
        seat,
        [outcome.kind, outcome.cases, calls.length],
        ["passed", 25, 25],
        "25 valid cases",
      );
    });

    it("runs the random cases of the seed while its pool is empty", async ({
      seat,
    }) => {
      const [, calls] = await explored(plain, ticks(10));
      const want = Array.from({ length: 10 }, (_, i) =>
        WIDE[DECODE](new Case(new Generating(caseSource(SEED, BigInt(i))))),
      );

      check.equal(seat, firsts(calls), want, "the random cases of seed 7");
    });

    it("measures its budget on the platform clock by default", async ({ seat }) => {
      const [outcome, calls] = await explored(plain, { seed: SEED, budget: 0 });

      check.equal(
        seat,
        [outcome.kind, calls.length],
        ["vacuous", 0],
        "a budget of no time runs no case",
      );
    });

    it("repeats the first value of a pool member in many mutated cases", async ({
      seat,
    }) => {
      const labelled = body((c) => {
        const n = c.draw(WIDE, "n");
        c.draw(WIDE, "m");
        c.classify(String(n));
      });
      const [outcome, calls] = await explored(labelled, ticks(400));

      check.equal(
        seat,
        [outcome.kind, repeatedShare(firsts(calls)) > 0.3],
        ["passed", true],
        "a share of repeated first values",
      );
    });

    it("admits a case that records a new fingerprint", async ({ seat }) => {
      const observing = body((c) => {
        c.observe(c.draw(WIDE, "n") % 7n);
        c.draw(WIDE, "m");
      });
      const [, calls] = await explored(observing, ticks(200));

      check.isTrue(
        seat,
        repeatedShare(firsts(calls)) > 0,
        "mutated cases repeat a member's first value",
      );
    });

    it("admits a case that records a score above the best of its label", async ({
      seat,
    }) => {
      const scoring = body((c) => {
        c.target("size", Number(c.draw(WIDE, "n") % 100n));
        c.draw(WIDE, "m");
      });
      const [, calls] = await explored(scoring, ticks(200));

      check.isTrue(
        seat,
        repeatedShare(firsts(calls)) > 0,
        "mutated cases repeat a member's first value",
      );
    });

    it("mutates every kind of pool member into a valid case", async ({ seat }) => {
      const generators: readonly Decoder<unknown>[] = [DIGITS, UNIT, BYTES];
      let calls = 0;
      const mixed = body((c) => {
        calls += 1;
        if (calls === 1) {
          c.classify("nothing drawn");
          return;
        }
        const n = c.random();
        c.classify(`n${n % 1000n}`);
        const generator = generators[Number(n % 4n)];
        if (generator !== undefined) c.draw(generator, "x");
      });
      const [outcome] = await explored(mixed, ticks(2000));

      check.equal(
        seat,
        [outcome.kind, outcome.cases, outcome.rejected],
        ["passed", 2000, 0],
        "every case is valid",
      );
    });

    it("runs the known cases first", async ({ seat }) => {
      const [outcome, calls] = await explored(
        plain,
        ticks(2, {
          traces: [[{ label: "n", value: 1n }]],
          examples: [integers(5n, 6n), new Values([7n, 8n])],
          stored: [integers(3n, 4n)],
        }),
      );

      check.equal(
        seat,
        [calls.map(([phase]) => phase), outcome.stored.length, outcome.cases],
        [["example", "example", "example", "stored", "random", "random"], 1, 6],
        "four known cases, then two random cases",
      );
    });

    it("goes on past a concluded failure until its budget has passed", async ({
      seat,
    }) => {
      const concluded: Outcome[] = [];
      const [outcome, calls] = await explored(
        body((c) => {
          if (c.draw(WIDE, "n") > HIGH) c.fail("high");
        }),
        ticks(100, { concluded: (one) => concluded.push(one) }),
      );

      check.equal(
        seat,
        [
          outcome.kind,
          outcome.failing?.case.draws[0]?.value,
          concluded.length,
          calls.filter(([phase]) => phase === "random").length,
        ],
        ["counterexample", HIGH + 1n, 1, 100],
        "one conclusion and 100 cases",
      );
    });

    it("reports each later failure of another identity among the others", async ({
      seat,
    }) => {
      const concluded: Outcome[] = [];
      const [outcome] = await explored(
        body((c) => {
          const n = c.draw(WIDE, "n");
          const m = c.draw(WIDE, "m");
          if (n > HIGH) c.fail("high n");
          if (n === 0n) c.fail("zero n");
          if (m > HIGH) c.fail("high m");
        }),
        ticks(300, { concluded: (one) => concluded.push(one) }),
      );
      const identities = concluded.flatMap((one) =>
        [one.failing, ...one.others].map((execution) => execution?.failure?.identity),
      );
      const reported = [outcome.failing, ...outcome.others].map(
        (execution) => execution?.failure?.identity,
      );

      check.equal(
        seat,
        [new Set(identities).size === identities.length, [...reported].sort()],
        [true, ["high m", "high n", "zero n"]],
        "each identity once",
      );
    });

    it("returns flaky for a failure whose replay passes", async ({ seat }) => {
      let calls = 0;
      const [outcome] = await explored(
        body((c) => {
          calls += 1;
          c.draw(WIDE, "n");
          if (calls === 1) c.fail("first");
        }),
        ticks(10, { stored: [integers(5n)] }),
      );

      check.equal(
        seat,
        [outcome.kind, outcome.divergence?.what, outcome.stored.length],
        ["flaky", "verdict", 1],
        "the replay passes",
      );
    });

    it("returns flaky for a random failure whose replay passes", async ({ seat }) => {
      let calls = 0;
      const [outcome] = await explored(
        body((c) => {
          calls += 1;
          c.draw(WIDE, "n");
          if (calls === 3) c.fail("third");
        }),
        ticks(10),
      );

      check.equal(
        seat,
        [outcome.kind, outcome.cases],
        ["flaky", 2],
        "two valid cases before it",
      );
    });

    it("reports a failing example of values as found", async ({ seat }) => {
      const [outcome] = await explored(
        body((c) => {
          if (c.draw(WIDE, "n") > HIGH) c.fail("high");
        }),
        ticks(5, { examples: [new Values([HIGH + 9n])] }),
      );

      check.equal(
        seat,
        [outcome.kind, outcome.valued, outcome.failing?.case.draws[0]?.value],
        ["counterexample", true, HIGH + 9n],
        "the example's value",
      );
    });

    it("returns rejected for a campaign that rejects every case", async ({ seat }) => {
      const [outcome] = await explored(
        body((c) => {
          c.draw(WIDE, "n");
          c.assume(false);
        }),
        ticks(5),
      );

      check.equal(seat, outcome.kind, "rejected", "every case rejected");
    });

    it("returns coverage-unmet for a label that no case counted", async ({ seat }) => {
      const [outcome] = await explored(
        plain,
        ticks(5, { requirements: [{ label: "never", share: 0.5 }] }),
      );

      check.equal(
        seat,
        [outcome.kind, outcome.shortfall?.requirement.label],
        ["coverage-unmet", "never"],
        "the label",
      );
    });

    it("passes a requirement that every case meets", async ({ seat }) => {
      const always = body((c) => {
        c.draw(WIDE, "n");
        c.classify("always");
      });
      const [outcome] = await explored(
        always,
        ticks(50, { requirements: [{ label: "always", share: 0.5 }] }),
      );

      check.equal(seat, outcome.kind, "passed", "every case counts the label");
    });

    it("throws a RangeError for settings of no case", async ({ seat }) => {
      const err = await check.rejectsWith(
        seat,
        () => drive(campaign(plain, { seed: SEED, budget: 1, cases: 0 })),
        "the settings are refused",
      );

      check.errorIs(seat, err, RangeError, "the error is a RangeError");
    });
  });
});
