// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of what a property writes to its store, and of the faults of the store. */

import { join } from "node:path";
import { describe } from "vitest";
import { check } from "../../../src/index.js";
import type { Fault } from "../../../src/matcher/fault.js";
import { FOR_ALL } from "../../../src/prop/detail.js";
import { load } from "../../../src/prop/directory.js";
import { type Outcome, Tally } from "../../../src/prop/engine/tally.js";
import { adapt } from "../../../src/prop/property/body.js";
import { saveOutcome, storeFaults } from "../../../src/prop/property/store.js";
import type { Call } from "../../../src/prop/property.js";
import { Recorder } from "../../../src/seat.js";
import { test as it } from "../../../src/vitest.js";
import { executed, temporary } from "../../helpers.js";

/** The call of the property of this spec. */
const CALL: Call = {
  op: "prop.forAll",
  assertion: FOR_ALL,
  contract: "c",
  where: undefined,
};

/** Returns the outcome of a counterexample of one case that fails. */
async function counterexample(): Promise<Outcome> {
  const failing = await executed(
    adapt(
      new Recorder(),
      undefined,
      (c) => check.isTrue(c, false, "the case fails"),
      CALL,
      undefined,
    ),
    [],
  );
  return new Tally(1n).take(failing) as Outcome;
}

/** Returns the location and the reason of each fault. */
function partsOf(faults: readonly Fault[]): [string, string][] {
  return faults.map((fault) => [fault.at, fault.reason]);
}

describe("store", () => {
  describe("saveOutcome", () => {
    it("writes an entry of the failing case of a counterexample", async ({ seat }) => {
      const dir = temporary();
      const faults = saveOutcome(dir, "c", await counterexample());

      check.isEqualTo(
        seat,
        [faults, load(dir, "c").entries.length],
        [[], 1],
        "one entry and no fault",
      );
    });

    it("writes nothing for a property without a store", async ({ seat }) => {
      check.isEmpty(seat, saveOutcome("", "c", await counterexample()), "no fault");
    });

    it("writes nothing for a counterexample of values", async ({ seat }) => {
      const dir = temporary();
      const outcome = { ...(await counterexample()), valued: true };
      saveOutcome(dir, "c", outcome);

      check.isEmpty(seat, load(dir, "c").entries, "no entry");
    });
  });

  describe("storeFaults", () => {
    it("states each file of the store that the run skipped", ({ seat }) => {
      const faults = storeFaults(
        "/store",
        { entries: [], skipped: ["later.json"] },
        new Tally(1n).outcome("passed"),
      );

      check.isEqualTo(
        seat,
        partsOf(faults),
        [
          [
            join("/store", "later.json"),
            "the entry is of a later format, so the run skips it",
          ],
        ],
        "the fault of the skipped file",
      );
    });

    it("states a stored case that decodes to other values than it records", async ({
      seat,
    }) => {
      const replayed = (await counterexample()).failing;
      const outcome: Outcome = {
        ...new Tally(1n).outcome("passed"),
        stored: replayed === undefined ? [] : [replayed],
      };
      const faults = storeFaults(
        "/store",
        {
          entries: [{ name: "a.json", choices: [], counterexample: [{ label: "x" }] }],
          skipped: [],
        },
        outcome,
      );

      check.isEqualTo(
        seat,
        partsOf(faults),
        [
          [
            join("/store", "a.json"),
            "the stored case decodes to other values than it records, and the run tested those",
          ],
        ],
        "the fault of the stored case",
      );
    });
  });
});
