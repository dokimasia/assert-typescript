// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the base of every generator and of the map, the filter and
 * the bind: what each decodes from recorded choices, and what each draws
 * from a source.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import {
  type Provider,
  Replaying,
} from "../../../../src/prop/engine/case/providers.js";
import { Rejected } from "../../../../src/prop/engine/case/signals.js";
import { Case, DECODE } from "../../../../src/prop/engine/case.js";
import {
  type Choice,
  IntegerBounds,
  type Value,
} from "../../../../src/prop/engine/choice.js";
import { Sizes } from "../../../../src/prop/engine/collection.js";
import {
  Bound,
  Filter,
  type Generator,
  Mapped,
} from "../../../../src/prop/engine/generator/base.js";
import { List } from "../../../../src/prop/engine/generator/collections.js";
import { Integer, SampledFrom } from "../../../../src/prop/engine/generator/scalars.js";
import { test as it } from "../../../../src/vitest.js";

const DIGIT = new Integer(new IntegerBounds(0n, 9n));
const DIGITS = new List(DIGIT, new Sizes(0, 3));
const KEEP_EVEN = new Filter(DIGIT, (value) => value % 2n === 0n);

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

/** A provider that returns the stated values in order, whatever the index. */
function feed(...values: Value[]): Provider {
  let at = 0;
  return {
    value: () => {
      at += 1;
      return values[at - 1] as Value;
    },
  };
}

/** Returns the span labels of a case. */
function labels(c: Case): string[] {
  return c.spans.map((span) => span.label);
}

describe("base", () => {
  describe("Generator.map", () => {
    it("returns a generator of the function of each value", ({ seat }) => {
      const doubled = DIGIT.map((value) => value * 2n);

      check.isEqualTo(
        seat,
        [doubled instanceof Mapped, decode(doubled, 4n)[0]],
        [true, 8n],
        "a map of 4",
      );
    });
  });

  describe("Generator.filter", () => {
    it("returns a generator of the values that the predicate keeps", ({ seat }) => {
      const even = DIGIT.filter((value) => value % 2n === 0n);

      check.isEqualTo(
        seat,
        [even instanceof Filter, decode(even, 4n)[0]],
        [true, 4n],
        "a filter that keeps 4",
      );
    });
  });

  describe("Generator.bind", () => {
    it("returns a generator of the value of the generator that the function returns", ({
      seat,
    }) => {
      const bound = DIGIT.bind((n) => new Integer(new IntegerBounds(0n, n)));
      const [value, c] = decode(bound, 5n, 3n);

      check.isEqualTo(
        seat,
        [bound instanceof Bound, value, labels(c)],
        [true, 3n, ["bind", "integer", "integer"]],
        "a bind of 5 then 3",
      );
    });
  });

  describe("Filter", () => {
    it("decodes a kept first attempt in one filter span", ({ seat }) => {
      const [value, c] = decode(KEEP_EVEN, 4n);

      check.isEqualTo(
        seat,
        [value, c.spans],
        [
          4n,
          [
            { label: "filter", start: 0, end: 1, depth: 0, parent: undefined },
            { label: "integer", start: 0, end: 1, depth: 1, parent: 0 },
          ],
        ],
        "4 is even",
      );
    });

    it("removes a rejected attempt from the record", ({ seat }) => {
      const c = new Case(feed(3n, 4n));

      check.isEqualTo(
        seat,
        [KEEP_EVEN[DECODE](c), c.choices, labels(c)],
        [4n, [{ kind: "integer", value: 4n }], ["filter", "integer"]],
        "the record of the kept attempt",
      );
    });

    it("throws Rejected after three rejected attempts", ({ seat }) => {
      const c = new Case(feed(1n, 3n, 5n, 6n));
      const err = check.doesThrow(
        seat,
        () => KEEP_EVEN[DECODE](c),
        "1, 3 and 5 are odd",
      );

      check.errorIs(seat, err, Rejected, "the case is rejected");
      check.isEqualTo(
        seat,
        c.choices,
        [{ kind: "integer", value: 5n }],
        "the record keeps the last attempt",
      );
    });

    it("throws Rejected for a replayed value that the predicate rejects", ({
      seat,
    }) => {
      check.errorIs(
        seat,
        check.doesThrow(seat, () => decode(KEEP_EVEN, 3n), "each attempt reads 3"),
        Rejected,
        "the case is rejected",
      );
    });
  });

  describe("Mapped", () => {
    it("decodes the function of the source's value", ({ seat }) => {
      const sorted = new Mapped(DIGITS, (values: bigint[]) =>
        [...values].sort((a, b) => Number(a - b)),
      );

      check.isEqualTo(
        seat,
        decode(sorted, 1n, 3n, 1n, 1n, 0n)[0],
        [1n, 3n],
        "[3, 1] sorts to [1, 3]",
      );
    });

    it("makes the source's choices without a span of its own", ({ seat }) => {
      const [value, c] = decode(new Mapped(DIGIT, (n) => n >= 0n), 4n);

      check.isEqualTo(
        seat,
        [value, c.choices, labels(c)],
        [true, [{ kind: "integer", value: 4n }], ["integer"]],
        "the integer's span alone",
      );
    });

    it("keeps the inverse of the function", ({ seat }) => {
      const back = (text: string) => BigInt(text);

      check.isTrue(seat, new Mapped(DIGIT, String, back).back === back, "the inverse");
    });
  });

  describe("Bound", () => {
    it("decodes the source before the generator of its value in one span", ({
      seat,
    }) => {
      const bound = new Bound(
        DIGIT,
        (n) => new SampledFrom(Array.from({ length: Number(n) + 1 }, (_, i) => i)),
      );
      const [value, c] = decode(bound, 3n, 2n);

      check.isEqualTo(
        seat,
        [value, c.spans[0]],
        [2, { label: "bind", start: 0, end: 2, depth: 0, parent: undefined }],
        "2 of [0, 3]",
      );
    });
  });
});
