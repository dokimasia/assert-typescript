// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the generators that contain no other generator: what each
 * decodes from recorded choices, and what each draws from a source.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { Generating, Replaying } from "../../../../src/prop/engine/case/providers.js";
import { Case, DECODE } from "../../../../src/prop/engine/case.js";
import {
  type Choice,
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
  type Value,
} from "../../../../src/prop/engine/choice.js";
import type { Generator } from "../../../../src/prop/engine/generator/base.js";
import {
  Bool,
  Bytes,
  Float,
  Integer,
  Just,
  Matching,
  Permutation,
  SampledFrom,
  Text,
} from "../../../../src/prop/engine/generator/scalars.js";
import { Source } from "../../../../src/prop/engine/source.js";
import { test as it } from "../../../../src/vitest.js";

const DIGIT = new Integer(new IntegerBounds(0n, 9n));
const COIN = new Bool({ num: 1n, den: 2n });
const LETTERS = new SampledFrom(["a", "b", "c"]);

/** Returns a recorded choice of the kind that the type of value implies. */
function choiceOf(value: Value): Choice {
  if (Array.isArray(value)) {
    return { kind: "sequence", value };
  }
  if (typeof value === "number") {
    return { kind: "float", value };
  }
  return { kind: "integer", value: value as bigint };
}

/** Returns a case that replays values. */
function replay(...values: Value[]): Case {
  return new Case(new Replaying(values.map(choiceOf)));
}

/** Returns the value that generator decodes from recorded values, and the case. */
function decode<T>(generator: Generator<T>, ...values: Value[]): [T, Case] {
  const c = replay(...values);
  return [generator[DECODE](c), c];
}

/** Returns the span labels of a case. */
function labels(c: Case): string[] {
  return c.spans.map((span) => span.label);
}

