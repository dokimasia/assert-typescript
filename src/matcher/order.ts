/**
 * The assertion about how neighbouring items relate.
 *
 * One assertion rather than sorted, unique and strictly increasing,
 * because each of those is a relation that has to hold between every
 * adjacent pair and nothing more.
 */

import { show } from "./inspect.js";
import { type Mode, report, type Seat } from "./seat.js";

/** Fail when an adjacent pair does not satisfy the predicate. */
export function pairwise<T>(
  seat: Seat,
  mode: Mode,
  items: readonly T[],
  predicate: (earlier: T, later: T) => boolean,
  msg: string,
): void {
  seat.helper();
  for (let i = 1; i < items.length; i += 1) {
    const earlier = items[i - 1] as T;
    const later = items[i] as T;
    if (!predicate(earlier, later)) {
      report(
        seat,
        mode,
        `${msg}: the pair at index ${i - 1} fails: ` +
          `${show(earlier)} then ${show(later)}`,
      );
      return;
    }
  }
}
