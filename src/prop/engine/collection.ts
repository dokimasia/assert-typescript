/**
 * How a collection decides its length, one element at a time.
 *
 * Every collection, a list, a dict or a repetition in a pattern, decodes the
 * same way: before each element a continue flag, an integer choice that
 * decides structure, then the element's own choices. The flag's bounds
 * force it while the count is below the minimum or at the maximum, so every
 * replay of recorded choices yields a length inside the sizes.
 *
 * Each element is a span labelled `element`, or `entry` in a dict, that
 * starts at its flag. Deleting that span deletes the element whole.
 */

import { type Case, Rejected } from "./case.js";
import * as draw from "./draw.js";

/** The span labels of one element of a collection and one entry of a dict. */
export const ELEMENT = "element";
export const ENTRY = "entry";

/**
 * A collection that discards this many duplicates in a row stops. A
 * collection still below its minimum size then rejects the case.
 */
const MAX_DISCARDS = 10;

/** The bounds on a collection's length, both inclusive. */
export class Sizes {
  /** The fewest elements. */
  readonly minSize: number;
  /** The most elements, or undefined for no bound. */
  readonly maxSize: number | undefined;

  /**
   * Returns the sizes from minSize to maxSize.
   *
   * @param minSize - The fewest elements.
   * @param maxSize - The most elements, or undefined for no bound.
   * @throws RangeError for a negative minSize or a maxSize below it.
   */
  constructor(minSize = 0, maxSize?: number) {
    if (minSize < 0 || (maxSize !== undefined && maxSize < minSize)) {
      throw new RangeError(`prop: sizes [${minSize}, ${maxSize}] are empty`);
    }
    this.minSize = minSize;
    this.maxSize = maxSize;
  }

  /** The average length that the random phase aims for. */
  get average(): number {
    return draw.averageLength(this.minSize, this.maxSize);
  }
}

/**
 * Returns the case's decision whether a collection of count elements grows.
 * The decision is an integer choice that decides structure, with the bounds
 * that draw.flagBounds states. A stopped collection decides as one at its
 * maximum would: the bounds admit only 0. The edge phase gives a collection
 * one element: its edge is 1 at count 0 and 0 after.
 *
 * @param c - The case.
 * @param count - The elements so far.
 * @param sizes - The collection's sizes.
 * @param stopped - Whether the collection takes no further element.
 * @param average - The average length, in place of the average of sizes.
 * @returns True to continue.
 */
export function more(
  c: Case,
  count: number,
  sizes: Sizes,
  stopped = false,
  average = sizes.average,
): boolean {
  const lo = sizes.minSize;
  const hi = stopped ? count : sizes.maxSize;
  const value = c.choose({
    bounds: draw.flagBounds(count, lo, hi),
    draw: (source) => draw.flag(source, count, lo, hi, average),
    edge: count === 0 ? 1n : 0n,
  });
  return value === 1n;
}

/**
 * Decodes a collection: per element a continue flag, then the element.
 * decode returns an element and the key that it must be unique by, or
 * undefined when the collection allows duplicates. An element whose key
 * repeats an earlier key is discarded, and the next flag is decided for the
 * same count. After ten discards in a row, the collection stops.
 *
 * @param c - The case.
 * @param sizes - The collection's sizes.
 * @param label - The span label of each element.
 * @param decode - Decodes one element and returns it with its key.
 * @param stop - Asked before each flag that the minimum does not force.
 *   When it returns true, the flag admits only 0.
 * @returns The elements.
 * @throws Rejected when the collection stopped below its minimum size.
 */
export function collect<T>(
  c: Case,
  sizes: Sizes,
  label: string,
  decode: () => readonly [item: T, key: string | undefined],
  stop?: () => boolean,
): T[] {
  const items: T[] = [];
  const seen = new Set<string>();
  let discards = 0;
  for (;;) {
    const start = c.choices.length;
    const stopped = stop !== undefined && items.length >= sizes.minSize && stop();
    if (!more(c, items.length, sizes, stopped)) return items;
    const [item, key] = c.span(label, decode, start);
    if (key !== undefined && seen.has(key)) {
      discards += 1;
      if (discards < MAX_DISCARDS) continue;
      if (items.length < sizes.minSize) throw new Rejected();
      return items;
    }
    discards = 0;
    if (key !== undefined) seen.add(key);
    items.push(item);
  }
}
