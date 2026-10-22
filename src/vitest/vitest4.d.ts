// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The declarations of `@dokimi/assert/vitest4`: the vitest adapter, and
 * the matchers of the standard's assertions in the shape of vitest 4.
 *
 * vitest 4 declares `Matchers<T = any>`, and its synchronous matchers
 * return nothing. A program merges two declarations of an interface only
 * when their type parameters agree, so this file and the one for vitest 5
 * cannot both be in one program. The package's `exports` names this file
 * as the types of `./vitest4`.
 */

import type { StandardMatchers } from "../expect/types.js";

export * from "../vitest.js";

declare module "vitest" {
  // biome-ignore lint/suspicious/noExplicitAny: the default of vitest 4's own declaration, which this one must repeat
  interface Matchers<T = any> extends StandardMatchers<void, T> {}
}
