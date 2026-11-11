// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the run of a stored case. Each case that counts is the one
 * that the definition's reference implementation counts for the same stored
 * case.
 */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { Replaying } from "../../../src/prop/engine/case/providers.js";
import { MAX_CHOICES } from "../../../src/prop/engine/case.js";
import { IntegerBounds } from "../../../src/prop/engine/choice.js";
import {
  type Execution,
  type Phase,
  type Status,
  unobserved,
} from "../../../src/prop/engine/execution.js";
import { Integer } from "../../../src/prop/engine/generator.js";
import {
  runKnown,
  runStoredCase,
  Stored,
  type StoredRun,
} from "../../../src/prop/engine/stored.js";
import type { Entry } from "../../../src/prop/engine/trace.js";
import { drive } from "../../../src/prop/engine/work.js";
import { test as it } from "../../../src/vitest.js";
import { body, integers } from "../../helpers.js";

const WIDE = new Integer(new IntegerBounds(0n, 2n ** 32n));
const MILLION = 1_000_000n;

/** A body that draws a wide integer and fails above a million. */
const aboveMillion = body((c) => {
  if (c.draw(WIDE, "n") > MILLION) {
    c.fail("big");
  }
});

/** Reports that a case does not decode to the counterexample of its entry. */
function neverMatches(): boolean {
  return false;
}

/** Returns the run of a stored case of the integer choices of values, the trace and matches, with the phase and the status of each call that the observer saw. */
async function ran(
  values: readonly bigint[],
  trace: readonly Entry[],
  matches?: (execution: Execution) => boolean,
): Promise<[StoredRun, [Phase, Status][]]> {
  const calls: [Phase, Status][] = [];
  const stored = new Stored(integers(...values), trace, matches);
  const run = await drive(
    runStoredCase(aboveMillion, stored, MAX_CHOICES, (phase, execution) => {
      calls.push([phase, execution.status]);
    }),
  );
  return [run, calls];
}

describe("stored", () => {
  describe("new Stored", () => {
    it("has an empty trace and no matcher by default", ({ seat }) => {
      const one = new Stored(integers(3n));

      check.isEqualTo(
        seat,
        [one.choices, one.trace, one.matches],
        [integers(3n), [], undefined],
        "the stored case has its choices alone",
      );
    });
  });

  describe("runStoredCase", () => {
    it("counts the case of the choices of a case without a matcher", async ({
      seat,
    }) => {
      const [run, calls] = await ran([3n], [{ label: "n", value: MILLION + 1n }]);

      check.isEqualTo(
        seat,
        [run.execution.case.draws[0]?.value, run.replayed, calls],
        [3n, false, [["stored", "passed"]]],
        "the trace does not run",
      );
    });

    it("counts the case of the choices that matches its entry", async ({ seat }) => {
      const [run, calls] = await ran(
        [3n],
        [{ label: "n", value: MILLION + 1n }],
        () => true,
      );

      check.isEqualTo(
        seat,
        [run.execution.case.draws[0]?.value, run.replayed, calls],
        [3n, false, [["stored", "passed"]]],
        "the matcher reports a match",
      );
    });

    it("counts the case of the choices that fails", async ({ seat }) => {
      const [run, calls] = await ran(
        [MILLION + 2n],
        [{ label: "n", value: 3n }],
        neverMatches,
      );

      check.isEqualTo(
        seat,
        [run.execution.case.draws[0]?.value, run.replayed, calls],
        [MILLION + 2n, false, [["stored", "failed"]]],
        "a failing case counts whatever it decodes to",
      );
    });

    it("counts the case of the trace that fails", async ({ seat }) => {
      const [run, calls] = await ran(
        [3n],
        [{ label: "n", value: MILLION + 1n }],
        neverMatches,
      );

      check.isEqualTo(
        seat,
        [run.execution.case.draws[0]?.value, run.replayed, calls],
        [
          MILLION + 1n,
          true,
          [
            ["stored", "passed"],
            ["stored", "failed"],
          ],
        ],
        "the choices decode to 3, and the entry records a value above a million",
      );
    });

    it("counts the case of the trace that takes every entry", async ({ seat }) => {
      const [run] = await ran([3n], [{ label: "n", value: 5n }], neverMatches);

      check.isEqualTo(
        seat,
        [run.execution.case.draws[0]?.value, run.execution.status, run.replayed],
        [5n, "passed", true],
        "the case of the trace passes",
      );
    });

    it("counts the case of the trace that fails before its last entry", async ({
      seat,
    }) => {
      const [run] = await ran(
        [3n],
        [
          { label: "n", value: MILLION + 1n },
          { label: "m", value: 1n },
        ],
        neverMatches,
      );

      check.isEqualTo(
        seat,
        [run.execution.status, run.replayed, run.untaken],
        ["failed", true, undefined],
        "the body fails before the draw of the second entry",
      );
    });

    it("counts the case of the choices when the body refuses an entry", async ({
      seat,
    }) => {
      const [run, calls] = await ran([3n], [{ label: "m", value: 5n }], neverMatches);

      check.isEqualTo(
        seat,
        [
          run.execution.case.draws[0]?.value,
          run.replayed,
          [run.refusal?.entry, run.refusal?.what],
          calls,
        ],
        [3n, false, [0, "n"], [["stored", "passed"]]],
        "the draw labelled n takes the entry labelled m",
      );
    });

    it("counts the case of the choices when the trace leaves an entry untaken", async ({
      seat,
    }) => {
      const [run, calls] = await ran(
        [3n],
        [
          { label: "n", value: 5n },
          { label: "m", value: 6n },
        ],
        neverMatches,
      );

      check.isEqualTo(
        seat,
        [run.execution.case.draws[0]?.value, run.replayed, run.untaken, calls],
        [3n, false, 1, [["stored", "passed"]]],
        "the body draws one value of two entries",
      );
    });

    it("throws an error of the body that is no refusal of the trace", async ({
      seat,
    }) => {
      const broken = new TypeError("broken");
      let calls = 0;
      const work = runStoredCase(
        body((c) => {
          calls += 1;
          c.draw(WIDE, "n");
          if (calls === 2) {
            throw broken;
          }
        }),
        new Stored(integers(3n), [{ label: "n", value: 5n }], neverMatches),
        MAX_CHOICES,
        unobserved,
      );

      check.isEqualTo(
        seat,
        await drive(work).catch((err: unknown) => err),
        broken,
        "the error of the case of the trace passes through",
      );
    });
  });

  describe("runKnown", () => {
    it("adds the run of a stored case to the runs of the stored cases", async ({
      seat,
    }) => {
      const stored: StoredRun[] = [];
      const execution = await drive(
        runKnown(
          aboveMillion,
          "stored",
          new Stored(integers(3n)),
          MAX_CHOICES,
          unobserved,
          stored,
        ),
      );

      check.isEqualTo(
        seat,
        [execution.case.draws[0]?.value, stored.map((one) => one.execution)],
        [3n, [execution]],
        "the run counts the case of the choices",
      );
    });

    it("runs any other case under its phase", async ({ seat }) => {
      const stored: StoredRun[] = [];
      const phases: Phase[] = [];
      await drive(
        runKnown(
          aboveMillion,
          "example",
          new Replaying(integers(5n)),
          MAX_CHOICES,
          (phase) => phases.push(phase),
          stored,
        ),
      );

      check.isEqualTo(seat, [phases, stored], [["example"], []], "an example");
    });
  });
});
