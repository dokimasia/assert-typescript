/**
 * The assertion about how neighbouring items relate.
 *
 * One assertion rather than sorted, unique and strictly increasing,
 * because each of those is a relation that has to hold between every
 * adjacent pair and nothing more.
 */

import type { Mode, Seat } from "./seat.js";
import { fail, pass } from "./verdict.js";

/**
 * Fail when an adjacent pair does not satisfy the predicate. The failure
 * states the index of the first item of the pair, and the two items.
 */
export function pairwise<T>(
  seat: Seat,
  mode: Mode,
  items: readonly T[],
  predicate: (earlier: T, later: T) => boolean,
  msg: string,
): void {
  seat.helper();
  for (let i = 1; i < items.length; i += 1) {
    const first = items[i - 1] as T;
    const second = items[i] as T;
    if (!predicate(first, second)) {
      fail(seat, mode, "pairwise", msg, { index: i - 1, first, second });
      return;
    }
  }
  pass(seat, mode, "pairwise", msg);
}
