// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The declarations of `@dokimi/assert/vitest`: the vitest adapter, and the
 * matchers of the standard's assertions in the shape of vitest 5.
 *
 * vitest 5 declares `Matchers<R, T>`. A program merges two declarations
 * of an interface only when their type parameters agree, so this file
 * and the one for vitest 4 cannot both be in one program. The package's
 * `exports` names this file as the types of `./vitest`.
 */

import type { StandardMatchers } from "../expect/types.js";

export * from "../vitest.js";

declare module "vitest" {
  interface Matchers<R, T> extends StandardMatchers<R, T> {}
}
