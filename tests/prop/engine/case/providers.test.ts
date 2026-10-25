// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of where the values of a case come from. The pinned draws are
 * the draws of the definition's reference implementation.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import {
  Generating,
  Replaying,
  type Request,
  Valuing,
} from "../../../../src/prop/engine/case/providers.js";
import { Case, DECODE, type Decoder } from "../../../../src/prop/engine/case.js";
import {
  type Choice,
  INT64_MAX,
  INT64_MIN,
  IntegerBounds,
} from "../../../../src/prop/engine/choice.js";
import * as draw from "../../../../src/prop/engine/draw.js";
import { Source } from "../../../../src/prop/engine/source.js";
import { test as it } from "../../../../src/vitest.js";

/** The bounds that most cases request. */
const DIGIT = new IntegerBounds(0n, 9n);

/** The bounds of the reuse cases. */
const WIDE = new IntegerBounds(0n, 1_000_000_000n);

/** Returns a request for one digit, drawn as draw.integer draws. */
function digit(): Request {
  return { bounds: DIGIT, draw: (source) => draw.integer(source, DIGIT) };
}

/** Returns integer choices of values. */
function integers(...values: bigint[]): Choice[] {
  return values.map((value) => ({ kind: "integer", value }));
}

/** A generator of one digit that opens no span. */
const DIGITS: Decoder = { [DECODE]: (c: Case) => c.choose(digit()) };

