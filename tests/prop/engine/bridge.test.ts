/** The spec of the fuzz bridge, which decodes a fuzzer's bytes into the choices of one case. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { Bridging } from "../../../src/prop/engine/bridge.js";
import {
  type Bounds,
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
} from "../../../src/prop/engine/choice.js";
import { test as it } from "../../../src/vitest.js";

/** Returns the values that bytes decode to for each bounds, in order. */
function values(data: number[], ...bounds: Bounds[]): unknown[] {
  const bridge = new Bridging(Uint8Array.from(data));
  return bounds.map((one) => bridge.value({ bounds: one, draw: () => one.target }));
}

/** Returns the bytes of a float of width 64, little-endian. */
function float64(value: number): number[] {
  return [...new Uint8Array(new Float64Array([value]).buffer)];
}

describe("bridge", () => {
  describe("Bridging.value", () => {
    it("reads an integer from its bytes as a little-endian offset from the lower bound", ({
      seat,
    }) => {
      check.equal(
        seat,
        values([0x2c, 0x01], new IntegerBounds(0n, 1000n)),
        [300n],
        "0x012c is 300",
      );
    });

    it("wraps an offset past the span of the bounds", ({ seat }) => {
      check.equal(
        seat,
        values([12], new IntegerBounds(-5n, 5n)),
        [-4n],
        "12 mod 11 is 1, so the value is -5 + 1",
      );
    });

    it("reads no byte for integer bounds of one value", ({ seat }) => {
      check.equal(
        seat,
        values([9], new IntegerBounds(7n, 7n), new IntegerBounds(0n, 255n)),
        [7n, 9n],
        "the second integer reads the byte",
      );
    });

    it("takes the target of an integer whose bytes run out", ({ seat }) => {
      check.equal(
        seat,
        values([1], new IntegerBounds(1n, 70_000n)),
        [1n],
        "three bytes are needed and one remains",
      );
    });

    it("takes the target of every value after the bytes run out", ({ seat }) => {
      check.equal(
        seat,
        values([1], new IntegerBounds(1n, 70_000n), new IntegerBounds(0n, 255n)),
        [1n, 0n],
        "the first integer spends the byte that remains",
      );
    });

    it("reads a float of width 64 from 8 bytes", ({ seat }) => {
      check.equal(
        seat,
        values(float64(0.5), new FloatBounds(0, 1)),
        [0.5],
        "the float 0.5",
      );
    });

    it("reads a float of width 32 from 4 bytes", ({ seat }) => {
      const data = [...new Uint8Array(new Float32Array([0.25]).buffer)];

      check.equal(
        seat,
        values(data, new FloatBounds(0, 1, false, 32)),
        [0.25],
        "the float 0.25",
      );
    });

    it("takes the target for a float that the bounds do not admit", ({ seat }) => {
      check.equal(
        seat,
        values(float64(5), new FloatBounds(0, 1)),
        [0],
        "5 is outside [0, 1]",
      );
    });

    it("reads no byte for float bounds of one nonzero value", ({ seat }) => {
      check.equal(
        seat,
        values([3], new FloatBounds(2, 2), new IntegerBounds(0n, 255n)),
        [2, 3n],
        "the integer reads the byte",
      );
    });

    it("reads negative zero from the bytes for float bounds of zero alone", ({
      seat,
    }) => {
      check.isTrue(
        seat,
        Object.is(values(float64(-0), new FloatBounds(0, 0))[0], -0),
        "the float is -0",
      );
    });

    it("takes the target of a float whose bytes run out", ({ seat }) => {
      check.equal(
        seat,
        values([1, 2], new FloatBounds(0, 1)),
        [0],
        "8 bytes are needed and 2 remain",
      );
    });

    it("reads the length of a sequence before its elements", ({ seat }) => {
      check.equal(
        seat,
        values([2, 5, 6, 7], new SequenceBounds(256, 0, 4)),
        [[5, 6]],
        "two elements",
      );
    });

    it("reads the length of a sequence without a maximum from two bytes", ({
      seat,
    }) => {
      check.equal(
        seat,
        values([1, 0, 9], new SequenceBounds(256, 0, undefined)),
        [[9]],
        "one element",
      );
    });

    it("extends a sequence whose elements run out with zeros to its minimum", ({
      seat,
    }) => {
      check.equal(
        seat,
        values([2, 4], new SequenceBounds(256, 3, 6)),
        [[4, 0, 0]],
        "one element read and two zeros",
      );
    });

    it("takes the target of a sequence without bytes for its length", ({ seat }) => {
      check.equal(
        seat,
        values([], new SequenceBounds(256, 2, 4)),
        [[0, 0]],
        "the target of two zeros",
      );
    });
  });
});
