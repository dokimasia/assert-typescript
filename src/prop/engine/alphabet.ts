/**
 * The default alphabet of the string generator, ordered from the simplest.
 *
 * A string is a sequence of indices into an alphabet, so the order of the
 * alphabet decides what a string shrinks towards. The default alphabet puts
 * the 95 printable ASCII characters first: the digits, the lowercase and the
 * uppercase letters, then space and the punctuation. A string shrinks
 * towards "0", then "00". After them come the other code points of the
 * Basic Multilingual Plane, ascending, without the surrogates, and then the
 * code points above it.
 */

/** An inclusive range of indices or code points. */
export type Interval = readonly [first: number, last: number];

/** The first 95 characters, in order. */
const PRINTABLE =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" +
  " !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

/**
 * The code point ranges that follow the printable characters, inclusive
 * and ascending: the controls below space, everything from DEL to the
 * surrogates, everything after the surrogates in the plane, and the
 * supplementary planes.
 */
const REST: readonly Interval[] = [
  [0x00, 0x1f],
  [0x7f, 0xd7ff],
  [0xe000, 0xffff],
  [0x10000, 0x10ffff],
];

/** The number of characters in the default alphabet: every Unicode scalar value. */
export const SIZE = REST.reduce((sum, [lo, hi]) => sum + hi - lo + 1, PRINTABLE.length);

/** The index of each printable character. */
const PRINTABLE_INDEX = new Map([...PRINTABLE].map((char, index) => [char, index]));

/** The first and the last printable code points: space and tilde. */
const FIRST_PRINTABLE = 0x20;
const LAST_PRINTABLE = 0x7e;

/**
 * Returns the character at index of the default alphabet.
 *
 * @param index - An index in [0, SIZE).
 * @returns The character.
 * @throws RangeError for an index outside [0, SIZE).
 */
export function character(index: number): string {
  if (index < 0 || index >= SIZE) {
    throw new RangeError(`prop: index ${index} is outside the default alphabet`);
  }
  if (index < PRINTABLE.length) return PRINTABLE[index] as string;
  let offset = index - PRINTABLE.length;
  let range = REST[0] as Interval;
  for (let at = 1; offset > range[1] - range[0]; at += 1) {
    offset -= range[1] - range[0] + 1;
    range = REST[at] as Interval;
  }
  return String.fromCodePoint(range[0] + offset);
}

/**
 * Returns the index of a character in the default alphabet, or undefined
 * for a lone surrogate, which is no scalar value.
 *
 * @param char - One code point.
 * @returns The index, or undefined.
 */
export function indexOf(char: string): number | undefined {
  const printable = PRINTABLE_INDEX.get(char);
  if (printable !== undefined) return printable;
  const point = char.codePointAt(0) as number;
  let offset = PRINTABLE.length;
  for (const [lo, hi] of REST) {
    if (point >= lo && point <= hi) return offset + point - lo;
    offset += hi - lo + 1;
  }
  return undefined;
}

/**
 * Returns the indices of the code points in [lo, hi], as inclusive
 * intervals, sorted, without overlaps and without intervals that touch.
 * The surrogates in the range have no index and are left out.
 *
 * @param lo - The first code point.
 * @param hi - The last code point.
 * @returns The intervals.
 */
export function indices(lo: number, hi: number): Interval[] {
  const found: Interval[] = [];
  for (
    let point = Math.max(lo, FIRST_PRINTABLE);
    point <= Math.min(hi, LAST_PRINTABLE);
    point += 1
  ) {
    const position = PRINTABLE_INDEX.get(String.fromCodePoint(point)) as number;
    found.push([position, position]);
  }
  let offset = PRINTABLE.length;
  for (const [first, last] of REST) {
    const start = Math.max(lo, first);
    const end = Math.min(hi, last);
    if (start <= end) found.push([offset + start - first, offset + end - first]);
    offset += last - first + 1;
  }
  return merge(found);
}

/**
 * Returns the union of inclusive intervals, sorted, with touching
 * intervals joined.
 *
 * @param intervals - The intervals.
 * @returns The union.
 */
export function merge(intervals: readonly Interval[]): Interval[] {
  const merged: [number, number][] = [];
  for (const [start, end] of [...intervals].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1],
  )) {
    const last = merged.at(-1);
    if (last !== undefined && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
