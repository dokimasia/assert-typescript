// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The types of the standard's assertions on jest's `expect`, and of
 * `expect.soft`.
 *
 * TypeScript types an `expect` that a test imports from `@jest/globals`
 * with `Matchers` of the module `expect`. It types the global `expect` of
 * `@types/jest` with `Matchers` of the namespace `jest`. This module
 * extends both. jest 29 and jest 30 declare the same type parameters, so
 * the one module serves both majors.
 */

import type { StandardMatchers } from "../expect/types.js";

/** A chain of `expect.soft`: the matchers M, and the same matchers under `.not`. */
type Soft<M> = M & {
  not: M;
};

declare module "expect" {
  interface Matchers<R, T> extends StandardMatchers<R, T> {}

  interface BaseExpect {
    /**
     * Returns the chain of `expect(actual)`, on which a failing matcher
     * records its failure and returns. jest adds the failures to the test
     * when the test ends.
     *
     * @param actual - The value under test.
     * @returns The chain.
     */
    soft<T = unknown>(
      actual: T,
    ): Soft<Matchers<void, T>> & {
      resolves: Soft<Matchers<Promise<void>, T>>;
      rejects: Soft<Matchers<Promise<void>, T>>;
    };
  }
}

declare global {
  namespace jest {
    interface Matchers<R, T> extends StandardMatchers<R, T> {}

    interface Expect {
      /**
       * Returns the chain of `expect(actual)`, on which a failing matcher
       * records its failure and returns. jest adds the failures to the
       * test when the test ends.
       *
       * @param actual - The value under test.
       * @returns The chain.
       */
      // biome-ignore lint/suspicious/noExplicitAny: the default that the global expect of @types/jest gives T
      soft<T = any>(
        actual: T,
      ): Soft<Matchers<void, T>> & {
        resolves: Soft<Matchers<Promise<void>, T>>;
        rejects: Soft<Matchers<Promise<void>, T>>;
      };
    }
  }
}
