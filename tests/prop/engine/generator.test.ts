/**
 * The spec of the generators: what each decodes from recorded choices, and
 * what each draws from a source.
 */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  Case,
  DECODE,
  Generating,
  type Provider,
  Rejected,
  Replaying,
} from "../../../src/prop/engine/case.js";
import {
  type Choice,
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
  type Value,
} from "../../../src/prop/engine/choice.js";
import { Sizes } from "../../../src/prop/engine/collection.js";
import * as draw from "../../../src/prop/engine/draw.js";
import { sameFloat } from "../../../src/prop/engine/float.js";
import {
  Bool,
  Bound,
  Bytes,
  Composite,
  Dict,
  Filter,
  Float,
  type Generator,
  Integer,
  Just,
  List,
  Mapped,
  Matching,
  OneOf,
  Optional,
  Permutation,
  Position,
  Recursive,
  SampledFrom,
  Text,
} from "../../../src/prop/engine/generator.js";
import { Source } from "../../../src/prop/engine/source.js";
import { canonical, Pairs } from "../../../src/prop/engine/value.js";
import { test as it } from "../../../src/vitest.js";

/** Seeds per check of generation. */
const SEEDS = 200;

const DIGIT = new Integer(new IntegerBounds(0n, 9n));
const TEEN = new Integer(new IntegerBounds(10n, 20n));
const COIN = new Bool({ num: 1n, den: 2n });
const LETTERS = new SampledFrom(["a", "b", "c"]);
const DIGITS = new List(DIGIT, new Sizes(0, 3));
const UNIQUE = new List(DIGIT, new Sizes(), true);
const TABLE = new Dict(DIGIT, COIN, new Sizes(0, 3));
const KEEP_EVEN = new Filter(DIGIT, (value) => value % 2n === 0n);

/** Returns a tree of digits: a digit, or a list of at most three trees. */
function tree(maxLeaves = 100): Recursive<unknown> {
  return new Recursive<unknown>(
    DIGIT,
    maxLeaves,
    (self) => new List(self, new Sizes(0, 3)),
  );
}

