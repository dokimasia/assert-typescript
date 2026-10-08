/** The spec of the run of a property, which forAll, fuzz and the property forms share. */

import { chmodSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, onTestFinished, vi } from "vitest";
import { check } from "../../src/index.js";
import type { Seat } from "../../src/matcher/seat.js";
import { Running } from "../../src/matcher/verdict.js";
import type { Case } from "../../src/prop/case.js";
import { FOR_ALL } from "../../src/prop/detail.js";
import { encode } from "../../src/prop/engine/token.js";
import { TraceError } from "../../src/prop/engine/trace.js";
import {
  BUDGET_VARIABLE,
  PROFILE_VARIABLE,
  REPLAY_VARIABLE,
} from "../../src/prop/environment.js";
import { bytes, integer } from "../../src/prop/generators.js";
import {
  cases,
  configure,
  draws,
  hermetic,
  type Option,
  replay,
  seed,
  shrink,
  store,
} from "../../src/prop/option.js";
import { type Call, Property, type PropertyBody } from "../../src/prop/property.js";
import { register } from "../../src/prop/registry.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import { records, setVariable, temporary, thrown, UNENFORCED } from "../helpers.js";

/** The variable that a mutation run sets in every process that it instruments. */
const MUTANT = "DOKIMI_MUTATE_MUTANT";

/** The call site of the properties. */
const WHERE = { file: "/work/tests/total.test.ts", line: 3 };

/** The call of a property of forAll with the contract c. */
const CALL: Call = {
  op: "prop.forAll",
  assertion: FOR_ALL,
  contract: "c",
  where: WHERE,
};

/** A recorder with cleanups, as the seat of a test with a store has them. */
class Kept extends Recorder {
  readonly cleanups: (() => void)[] = [];

  cleanup(fn: () => void): void {
    this.cleanups.push(fn);
  }
}

/** A body that passes for every digit. */
const PASSES: PropertyBody = (c: Case) => {
  c.draw(integer(0, 9), "x");
};

/** A body that fails for a digit of 5 or more. */
const BELOW_FIVE: PropertyBody = (c: Case) => {
  check.isTrue(c, c.draw(integer(0, 9), "x") < 5, "x is below 5");
};

/** Returns the property of options on seat, hermetic, of the seed 1 and without a store unless an option states one. */
function propertyOf(seat: Seat, ...options: Option[]): Property {
  return Property.of(
    seat,
    CALL,
    configure([hermetic(), seed(1n), store(""), ...options]),
  );
}

/** Runs body as the property of options on seat. */
async function runOn(
  seat: Seat,
  body: PropertyBody,
  ...options: Option[]
): Promise<void> {
  await propertyOf(seat, ...options).run(seat, Running.begin(seat, WHERE), body);
}

/** Returns the detail of the first failure that recorder received. */
function detailOf(recorder: Recorder): Readonly<Record<string, unknown>> {
  return recorder.failures[0]?.detail ?? {};
}

/** Returns the texts that console.warn receives until the test ends. */
function warnings(): string[] {
  const texts: string[] = [];
  const spy = vi.spyOn(console, "warn").mockImplementation((text: unknown) => {
    texts.push(String(text));
  });
  onTestFinished(() => spy.mockRestore());
  return texts;
}

