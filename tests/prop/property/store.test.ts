// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of what a property writes to its store, and of the faults of the store. */

import { join } from "node:path";
import { describe } from "vitest";
import { check } from "../../../src/index.js";
import type { Fault } from "../../../src/matcher/fault.js";
import { FOR_ALL } from "../../../src/prop/detail.js";
import { load } from "../../../src/prop/directory.js";
import type { Execution } from "../../../src/prop/engine/execution.js";
import type { StoredRun } from "../../../src/prop/engine/stored.js";
import { type Outcome, Tally } from "../../../src/prop/engine/tally.js";
import { TraceError } from "../../../src/prop/engine/trace.js";
import { adapt } from "../../../src/prop/property/body.js";
import {
  saveOutcome,
  storedCases,
  storeFaults,
} from "../../../src/prop/property/store.js";
import type { Call } from "../../../src/prop/property.js";
import { Recorder } from "../../../src/seat.js";
import { test as it } from "../../../src/vitest.js";
import { executed, integers, temporary } from "../../helpers.js";

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

/** The reason of the fault of a stored case whose run tested the values of its choices. */
const TESTED =
  "the stored case decodes to other values than it records, and the run tested those";

/**
 * Returns the faults of a store of the entry a.json, whose counterexample is
 * recorded, after a run whose stored case ran with the failing case of a
 * counterexample as the case of its choices, with run.
 */
async function faultsOf(
  run: Partial<StoredRun>,
  recorded: Record<string, unknown>[] = [{ label: "x" }],
): Promise<Fault[]> {
  const execution = (await counterexample()).failing as Execution;
  const outcome: Outcome = {
    ...new Tally(1n).outcome("passed"),
    stored: [
      { execution, replayed: false, refusal: undefined, untaken: undefined, ...run },
    ],
  };
  return storeFaults(
    "/store",
    {
      entries: [{ name: "a.json", choices: [], counterexample: recorded }],
      skipped: [],
    },
    outcome,
  );
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

    it("states a stored case whose run tested the values of its choices", async ({
      seat,
    }) => {
      const [fault] = await faultsOf({});

      check.isEqualTo(
        seat,
        [fault?.at, fault?.reason, fault?.cause],
        [join("/store", "a.json"), TESTED, undefined],
        "the case of the choices failed, so the run did not follow the trace",
      );
    });

    it("states the refusal of the trace as the cause of the fault", async ({
      seat,
    }) => {
      const [fault] = await faultsOf({ refusal: new TraceError(0, "y", "label") });
      const cause = fault?.cause as Fault;

      check.isEqualTo(
        seat,
        [fault?.reason, cause.at, cause.reason],
        [
          TESTED,
          "counterexample[0].label",
          'the draw labelled "y" takes the entry labelled "x"',
        ],
        "the cause is at the entry of the counterexample",
      );
    });

    it("states the untaken entry as the cause of the fault", async ({ seat }) => {
      const [fault] = await faultsOf({ untaken: 0 });
      const cause = fault?.cause as Fault;

      check.isEqualTo(
        seat,
        [cause.at, cause.reason],
        [
          "counterexample[0]",
          "the case of the counterexample leaves the entry untaken",
        ],
        "the cause is at the first untaken entry",
      );
    });

    it("states a stored case whose run replayed its counterexample", async ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        partsOf(await faultsOf({ replayed: true })),
        [
          [
            join("/store", "a.json"),
            "the stored case decodes to other values than it records, and the run replayed its counterexample",
          ],
        ],
        "the fault of the replayed case",
      );
    });

    it("states nothing for a stored case that decodes to its entry", async ({
      seat,
    }) => {
      check.isEmpty(seat, await faultsOf({}, []), "no fault");
    });
  });

  describe("storedCases", () => {
    it("returns the stored case of each entry with its counterexample as a trace", ({
      seat,
    }) => {
      const [stored] = storedCases({
        entries: [
          {
            name: "a.json",
            choices: integers(3n),
            counterexample: [{ label: "x", value: { type: "int", value: 3 } }],
          },
        ],
        skipped: [],
      });

      check.isEqualTo(
        seat,
        [stored?.choices, stored?.trace],
        [integers(3n), [{ label: "x", value: 3n }]],
        "the choices and the trace of the entry",
      );
    });
  });
});