/** Returns a recorded choice of the kind that the type of value implies. */
function choiceOf(value: Value): Choice {
  if (Array.isArray(value)) return { kind: "sequence", value };
  if (typeof value === "number") return { kind: "float", value };
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

/** Returns the canonical value that generator decodes from c, or "rejected". */
function decoded(generator: Generator<unknown>, c: Case): string {
  try {
    return canonical(generator[DECODE](c));
  } catch (error) {
    if (error instanceof Rejected) return "rejected";
    throw error;
  }
}

describe("generator", () => {
  describe("Generator.map", () => {
    it("returns a generator of the function of each value", ({ seat }) => {
      const doubled = DIGIT.map((value) => value * 2n);

      check.equal(
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

      check.equal(
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

      check.equal(
        seat,
        [bound instanceof Bound, value, labels(c)],
        [true, 3n, ["bind", "integer", "integer"]],
        "a bind of 5 then 3",
      );
    });
  });

  describe("Integer", () => {
    it("decodes a recorded value to itself", ({ seat }) => {
      check.equal(seat, decode(DIGIT, 7n)[0], 7n, "7");
    });

    it("decodes the value closest to zero from no choice", ({ seat }) => {
      const above = new Integer(new IntegerBounds(3n, 9n));
      const below = new Integer(new IntegerBounds(-9n, -3n));

      check.equal(seat, [decode(above)[0], decode(below)[0]], [3n, -3n], "the targets");
    });

    it("makes one reusable value choice in a span of its id", ({ seat }) => {
      const [, c] = decode(DIGIT, 7n);

      check.equal(
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

      check.equal(
        seat,
        [value, labels(c)],
        [5n, ["duration"]],
        "a span named duration",
      );
    });
  });

  describe("Float", () => {
    it("decodes a recorded value to itself", ({ seat }) => {
      check.equal(seat, decode(new Float(new FloatBounds(-1, 1)), 0.5)[0], 0.5, "0.5");
    });

    it("decodes the simplest float in range from no choice", ({ seat }) => {
      check.equal(
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
      check.equal(
        seat,
        decode(new Float(new FloatBounds(1, 2)), Number.NaN)[0],
        1,
        "the target 1",
      );
    });

    it("decodes the target for a value off its width", ({ seat }) => {
      const narrow = new Float(new FloatBounds(0, 1, false, 32));

      check.equal(
        seat,
        [decode(narrow, 0.1)[0], decode(narrow, 0.5)[0]],
        [0, 0.5],
        "0.1 is no value of width 32",
      );
    });

    it("decodes in a span labelled float", ({ seat }) => {
      check.equal(
        seat,
        labels(decode(new Float(new FloatBounds(0, 1)), 0.5)[1]),
        ["float"],
        "one span",
      );
    });
  });

  describe("Bool", () => {
    it("decodes true from the choice 1 alone", ({ seat }) => {
      check.equal(
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

      check.equal(seat, got, want, "a coin of 1 in 3 for 50 seeds");
    });
  });

  describe("Just", () => {
    it("decodes its value without a choice", ({ seat }) => {
      const [value, c] = decode(new Just("x"));

      check.equal(
        seat,
        [value, c.choices, c.spans],
        ["x", [], [{ label: "just", start: 0, end: 0, depth: 0, parent: undefined }]],
        "an empty span",
      );
    });
  });

  describe("SampledFrom", () => {
    it("decodes the value at the recorded index", ({ seat }) => {
      check.equal(seat, decode(LETTERS, 2n)[0], "c", "index 2");
    });

    it("decodes the first value from no choice or an index past the end", ({
      seat,
    }) => {
      check.equal(
        seat,
        [decode(LETTERS)[0], decode(LETTERS, 3n)[0]],
        ["a", "a"],
        "the target",
      );
    });

    it("chooses its index as a structure choice with the edge 0", ({ seat }) => {
      const [, c] = decode(LETTERS, 1n);

      check.equal(
        seat,
        [c.requests[0]?.edge, c.requests[0]?.bounds.id],
        [0n, "integer 0 2"],
        "the index",
      );
    });
  });

  describe("OneOf", () => {
    const either = new OneOf([DIGIT, TEEN]);

    it("decodes the value of the alternative at the recorded index", ({ seat }) => {
      check.equal(
        seat,
        decode(either, 1n, 15n)[0],
        15n,
        "the second alternative decodes 15",
      );
    });

    it("decodes the first alternative's simplest value from no choice", ({ seat }) => {
      check.equal(seat, decode(either)[0], 0n, "0");
    });

    it("decodes the target of the chosen alternative for a value outside it", ({
      seat,
    }) => {
      check.equal(seat, decode(either, 1n, 5n)[0], 10n, "5 is outside [10, 20]");
    });

    it("chooses its index as a structure choice in its span", ({ seat }) => {
      const [, c] = decode(either, 1n, 15n);

      check.equal(
        seat,
        [c.requests.map((request) => request.edge), c.spans[0]],
        [
          [0n, undefined],
          { label: "one-of", start: 0, end: 2, depth: 0, parent: undefined },
        ],
        "the index's edge and the span",
      );
    });
  });

  describe("Optional", () => {
    const maybe = new Optional(DIGIT);

    it("decodes undefined for an absent value with one choice", ({ seat }) => {
      const [value, c] = decode(maybe, 0n, 4n);

      check.equal(seat, [value, c.choices.length], [undefined, 1], "absent");
    });

    it("decodes the value of a present value", ({ seat }) => {
      check.equal(seat, decode(maybe, 1n, 4n)[0], 4n, "present");
    });

    it("decodes undefined from no choice", ({ seat }) => {
      check.isNil(seat, decode(maybe)[0], "the target is absent");
    });

    it("chooses its presence as a structure choice with the edge 1", ({ seat }) => {
      check.equal(
        seat,
        decode(maybe, 1n, 4n)[1].requests.map((request) => request.edge),
        [1n, undefined],
        "the edges",
      );
    });
  });

  describe("List", () => {
    it("decodes its flags and elements", ({ seat }) => {
      check.equal(seat, decode(DIGITS, 1n, 7n, 1n, 3n, 0n)[0], [7n, 3n], "two digits");
    });

    it("decodes minSize simplest elements from no choice", ({ seat }) => {
      check.equal(
        seat,
        [decode(DIGITS)[0], decode(new List(DIGIT, new Sizes(2, 3)))[0]],
        [[], [0n, 0n]],
        "the targets",
      );
    });

    it("forces the flag at its maximum to stop", ({ seat }) => {
      const [value, c] = decode(DIGITS, 1n, 1n, 1n, 2n, 1n, 3n, 1n);

      check.equal(
        seat,
        [value, c.choices.at(-1), c.requests.at(-1)?.bounds.id],
        [[1n, 2n, 3n], { kind: "integer", value: 0n }, "integer 0 0"],
        "a recorded 1 replays as the stop",
      );
    });

    it("gives an edge to its flags alone", ({ seat }) => {
      check.equal(
        seat,
        decode(DIGITS, 1n, 7n, 1n, 3n, 0n)[1].requests.map((request) => request.edge),
        [1n, undefined, 0n, undefined, 0n],
        "the edges",
      );
    });

    it("opens the span of each element at its flag", ({ seat }) => {
      check.equal(
        seat,
        decode(DIGITS, 1n, 7n, 1n, 3n, 0n)[1].spans,
        [
          { label: "list", start: 0, end: 5, depth: 0, parent: undefined },
          { label: "element", start: 0, end: 2, depth: 1, parent: 0 },
          { label: "integer", start: 1, end: 2, depth: 2, parent: 1 },
          { label: "element", start: 2, end: 4, depth: 1, parent: 0 },
          { label: "integer", start: 3, end: 4, depth: 2, parent: 3 },
        ],
        "five spans",
      );
    });

    it("keeps duplicates of a list that is not unique", ({ seat }) => {
      check.equal(seat, decode(DIGITS, 1n, 4n, 1n, 4n, 0n)[0], [4n, 4n], "both fours");
    });

    it("discards a duplicate element of a unique list", ({ seat }) => {
      check.equal(
        seat,
        decode(UNIQUE, 1n, 4n, 1n, 4n, 1n, 5n, 0n)[0],
        [4n, 5n],
        "the second four is discarded",
      );
    });

    it("throws Rejected for a unique list that remains below its minimum", ({
      seat,
    }) => {
      const err = check.throws(
        seat,
        () => decode(new List(DIGIT, new Sizes(2), true)),
        "the targets repeat",
      );

      check.errorIs(seat, err, Rejected, "the case is rejected");
    });

    it("draws an element after each flag with the odds of reusing an earlier one", ({
      seat,
    }) => {
      const average = draw.averageLength(0, 3);
      const element = new IntegerBounds(0n, 9n);
      const got = Array.from({ length: SEEDS }, (_, seed) =>
        DIGITS[DECODE](new Case(new Generating(new Source(BigInt(seed))))),
      );
      const want = Array.from({ length: SEEDS }, (_, seed) => {
        const twin = new Source(BigInt(seed));
        const values: bigint[] = [];
        while (draw.flag(twin, values.length, 0, 3, average) === 1n) {
          if (values.length > 0 && twin.coin(1n, draw.REUSE_ODDS))
            values.push(values[Number(twin.below(BigInt(values.length)))] as bigint);
          else values.push(draw.integer(twin, element));
        }
        return values;
      });

      check.equal(seat, got, want, "200 seeds");
    });
  });

  describe("Dict", () => {
    it("discards an entry whose key repeats", ({ seat }) => {
      check.equal(
        seat,
        decode(TABLE, 1n, 3n, 1n, 1n, 3n, 0n, 0n)[0],
        new Pairs([[3n, true]]),
        "the first entry of key 3",
      );
    });

    it("opens the span of each entry at its flag", ({ seat }) => {
      check.equal(
        seat,
        decode(TABLE, 1n, 3n, 1n, 0n)[1].spans.slice(0, 2),
        [
          { label: "dict", start: 0, end: 4, depth: 0, parent: undefined },
          { label: "entry", start: 0, end: 3, depth: 1, parent: 0 },
        ],
        "the dict and its entry",
      );
    });

    it("decodes no entry from no choice", ({ seat }) => {
      check.equal(seat, decode(TABLE)[0], new Pairs([]), "empty");
    });

    it("throws Rejected for a minimum of two that the targets cannot meet", ({
      seat,
    }) => {
      const err = check.throws(
        seat,
        () => decode(new Dict(DIGIT, COIN, new Sizes(2, 3))),
        "both target keys are 0",
      );

      check.errorIs(seat, err, Rejected, "the case is rejected");
    });
  });

  describe("Text", () => {
    it("spells the indices in the default alphabet", ({ seat }) => {
      check.equal(
        seat,
        decode(new Text(undefined, new SequenceBounds(0x10f800)), [10, 0])[0],
        "a0",
        "index 10 is a",
      );
    });

    it("spells the indices in a stated alphabet in its order", ({ seat }) => {
      const xyz = new Text(["x", "y", "z"], new SequenceBounds(3));

      check.equal(seat, decode(xyz, [2, 0, 1])[0], "zxy", "the stated order");
    });

    it("repeats the first character minSize times from no choice", ({ seat }) => {
      const xyz = new Text(["x", "y", "z"], new SequenceBounds(3, 2));
      const digits = new Text(undefined, new SequenceBounds(0x10f800, 2));

      check.equal(
        seat,
        [decode(xyz)[0], decode(digits)[0]],
        ["xx", "00"],
        "the targets",
      );
    });

    it("spells an index past the alphabet as its first character", ({ seat }) => {
      check.equal(
        seat,
        decode(new Text(["x", "y", "z"], new SequenceBounds(3)), [5])[0],
        "x",
        "5 is outside xyz",
      );
    });

    it("decodes in a span labelled string", ({ seat }) => {
      check.equal(
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
      check.equal(
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
        emit: (c: Case, out: string[]) => {
          out.push("a", c.integer(new IntegerBounds(0n, 9n)).toString());
        },
      };
      const [value, c] = decode(new Matching(piece), 7n);

      check.equal(
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
      check.equal(
        seat,
        decode(ordering, 2n, 2n)[0],
        ["c", "a", "b"],
        "a with c, then a with b",
      );
    });

    it("keeps the stated order from no choice", ({ seat }) => {
      const [value, c] = decode(ordering);

      check.equal(
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

      check.equal(seat, [value, c.choices], [[], []], "an empty ordering");
    });
  });

  describe("Filter", () => {
    it("decodes a kept first attempt in one filter span", ({ seat }) => {
      const [value, c] = decode(KEEP_EVEN, 4n);

      check.equal(
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

      check.equal(
        seat,
        [KEEP_EVEN[DECODE](c), c.choices, labels(c)],
        [4n, [{ kind: "integer", value: 4n }], ["filter", "integer"]],
        "the record of the kept attempt",
      );
    });

    it("throws Rejected after three rejected attempts", ({ seat }) => {
      const c = new Case(feed(1n, 3n, 5n, 6n));
      const err = check.throws(seat, () => KEEP_EVEN[DECODE](c), "1, 3 and 5 are odd");

      check.errorIs(seat, err, Rejected, "the case is rejected");
      check.equal(
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
        check.throws(seat, () => decode(KEEP_EVEN, 3n), "each attempt reads 3"),
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

      check.equal(
        seat,
        decode(sorted, 1n, 3n, 1n, 1n, 0n)[0],
        [1n, 3n],
        "[3, 1] sorts to [1, 3]",
      );
    });

    it("makes the source's choices without a span of its own", ({ seat }) => {
      const [value, c] = decode(new Mapped(DIGIT, (n) => n >= 0n), 4n);

      check.equal(
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

      check.equal(
        seat,
        [value, c.spans[0]],
        [2, { label: "bind", start: 0, end: 2, depth: 0, parent: undefined }],
        "2 of [0, 3]",
      );
    });
  });

  describe("Composite", () => {
    it("decodes the value of its function in one span", ({ seat }) => {
      const pair = new Composite((c) => [c.draw(DIGIT, "a"), c.draw(DIGIT, "b")]);
      const [value, c] = decode(pair, 1n, 2n);

      check.equal(seat, [value, c.spans[0]?.label], [[1n, 2n], "composite"], "a pair");
    });
  });

  describe("Recursive", () => {
    it("decodes the base's simplest value from no choice", ({ seat }) => {
      check.equal(seat, decode(tree())[0], 0n, "the base");
    });

    it("decodes its positions recursively", ({ seat }) => {
      check.equal(
        seat,
        [
          decode(tree(), 1n, 1n, 0n, 5n, 1n, 0n, 7n, 0n)[0],
          decode(tree(), 1n, 1n, 1n, 1n, 0n, 3n, 0n, 0n)[0],
        ],
        [[5n, 7n], [[3n]]],
        "two leaves, and one a level deeper",
      );
    });

    it("decodes each position in a recursive span with a structure choice", ({
      seat,
    }) => {
      const [, c] = decode(tree(), 1n, 1n, 0n, 5n, 0n);

      check.equal(
        seat,
        [labels(c), c.requests[0]?.edge],
        [["recursive", "list", "element", "recursive", "integer"], 0n],
        "the labels and the edge of the first position",
      );
    });

    it("forces the base for each position after maxLeaves", ({ seat }) => {
      const [value, c] = decode(tree(1), 1n, 1n, 0n, 5n, 1n, 1n, 7n, 0n);

      check.equal(
        seat,
        [value, c.requests[5]?.bounds.id],
        [[5n, 7n], "integer 0 0"],
        "the second position takes the base",
      );
    });

    it("counts the leaves of each value from zero", ({ seat }) => {
      const one = tree(1);

      check.equal(
        seat,
        [decode(one, 1n, 1n, 0n, 5n, 0n)[0], decode(one, 1n, 1n, 0n, 5n, 0n)[0]],
        [[5n], [5n]],
        "two values",
      );
    });

    it("counts the leaves of the innermost recursive generator", ({ seat }) => {
      const outer = new Recursive<unknown>(
        tree(1),
        100,
        (self) => new List(self, new Sizes(0, 3)),
      );

      check.equal(
        seat,
        decode(outer, 0n, 1n, 1n, 0n, 5n, 1n, 1n, 7n, 0n)[0],
        [5n, 7n],
        "the inner tree's limit",
      );
    });
  });

  describe("Position", () => {
    it("decodes the next position of its owner inside the owner's extension", ({
      seat,
    }) => {
      const owner = tree();
      const position = new Position(owner);

      check.equal(
        seat,
        [position.owner === owner, decode(owner, 1n, 1n, 0n, 4n, 0n)[0]],
        [true, [4n]],
        "a list of one base position",
      );
    });
  });

  {
    const every: [string, Generator<unknown>][] = [
      ["integer", DIGIT],
      [
        "float",
        new Float(
          new FloatBounds(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, true),
        ),
      ],
      ["boolean", new Bool({ num: 1n, den: 3n })],
      ["just", new Just(4n)],
      ["sampled-from", LETTERS],
      ["one-of", new OneOf([DIGIT, TEEN])],
      ["optional", new Optional(DIGIT)],
      ["list", DIGITS],
      ["unique list", UNIQUE],
      ["dict", TABLE],
      ["string", new Text(undefined, new SequenceBounds(0x10f800, 0, 4))],
      ["alphabet", new Text(["x", "y", "z"], new SequenceBounds(3))],
      ["bytes", new Bytes(new SequenceBounds(256))],
      [
        "duration",
        new Integer(new IntegerBounds(-1_000_000_000n, 1_000_000_000n), "duration"),
      ],
      ["permutation", new Permutation(["a", "b", "c"])],
      ["recursive", tree()],
      ["filter", KEEP_EVEN],
      [
        "map",
        new Mapped(DIGITS, (values: bigint[]) =>
          [...values].sort((a, b) => Number(a - b)),
        ),
      ],
    ];
    for (const [name, generator] of every) {
      it(`replays a generated ${name} to the same value and choices`, ({ seat }) => {
        const differ = Array.from({ length: SEEDS }, (_, seed) => seed).filter(
          (seed) => {
            const generated = new Case(new Generating(new Source(BigInt(seed))));
            const value = decoded(generator, generated);
            const replayed = new Case(new Replaying(generated.choices));
            const again = decoded(generator, replayed);
            return (
              again !== value ||
              canonical(replayed.choices.map((one) => one.value)) !==
                canonical(generated.choices.map((one) => one.value))
            );
          },
        );

        check.isEmpty(seat, differ, "no seed replays to another value");
      });
    }

    it("draws no repeated element of a unique collection", ({ seat }) => {
      const repeats = Array.from({ length: SEEDS }, (_, seed) => {
        const elements = UNIQUE[DECODE](
          new Case(new Generating(new Source(BigInt(seed)))),
        );
        const entries = TABLE[DECODE](
          new Case(new Generating(new Source(BigInt(seed)))),
        );
        const keys = entries.items.map(([key]) => key);
        return (
          new Set(elements).size !== elements.length ||
          new Set(keys).size !== keys.length
        );
      }).filter(Boolean);

      check.isEmpty(seat, repeats, "no repeated element or key");
    });

    it("draws floats that the bounds of a float admit", ({ seat }) => {
      const bounds = new FloatBounds(-1, 1);
      const generator = new Float(bounds);
      const values = Array.from({ length: SEEDS }, (_, seed) =>
        generator[DECODE](new Case(new Generating(new Source(BigInt(seed))))),
      );

      check.isTrue(
        seat,
        values.every((value) => bounds.admits(value) && !sameFloat(value, Number.NaN)),
        "every float fits",
      );
    });
  }
});
