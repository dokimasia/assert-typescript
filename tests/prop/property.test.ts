// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the run of a property, which forAll, fuzz and the property forms share. */

import { chmodSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, onTestFinished, vi } from "vitest";
import { check, fault } from "../../src/index.js";
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
import { bytes } from "../../src/prop/generators/collections.js";
import { integer } from "../../src/prop/generators.js";
import {
  around,
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
import { register } from "../../src/prop/registry/register.js";
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

/** A body that passes for every digit. */
const PASSES: PropertyBody = (c: Case) => {
  c.draw(integer(0, 9), "x");
};

/** A body that fails for a digit of 5 or more. */
const BELOW_FIVE: PropertyBody = (c: Case) => {
  check.isTrue(c, c.draw(integer(0, 9), "x") < 5, "x is below 5");
};

/** A body that draws a digit and skips. */
const SKIPS: PropertyBody = (c: Case) => {
  c.draw(integer(0, 9), "x");
  c.skip("the environment lacks a capability");
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

/**
 * Writes the entry of a failure of BELOW_FIVE into the store dir. The run
 * releases its claim on the entries, so a later property can claim them.
 */
async function storeAFailure(dir: string): Promise<void> {
  const first = new Recorder();
  await runOn(first, BELOW_FIVE, store(dir));
  await first.runCleanups();
}

/** Returns the detail of the first failure that recorder received. */
function detailOf(recorder: Recorder): Readonly<Record<string, unknown>> {
  return recorder.failures[0]?.detail ?? {};
}

/** Returns the value of the first draw of the counterexample that recorder received. */
function drawnOf(recorder: Recorder): unknown {
  return (detailOf(recorder)["counterexample"] as { value: unknown }[])[0]?.value;
}

/** Returns the option of a wrapper that awaits run and counts its own calls in count. */
function counting(count: { calls: number }): Option {
  return around(async (run) => {
    count.calls += 1;
    await run();
  });
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

      check.isEqualTo(
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

    it("records a skip with its reason for a case that skips", async ({ seat }) => {
      const recorder = new Recorder();
      await runOn(recorder, SKIPS);
      const [call] = records(recorder);
      const detail = call?.["detail"] as Record<string, unknown> | undefined;

      check.isEqualTo(
        seat,
        [recorder.failed, call?.["verdict"], detail?.["outcome"], detail?.["reason"]],
        [false, "skip", "skipped", "the environment lacks a capability"],
        "a skip",
      );
    });

    it("ends the call with the fault that ends its first case, without a shrink", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      const error = new Error("the environment lacks the resource");
      let ran = 0;
      await runOn(recorder, (c) => {
        ran += 1;
        c.draw(integer(0, 9), "x");
        fault(c, error);
      });
      const [call] = records(recorder);

      check.isEqualTo(
        seat,
        [recorder.faults, recorder.failures, ran, call?.["verdict"]],
        [[error], [], 1, "error"],
        "the call ends with the same fault after one case",
      );
    });

    it("ends the call with the fault of a shrink candidate", async ({ seat }) => {
      const recorder = new Recorder();
      const error = new Error("the environment lacks the resource");
      let failed = false;
      await runOn(recorder, (c) => {
        const value = c.draw(integer(0, 9), "x");
        if (failed && value < 5) {
          fault(c, error);
        }
        if (value >= 5) {
          failed = true;
          c.fail("the digit is 5 or more");
        }
      });

      check.isEqualTo(
        seat,
        [recorder.faults, recorder.failures],
        [[error], []],
        "the shrink ends the call with the fault",
      );
    });

    it("fails with one record of the property's assertion for a counterexample", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      await runOn(recorder, BELOW_FIVE);
      const [failure] = recorder.failures;

      check.isEqualTo(
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
      check.isEqualTo(
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

      check.isEqualTo(
        seat,
        [...new Set(calls.map((one) => `${one["parent"]} ${one["assertion"]}`))],
        ["1 true"],
        "every call of a case is under the property's call",
      );
      check.isEqualTo(
        seat,
        calls[0]?.["phase"],
        "simplest",
        "the simplest case runs first",
      );
    });

    it("ends the call with a fault for a second property of one contract in one store", async ({
      seat,
    }) => {
      const kept = new Recorder();
      onTestFinished(() => kept.runCleanups());
      const dir = temporary();
      await runOn(kept, PASSES, store(dir));
      await runOn(kept, PASSES, store(dir));

      check.isEqualTo(
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

      check.isEqualTo(
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

      check.isEqualTo(
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
      await storeAFailure(dir);
      const [written] = readdirSync(dir);
      const entry = JSON.parse(
        readFileSync(join(dir, written as string), "utf8"),
      ) as Record<string, unknown>;
      const second = new Recorder();
      await runOn(second, BELOW_FIVE, store(dir));

      check.isEqualTo(
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

      check.isEqualTo(
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
      const dir = temporary();
      await storeAFailure(dir);
      writeFileSync(join(dir, "later.json"), JSON.stringify({ store: 2 }));
      const [written] = readdirSync(dir).filter((file) => file !== "later.json");
      const recorder = new Recorder();
      await runOn(
        recorder,
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

      check.isEqualTo(
        seat,
        recorder.faults.map((f) => f.message),
        [
          `prop.forAll: ${join(dir, "later.json")}: the entry is of a later format, so the run skips it`,
          `prop.forAll: ${join(dir, written as string)}: the stored case decodes to other values than it records, and the run tested those`,
        ],
        "two noted faults",
      );
    });

    it.skipIf(UNENFORCED)(
      "notes a store that cannot keep an entry",
      async ({ seat }) => {
        setVariable(MUTANT, undefined);
        const dir = temporary();
        chmodSync(dir, 0o500);
        const recorder = new Recorder();
        await runOn(recorder, BELOW_FIVE, store(dir));
        chmodSync(dir, 0o700);

        check.isEqualTo(seat, recorder.faults.length, 1, "one noted fault");
        check.hasPrefix(
          seat,
          recorder.faults[0]?.message,
          `prop.forAll: ${dir}: the store keeps no case of "c": `,
          "the noted fault",
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

      check.isEqualTo(
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

          check.isEqualTo(seat, recorder.message, tt.want, "the fault");
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

      check.isEqualTo(
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

      check.isEqualTo(
        seat,
        [records(recorder)[1]?.["phase"], detailOf(recorder)["cases"]],
        ["example", 0],
        "the example fails first",
      );
    });

    it("runs the body once in each call of the wrapper", async ({ seat }) => {
      const recorder = new Recorder();
      let runs = 0;
      const ran: number[] = [];
      await runOn(
        recorder,
        (c) => {
          runs += 1;
          BELOW_FIVE(c);
        },
        around(async (run) => {
          const before = runs;
          await run();
          ran.push(runs - before);
        }),
      );

      check.isEqualTo(
        seat,
        ran,
        Array.from({ length: runs }, () => 1),
        "each call of the wrapper runs the body once",
      );
      check.isEqualTo(
        seat,
        [
          ...new Set(
            records(recorder)
              .slice(1)
              .map((one) => one["phase"]),
          ),
        ].sort(),
        ["explain", "random", "replay", "shrink", "simplest"],
        "the wrapper runs the cases of every phase",
      );
    });

    it("reports the counterexample of the body's records under a wrapper", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      await runOn(recorder, BELOW_FIVE, counting({ calls: 0 }));

      check.isEqualTo(
        seat,
        [detailOf(recorder)["outcome"], drawnOf(recorder)],
        ["counterexample", 5],
        "the counterexample shrinks to 5",
      );
    });

    it("waits for the run of a wrapper that does not await it", async ({ seat }) => {
      const recorder = new Recorder();
      await runOn(
        recorder,
        async (c) => {
          await Promise.resolve();
          BELOW_FIVE(c);
        },
        around((run) => {
          void run();
        }),
      );

      check.isEqualTo(
        seat,
        [detailOf(recorder)["outcome"], drawnOf(recorder)],
        ["counterexample", 5],
        "the counterexample shrinks to 5",
      );
    });

    it("ends the call with a fault for a wrapper that returns without calling run", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      let runs = 0;
      await runOn(
        recorder,
        () => {
          runs += 1;
        },
        around(() => undefined),
      );

      check.isEqualTo(
        seat,
        [recorder.message, runs],
        ["prop.forAll: around: the wrapper returned without calling run", 0],
        "the fault, without a run of the body",
      );
    });

    it("ends the call with a fault for a wrapper that calls run twice", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      let runs = 0;
      await runOn(
        recorder,
        () => {
          runs += 1;
        },
        around(async (run) => {
          await run();
          await run();
        }),
      );

      check.isEqualTo(
        seat,
        [recorder.message, runs],
        ["prop.forAll: around: the wrapper called run more than once", 1],
        "the fault, after one run of the body",
      );
    });

    {
      const tests = [
        {
          name: "a wrapper that throws",
          give: (): void => {
            throw new Error("no environment");
          },
        },
        {
          name: "a wrapper whose promise rejects",
          give: (): Promise<void> => Promise.reject(new Error("no environment")),
        },
      ];
      for (const tt of tests) {
        it(`ends the call with a fault for ${tt.name}`, async ({ seat }) => {
          const recorder = new Recorder();
          await runOn(recorder, PASSES, around(tt.give));

          check.isEqualTo(
            seat,
            recorder.message,
            "prop.forAll: around: the wrapper threw: no environment",
            "the fault",
          );
        });
      }
    }

    it("runs nothing at a call of run after the wrapper settled", async ({ seat }) => {
      let late: (() => Promise<void>) | undefined;
      let runs = 0;
      await runOn(
        new Recorder(),
        () => {
          runs += 1;
        },
        around((run) => {
          late = run;
        }),
      );
      await late?.();

      check.isEqualTo(seat, runs, 0, "the late call runs nothing");
    });
  });

  describe("Property.replayStored", () => {
    it("counts the stored cases that pass", async ({ seat }) => {
      setVariable(MUTANT, undefined);
      const dir = temporary();
      await storeAFailure(dir);
      const recorder = new Recorder();
      await propertyOf(recorder, store(dir)).replayStored(
        recorder,
        Running.begin(recorder, WHERE),
        PASSES,
      );

      check.isEqualTo(
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
      const dir = temporary();
      await storeAFailure(dir);
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

      check.isEqualTo(
        seat,
        [detailOf(recorder)["outcome"], drawn?.value],
        ["counterexample", 6],
        "found, not shrunk",
      );
      check.isEqualTo(seat, recorder.faults.length, 1, "the difference is noted");
    });

    it("records a skip for a stored case that skips", async ({ seat }) => {
      setVariable(MUTANT, undefined);
      const dir = temporary();
      await storeAFailure(dir);
      const recorder = new Recorder();
      await propertyOf(recorder, store(dir)).replayStored(
        recorder,
        Running.begin(recorder, WHERE),
        SKIPS,
      );
      const [call] = records(recorder);

      check.isEqualTo(
        seat,
        [recorder.failed, call?.["verdict"]],
        [false, "skip"],
        "the stored case skips",
      );
    });

    it("ends the call with a fault for a second claim", async ({ seat }) => {
      const kept = new Recorder();
      onTestFinished(() => kept.runCleanups());
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

    it("runs each stored case inside the wrapper", async ({ seat }) => {
      setVariable(MUTANT, undefined);
      const dir = temporary();
      await storeAFailure(dir);
      const count = { calls: 0 };
      const recorder = new Recorder();
      await propertyOf(recorder, store(dir), counting(count)).replayStored(
        recorder,
        Running.begin(recorder, WHERE),
        PASSES,
      );

      check.isEqualTo(seat, count.calls, 1, "one call for the one stored case");
    });

    it("ends the call with a fault for a run whose seat's signal aborted", async ({
      seat,
    }) => {
      setVariable(MUTANT, undefined);
      const dir = temporary();
      await storeAFailure(dir);
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

      check.isEqualTo(
        seat,
        (records(recorder)[0]?.["detail"] as Record<string, unknown> | undefined)?.[
          "cases"
        ],
        1,
        "one valid case",
      );
    });

    it("runs the case of an input inside the wrapper", async ({ seat }) => {
      const count = { calls: 0 };
      const recorder = new Recorder();
      await propertyOf(recorder, counting(count)).input(
        recorder,
        Running.begin(recorder, WHERE),
        StartsWithSeven,
        Uint8Array.of(1, 1),
      );

      check.isEqualTo(seat, count.calls, 1, "one call for the one input");
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

      check.isEqualTo(
        seat,
        (records(recorder)[0]?.["detail"] as Record<string, unknown> | undefined)?.[
          "rejected"
        ],
        1,
        "one rejected case",
      );
    });

    it("records a skip that counts no case for an input whose case skips", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      await propertyOf(recorder).input(
        recorder,
        Running.begin(recorder, WHERE),
        SKIPS,
        Uint8Array.of(1),
      );
      const [call] = records(recorder);
      const detail = call?.["detail"] as Record<string, unknown> | undefined;

      check.isEqualTo(
        seat,
        [call?.["verdict"], detail?.["cases"], detail?.["rejected"]],
        ["skip", 0, 0],
        "a skip of no case",
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

      check.isEqualTo(
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
        recorder.faults[0]?.message,
        `prop.forAll: ${file}: the store keeps no case of "c": `,
        "the noted fault",
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

      check.isEqualTo(
        seat,
        detailOf(recorder)["outcome"],
        "flaky",
        "the replay passes",
      );
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

      check.isEqualTo(
        seat,
        [recorder.message, records(recorder)[0]?.["verdict"]],
        ["prop.forAll: bad", "error"],
        "the fault",
      );
    });
  });
});
