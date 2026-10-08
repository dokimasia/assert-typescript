/** The spec of the edge phase: the value that each choice takes at each boundary. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  type Bounds,
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
  type Value,
} from "../../../src/prop/engine/choice.js";
import { BOUNDARIES, Edge } from "../../../src/prop/engine/edge.js";
import { sameFloat } from "../../../src/prop/engine/float.js";
import { test as it } from "../../../src/vitest.js";

/** Returns the value that a request with bounds takes at each boundary, in order. The edge phase never draws. */
function take(bounds: Bounds, edge?: bigint): Value[] {
  const request = {
    bounds,
    draw: () => {
      throw new Error("the edge phase drew from the source");
    },
    edge,
  };
  return BOUNDARIES.map((boundary) => new Edge(boundary).value(request));
}

describe("edge", () => {
  describe("BOUNDARIES", () => {
    it("orders the edge cases from min to below", ({ seat }) => {
      check.equal(seat, BOUNDARIES, ["min", "max", "above", "below"], "the order");
    });
  });

  describe("Edge.value", () => {
    it("gives an integer its bounds and the neighbours of its target", ({ seat }) => {
      check.equal(
        seat,
        take(new IntegerBounds(-5n, 5n)),
        [-5n, 5n, 1n, -1n],
        "the four values",
      );
    });

    it("gives an integer its target for a neighbour outside the bounds", ({ seat }) => {
      check.equal(
        seat,
        take(new IntegerBounds(0n, 10n)),
        [0n, 10n, 1n, 0n],
        "below 0 is outside [0, 10]",
      );
    });

    it("gives an integer of one value that value at every boundary", ({ seat }) => {
      check.equal(
        seat,
        take(new IntegerBounds(3n, 3n)),
        [3n, 3n, 3n, 3n],
        "the one value",
      );
    });

    it("gives a float its bounds and the next floats around its target", ({ seat }) => {
      const got = take(new FloatBounds(-1, 1)) as number[];
      const want = [-1, 1, Number.MIN_VALUE, -Number.MIN_VALUE];

      check.isTrue(
        seat,
        got.every((value, i) => sameFloat(value, want[i] as number)),
        "the smallest subnormals around 0",
      );
    });

    it("gives a float its target for the next float below the bounds", ({ seat }) => {
      const [, , above, below] = take(new FloatBounds(0.5, 0.75)) as number[];

      check.equal(
        seat,
        [below, (above as number) > 0.5],
        [0.5, true],
        "the target below and a larger float above",
      );
    });

    it("gives a float of width 32 the next float of that width", ({ seat }) => {
      const [, , above] = take(new FloatBounds(-1, 1, false, 32)) as number[];

      check.equal(seat, above, 2 ** -149, "the smallest subnormal of width 32");
    });

    it("gives a sequence one element at the boundary", ({ seat }) => {
      check.equal(
        seat,
        take(new SequenceBounds(256)),
        [[0], [255], [1], [0]],
        "0, k − 1, 1, and 0 below",
      );
    });

    it("gives a sequence minSize elements", ({ seat }) => {
      check.equal(
        seat,
        take(new SequenceBounds(4, 3))[1],
        [3, 3, 3],
        "three elements at max",
      );
    });

    it("gives a sequence of at most 0 elements none", ({ seat }) => {
      check.equal(
        seat,
        take(new SequenceBounds(4, 0, 0)),
        [[], [], [], []],
        "empty sequences",
      );
    });

    it("gives a sequence of one element value 0 above", ({ seat }) => {
      check.equal(seat, take(new SequenceBounds(1))[2], [0], "1 is outside [0, 1)");
    });

    it("gives a structure choice its edge at every boundary", ({ seat }) => {
      check.equal(
        seat,
        take(new IntegerBounds(0n, 1n), 1n),
        [1n, 1n, 1n, 1n],
        "the edge 1",
      );
    });

    it("gives a structure choice its target for an edge outside the bounds", ({
      seat,
    }) => {
      check.equal(
        seat,
        take(new IntegerBounds(1n, 1n), 0n),
        [1n, 1n, 1n, 1n],
        "a flag forced to 1",
      );
    });
  });
});
