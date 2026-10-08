/** The spec of the case tree: repeats, divergences, exhaustion and its size limit. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  type Bounds,
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
  type Value,
} from "../../../src/prop/engine/choice.js";
import {
  Diverged,
  type Ending,
  NODE_LIMIT,
  Repeated,
  Tree,
} from "../../../src/prop/engine/tree.js";
import { test as it } from "../../../src/vitest.js";

const BIT = new IntegerBounds(0n, 1n);
const DIGIT = new IntegerBounds(0n, 9n);
const ONE_FLOAT = new FloatBounds(1, 1);

/** Walks one case through tree and ends it. The tree never draws. */
function walk(tree: Tree, steps: [Bounds, Value][], ending: Ending = "passed"): void {
  const walker = tree.walker();
  steps.forEach(([bounds, value], index) => {
    walker.step(
      index,
      {
        bounds,
        draw: () => {
          throw new Error("the tree drew from the source");
        },
      },
      value,
    );
  });
  walker.end(ending);
}

/** Returns what walk throws. */
function walkThrows(tree: Tree, steps: [Bounds, Value][]): unknown {
  try {
    walk(tree, steps);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("tree", () => {
  describe("NODE_LIMIT", () => {
    it("limits a tree to 2^20 nodes", ({ seat }) => {
      check.equal(seat, NODE_LIMIT, 2 ** 20, "the limit");
    });
  });

  describe("new Repeated", () => {
    it("returns the signal of a repeated case", ({ seat }) => {
      const signal = new Repeated();

      check.equal(
        seat,
        [signal.name, signal.message],
        ["Repeated", "prop: the case repeats a tested case"],
        "the name and the message",
      );
    });
  });

  describe("new Diverged", () => {
    it("returns the divergence at a position with both bounds", ({ seat }) => {
      const signal = new Diverged(2, DIGIT, undefined);

      check.equal(
        seat,
        [signal.name, signal.message, signal.index, signal.recorded, signal.requested],
        ["Diverged", "prop: choice 2 diverges", 2, DIGIT, undefined],
        "the fields",
      );
    });
  });

  describe("Walker.step", () => {
    it("throws Repeated for a choice that arrives at a leaf", ({ seat }) => {
      const tree = new Tree();
      walk(tree, [[DIGIT, 7n]]);

      check.errorIs(
        seat,
        walkThrows(tree, [[DIGIT, 7n]]),
        Repeated,
        "the second case of 7",
      );
    });

    it("throws Repeated for a repeat of a rejected case", ({ seat }) => {
      const tree = new Tree();
      walk(tree, [[DIGIT, 3n]], "rejected");

      check.errorIs(
        seat,
        walkThrows(tree, [[DIGIT, 3n]]),
        Repeated,
        "a rejected case is a leaf",
      );
    });

    it("follows every NaN on one edge apart from the two zeros", ({ seat }) => {
      const tree = new Tree();
      const any = new FloatBounds(
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        true,
      );
      walk(tree, [[any, Number.NaN]]);
      const repeated = walkThrows(tree, [[any, -Number.NaN]]);
      walk(tree, [[any, 0]]);
      walk(tree, [[any, -0]]);

      check.errorIs(seat, repeated, Repeated, "a NaN of another sign repeats");
      check.equal(seat, tree.root.children.size, 3, "NaN, +0 and -0");
    });

    it("follows a sequence on the edge of its elements", ({ seat }) => {
      const tree = new Tree();
      const bytes = new SequenceBounds(256, 0, 4);
      walk(tree, [[bytes, [1, 2]]]);

      check.errorIs(
        seat,
        walkThrows(tree, [[bytes, [1, 2]]]),
        Repeated,
        "the same elements repeat",
      );
    });

    it("throws Diverged for other bounds at a recorded position", ({ seat }) => {
      const tree = new Tree();
      walk(tree, [
        [DIGIT, 1n],
        [DIGIT, 2n],
      ]);
      const err = walkThrows(tree, [
        [DIGIT, 1n],
        [BIT, 0n],
      ]) as Diverged;

      check.errorIs(seat, err, Diverged, "the second request diverges");
      check.equal(
        seat,
        [err.index, err.recorded, err.requested],
        [1, DIGIT, BIT],
        "both requests",
      );
    });

    it("throws Diverged for a request where an earlier case ended", ({ seat }) => {
      const tree = new Tree();
      walk(tree, []);
      const err = walkThrows(tree, [[DIGIT, 1n]]) as Diverged;

      check.equal(
        seat,
        [err.index, err.recorded, err.requested],
        [0, undefined, DIGIT],
        "an end was recorded",
      );
    });

    it("stops checking a case once the tree is full", ({ seat }) => {
      const tree = new Tree(3);
      walk(tree, [
        [BIT, 0n],
        [BIT, 0n],
      ]);
      walk(tree, [
        [BIT, 0n],
        [BIT, 1n],
      ]);
      walk(tree, [
        [BIT, 0n],
        [BIT, 1n],
        [BIT, 1n],
      ]);

      check.equal(seat, [tree.nodes, tree.full], [3, true], "the tree stopped growing");
    });
  });

  describe("Walker.end", () => {
    it("throws Diverged for an end where an earlier case made a request", ({
      seat,
    }) => {
      const tree = new Tree();
      walk(tree, [[DIGIT, 1n]]);
      const err = walkThrows(tree, []) as Diverged;

      check.equal(
        seat,
        [err.index, err.recorded, err.requested],
        [0, DIGIT, undefined],
        "a request was recorded",
      );
    });

    it("marks the leaf with how the case ended", ({ seat }) => {
      const tree = new Tree();
      walk(tree, [[DIGIT, 3n]], "rejected");

      check.equal(
        seat,
        tree.root.children.get("3")?.ending,
        "rejected",
        "a rejected leaf",
      );
    });
  });

  describe("Tree.exhausted", () => {
    it("reports true once every value of two booleans has a leaf", ({ seat }) => {
      const tree = new Tree();
      const seen = (
        [
          [0n, 0n],
          [0n, 1n],
          [1n, 0n],
          [1n, 1n],
        ] as const
      ).map(([first, second]) => {
        walk(tree, [
          [BIT, first],
          [BIT, second],
        ]);
        return tree.exhausted;
      });

      check.equal(
        seat,
        seen,
        [false, false, false, true],
        "exhausted after the fourth case",
      );
    });

    it("reports true for a shorter branch once its leaf and the longer branch are done", ({
      seat,
    }) => {
      const tree = new Tree();
      walk(tree, [[BIT, 0n]]);
      walk(tree, [
        [BIT, 1n],
        [BIT, 0n],
      ]);
      const before = tree.exhausted;
      walk(tree, [
        [BIT, 1n],
        [BIT, 1n],
      ]);

      check.equal(
        seat,
        [before, tree.exhausted],
        [false, true],
        "a 1 needs both of its children",
      );
    });

    it("reports true for a case without choices", ({ seat }) => {
      const tree = new Tree();
      walk(tree, []);

      check.isTrue(seat, tree.exhausted, "the root is the leaf");
    });

    it("reports false for a float of one value", ({ seat }) => {
      const tree = new Tree();
      walk(tree, [[ONE_FLOAT, 1]]);

      check.isFalse(seat, tree.exhausted, "a float never exhausts");
    });

    it("reports false for a sequence without a maximum", ({ seat }) => {
      const tree = new Tree();
      walk(tree, [[new SequenceBounds(1, 0, undefined), []]]);

      check.isFalse(seat, tree.exhausted, "the sequence is unbounded");
    });

    it("reports true once every sequence of the bounds has a leaf", ({ seat }) => {
      const tree = new Tree();
      const bounds = new SequenceBounds(2, 0, 2);
      const all = [[], [0], [1], [0, 0], [0, 1], [1, 0], [1, 1]];
      const seen = all.map((elements) => {
        walk(tree, [[bounds, elements]]);
        return tree.exhausted;
      });

      check.equal(
        seat,
        seen,
        [false, false, false, false, false, false, true],
        "1 + 2 + 4 sequences",
      );
    });

    it("reports true once every sequence of a minimum length has a leaf", ({
      seat,
    }) => {
      const tree = new Tree();
      const bounds = new SequenceBounds(2, 1, 1);
      walk(tree, [[bounds, [0]]]);
      const before = tree.exhausted;
      walk(tree, [[bounds, [1]]]);

      check.equal(
        seat,
        [before, tree.exhausted],
        [false, true],
        "two sequences of one element",
      );
    });

    it("reports false for a sequence whose minimum length passes the children", ({
      seat,
    }) => {
      const tree = new Tree();
      walk(tree, [[new SequenceBounds(10, 2, 2), [3, 4]]]);

      check.isFalse(seat, tree.exhausted, "a hundred sequences of two digits");
    });

    it("reports false for a full tree", ({ seat }) => {
      const tree = new Tree(2);
      walk(tree, [[BIT, 0n]]);
      walk(tree, [[BIT, 1n]]);

      check.equal(
        seat,
        [tree.full, tree.exhausted],
        [true, false],
        "the full tree exhausts nothing",
      );
    });
  });
});
