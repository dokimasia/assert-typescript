// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the shapes of two choices. The decoded values are those of
 * the definition's reference implementation.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { UINT64_MAX } from "../../../../src/prop/engine/choice.js";
import {
  FIRST_DAY,
  FIRST_SECOND,
  LAST_SECOND,
} from "../../../../src/prop/engine/shape/calendar.js";
import {
  halves,
  InstantShape,
  Int128Shape,
  instantValue,
  LocalDateTimeShape,
  localValue,
  secondPart,
} from "../../../../src/prop/engine/shape/pair.js";
import { canonical, Fields } from "../../../../src/prop/engine/value.js";
import { test as it } from "../../../../src/vitest.js";
import { decodeFrom } from "../../../helpers.js";

/** The nanoseconds in a second. */
const NS = 1_000_000_000n;

/** The seconds since 1970-01-01T00:00:00Z of 2020-01-01T00:00:00Z. */
const START = 1_577_836_800n;

describe("pair", () => {
  describe("secondPart", () => {
    const tests = [
      {
        name: "the whole range between the bounds",
        give: 5n,
        want: `integer 0 ${UINT64_MAX}`,
      },
      {
        name: "the lower bound's second part at its first part",
        give: 1n,
        want: `integer 10 ${UINT64_MAX}`,
      },
      {
        name: "the upper bound's second part at its first part",
        give: 9n,
        want: "integer 0 20",
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.isEqualTo(
          seat,
          secondPart(tt.give, [1n, 10n], [9n, 20n], UINT64_MAX).id,
          tt.want,
          "the bounds",
        );
      });
    }
  });

  describe("halves", () => {
    it("returns the high and the low 64 bits of a 128-bit integer", ({ seat }) => {
      check.isEqualTo(
        seat,
        [halves(2n ** 64n + 3n), halves(-1n)],
        [
          [1n, 3n],
          [-1n, UINT64_MAX],
        ],
        "two splits",
      );
    });
  });

  describe("Int128Shape", () => {
    it("decodes its signed high half before its low half", ({ seat }) => {
      const signed = new Int128Shape(-(2n ** 127n), 2n ** 127n - 1n);
      const unsigned = new Int128Shape(0n, 2n ** 128n - 1n);

      check.isEqualTo(
        seat,
        [
          decodeFrom(signed, -1n, UINT64_MAX)[0],
          decodeFrom(signed, 1n, 0n)[0],
          decodeFrom(signed, -(2n ** 63n), 0n)[0],
          decodeFrom(unsigned, UINT64_MAX, UINT64_MAX)[0],
        ],
        [-1n, 2n ** 64n, -(2n ** 127n), 2n ** 128n - 1n],
        "four values",
      );
    });

    it("bounds its low half by the bound whose high half it shares", ({ seat }) => {
      const bounded = new Int128Shape(2n ** 64n + 10n, 2n ** 65n);

      check.isEqualTo(
        seat,
        [
          decodeFrom(bounded, 1n, 3n)[0],
          decodeFrom(bounded, 2n, 9n)[0],
          decodeFrom(bounded, 1n, 11n)[0],
        ],
        [2n ** 64n + 10n, 2n ** 65n, 2n ** 64n + 11n],
        "the low halves at the bounds",
      );
    });
  });

  describe("instantValue", () => {
    it("returns the record of the seconds and the units", ({ seat }) => {
      check.isEqualTo(
        seat,
        canonical(instantValue(7n, 8n)),
        canonical(
          new Fields([
            ["seconds", 7n],
            ["units", 8n],
          ]),
        ),
        "the two fields",
      );
    });
  });

  describe("localValue", () => {
    it("returns the record of the date and the time of day", ({ seat }) => {
      check.isEqualTo(
        seat,
        canonical(localValue(5n, 6n)),
        canonical(
          new Fields([
            ["date", 5n],
            ["time-of-day", 6n],
          ]),
        ),
        "the two fields",
      );
    });
  });

  describe("InstantShape", () => {
    it("decodes its seconds and its units", ({ seat }) => {
      const nanoseconds = new InstantShape(
        NS,
        [FIRST_SECOND, 0n],
        [LAST_SECOND, NS - 1n],
      );
      const seconds = new InstantShape(1n, [FIRST_SECOND, 0n], [LAST_SECOND, 0n]);
      const [value, c] = decodeFrom(seconds, LAST_SECOND);

      check.isEqualTo(
        seat,
        [
          canonical(decodeFrom(nanoseconds, -1n, NS - 1n)[0]),
          canonical(value),
          c.choices.length,
        ],
        [
          canonical(instantValue(-1n, NS - 1n)),
          canonical(instantValue(LAST_SECOND, 0n)),
          1,
        ],
        "two choices at nanoseconds, and one at seconds",
      );
    });

    it("stops the units of the second of its bound", ({ seat }) => {
      const bounded = new InstantShape(1_000n, [START, 500n], [LAST_SECOND, 999n]);

      check.isEqualTo(
        seat,
        [
          canonical(decodeFrom(bounded, START, 3n)[0]),
          canonical(decodeFrom(bounded, START + 1n, 3n)[0]),
        ],
        [canonical(instantValue(START, 500n)), canonical(instantValue(START + 1n, 3n))],
        "500 at the bound's second, and 3 after it",
      );
    });
  });

  describe("LocalDateTimeShape", () => {
    it("stops the time of day of the date of its bound", ({ seat }) => {
      const bounded = new LocalDateTimeShape(1n, [FIRST_DAY, 0n], [1n, 43_200n]);

      check.isEqualTo(
        seat,
        [
          canonical(decodeFrom(bounded, 1n, 86_399n)[0]),
          canonical(decodeFrom(bounded, 0n, 86_399n)[0]),
        ],
        [canonical(localValue(1n, 0n)), canonical(localValue(0n, 86_399n))],
        "the bound's date, and the date before it",
      );
    });
  });
});
