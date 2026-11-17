// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The outcome of the test of a helper's seat.
 *
 * A helper that keeps the data of a failed test, such as the clone of a
 * database that a developer reads after the test, reads whether the test of
 * the seat that it takes has failed.
 */

import { end, Fault, ofOperation } from "./matcher/fault.js";
import type { Seat } from "./matcher/seat.js";

/**
 * Returns whether the test, the case or the body of seat has failed. It
 * reads the member failed of seat. The seat of the fixture of
 * `@dokimi/assert/vitest`, a Collector, a Recorder, a case of a property,
 * and the seat that doesReject or eventually hands a body have the member.
 * In a cleanup, the member also counts the error that ended the test, the
 * case or the body. A seat without the member ends the call with a fault,
 * and failed returns false.
 *
 * @param seat - The seat of the helper's call.
 * @returns The member failed of seat, or false on a seat without it.
 * @throws The fault, for a seat without the member and without reportFault.
 * @example
 * const dir = await mkdtemp(join(tmpdir(), "store-"));
 * cleanup(seat, () => (failed(seat) ? undefined : rm(dir, { recursive: true })));
 */
export function failed(seat: Seat): boolean {
  if (typeof seat.failed !== "boolean") {
    end(seat, ofOperation("failed", new Fault("", "the seat has no member failed")));
    return false;
  }
  return seat.failed;
}
