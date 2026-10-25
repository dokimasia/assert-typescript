// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The assertions about text: a prefix, a suffix, a pattern of the portable
 * subset, and needles in order. A value that is no string fails.
 */

import { compile } from "../pattern/match.js";
import type { Mode, Seat } from "./seat.js";
import { fail, pass } from "./verdict.js";

/** Fail when got does not start with prefix. */
export function hasPrefix(
  seat: Seat,
  mode: Mode,
  got: unknown,
  prefix: string,
  msg: string,
): void {
  seat.helper();
  if (typeof got !== "string" || !got.startsWith(prefix)) {
    fail(seat, mode, "has-prefix", msg, { got, prefix });
    return;
  }
  pass(seat, mode, "has-prefix", msg);
}

/** Fail when got does not end with suffix. */
export function hasSuffix(
  seat: Seat,
  mode: Mode,
  got: unknown,
  suffix: string,
  msg: string,
): void {
  seat.helper();
  if (typeof got !== "string" || !got.endsWith(suffix)) {
    fail(seat, mode, "has-suffix", msg, { got, suffix });
    return;
  }
  pass(seat, mode, "has-suffix", msg);
}

/**
 * Fail when got does not match the pattern, a pattern of the portable
 * subset. A pattern outside the subset fails, with reason the text with
 * which the subset's parser refuses it. reason is null for a pattern
 * inside the subset.
 */
export function matches(
  seat: Seat,
  mode: Mode,
  got: unknown,
  pattern: string,
  msg: string,
): void {
  seat.helper();
  let expression: RegExp | undefined;
  let reason: string | null = null;
  try {
    expression = compile(pattern);
  } catch (err) {
    reason = (err as Error).message;
  }
  if (typeof got !== "string" || expression === undefined || !expression.test(got)) {
    fail(seat, mode, "matches", msg, { got, pattern, reason });
    return;
  }
  pass(seat, mode, "matches", msg);
}

/** Fail when got does not contain every needle, in order. */
export function containsInOrder(
  seat: Seat,
  mode: Mode,
  got: unknown,
  needles: readonly string[],
  msg: string,
): void {
  seat.helper();
  if (typeof got !== "string") {
    fail(seat, mode, "contains-in-order", msg, { haystack: got, needle: "", index: 0 });
    return;
  }

  let from = 0;
  // The index is the loop's own, not a lookup: a needle listed twice
  // would find its first position rather than the one that failed.
  for (const [index, needle] of needles.entries()) {
    const at = got.indexOf(needle, from);
    if (at < 0) {
      fail(seat, mode, "contains-in-order", msg, { haystack: got, needle, index });
      return;
    }
    from = at + needle.length;
  }
  pass(seat, mode, "contains-in-order", msg);
}
