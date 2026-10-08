/** The spec of the generators of the property engine. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { Case, Replaying } from "../../src/prop/engine/case.js";
import type { Choice } from "../../src/prop/engine/choice.js";
import type { Generator } from "../../src/prop/engine/generator.js";
import { invert } from "../../src/prop/engine/inverse.js";
import { Pairs } from "../../src/prop/engine/value.js";
import {
  boolean,
  bytes,
  composite,
  dict,
  duration,
  float,
  integer,
  just,
  list,
  oneOf,
  optional,
  permutation,
  recursive,
  sampledFrom,
  string,
  stringMatching,
} from "../../src/prop/generators.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

/** Returns the value that generator decodes from choices. */
function decoded<T>(generator: Generator<T>, ...choices: Choice[]): T {
  return new Case(new Replaying(choices)).draw(generator, "value");
}

/** The choice of an integer. */
function int(value: bigint): Choice {
  return { kind: "integer", value };
}

/** The choice of a sequence. */
function seq(...value: number[]): Choice {
  return { kind: "sequence", value };
}

describe("generators", () => {
  describe("integer", () => {
    it("returns numbers of bounds stated as numbers", ({ seat }) => {
      check.equal(seat, decoded(integer(-5, 5), int(-3n)), -3, "a number");
    });

    it("returns bigints up to 2^64 - 1 for bounds stated as bigints", ({ seat }) => {
      check.equal(
        seat,
        decoded(integer(0n, 2n ** 64n - 1n), int(2n ** 64n - 1n)),
        2n ** 64n - 1n,
        "a bigint",
      );
    });

    it("runs a number or a bigint back to one choice", ({ seat }) => {
      check.equal(
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
          check.equal(seat, thrown(tt.give), tt.want, "the refusal");
        });
      }
    }
  });

  describe("float", () => {
    it("returns the float of a choice", ({ seat }) => {
      check.equal(
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
      check.equal(
        seat,
        thrown(() => float(2, 1)),
        "prop: float(2, 1) states no value: float bounds [2, 1] are empty",
        "the refusal",
      );
    });

    it("throws a RangeError for a bound that is no value of the width", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => float(0.1, 1, { width: 32 })),
        "prop: float(0.1, 1) states no value: float bound 0.1 is no value of width 32",
        "the refusal",
      );
    });
  });

  describe("boolean", () => {
    it("returns the boolean of a choice of 0 or 1", ({ seat }) => {
      check.equal(
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
      check.equal(
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

      check.equal(
        seat,
        [c.draw(just("x"), "v"), c.choices.length],
        ["x", 0],
        "the value",
      );
    });
  });

  describe("sampledFrom", () => {
    it("returns the value of an index", ({ seat }) => {
      check.equal(
        seat,
        decoded(sampledFrom("a", "b", "c"), int(2n)),
        "c",
        "the third value",
      );
    });

    it("throws a RangeError for no value", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => sampledFrom()),
        "prop: sampledFrom() states no value",
        "the refusal",
      );
    });
  });

  describe("oneOf", () => {
    it("returns a value of the generator of an index", ({ seat }) => {
      check.equal(
        seat,
        decoded(oneOf(just(10), integer(0, 9)), int(1n), int(4n)),
        4,
        "the second generator's value",
      );
    });

    it("throws a RangeError for no generator", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => oneOf()),
        "prop: oneOf() states no generator",
        "the refusal",
      );
    });
  });

  describe("optional", () => {
    it("returns undefined only for an absent value", ({ seat }) => {
      check.equal(
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

  describe("list", () => {
    it("returns the elements of the continue choices", ({ seat }) => {
      check.equal(
        seat,
        decoded(list(integer(0, 9)), int(1n), int(4n), int(1n), int(5n), int(0n)),
        [4, 5],
        "two elements",
      );
    });

    it("discards an element equal to an earlier one of a unique list", ({ seat }) => {
      check.equal(
        seat,
        decoded(
          list(integer(0, 9), { unique: true }),
          int(1n),
          int(4n),
          int(1n),
          int(4n),
          int(0n),
        ),
        [4],
        "one element",
      );
    });

    {
      const tests = [
        {
          name: "a maximum below the minimum",
          give: { minSize: 2, maxSize: 1 },
          want: "prop: list states the sizes [2, 1], which admit no length",
        },
        {
          name: "a negative minimum",
          give: { minSize: -1 },
          want: "prop: list states the sizes [-1, undefined], which admit no length",
        },
        {
          name: "a maximum that is no whole number",
          give: { maxSize: 1.5 },
          want: "prop: list states the sizes [0, 1.5], which admit no length",
        },
      ];
      for (const tt of tests) {
        it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
          check.equal(
            seat,
            thrown(() => list(integer(0, 9), tt.give)),
            tt.want,
            "the refusal",
          );
        });
      }
    }
  });

  describe("dict", () => {
    it("returns a Map of the entries", ({ seat }) => {
      check.equal(
        seat,
        decoded(dict(integer(0, 9), boolean()), int(1n), int(3n), int(1n), int(0n)),
        new Map([[3, true]]),
        "one entry",
      );
    });

    it("runs a Map or the engine's entries back to choices", ({ seat }) => {
      const generator = dict(integer(0, 9), boolean(), { maxSize: 1 });

      check.equal(
        seat,
        invert(generator, new Map([[3, true]])),
        invert(generator, new Pairs([[3n, true]])),
        "one choice sequence",
      );
    });

    it("throws a RangeError for sizes that admit no length", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => dict(integer(0, 9), boolean(), { minSize: 3, maxSize: 2 })),
        "prop: dict states the sizes [3, 2], which admit no length",
        "the refusal",
      );
    });
  });

  describe("string", () => {
    it("returns the characters of the default alphabet with the digits first", ({
      seat,
    }) => {
      check.equal(seat, decoded(string(), seq(0, 1, 10)), "01a", "three characters");
    });

    it("returns the characters of a stated alphabet", ({ seat }) => {
      check.equal(
        seat,
        decoded(string({ alphabet: "xy" }), seq(1, 0)),
        "yx",
        "two characters",
      );
    });

    {
      const tests = [
        {
          name: "an empty alphabet",
          give: "",
          want: 'prop: string({ alphabet: "" }) states no character',
        },
        {
          name: "an alphabet that repeats a character",
          give: "aa",
          want: 'prop: string({ alphabet: "aa" }) repeats a character',
        },
        {
          name: "an alphabet with a lone surrogate",
          give: "a\ud800",
          want: 'prop: string({ alphabet: "a\\ud800" }) has a lone surrogate',
        },
      ];
      for (const tt of tests) {
        it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
          check.equal(
            seat,
            thrown(() => string({ alphabet: tt.give })),
            tt.want,
            "the refusal",
          );
        });
      }
    }

    it("throws a RangeError for sizes that admit no length", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => string({ maxSize: -1 })),
        "prop: string states the sizes [0, -1], which admit no length",
        "the refusal",
      );
    });
  });

  describe("bytes", () => {
    it("returns the bytes of a sequence", ({ seat }) => {
      check.equal(
        seat,
        decoded(bytes(), seq(1, 255)),
        Uint8Array.of(1, 255),
        "two bytes",
      );
    });

    it("throws a RangeError for sizes that admit no length", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => bytes({ minSize: 0.5 })),
        "prop: bytes states the sizes [0.5, undefined], which admit no length",
        "the refusal",
      );
    });
  });

  describe("duration", () => {
    const lo = Temporal.Duration.from("-PT1S");
    const hi = Temporal.Duration.from("P2D");

    it("returns a duration of nanoseconds balanced from the hours down", ({ seat }) => {
      check.equal(
        seat,
        decoded(duration(lo, hi), int(90_000_000_000_000n)).toString(),
        "PT25H",
        "25 hours",
      );
    });

    it("runs a duration or its nanoseconds back to one choice", ({ seat }) => {
      check.equal(
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
          check.equal(seat, thrown(tt.give), tt.want, "the refusal");
        });
      }
    }
  });

  describe("permutation", () => {
    it("returns the values in their order for the target swaps", ({ seat }) => {
      check.equal(
        seat,
        decoded(permutation("a", "b", "c"), int(0n), int(1n)),
        ["a", "b", "c"],
        "the stated order",
      );
    });
  });

  describe("stringMatching", () => {
    it("returns a string that the pattern matches", ({ seat }) => {
      check.equal(seat, decoded(stringMatching("ab")), "ab", "the literal pattern");
    });

    it("throws a RangeError for a pattern outside the portable subset", ({ seat }) => {
      check.hasPrefix(
        seat,
        thrown(() => stringMatching("(")),
        'prop: stringMatching("(") states no pattern of the portable subset: pattern "(" at ',
        "the refusal",
      );
    });
  });

  describe("recursive", () => {
    it("returns the base's value at a position that takes the base", ({ seat }) => {
      const generator = recursive<unknown>(integer(0, 9), (self) => list(self));

      check.equal(seat, decoded(generator, int(0n), int(6n)), 6, "a leaf");
    });

    it("throws a RangeError for a maxLeaves below 1", ({ seat }) => {
      check.equal(
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

      check.equal(seat, decoded(pair, int(1n), int(2n)), [1, 2], "two draws");
    });
  });
});
