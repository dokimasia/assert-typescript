// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The end of a helper's call with a fault.
 *
 * A fault is an error that ends a call without a verdict: an argument or an
 * environment that the call refuses. A helper built on the seat ends its
 * call with a fault as the assertions of this library end theirs.
 */

import { end } from "./matcher/fault.js";
import type { Seat } from "./matcher/seat.js";

/**
 * Ends the call of a helper with error, a fault. A seat with reportFault
 * receives error with ending true, and returns, so the helper returns after
 * fault. For a seat without reportFault, fault throws error. It does not
 * write a call record, because the call is not a call of an assertion.
 *
 * @param seat - The seat of the helper's call.
 * @param error - The fault.
 * @throws error, for a seat without reportFault.
 * @example
 * if (path === "") {
 *   fault(seat, new RangeError("loaded: the path is empty"));
 *   return undefined;
 * }
 */
export function fault(seat: Seat, error: Error): void {
  end(seat, error);
}
