// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the nodes and the spans of a case as the passes of the shrinker edit them. */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import type { Span } from "../../../../src/prop/engine/case/record.js";
import {
  type Bounds,
  choiceOf,
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
  type Value,
} from "../../../../src/prop/engine/choice.js";
import { Integer } from "../../../../src/prop/engine/generator.js";
import { choiceKey } from "../../../../src/prop/engine/order.js";
import {
  atTarget,
  children,
  descendants,
  duplicates,
  elementDeletions,
  freeStructure,
  groupsOf,
  keysOf,
  largestPower,
  latestFirst,
  type Node,
  nextWithBounds,
  nodesOf,
  parentsOf,
  replaced,
  sequenceDeletions,
  steppedAt,
  without,
} from "../../../../src/prop/engine/shrink/nodes.js";
import { test as it } from "../../../../src/vitest.js";
import { body, executed, integers } from "../../../helpers.js";

const DIGITS = new IntegerBounds(0n, 9n);
const WIDE = new Integer(new IntegerBounds(0n, 1_000_000_000n));

/** A body that fails for a draw above 1000. */
const above = body((c) => {
  if (c.draw(WIDE, "n") > 1000n) {
    c.fail("above");
  }
});

/** Returns the node of a choice of value under bounds, with the edge of a structure choice. */
function node(bounds: Bounds, value: Value, edge?: bigint): Node {
  return {
    request: { bounds, draw: () => value, edge },
    choice: choiceOf(bounds, value),
  };
}

/** Returns the values of the choices of nodes. */
function valuesOf(nodes: readonly Node[]): Value[] {
  return nodes.map((one) => one.choice.value);
}

/** Returns a span of label from start to end below parent. */
function span(label: string, start: number, end: number, parent?: number): Span {
  return { label, start, end, depth: parent === undefined ? 0 : 1, parent };
}

/** The spans of a list at 0 with two elements, the first of which holds a nested span. */
const LIST = span("list", 0, 5);
const FIRST = span("element", 0, 2, 0);
const INNER = span("inner", 1, 2, 1);
const SECOND = span("element", 2, 4, 0);
const SPANS: readonly Span[] = [LIST, FIRST, INNER, SECOND];

