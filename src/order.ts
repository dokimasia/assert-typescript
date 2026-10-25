// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The order of text: by UTF-16 code units, the order in which
 * `Array.prototype.sort` sorts strings without a comparator.
 */

/**
 * Compares two strings by their UTF-16 code units.
 *
 * @param a - A string.
 * @param b - Another string.
 * @returns A negative number when a sorts first, a positive one when b
 *   does, and 0 for equal strings.
 */
export function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}
