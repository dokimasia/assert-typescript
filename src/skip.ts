// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The skip of the test of a helper's seat.
 *
 * A helper that needs a capability of the environment, such as a server
 * that a developer starts before the tests, skips the test of the seat that
 * it takes where the environment lacks the capability.
 */

import { end, Fault, ofOperation } from "./matcher/fault.js";
import type { Seat } from "./matcher/seat.js";

/**
 * Skips the test, the case or the check of seat with reason. It calls the
 * member skip of seat. The seat of the fixture of `@dokimi/assert/vitest`, a
 * case of a property and the seat that doesReject hands its check have the
 * member. A seat without it, such as a Recorder or the seat of a jest test,
 * ends the call with a fault, and the test does not skip.
 *
 * @param seat - The seat of the helper's call.
 * @param reason - The reason of the skip.
 * @throws The skip of the seat, and the fault for a seat without the member
 *   and without reportFault.
 * @example
 * if (process.env["NATS_ADDR"] === undefined) {
 *   skip(seat, "the local stack does not run");
 * }
 */
export function skip(seat: Seat, reason: string): void {
  if (seat.skip === undefined) {
    end(seat, ofOperation("skip", new Fault("", "the seat has no member skip")));
    return;
  }
  seat.skip(reason);
}
