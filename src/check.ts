// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Assertions that stop the test at the first failure.
 *
 * Every assertion takes a seat first and a message last. The message
 * states the contract under test and is the first line of the failure,
 * so a failure says what was supposed to be true rather than only what
 * was observed.
 *
 * ```ts
 * import { check } from "@dokimi/assert";
 *
 * test("get", ({ seat }) => {
 *   check.isEqualTo(seat, store.get(id), item, "get returns the stored item");
 * });
 * ```
 *
 * The `soft` module carries the same assertions under the same names
 * and runs the same comparison. Only what happens on failure differs.
 */

export * from "./check/behaviour.js";
export * from "./check/relations.js";
export * from "./check/values.js";
export { doesReject } from "./rejects.js";
