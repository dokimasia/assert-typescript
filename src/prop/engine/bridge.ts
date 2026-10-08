/**
 * The fuzz bridge: a fuzzer's bytes decoded into the choices of one case.
 *
 * Bridging is a provider that reads each value from the bytes, in request
 * order:
 *
 * - An integer in [lo, hi] reads `ceil(bitLength(hi − lo) / 8)` bytes as a
 *   little-endian unsigned u, and takes `lo + u mod (hi − lo + 1)`. Bounds
 *   with one value read no byte.
 * - A float reads 8 bytes, or 4 for width 32, little-endian, as the bits of
 *   a float of its width. A value that its bounds do not admit takes the
 *   target. Bounds that admit one value read no byte.
 * - A sequence reads its length as an integer in [minSize, maxSize], or in
 *   [minSize, minSize + 65,535] when it has no maximum, then each element
 *   as an integer in [0, k − 1]. A byte string therefore takes one fuzzer
 *   byte per byte, after its length.
 * - A value that needs more bytes than remain takes its target, and the
 *   bytes that remain are spent, so every later value takes its target too.
 *   An element cut short ends its sequence, which zeros extend to minSize.
 *
 * Every byte string decodes to a valid case, so a failure that a fuzzer
 * finds is a choice sequence that the shrinker can minimise and the store
 * can keep.
 */

import type { Provider, Request } from "./case.js";
import type { FloatBounds, IntegerBounds, SequenceBounds, Value } from "./choice.js";
import { fromBits, fromBits32 } from "./float.js";
import { bitLength } from "./source.js";

/** The lengths that a sequence without a maximum may take beyond its minimum, read from two bytes. */
const UNBOUNDED_LENGTHS = 0xffff;

/** Returns the bytes that cover an integer range of span + 1 values. */
function width(span: bigint): number {
  return Math.ceil(bitLength(span) / 8);
}

/** A provider that decodes every value from a fuzzer's bytes. */
export class Bridging implements Provider {
  readonly #data: Uint8Array;
  #at = 0;

  /**
   * Returns the provider that decodes from data's first byte.
   *
   * @param data - The fuzzer's bytes.
   */
  constructor(data: Uint8Array) {
    this.#data = data;
  }

  /**
   * Returns the value that the next bytes decode to under the request's bounds.
   *
   * @param request - The request.
   * @returns The value.
   */
  value(request: Request): Value {
    const bounds = request.bounds;
    switch (bounds.kind) {
      case "integer":
        return this.#integer(bounds);
      case "float":
        return this.#float(bounds);
      default:
        return this.#sequence(bounds);
    }
  }

  /**
   * Returns the next count bytes as a little-endian unsigned integer, or
   * undefined when fewer than count bytes remain. The bytes that remain are
   * then spent.
   */
  #take(count: number): bigint | undefined {
    if (count > this.#data.length - this.#at) {
      this.#at = this.#data.length;
      return undefined;
    }
    let value = 0n;
    for (let i = count - 1; i >= 0; i -= 1) {
      value = (value << 8n) | BigInt(this.#data[this.#at + i] as number);
    }
    this.#at += count;
    return value;
  }

  /** Returns an integer in [0, span] read from the bytes that cover it, or undefined. */
  #below(span: bigint): bigint | undefined {
    const u = this.#take(width(span));
    return u === undefined ? undefined : u % (span + 1n);
  }

  /** Returns lo plus the offset that the bytes state, or the target. */
  #integer(bounds: IntegerBounds): bigint {
    const offset = this.#below(bounds.hi - bounds.lo);
    return offset === undefined ? bounds.target : bounds.lo + offset;
  }

  /**
   * Returns the float whose bits the bytes state, fitted to the bounds. Both
   * zeros lie inside any range that contains either, so only a nonzero range
   * of one value, without NaN, reads no byte.
   */
  #float(bounds: FloatBounds): number {
    if (bounds.lo === bounds.hi && bounds.lo !== 0 && !bounds.allowNan)
      return bounds.target;
    const bits = this.#take(bounds.width / 8);
    if (bits === undefined) return bounds.target;
    const value = bounds.width === 64 ? fromBits(bits) : fromBits32(bits);
    return bounds.coerce({ kind: "float", value });
  }

  /** Returns the length that the bytes state, then as many elements as they contain. */
  #sequence(bounds: SequenceBounds): readonly number[] {
    const spread =
      bounds.maxSize === undefined
        ? UNBOUNDED_LENGTHS
        : bounds.maxSize - bounds.minSize;
    const extra = this.#below(BigInt(spread));
    if (extra === undefined) return bounds.target;
    const elements: number[] = [];
    const span = BigInt(bounds.k - 1);
    for (let i = 0; i < bounds.minSize + Number(extra); i += 1) {
      const element = this.#below(span);
      if (element === undefined) break;
      elements.push(Number(element));
    }
    while (elements.length < bounds.minSize) elements.push(0);
    return elements;
  }
}
