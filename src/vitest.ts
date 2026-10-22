// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The vitest adapter: the standard's assertions on vitest's `expect`, and
 * a seat supplied per test.
 *
 * ```ts
 * // vitest.setup.ts, which setupFiles names
 * import { register } from "@dokimi/assert/vitest";
 *
 * register();
 * ```
 *
 * ```ts
 * import { expect, it } from "vitest";
 *
 * it("get", () => {
 *   expect(store.get(id)).isNotNil("get returns the stored item");
 *   expect.soft(store.size).isEqualTo(1, "and nothing else was added");
 * });
 * ```
 *
 * The function form takes the seat of the fixture {@link test}:
 *
 * ```ts
 * import { test } from "@dokimi/assert/vitest";
 * import { check, soft } from "@dokimi/assert";
 *
 * test("get", ({ seat }) => {
 *   check.isNotNil(seat, store.get(id), "get returns the stored item");
 *   soft.isEqualTo(seat, store.size, 1, "and nothing else was added");
 * });
 * ```
 *
 * The entry point serves vitest 4 and vitest 5. `@dokimi/assert/vitest`
 * declares the matchers in the shape of vitest 5, and
 * `@dokimi/assert/vitest4` declares them in the shape of vitest 4.
 */

export type { Overlap } from "./expect/types.js";
export { Collector, Recorder, Standard } from "./seat.js";
export { RECORDS, register, type SeatFixture, test } from "./vitest/api.js";
