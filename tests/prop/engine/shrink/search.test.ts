// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the searches of the passes of the shrinker. */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { FloatBounds } from "../../../../src/prop/engine/choice.js";
import {
  findInteger,
  roundedFloats,
  search,
} from "../../../../src/prop/engine/shrink/search.js";
import { drive, type Work } from "../../../../src/prop/engine/work.js";
import { test as it } from "../../../../src/vitest.js";

/** Returns a test of a search that accepts the values that accepts states, and records each probe in probes. */
function probing(
  accepts: (k: bigint) => boolean,
  probes: bigint[],
): (k: bigint) => Work<boolean> {
  // biome-ignore lint/correctness/useYield: the work waits on nothing.
  return function* (k: bigint): Work<boolean> {
    probes.push(k);
    return accepts(k);
  };
}

describe("search", () => {
  describe("findInteger", () => {
    it("returns the last count that a linear probe accepts", async ({ seat }) => {
      const probes: bigint[] = [];

      check.isEqualTo(
        seat,
        [await drive(findInteger(probing((k) => k <= 2n, probes))), probes],
        [2n, [1n, 2n, 3n]],
        "2, after three probes",
      );
    });

    it("doubles past the linear probes and then bisects", async ({ seat }) => {
      const probes: bigint[] = [];

      check.isEqualTo(
        seat,
        [await drive(findInteger(probing((k) => k <= 37n, probes))), probes],
        [37n, [1n, 2n, 3n, 4n, 5n, 10n, 20n, 40n, 30n, 35n, 37n, 38n]],
        "37",
      );
    });

    it("returns 0 when no count is accepted", async ({ seat }) => {
      check.isEqualTo(
        seat,
        await drive(findInteger(probing(() => false, []))),
        0n,
        "0",
      );
    });
  });

  describe("search", () => {
    it("tries the target first and stops when it is accepted", async ({ seat }) => {
      const probes: bigint[] = [];

      check.isEqualTo(
        seat,
        [
          await drive(
            search(
              10n,
              probing((p) => p === 0n, probes),
            ),
          ),
          probes,
        ],
        [true, [0n]],
        "one probe",
      );
    });

    it("bisects towards the smallest accepted position", async ({ seat }) => {
      const probes: bigint[] = [];

      check.isEqualTo(
        seat,
        [
          await drive(
            search(
              10n,
              probing((p) => p >= 3n, probes),
            ),
          ),
          probes,
        ],
        [true, [0n, 5n, 2n, 3n]],
        "the bisection to 3",
      );
    });

    it("reports false at the target without a probe", async ({ seat }) => {
      const probes: bigint[] = [];

      check.isEqualTo(
        seat,
        [
          await drive(
            search(
              0n,
              probing(() => true, probes),
            ),
          ),
          probes,
        ],
        [false, []],
        "no probe",
      );
    });

    it("reports false when no position is accepted", async ({ seat }) => {
      check.isFalse(
        seat,
        await drive(
          search(
            4n,
            probing(() => false, []),
          ),
        ),
        "no acceptance",
      );
    });
  });

  describe("roundedFloats", () => {
    it("yields roundings towards the target, then away from it, with fewer bits", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        [
          [...roundedFloats(2.75, new FloatBounds(0, 10))],
          [...roundedFloats(-2.75, new FloatBounds(-10, 10))],
        ],
        [
          [2, 3, 2.5, 3],
          [-2, -3, -2.5, -3],
        ],
        "towards 0 from each side",
      );
    });

    it("yields only the roundings that the bounds admit", ({ seat }) => {
      check.isEqualTo(
        seat,
        [...roundedFloats(2.75, new FloatBounds(2.6, 2.9))],
        [],
        "none inside [2.6, 2.9]",
      );
    });

    it("yields nothing for an integral value, an infinity and NaN", ({ seat }) => {
      const bounds = new FloatBounds(
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        true,
      );

      check.isEqualTo(
        seat,
        [3, Number.POSITIVE_INFINITY, Number.NaN].map((value) => [
          ...roundedFloats(value, bounds),
        ]),
        [[], [], []],
        "none",
      );
    });
  });
});