describe("nodes", () => {
  describe("nodesOf", () => {
    it("returns each choice of a case with its request", async ({ seat }) => {
      const execution = await executed(above, integers(2000n));
      const [first] = nodesOf(execution.case);

      check.isEqualTo(
        seat,
        [first?.choice, first?.request === execution.case.requests[0]],
        [{ kind: "integer", value: 2000n }, true],
        "one node",
      );
    });
  });

  describe("keysOf", () => {
    it("returns the key of each choice under its bounds", ({ seat }) => {
      check.isEqualTo(
        seat,
        keysOf([node(DIGITS, 3n)]),
        [choiceKey(DIGITS, 3n)],
        "one key",
      );
    });
  });

  describe("replaced", () => {
    it("returns the nodes with one value replaced", ({ seat }) => {
      const nodes = [node(DIGITS, 1n), node(DIGITS, 2n)];

      check.isEqualTo(
        seat,
        [valuesOf(replaced(nodes, 1, 5n)), valuesOf(nodes)],
        [
          [1n, 5n],
          [1n, 2n],
        ],
        "a new list, and the old one unchanged",
      );
    });
  });

  describe("without", () => {
    it("returns the nodes without a range", ({ seat }) => {
      const nodes = [node(DIGITS, 1n), node(DIGITS, 2n), node(DIGITS, 3n)];

      check.isEqualTo(
        seat,
        valuesOf(without(nodes, 1, 2)),
        [1n, 3n],
        "the middle node gone",
      );
    });
  });

  describe("atTarget", () => {
    it("returns the node with its value at the target of its bounds", ({ seat }) => {
      check.isEqualTo(seat, atTarget(node(DIGITS, 7n)).choice.value, 0n, "0");
    });
  });

  describe("children", () => {
    it("returns the spans of one parent in order", ({ seat }) => {
      check.isEqualTo(
        seat,
        [children(SPANS, undefined), children(SPANS, 0)],
        [[LIST], [FIRST, SECOND]],
        "the list, then its elements",
      );
    });
  });

  describe("parentsOf", () => {
    it("returns the later parents first and the top last", ({ seat }) => {
      check.isEqualTo(seat, parentsOf(SPANS), [1, 0, undefined], "three parents");
    });
  });

  describe("groupsOf", () => {
    it("returns the siblings of each parent in the order of parentsOf", ({ seat }) => {
      check.isEqualTo(
        seat,
        groupsOf(SPANS),
        [[INNER], [FIRST, SECOND], [LIST]],
        "three groups",
      );
    });
  });

  describe("descendants", () => {
    it("returns the spans inside a span in order", ({ seat }) => {
      check.isEqualTo(
        seat,
        [descendants(SPANS, 0), descendants(SPANS, 1)],
        [[FIRST, INNER, SECOND], [INNER]],
        "every span inside the list, and the nested span",
      );
    });
  });

  describe("latestFirst", () => {
    it("returns the spans from the latest start, the longer first at one start", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        latestFirst(SPANS),
        [SECOND, INNER, LIST, FIRST],
        "by start, then by end",
      );
    });
  });

  describe("largestPower", () => {
    it("returns the largest power of two that is the count or less", ({ seat }) => {
      check.isEqualTo(
        seat,
        [0, 1, 5, 8].map(largestPower),
        [0, 1, 4, 8],
        "four counts",
      );
    });
  });

  describe("steppedAt", () => {
    it("returns the nodes with an integer stepped once towards its target", ({
      seat,
    }) => {
      const signed = new IntegerBounds(-9n, 9n);

      check.isEqualTo(
        seat,
        [
          valuesOf(steppedAt([node(signed, 5n)], 0) ?? []),
          valuesOf(steppedAt([node(signed, -5n)], 0) ?? []),
        ],
        [[4n], [-4n]],
        "one step down and one step up",
      );
    });

    it("returns undefined for an integer at its target and for a float", ({ seat }) => {
      check.isEqualTo(
        seat,
        [
          steppedAt([node(DIGITS, 0n)], 0),
          steppedAt([node(new FloatBounds(0, 1), 0.5)], 0),
        ],
        [undefined, undefined],
        "no step",
      );
    });
  });

  describe("sequenceDeletions", () => {
    it("yields 2^k consecutive deletions, the largest k and the last run first", ({
      seat,
    }) => {
      const sequence = node(new SequenceBounds(10), [1, 2, 3]);

      check.isEqualTo(
        seat,
        [...sequenceDeletions([sequence], 0)].map((nodes) => nodes[0]?.choice.value),
        [[1], [3], [1, 2], [1, 3], [2, 3]],
        "five deletions",
      );
    });

    it("yields no deletion below the minimum size", ({ seat }) => {
      const sequence = node(new SequenceBounds(10, 3), [1, 2, 3]);

      check.isEqualTo(seat, [...sequenceDeletions([sequence], 0)], [], "none");
    });

    it("yields nothing for a choice that is no sequence", ({ seat }) => {
      check.isEqualTo(seat, [...sequenceDeletions([node(DIGITS, 3n)], 0)], [], "none");
    });
  });

  describe("elementDeletions", () => {
    it("yields each deletion of one element, the last element first", ({ seat }) => {
      const sequence = node(new SequenceBounds(10), [1, 2, 3]);

      check.isEqualTo(
        seat,
        [...elementDeletions([sequence], 0)].map((nodes) => nodes[0]?.choice.value),
        [
          [1, 2],
          [1, 3],
          [2, 3],
        ],
        "three deletions",
      );
    });

    it("yields nothing at the minimum size and for a choice that is no sequence", ({
      seat,
    }) => {
      const full = node(new SequenceBounds(10, 3), [1, 2, 3]);

      check.isEqualTo(
        seat,
        [
          [...elementDeletions([full], 0)],
          [...elementDeletions([node(DIGITS, 3n)], 0)],
        ],
        [[], []],
        "none",
      );
    });
  });

  describe("freeStructure", () => {
    it("reports whether a structure choice allows two values or more", ({ seat }) => {
      check.isEqualTo(
        seat,
        [
          freeStructure(node(new IntegerBounds(0n, 1n), 1n, 1n)),
          freeStructure(node(new IntegerBounds(0n, 0n), 0n, 0n)),
          freeStructure(node(new IntegerBounds(0n, 1n), 1n)),
        ],
        [true, false, false],
        "a free flag, a forced flag, and a value choice",
      );
    });
  });

  describe("duplicates", () => {
    it("returns the groups of choices that share bounds and a value off the target", ({
      seat,
    }) => {
      const wide = WIDE.bounds;
      const nodes = [
        node(DIGITS, 3n),
        node(DIGITS, 3n),
        node(DIGITS, 0n),
        node(DIGITS, 0n),
        node(DIGITS, 3n),
        node(wide, 3n),
      ];

      check.isEqualTo(seat, duplicates(nodes), [[0, 1, 4]], "the three digits of 3");
    });
  });

  describe("nextWithBounds", () => {
    it("returns the index of the next node with the same bounds", ({ seat }) => {
      const nodes = [node(DIGITS, 1n), node(WIDE.bounds, 1n), node(DIGITS, 2n)];

      check.isEqualTo(
        seat,
        [nextWithBounds(nodes, 0), nextWithBounds(nodes, 1)],
        [2, undefined],
        "the third node, and none",
      );
    });
  });
});