describe("providers", () => {
  describe("Generating.value", () => {
    it("returns the draw of each request", ({ seat }) => {
      const c = new Case(new Generating(new Source(3n)));
      const twin = new Source(3n);
      const got = Array.from({ length: 20 }, () => c.choose(digit()));

      check.isEqualTo(
        seat,
        got,
        got.map(() => draw.integer(twin, DIGIT)),
        "the draws of the source alone",
      );
    });

    it("draws a coin before it takes an earlier value of a reuse request", ({
      seat,
    }) => {
      const c = new Case(new Generating(new Source(5n)));
      const twin = new Source(5n);
      const first = c.integer(WIDE, undefined, true);
      const earlier = [first];
      const want = [draw.integer(twin, WIDE)];
      for (let i = 0; i < 40; i += 1) {
        const got = c.integer(WIDE, undefined, true);
        want.push(
          twin.coin(1n, draw.REUSE_ODDS)
            ? (earlier[Number(twin.below(BigInt(earlier.length)))] as bigint)
            : draw.integer(twin, WIDE),
        );
        earlier.push(got);
      }

      check.isEqualTo(seat, earlier, want, "41 reuse requests");
    });

    it("returns the pinned reuse requests of seed 42", ({ seat }) => {
      const c = new Case(new Generating(new Source(42n)));
      const wide = new IntegerBounds(INT64_MIN, INT64_MAX);

      check.isEqualTo(
        seat,
        Array.from({ length: 12 }, () => c.integer(wide, undefined, true)),
        [
          11n,
          13n,
          INT64_MAX,
          INT64_MAX,
          -207n,
          -781_715_023_583_996_500n,
          INT64_MIN,
          -43n,
          -12n,
          -2_609_675_888_663_766_267n,
          -2_609_675_888_663_766_267n,
          229n,
        ],
        "twelve requests",
      );
    });

    it("takes no coin for a reuse request with equal bounds", ({ seat }) => {
      const c = new Case(new Generating(new Source(7n)));
      const twin = new Source(7n);
      const seven = new IntegerBounds(7n, 7n);
      const sevens = Array.from({ length: 3 }, () => c.integer(seven, undefined, true));
      const after = Array.from({ length: 5 }, () => c.integer(WIDE));

      check.isEqualTo(
        seat,
        [sevens, after],
        [[7n, 7n, 7n], after.map(() => draw.integer(twin, WIDE))],
        "the stream is untouched",
      );
    });

    it("reuses only values of the bounds of the request", ({ seat }) => {
      const c = new Case(new Generating(new Source(5n)));
      for (let i = 0; i < 30; i += 1) {
        c.integer(new IntegerBounds(500n, 600n), undefined, true);
      }
      const values = Array.from({ length: 30 }, () =>
        c.integer(DIGIT, undefined, true),
      );

      check.isTrue(
        seat,
        values.every((value) => DIGIT.admits(value)),
        "every value is a digit",
      );
    });

    it("takes no coin for a request without reuse", ({ seat }) => {
      const c = new Case(new Generating(new Source(9n)));
      const twin = new Source(9n);
      c.integer(DIGIT, undefined, true);
      draw.integer(twin, DIGIT);

      check.isEqualTo(
        seat,
        c.integer(DIGIT, 0n),
        draw.integer(twin, DIGIT),
        "a plain draw",
      );
    });

    it("reuses no value of a removed choice", ({ seat }) => {
      const got = Array.from({ length: 50 }, (_, seed) => {
        const c = new Case(new Generating(new Source(BigInt(seed))));
        const start = c.mark();
        c.integer(WIDE, undefined, true);
        c.rewind(start);
        return c.integer(WIDE, undefined, true);
      });
      const want = Array.from({ length: 50 }, (_, seed) => {
        const twin = new Source(BigInt(seed));
        draw.integer(twin, WIDE);
        return draw.integer(twin, WIDE);
      });

      check.isEqualTo(seat, got, want, "no coin after the rewind for 50 seeds");
    });

    it("reuses no removed value of other bounds", ({ seat }) => {
      const narrow = new IntegerBounds(0n, 999_999_999n);
      const got = Array.from({ length: 50 }, (_, seed) => {
        const c = new Case(new Generating(new Source(BigInt(seed))));
        const start = c.mark();
        c.integer(WIDE, undefined, true);
        c.rewind(start);
        c.integer(narrow, undefined, true);
        return c.integer(WIDE, undefined, true);
      });
      const want = Array.from({ length: 50 }, (_, seed) => {
        const twin = new Source(BigInt(seed));
        draw.integer(twin, WIDE);
        draw.integer(twin, narrow);
        return draw.integer(twin, WIDE);
      });

      check.isEqualTo(seat, got, want, "no coin after the rewind for 50 seeds");
    });
  });

  describe("Replaying.value", () => {
    it("returns the recorded values that fit", ({ seat }) => {
      const c = new Case(new Replaying(integers(7n, 3n)));

      check.isEqualTo(
        seat,
        [c.choose(digit()), c.choose(digit())],
        [7n, 3n],
        "the digits",
      );
    });

    it("returns the target for a recorded value outside the bounds", ({ seat }) => {
      check.isEqualTo(
        seat,
        new Case(new Replaying(integers(12n))).choose(digit()),
        0n,
        "12 is no digit",
      );
    });

    it("returns the target for a recorded value of another kind", ({ seat }) => {
      const c = new Case(new Replaying([{ kind: "sequence", value: [5] }]));

      check.isEqualTo(seat, c.choose(digit()), 0n, "a sequence is no digit");
    });

    it("returns the target past the recorded choices", ({ seat }) => {
      const bounds = new IntegerBounds(3n, 9n);
      const c = new Case(new Replaying(integers(5n)));
      const request = {
        bounds,
        draw: (source: Source) => draw.integer(source, bounds),
      };

      check.isEqualTo(
        seat,
        [c.choose(request), c.choose(request), c.choose(request)],
        [5n, 3n, 3n],
        "the target after the last choice",
      );
    });
  });

  describe("Valuing.valued", () => {
    it("gives each draw the next stated value without a choice", ({ seat }) => {
      const c = new Case(new Valuing([5, "x"]));
      const drawn = [c.draw(DIGITS, "a"), c.draw(DIGITS, "b")];

      check.isEqualTo(
        seat,
        [drawn, c.choices, c.spans, c.draws.map((one) => [one.label, one.value])],
        [
          [5, "x"],
          [],
          [],
          [
            ["a", 5],
            ["b", "x"],
          ],
        ],
        "the values, without a choice or a span",
      );
    });
  });

  describe("Valuing.value", () => {
    it("gives a request of a draw past the last value its target", ({ seat }) => {
      const c = new Case(new Valuing([5]));
      c.draw(DIGITS, "a");

      check.isEqualTo(
        seat,
        [c.draw(DIGITS, "b"), c.choices],
        [0n, integers(0n)],
        "the decoded target",
      );
    });
  });
});
