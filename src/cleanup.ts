// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The registration of a cleanup on the seat of a helper.
 *
 * A helper that starts a server, a process or a directory registers its
 * release on the seat that it takes, so the release runs when the test, the
 * case or the body of the seat ends.
 */

import { end, Fault, ofOperation } from "./matcher/fault.js";
import type { Seat } from "./matcher/seat.js";

/**
 * Registers fn to run when the test, the case or the body of seat ends.
 * It calls the member cleanup of seat. The seat of the fixture of
 * `@dokimi/assert/vitest`, a case of a property, a Recorder, and the seat
 * that doesReject or eventually hands a body have the member. A seat
 * without it ends the call with a fault, and fn does not run.
 *
 * @param seat - The seat of the helper's call.
 * @param fn - The release, which may return a promise.
 * @throws The fault, for a seat without the member and without reportFault.
 * @example
 * const server = await listen(handler);
 * cleanup(seat, () => server.close());
 */
export function cleanup(seat: Seat, fn: () => void | Promise<void>): void {
  if (seat.cleanup === undefined) {
    end(seat, ofOperation("cleanup", new Fault("", "the seat has no member cleanup")));
    return;
  }
  seat.cleanup(fn);
}
