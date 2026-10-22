// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The jest adapter: the standard's assertions on jest's `expect`, and
 * `expect.soft`.
 *
 * ```ts
 * // jest.setup.ts, which setupFilesAfterEnv names
 * import { register } from "@dokimi/assert/jest";
 *
 * register();
 * ```
 *
 * ```ts
 * import { expect, it } from "@jest/globals";
 *
 * it("get", () => {
 *   expect(store.get(id)).isNotNil("get returns the stored item");
 *   expect.soft(store.size).isEqualTo(1, "and nothing else was added");
 * });
 * ```
 *
 * The entry point serves jest 29 and jest 30, in jest's CommonJS mode and
 * in its ES module mode. The declarations extend the matchers of
 * `@jest/globals` and of the global `expect` of `@types/jest`.
 */

import "./jest/types.js";

export type { Overlap } from "./expect/types.js";
export { register } from "./jest/api.js";
