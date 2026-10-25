// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the relations of what a subject refuses. It uses vitest's
 * `expect` alone, because the surfaces call these assertions.
 */

import { describe, expect, it } from "vitest";
import * as refusal from "../../src/matcher/refusal.js";
import { Mode } from "../../src/matcher/seat.js";
import { Recorder } from "../../src/seat.js";

/** The contract that every call passes. */
const MSG = "the stated contract";

/** Runs one call of a relation on a fresh recorder, and returns the recorder. */
async function drive(call: (seat: Recorder) => unknown): Promise<Recorder> {
  const seat = new Recorder();
  await call(seat);
  return seat;
}

/** Returns the assertion and the detail of each failure that seat received. */
function reported(seat: Recorder): [string, unknown][] {
  return seat.failures.map((f) => [f.assertion, f.detail]);
}

const boom = new Error("boom");

describe("refusal", () => {
  describe("isTotal", () => {
    it("passes a call that succeeds for every element", async () => {
      const seat = await drive((s) =>
        refusal.isTotal(s, Mode.Fatal, () => undefined, [1, 2, 3], MSG),
      );

      expect(seat.failed).toBe(false);
    });

    it("passes an empty domain", async () => {
      const seat = await drive((s) =>
        refusal.isTotal(
          s,
          Mode.Fatal,
          () => {
            throw boom;
          },
          [],
          MSG,
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports the index with the error of a later element", async () => {
      const seat = await drive((s) =>
        refusal.isTotal(
          s,
          Mode.Fatal,
          async (x: number) => {
            if (x === 3) {
              throw boom;
            }
          },
          new Set([1, 2, 3]),
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["total", { index: 2, got: boom }]]);
    });
  });

  describe("failsAfterClose", () => {
    class Closed extends Error {}
    const sentinel = new Closed("closed");

    const tests: {
      name: string;
      giveClose: () => unknown;
      giveCall: () => unknown;
      giveSentinel: unknown;
      want?: Record<string, unknown>;
    }[] = [
      {
        name: "passes a call that throws the sentinel",
        giveClose: () => undefined,
        giveCall: () => {
          throw sentinel;
        },
        giveSentinel: sentinel,
      },
      {
        name: "passes a call that rejects with an error that wraps the sentinel",
        giveClose: () => undefined,
        giveCall: async () => {
          throw new Error("while reading", { cause: sentinel });
        },
        giveSentinel: sentinel,
      },
      {
        name: "passes a call that throws an error of the sentinel class",
        giveClose: () => undefined,
        giveCall: () => {
          throw new Closed("another");
        },
        giveSentinel: Closed,
      },
      {
        name: "reports a call that returns with got null",
        giveClose: () => undefined,
        giveCall: () => 1,
        giveSentinel: sentinel,
        want: { want: sentinel, got: null },
      },
      {
        name: "reports a call that fails with another error",
        giveClose: () => undefined,
        giveCall: () => {
          throw boom;
        },
        giveSentinel: sentinel,
        want: { want: sentinel, got: boom },
      },
      {
        name: "reports a throw of close as got with want null",
        giveClose: () => {
          throw boom;
        },
        giveCall: () => undefined,
        giveSentinel: sentinel,
        want: { want: null, got: boom },
      },
    ];

    for (const tt of tests) {
      it(tt.name, async () => {
        const seat = await drive((s) =>
          refusal.failsAfterClose(
            s,
            Mode.Fatal,
            tt.giveClose,
            tt.giveCall,
            tt.giveSentinel,
            MSG,
          ),
        );

        expect(reported(seat)).toEqual(
          tt.want === undefined ? [] : [["after-close", tt.want]],
        );
      });
    }
  });

  describe("isPoisoned", () => {
    it("passes a subject whose 32 readings after induce all throw", async () => {
      let readings = 0;
      const seat = await drive((s) =>
        refusal.isPoisoned(
          s,
          Mode.Fatal,
          () => undefined,
          () => {
            readings += 1;
            if (readings <= 32) {
              throw boom;
            }
          },
          MSG,
        ),
      );

      expect(seat.failed).toBe(false);
    });

    it("reports the first reading that returns with what it returned", async () => {
      let readings = 0;
      const seat = await drive((s) =>
        refusal.isPoisoned(
          s,
          Mode.Fatal,
          () => undefined,
          async () => {
            readings += 1;
            if (readings < 3) {
              throw boom;
            }
            return "served";
          },
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["poisoned", { index: 2, got: "served" }]]);
    });

    it("reports a throw of induce as got with index null", async () => {
      const seat = await drive((s) =>
        refusal.isPoisoned(
          s,
          Mode.Fatal,
          () => {
            throw boom;
          },
          () => undefined,
          MSG,
        ),
      );

      expect(reported(seat)).toEqual([["poisoned", { index: null, got: boom }]]);
    });
  });
});