describe("property", () => {
  describe("Property.of", () => {
    it("closes the registry", ({ seat }) => {
      propertyOf(new Recorder());

      check.hasSuffix(
        seat,
        thrown(() => register("Late", integer(0, 9))),
        "follows the first property, which closed the registry",
        "a registration after a property",
      );
    });

    {
      const tests = [
        {
          name: "text that is no JSON",
          give: "[",
          want: "draws: the entries are no JSON array of objects: ",
        },
        {
          name: "JSON that is no array of objects",
          give: "[1]",
          want: "draws: the entries are no JSON array of objects",
        },
        {
          name: "an entry without a step or a label",
          give: '[{"value": {"type": "int", "value": 1}}]',
          want: "draws[0]: the entry states no step, and no label or no value",
        },
        {
          name: "an entry without a value",
          give: '[{"label": "x"}]',
          want: "draws[0]: the entry states no step, and no label or no value",
        },
        {
          name: "a client below 0",
          give: '[{"step": "put", "client": -1}]',
          want: "draws[0].client: the client -1 is no whole number of 0 or more",
        },
        {
          name: "a client that is no number",
          give: '[{"step": "put", "client": "a"}]',
          want: 'draws[0].client: the client "a" is no whole number of 0 or more',
        },
        {
          name: "a value that is no typed literal",
          give: '[{"label": "x", "value": 1}]',
          want: "draws[0].value: the value is no typed literal: ",
        },
      ];
      for (const tt of tests) {
        it(`throws a fault for draws of ${tt.name}`, ({ seat }) => {
          check.hasPrefix(
            seat,
            thrown(() => propertyOf(new Recorder(), draws(tt.give))),
            tt.want,
            "the fault",
          );
        });
      }
    }

    it("throws a fault at the option for a token that no encoder writes", ({
      seat,
    }) => {
      check.hasPrefix(
        seat,
        thrown(() => propertyOf(new Recorder(), replay("prop1:!"))),
        "replay: no encoder writes the token: ",
        "the fault",
      );
    });

    it("throws a fault at the variable for a token of the variable that no encoder writes", ({
      seat,
    }) => {
      setVariable(PROFILE_VARIABLE, undefined);
      setVariable(REPLAY_VARIABLE, "prop1:!");

      check.hasPrefix(
        seat,
        thrown(() => Property.of(new Recorder(), CALL, configure([seed(1n)]))),
        "DOKIMI_ASSERT_PROP_REPLAY: no encoder writes the token: ",
        "the fault",
      );
    });

    it("throws the fault of a misspelled profile", ({ seat }) => {
      setVariable(PROFILE_VARIABLE, "fast");

      check.hasPrefix(
        seat,
        thrown(() => Property.of(new Recorder(), CALL, configure([]))),
        "DOKIMI_ASSERT_PROP_PROFILE: ",
        "the fault",
      );
    });
  });

  describe("Property.run", () => {
    it("records a pass for a body that passes every case", async ({ seat }) => {
      const recorder = new Recorder();
      await runOn(recorder, PASSES);
      const [call] = records(recorder);

      check.equal(
        seat,
        [
          recorder.failures,
          call?.["verdict"],
          (call?.["detail"] as Record<string, unknown> | undefined)?.["outcome"],
        ],
        [[], "pass", "passed"],
        "a pass",
      );
    });

    it("fails with one record of the property's assertion for a counterexample", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      await runOn(recorder, BELOW_FIVE);
      const [failure] = recorder.failures;

      check.equal(
        seat,
        [
          recorder.failures.length,
          failure?.assertion,
          failure?.contract,
          failure?.where,
          detailOf(recorder)["outcome"],
        ],
        [1, FOR_ALL, "c", WHERE, "counterexample"],
        "one record of the counterexample",
      );
      check.equal(
        seat,
        (detailOf(recorder)["counterexample"] as { value: unknown }[])[0]?.value,
        5,
        "the counterexample shrinks to 5",
      );
    });

    it("records the calls of each case under the property's call with the case's phase", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      await runOn(recorder, BELOW_FIVE, shrink(0));
      const calls = records(recorder).slice(1);

      check.equal(
        seat,
        [...new Set(calls.map((one) => `${one["parent"]} ${one["assertion"]}`))],
        ["1 true"],
        "every call of a case is under the property's call",
      );
      check.equal(
        seat,
        calls[0]?.["phase"],
        "simplest",
        "the simplest case runs first",
      );
    });

    it("ends the call with a fault for a second property of one contract in one store", async ({
      seat,
    }) => {
      const kept = new Kept();
      const dir = temporary();
      await runOn(kept, PASSES, store(dir));
      await runOn(kept, PASSES, store(dir));

      check.equal(
        seat,
        kept.message,
        `prop.forAll: ${dir}: two properties of the test have the contract "c", and would share their stored cases`,
        "the fault",
      );
    });

    it("reports the failure of a token's one case as found", async ({ seat }) => {
      const recorder = new Recorder();
      const token = encode([{ kind: "integer", value: 7n }]);
      await runOn(recorder, BELOW_FIVE, replay(token));

      check.equal(
        seat,
        [
          detailOf(recorder)["outcome"],
          detailOf(recorder)["cases"],
          detailOf(recorder)["choices"],
        ],
        ["counterexample", 0, token],
        "the token's case fails as found",
      );
    });

    it("ends the call with a fault for a run whose seat's signal aborted", async ({
      seat,
    }) => {
      const recorder = new Recorder().withSignal(AbortSignal.abort());
      await runOn(recorder, PASSES);

      check.equal(
        seat,
        recorder.message,
        "prop.forAll: the run stopped between two cases, because the seat's signal aborted",
        "the fault",
      );
    });

    it("ends the replay of a token with a fault for a run whose seat's signal aborted", async ({
      seat,
    }) => {
      const recorder = new Recorder().withSignal(AbortSignal.abort());
      await runOn(recorder, PASSES, replay(encode([])));

      check.hasPrefix(
        seat,
        recorder.message,
        "prop.forAll: the run stopped",
        "the fault",
      );
    });

    it("writes an entry of a counterexample that the next run replays first", async ({
      seat,
    }) => {
      setVariable(MUTANT, undefined);
      const dir = temporary();
      await runOn(new Recorder(), BELOW_FIVE, store(dir));
      const [written] = readdirSync(dir);
      const entry = JSON.parse(
        readFileSync(join(dir, written as string), "utf8"),
      ) as Record<string, unknown>;
      const second = new Recorder();
      await runOn(second, BELOW_FIVE, store(dir));

      check.equal(
        seat,
        [entry["property"], entry["counterexample"], records(second)[1]?.["phase"]],
        ["c", [{ label: "x", value: { type: "int", value: 5 } }], "stored"],
        "the entry, replayed first",
      );
    });

    it("writes no entry in a process of a mutation run", async ({ seat }) => {
      setVariable(MUTANT, "1");
      const dir = temporary();
      await runOn(new Recorder(), BELOW_FIVE, store(dir));

      check.isEmpty(seat, readdirSync(dir), "no entry");
    });

    it("ends the call with a fault for a store with a damaged file", async ({
      seat,
    }) => {
      const dir = temporary();
      writeFileSync(join(dir, "a.json"), "{");
      const recorder = new Recorder();
      await runOn(recorder, PASSES, store(dir));

      check.equal(
        seat,
        recorder.message,
        `prop.forAll: ${dir}: the store has damaged files: a.json`,
        "the fault",
      );
    });

    it("notes the stored entries that a run skips or decodes to other values", async ({
      seat,
    }) => {
      setVariable(MUTANT, undefined);
      const texts = warnings();
      const dir = temporary();
      await runOn(new Recorder(), BELOW_FIVE, store(dir));
      writeFileSync(join(dir, "later.json"), JSON.stringify({ store: 2 }));
      const [written] = readdirSync(dir).filter((file) => file !== "later.json");
      await runOn(
        new Recorder(),
        (c) => {
          check.isTrue(
            c,
            c.draw(
              integer(0, 9).map((x) => x + 1),
              "x",
            ) < 5,
            "x is below 5",
          );
        },
        store(dir),
      );

      check.equal(
        seat,
        texts,
        [
          `prop.forAll: ${join(dir, "later.json")}: the entry is of a later format, so the run skips it`,
          `prop.forAll: ${join(dir, written as string)}: the stored case decodes to other values than it records, and the run tested those`,
        ],
        "two notes",
      );
    });

    it.skipIf(UNENFORCED)(
      "notes a store that cannot keep an entry",
      async ({ seat }) => {
        setVariable(MUTANT, undefined);
        const texts = warnings();
        const dir = temporary();
        chmodSync(dir, 0o500);
        await runOn(new Recorder(), BELOW_FIVE, store(dir));
        chmodSync(dir, 0o700);

        check.equal(seat, texts.length, 1, "one note");
        check.hasPrefix(
          seat,
          texts[0],
          `prop.forAll: ${dir}: the store keeps no case of "c": `,
          "the note",
        );
      },
    );

    it("writes each failure of a campaign as the campaign concludes it", async ({
      seat,
    }) => {
      setVariable(MUTANT, undefined);
      setVariable(PROFILE_VARIABLE, "campaign");
      setVariable(BUDGET_VARIABLE, "1");
      let time = 0;
      const spy = vi.spyOn(performance, "now").mockImplementation(() => {
        time += 10;
        return time;
      });
      onTestFinished(() => spy.mockRestore());
      const dir = temporary();
      const recorder = new Recorder();
      const property = Property.of(
        recorder,
        CALL,
        configure([seed(1n), store(dir), cases(5)]),
      );
      await property.run(recorder, Running.begin(recorder, WHERE), BELOW_FIVE);

      check.equal(
        seat,
        [detailOf(recorder)["outcome"], readdirSync(dir).length],
        ["counterexample", 1],
        "one failure, written once",
      );
    });

    {
      const tests = [
        {
          name: "a draw whose label differs from its entry's",
          give: '[{"label": "y", "value": {"type": "int", "value": 1}}]',
          want: 'prop.forAll: draws[0].label: the draw labelled "x" takes the entry labelled "y"',
        },
        {
          name: "a draw that meets a step entry",
          give: '[{"step": "put"}]',
          want: 'prop.forAll: draws[0].label: the draw labelled "x" takes the step entry of "put"',
        },
        {
          name: "a draw whose generator does not produce its entry's value",
          give: '[{"label": "x", "value": {"type": "int", "value": 99}}]',
          want: 'prop.forAll: draws[0].value: the generator of the draw labelled "x" does not produce the entry\'s value',
        },
      ];
      for (const tt of tests) {
        it(`ends the call with a fault at the entry of ${tt.name}`, async ({
          seat,
        }) => {
          const recorder = new Recorder();
          await runOn(recorder, PASSES, draws(tt.give));

          check.equal(seat, recorder.message, tt.want, "the fault");
        });
      }
    }

    it("ends the call with a fault at a step entry that a machine cannot take", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      await runOn(
        recorder,
        () => {
          throw new TraceError(0, "put", "step");
        },
        draws('[{"step": "put", "client": 1, "drain": true}]'),
      );

      check.equal(
        seat,
        recorder.message,
        'prop.forAll: draws[0].step: the machine cannot take the step "put" there',
        "the fault",
      );
    });

    it("runs the case of the draws option first", async ({ seat }) => {
      const recorder = new Recorder();
      await runOn(
        recorder,
        BELOW_FIVE,
        draws('[{"label": "x", "value": {"type": "int", "value": 7}}]'),
        shrink(0),
      );

      check.equal(
        seat,
        [records(recorder)[1]?.["phase"], detailOf(recorder)["cases"]],
        ["example", 0],
        "the example fails first",
      );
    });
  });

  describe("Property.replayStored", () => {
    it("counts the stored cases that pass", async ({ seat }) => {
      setVariable(MUTANT, undefined);
      const dir = temporary();
      await runOn(new Recorder(), BELOW_FIVE, store(dir));
      const recorder = new Recorder();
      await propertyOf(recorder, store(dir)).replayStored(
        recorder,
        Running.begin(recorder, WHERE),
        PASSES,
      );

      check.equal(
        seat,
        [
          recorder.failures,
          (records(recorder)[0]?.["detail"] as Record<string, unknown> | undefined)?.[
            "cases"
          ],
        ],
        [[], 1],
        "one stored case passes",
      );
    });

    it("reports a stored case that decodes to other values as found", async ({
      seat,
    }) => {
      setVariable(MUTANT, undefined);
      const texts = warnings();
      const dir = temporary();
      await runOn(new Recorder(), BELOW_FIVE, store(dir));
      const recorder = new Recorder();
      await propertyOf(recorder, store(dir)).replayStored(
        recorder,
        Running.begin(recorder, WHERE),
        (c) => {
          check.isTrue(
            c,
            c.draw(
              integer(0, 9).map((x) => x + 1),
              "x",
            ) < 5,
            "x is below 5",
          );
        },
      );
      const [drawn] = detailOf(recorder)["counterexample"] as { value: unknown }[];

      check.equal(
        seat,
        [detailOf(recorder)["outcome"], drawn?.value],
        ["counterexample", 6],
        "found, not shrunk",
      );
      check.equal(seat, texts.length, 1, "the difference is noted");
    });

    it("ends the call with a fault for a second claim", async ({ seat }) => {
      const kept = new Kept();
      const dir = temporary();
      await runOn(kept, PASSES, store(dir));
      await propertyOf(kept, store(dir)).replayStored(
        kept,
        Running.begin(kept, WHERE),
        PASSES,
      );

      check.hasSuffix(
        seat,
        kept.message,
        "would share their stored cases",
        "the fault",
      );
    });

    it("ends the call with a fault for a store with a damaged file", async ({
      seat,
    }) => {
      const dir = temporary();
      writeFileSync(join(dir, "a.json"), "{");
      const recorder = new Recorder();
      await propertyOf(recorder, store(dir)).replayStored(
        recorder,
        Running.begin(recorder, WHERE),
        PASSES,
      );

      check.hasSuffix(
        seat,
        recorder.message,
        "the store has damaged files: a.json",
        "the fault",
      );
    });

    it("ends the call with a fault for a run whose seat's signal aborted", async ({
      seat,
    }) => {
      setVariable(MUTANT, undefined);
      const dir = temporary();
      await runOn(new Recorder(), BELOW_FIVE, store(dir));
      const recorder = new Recorder().withSignal(AbortSignal.abort());
      await propertyOf(recorder, store(dir)).replayStored(
        recorder,
        Running.begin(recorder, WHERE),
        PASSES,
      );

      check.hasPrefix(
        seat,
        recorder.message,
        "prop.forAll: the run stopped",
        "the fault",
      );
    });
  });

  describe("Property.input", () => {
    /** A body that reads one byte string and fails when it starts with 7. */
    const StartsWithSeven: PropertyBody = (c: Case) => {
      const data = c.draw(bytes({ maxSize: 4 }), "data");
      check.isFalse(c, data[0] === 7, "the data does not start with 7");
    };

    it("counts one valid case of an input that the body passes", async ({ seat }) => {
      const recorder = new Recorder();
      await propertyOf(recorder).input(
        recorder,
        Running.begin(recorder, WHERE),
        StartsWithSeven,
        Uint8Array.of(1, 1),
      );

      check.equal(
        seat,
        (records(recorder)[0]?.["detail"] as Record<string, unknown> | undefined)?.[
          "cases"
        ],
        1,
        "one valid case",
      );
    });

    it("counts one rejected case of an input that the body rejects", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      await propertyOf(recorder).input(
        recorder,
        Running.begin(recorder, WHERE),
        (c) => c.assume(false),
        Uint8Array.of(),
      );

      check.equal(
        seat,
        (records(recorder)[0]?.["detail"] as Record<string, unknown> | undefined)?.[
          "rejected"
        ],
        1,
        "one rejected case",
      );
    });

    it("writes the entry of a failing input to the store", async ({ seat }) => {
      setVariable(MUTANT, undefined);
      const dir = temporary();
      const recorder = new Recorder();
      await propertyOf(recorder, store(dir)).input(
        recorder,
        Running.begin(recorder, WHERE),
        StartsWithSeven,
        Uint8Array.of(3, 7, 7, 7),
      );

      check.equal(
        seat,
        [
          detailOf(recorder)["outcome"],
          detailOf(recorder)["cases"],
          readdirSync(dir).length,
        ],
        ["counterexample", 0, 1],
        "the shrunk input is stored",
      );
    });

    it("notes a store that cannot keep the entry of a failing input", async ({
      seat,
    }) => {
      setVariable(MUTANT, undefined);
      const texts = warnings();
      const file = join(temporary(), "file");
      writeFileSync(file, "");
      const recorder = new Recorder();
      await propertyOf(recorder, store(file)).input(
        recorder,
        Running.begin(recorder, WHERE),
        StartsWithSeven,
        Uint8Array.of(1, 7),
      );

      check.hasPrefix(
        seat,
        texts[0],
        `prop.forAll: ${file}: the store keeps no case of "c": `,
        "the note",
      );
    });

    it("reports an input whose replay passes as flaky", async ({ seat }) => {
      const recorder = new Recorder();
      let calls = 0;
      await propertyOf(recorder).input(
        recorder,
        Running.begin(recorder, WHERE),
        (c) => {
          c.draw(bytes(), "data");
          calls += 1;
          check.isTrue(c, calls > 1, "only the first call fails");
        },
        Uint8Array.of(0, 0),
      );

      check.equal(seat, detailOf(recorder)["outcome"], "flaky", "the replay passes");
    });

    it("ends the call with a fault for a run whose seat's signal aborted", async ({
      seat,
    }) => {
      const recorder = new Recorder().withSignal(AbortSignal.abort());
      await propertyOf(recorder).input(
        recorder,
        Running.begin(recorder, WHERE),
        PASSES,
        Uint8Array.of(),
      );

      check.hasPrefix(
        seat,
        recorder.message,
        "prop.forAll: the run stopped",
        "the fault",
      );
    });
  });

  describe("Property.fault", () => {
    it("ends the call with the fault of the property's operation", ({ seat }) => {
      const recorder = new Recorder();
      Property.fault(Running.begin(recorder, WHERE), CALL, new RangeError("bad"));

      check.equal(
        seat,
        [recorder.message, records(recorder)[0]?.["verdict"]],
        ["prop.forAll: bad", "error"],
        "the fault",
      );
    });
  });
});
