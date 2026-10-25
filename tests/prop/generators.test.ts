// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the generators of the property engine. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { Replaying } from "../../src/prop/engine/case/providers.js";
import { Case } from "../../src/prop/engine/case.js";
import { invert } from "../../src/prop/engine/inverse.js";
import { list } from "../../src/prop/generators/collections.js";
import {
  boolean,
  composite,
  duration,
  float,
  integer,
  just,
  oneOf,
  optional,
  recursive,
  sampledFrom,
} from "../../src/prop/generators.js";
import { test as it } from "../../src/vitest.js";
import { decoded, int, thrown } from "../helpers.js";

describe("generators", () => {
  describe("integer", () => {
    it("returns numbers of bounds stated as numbers", ({ seat }) => {
      check.isEqualTo(seat, decoded(integer(-5, 5), int(-3n)), -3, "a number");
    });

    it("returns bigints up to 2^64 - 1 for bounds stated as bigints", ({ seat }) => {
      check.isEqualTo(
        seat,
        decoded(integer(0n, 2n ** 64n - 1n), int(2n ** 64n - 1n)),
        2n ** 64n - 1n,
        "a bigint",
      );
    });

    it("runs a number or a bigint back to one choice", ({ seat }) => {
      check.isEqualTo(
        seat,
        [invert(integer(0, 9), 3), invert(integer(0, 9), 3n)],
        [[int(3n)], [int(3n)]],
        "the choice 3",
      );
    });

    {
      const tests = [
        {
          name: "bounds of two types",
          give: () => integer(0 as never, 1n as never),
          want: "prop: integer(0, 1) states bounds of two types",
        },
        {
          name: "a number that is no safe integer",
          give: () => integer(0, 2 ** 60),
          want: `prop: integer(0, ${2 ** 60}) states ${2 ** 60}, which is no safe integer`,
        },
        {
          name: "bounds of no value",
          give: () => integer(5, 1),
          want: "prop: integer(5, 1) states no value",
        },
        {
          name: "bounds beyond both 64-bit ranges",
          give: () => integer(-1n, 2n ** 64n - 1n),
          want: `prop: integer(-1, ${2n ** 64n - 1n}) states no value`,
        },
      ];
      for (const tt of tests) {
        it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
          check.isEqualTo(seat, thrown(tt.give), tt.want, "the refusal");
        });
      }
    }
  });

  describe("float", () => {
    it("returns the float of a choice", ({ seat }) => {
      check.isEqualTo(
        seat,
        decoded(float(0, 1), { kind: "float", value: 0.5 }),
        0.5,
        "0.5",
      );
    });

    it("returns NaN when allowNan states it", ({ seat }) => {
      check.isTrue(
        seat,
        Number.isNaN(
          decoded(float(0, 1, { allowNan: true }), {
            kind: "float",
            value: Number.NaN,
          }),
        ),
        "NaN",
      );
    });

    it("throws a RangeError for bounds of no float", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => float(2, 1)),
        "prop: float(2, 1) states no value: float bounds [2, 1] are empty",
        "the refusal",
      );
    });

    it("throws a RangeError for a bound that is no value of the width", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => float(0.1, 1, { width: 32 })),
        "prop: float(0.1, 1) states no value: float bound 0.1 is no value of width 32",
        "the refusal",
      );
    });
  });

  describe("boolean", () => {
    it("returns the boolean of a choice of 0 or 1", ({ seat }) => {
      check.isEqualTo(
        seat,
        [decoded(boolean(), int(0n)), decoded(boolean(), int(1n))],
        [false, true],
        "two booleans",
      );
    });

    it("returns booleans of a probability stated as numbers", ({ seat }) => {
      check.isTrue(seat, decoded(boolean({ p: [2, 4] }), int(1n)), "true");
    });

    it("throws a RangeError for a probability above 1", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => boolean({ p: [3n, 2n] })),
        "prop: boolean({ p: [3, 2] }) states no probability",
        "the refusal",
      );
    });
  });

  describe("just", () => {
    it("returns the value without a choice", ({ seat }) => {
      const c = new Case(new Replaying([]));

      check.isEqualTo(
        seat,
        [c.draw(just("x"), "v"), c.choices.length],
        ["x", 0],
        "the value",
      );
    });
  });

  describe("sampledFrom", () => {
    it("returns the value of an index", ({ seat }) => {
      check.isEqualTo(
        seat,
        decoded(sampledFrom("a", "b", "c"), int(2n)),
        "c",
        "the third value",
      );
    });

    it("throws a RangeError for no value", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => sampledFrom()),
        "prop: sampledFrom() states no value",
        "the refusal",
      );
    });
  });

  describe("oneOf", () => {
    it("returns a value of the generator of an index", ({ seat }) => {
      check.isEqualTo(
        seat,
        decoded(oneOf(just(10), integer(0, 9)), int(1n), int(4n)),
        4,
        "the second generator's value",
      );
    });

    it("throws a RangeError for no generator", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => oneOf()),
        "prop: oneOf() states no generator",
        "the refusal",
      );
    });
  });

  describe("optional", () => {
    it("returns undefined only for an absent value", ({ seat }) => {
      check.isEqualTo(
        seat,
        [
          decoded(optional(integer(0, 9)), int(0n)),
          decoded(optional(integer(0, 9)), int(1n), int(7n)),
        ],
        [undefined, 7],
        "absent and present",
      );
    });
  });

  describe("duration", () => {
    const lo = Temporal.Duration.from("-PT1S");
    const hi = Temporal.Duration.from("P2D");

    it("returns a duration of nanoseconds balanced from the hours down", ({ seat }) => {
      check.isEqualTo(
        seat,
        decoded(duration(lo, hi), int(90_000_000_000_000n)).toString(),
        "PT25H",
        "25 hours",
      );
    });

    it("runs a duration or its nanoseconds back to one choice", ({ seat }) => {
      check.isEqualTo(
        seat,
        [
          invert(duration(lo, hi), Temporal.Duration.from("PT1H")),
          invert(duration(lo, hi), 3_600_000_000_000n),
        ],
        [[int(3_600_000_000_000n)], [int(3_600_000_000_000n)]],
        "an hour",
      );
    });

    {
      const tests = [
        {
          name: "a bound with a calendar unit",
          give: () => duration(lo, Temporal.Duration.from("P1M")),
          want: "prop: duration(-PT1S, P1M) states a calendar unit",
        },
        {
          name: "bounds of no duration",
          give: () => duration(hi, lo),
          want: "prop: duration(P2D, -PT1S) states no duration",
        },
        {
          name: "a bound beyond 2^63 - 1 nanoseconds",
          give: () => duration(lo, Temporal.Duration.from({ hours: 3_000_000 })),
          want: "prop: duration(-PT1S, PT3000000H) states no duration",
        },
      ];
      for (const tt of tests) {
        it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
          check.isEqualTo(seat, thrown(tt.give), tt.want, "the refusal");
        });
      }
    }
  });

  describe("recursive", () => {
    it("returns the base's value at a position that takes the base", ({ seat }) => {
      const generator = recursive<unknown>(integer(0, 9), (self) => list(self));

      check.isEqualTo(seat, decoded(generator, int(0n), int(6n)), 6, "a leaf");
    });

    it("throws a RangeError for a maxLeaves below 1", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => recursive(integer(0, 9), (self) => self, { maxLeaves: 0 })),
        "prop: recursive({ maxLeaves: 0 }) states no count of 1 or more",
        "the refusal",
      );
    });
  });

  describe("composite", () => {
    it("returns what its function draws from the case", ({ seat }) => {
      const pair = composite((c) => [
        c.draw(integer(0, 9), "a"),
        c.draw(integer(0, 9), "b"),
      ]);

      check.isEqualTo(seat, decoded(pair, int(1n), int(2n)), [1, 2], "two draws");
    });
  });
});