describe("scalars", () => {
  describe("Integer", () => {
    it("decodes a recorded value to itself", ({ seat }) => {
      check.isEqualTo(seat, decode(DIGIT, 7n)[0], 7n, "7");
    });

    it("decodes the value closest to zero from no choice", ({ seat }) => {
      const above = new Integer(new IntegerBounds(3n, 9n));
      const below = new Integer(new IntegerBounds(-9n, -3n));

      check.isEqualTo(
        seat,
        [decode(above)[0], decode(below)[0]],
        [3n, -3n],
        "the targets",
      );
    });

    it("makes one reusable value choice in a span of its id", ({ seat }) => {
      const [, c] = decode(DIGIT, 7n);

      check.isEqualTo(
        seat,
        [c.spans, c.requests[0]?.edge, c.requests[0]?.reuse],
        [
          [{ label: "integer", start: 0, end: 1, depth: 0, parent: undefined }],
          undefined,
          true,
        ],
        "one span and one request",
      );
    });

    it("decodes a duration in nanoseconds under its own id", ({ seat }) => {
      const [value, c] = decode(
        new Integer(new IntegerBounds(0n, 1_000_000_000n), "duration"),
        5n,
      );

      check.isEqualTo(
        seat,
        [value, labels(c)],
        [5n, ["duration"]],
        "a span named duration",
      );
    });
  });

  describe("Float", () => {
    it("decodes a recorded value to itself", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(new Float(new FloatBounds(-1, 1)), 0.5)[0],
        0.5,
        "0.5",
      );
    });

    it("decodes the simplest float in range from no choice", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(new Float(new FloatBounds(0.6, 0.7)))[0],
        0.625,
        "0.625",
      );
    });

    it("decodes NaN and the infinities where the bounds allow them", ({ seat }) => {
      const any = new Float(
        new FloatBounds(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, true),
      );

      check.isTrue(
        seat,
        Number.isNaN(decode(any, Number.NaN)[0]) &&
          decode(any, Number.NEGATIVE_INFINITY)[0] === Number.NEGATIVE_INFINITY,
        "NaN and -Infinity",
      );
    });

    it("decodes the target for NaN where the bounds refuse it", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(new Float(new FloatBounds(1, 2)), Number.NaN)[0],
        1,
        "the target 1",
      );
    });

    it("decodes the target for a value off its width", ({ seat }) => {
      const narrow = new Float(new FloatBounds(0, 1, false, 32));

      check.isEqualTo(
        seat,
        [decode(narrow, 0.1)[0], decode(narrow, 0.5)[0]],
        [0, 0.5],
        "0.1 is no value of width 32",
      );
    });

    it("decodes in a span labelled float", ({ seat }) => {
      check.isEqualTo(
        seat,
        labels(decode(new Float(new FloatBounds(0, 1)), 0.5)[1]),
        ["float"],
        "one span",
      );
    });
  });

  describe("Bool", () => {
    it("decodes true from the choice 1 alone", ({ seat }) => {
      check.isEqualTo(
        seat,
        [decode(COIN, 1n)[0], decode(COIN)[0]],
        [true, false],
        "true and false",
      );
    });

    it("draws one coin of its probability", ({ seat }) => {
      const third = new Bool({ num: 1n, den: 3n });
      const got = Array.from({ length: 50 }, (_, seed) =>
        third[DECODE](new Case(new Generating(new Source(BigInt(seed))))),
      );
      const want = Array.from({ length: 50 }, (_, seed) =>
        new Source(BigInt(seed)).coin(1n, 3n),
      );

      check.isEqualTo(seat, got, want, "a coin of 1 in 3 for 50 seeds");
    });
  });

  describe("Just", () => {
    it("decodes its value without a choice", ({ seat }) => {
      const [value, c] = decode(new Just("x"));

      check.isEqualTo(
        seat,
        [value, c.choices, c.spans],
        ["x", [], [{ label: "just", start: 0, end: 0, depth: 0, parent: undefined }]],
        "an empty span",
      );
    });
  });

  describe("SampledFrom", () => {
    it("decodes the value at the recorded index", ({ seat }) => {
      check.isEqualTo(seat, decode(LETTERS, 2n)[0], "c", "index 2");
    });

    it("decodes the first value from no choice or an index past the end", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        [decode(LETTERS)[0], decode(LETTERS, 3n)[0]],
        ["a", "a"],
        "the target",
      );
    });

    it("chooses its index as a structure choice with the edge 0", ({ seat }) => {
      const [, c] = decode(LETTERS, 1n);

      check.isEqualTo(
        seat,
        [c.requests[0]?.edge, c.requests[0]?.bounds.id],
        [0n, "integer 0 2"],
        "the index",
      );
    });
  });

  describe("Text", () => {
    it("spells the indices in the default alphabet", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(new Text(undefined, new SequenceBounds(0x10_f8_00)), [10, 0])[0],
        "a0",
        "index 10 is a",
      );
    });

    it("spells the indices in a stated alphabet in its order", ({ seat }) => {
      const xyz = new Text(["x", "y", "z"], new SequenceBounds(3));

      check.isEqualTo(seat, decode(xyz, [2, 0, 1])[0], "zxy", "the stated order");
    });

    it("repeats the first character minSize times from no choice", ({ seat }) => {
      const xyz = new Text(["x", "y", "z"], new SequenceBounds(3, 2));
      const digits = new Text(undefined, new SequenceBounds(0x10_f8_00, 2));

      check.isEqualTo(
        seat,
        [decode(xyz)[0], decode(digits)[0]],
        ["xx", "00"],
        "the targets",
      );
    });

    it("spells an index past the alphabet as its first character", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(new Text(["x", "y", "z"], new SequenceBounds(3)), [5])[0],
        "x",
        "5 is outside xyz",
      );
    });

    it("decodes in a span labelled string", ({ seat }) => {
      check.isEqualTo(
        seat,
        labels(decode(new Text(undefined, new SequenceBounds(10)))[1]),
        ["string"],
        "one span",
      );
    });
  });

  describe("Bytes", () => {
    const bytes = new Bytes(new SequenceBounds(256));

    it("decodes a sequence of 256 element values", ({ seat }) => {
      check.isEqualTo(
        seat,
        [decode(bytes, [104, 105])[0], decode(bytes, [256])[0], decode(bytes)[0]],
        [Uint8Array.of(104, 105), Uint8Array.of(0), Uint8Array.of()],
        "hi, a zero and no byte",
      );
    });
  });

  describe("Matching", () => {
    it("joins the characters of its piece in a span", ({ seat }) => {
      const piece = {
        emit: (inner: Case, out: string[]) => {
          out.push("a", inner.integer(new IntegerBounds(0n, 9n)).toString());
        },
      };
      const [value, c] = decode(new Matching(piece), 7n);

      check.isEqualTo(
        seat,
        [value, labels(c)],
        ["a7", ["string-matching"]],
        "the piece's characters",
      );
    });
  });

  describe("Permutation", () => {
    const ordering = new Permutation(["a", "b", "c"]);

    it("swaps each position with the recorded index", ({ seat }) => {
      check.isEqualTo(
        seat,
        decode(ordering, 2n, 2n)[0],
        ["c", "a", "b"],
        "a with c, then a with b",
      );
    });

    it("keeps the stated order from no choice", ({ seat }) => {
      const [value, c] = decode(ordering);

      check.isEqualTo(
        seat,
        [value, c.requests.map((request) => request.bounds.id)],
        [
          ["a", "b", "c"],
          ["integer 0 2", "integer 1 2"],
        ],
        "position i targets i",
      );
    });

    it("decodes no values without a choice", ({ seat }) => {
      const [value, c] = decode(new Permutation([]));

      check.isEqualTo(seat, [value, c.choices], [[], []], "an empty ordering");
    });
  });
});
