// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Assertions that record a failure and let the test carry on.
 *
 * Named for what vitest already calls this: `expect.soft` records
 * rather than stopping. The name `expect` is taken by every test
 * runner's own global, so importing another one would shadow it.
 *
 * ```ts
 * import { soft } from "@dokimi/assert";
 *
 * test("reply", ({ seat }) => {
 *   soft.hasPrefix(seat, reply.body, "{", "the body is JSON");
 *   soft.hasLength(seat, reply.items, 3, "every item comes back");
 * });
 * ```
 *
 * Everything recorded is reported when the test body ends, so one run
 * shows every property that failed. The members, their signatures and
 * their comparison rules are those of `check`; only what happens on a
 * failure differs.
 */

export * from "./soft/behaviour.js";
export * from "./soft/relations.js";
export * from "./soft/values.js";
