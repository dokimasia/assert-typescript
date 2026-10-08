/** The spec of fuzz, which replays a property's stored cases and returns the target of a fuzzer. */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { check } from "../../src/index.js";
import { nameTest } from "../../src/matcher/seat.js";
import type { Case } from "../../src/prop/case.js";
import { forAll } from "../../src/prop/forall.js";
import { fuzz } from "../../src/prop/fuzz.js";
import { bytes } from "../../src/prop/generators.js";
import { hermetic, seed, store } from "../../src/prop/option.js";
import { AssertionFailed, Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import { enter, records, setVariable, temporary } from "../helpers.js";

/** The variable that a mutation run sets in every process that it instruments. */
const MUTANT = "DOKIMI_MUTATE_MUTANT";

/** A body that fails for a byte string that starts with 7. */
function noLeadingSeven(c: Case): void {
  const data = c.draw(bytes({ maxSize: 4 }), "data");
  check.isFalse(c, data[0] === 7, "the data does not start with 7");
}

describe("fuzz", () => {
  describe("fuzz", () => {
    it("returns a target that passes an input that the body passes", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      const target = await fuzz(
        recorder,
        "no leading seven",
        noLeadingSeven,
        hermetic(),
        seed(1n),
      );
      await target(Uint8Array.of(1, 1));

      check.isEmpty(seat, recorder.failures, "the replay of no stored case passes");
    });

    it("returns a target that rejects a failing input with the sentence of its counterexample", async ({
      seat,
    }) => {
      const target = await fuzz(
        new Recorder(),
        "no leading seven",
        noLeadingSeven,
        hermetic(),
        seed(1n),
        store(""),
      );
      const err = await check.rejectsWith(
        seat,
        () => target(Uint8Array.of(2, 7, 7)),
        "the input fails",
      );

      check.isTrue(seat, err instanceof AssertionFailed, "the target's seat fails");
      check.hasPrefix(
        seat,
        (err as Error).message,
        "no leading seven: counterexample after 0 valid",
        "the sentence",
      );
    });

    it("fails the call at a stored case that fails", async ({ seat }) => {
      setVariable(MUTANT, undefined);
      const dir = temporary();
      await forAll(
        new Recorder(),
        "no leading seven",
        (c) => {
          const data = c.draw(bytes({ maxSize: 4 }), "data");
          check.isFalse(c, data.length > 0, "the data is empty");
        },
        hermetic(),
        seed(1n),
        store(dir),
      );
      const recorder = new Recorder();
      await fuzz(
        recorder,
        "no leading seven",
        (c) => {
          const data = c.draw(bytes({ maxSize: 4 }), "data");
          check.isFalse(c, data.length > 0, "the data is empty");
        },
        hermetic(),
        seed(1n),
        store(dir),
      );

      check.equal(
        seat,
        [recorder.failures[0]?.detail["outcome"], records(recorder)[1]?.["phase"]],
        ["counterexample", "stored"],
        "the stored case fails as found",
      );
    });

    it("runs each seed file of the test as one input of its own", async ({ seat }) => {
      const dir = temporary();
      enter(dir);
      const recorder = new Recorder();
      nameTest(recorder, ["parse.test.ts", "parses"]);
      const seeds = join(dir, "testdata", "fuzz", "parse.test.ts", "parses");
      mkdirSync(seeds, { recursive: true });
      writeFileSync(join(seeds, "a"), Uint8Array.of(1, 1));
      writeFileSync(join(seeds, "b"), Uint8Array.of(1, 7));
      await fuzz(
        recorder,
        "no leading seven",
        noLeadingSeven,
        hermetic(),
        seed(1n),
        store(""),
      );

      check.equal(
        seat,
        records(recorder)
          .filter((one) => one["parent"] === undefined)
          .map((one) => [
            one["verdict"],
            (one["detail"] as Record<string, unknown>)["outcome"],
          ]),
        [
          ["pass", "passed"],
          ["pass", "passed"],
          ["fail", "counterexample"],
        ],
        "the stored cases, then two seed files",
      );
    });

    it("returns a target that rejects every input with the fault that ends the call", async ({
      seat,
    }) => {
      setVariable("DOKIMI_ASSERT_PROP_PROFILE", "fast");
      const recorder = new Recorder();
      const target = await fuzz(recorder, "c", noLeadingSeven);
      const err = await check.rejectsWith(
        seat,
        () => target(Uint8Array.of()),
        "the target rejects",
      );

      check.equal(
        seat,
        [recorder.message, (err as Error).message],
        [
          'prop.fuzz: DOKIMI_ASSERT_PROP_PROFILE: "fast" names none of the default, ci and campaign profiles',
          'prop.fuzz: DOKIMI_ASSERT_PROP_PROFILE: "fast" names none of the default, ci and campaign profiles',
        ],
        "the fault",
      );
    });

    it("ends the call with a fault for seed files that cannot be read", async ({
      seat,
    }) => {
      const dir = temporary();
      enter(dir);
      const recorder = new Recorder();
      nameTest(recorder, ["parse.test.ts", "parses"]);
      mkdirSync(join(dir, "testdata", "fuzz", "parse.test.ts"), { recursive: true });
      writeFileSync(join(dir, "testdata", "fuzz", "parse.test.ts", "parses"), "");
      await fuzz(recorder, "c", noLeadingSeven, hermetic(), store(""));

      check.hasPrefix(
        seat,
        recorder.message,
        `prop.fuzz: ${join("testdata", "fuzz", "parse.test.ts", "parses")}: the seed files cannot be read: `,
        "the fault",
      );
    });
  });
});
