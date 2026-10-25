// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Properties: assertions that pass for every case that a run generates.
 *
 * {@link forAll} runs a body against generated cases. The body draws its
 * inputs from its {@link Case} with the generators, such as
 * {@link integer}, {@link list} and {@link string}, and asserts on the case
 * as on a test's seat. A failing case shrinks to the smallest case that
 * fails the same way, and the failure states its draws and a replay token.
 *
 * ```ts
 * test("sort", async ({ seat }) => {
 *   await prop.forAll(seat, "a sorted list is ordered", (c) => {
 *     const xs = c.draw(prop.list(prop.integer(-100, 100)), "xs");
 *     check.pairwise(c, sort(xs), (a, b) => a <= b, "sort orders the list");
 *   });
 * });
 * ```
 *
 * Each property form, such as {@link isEqualTo} or {@link roundTrip}, runs one
 * assertion on every generated input, which the option {@link using}
 * generates. {@link fuzz} replays the stored cases of a property and
 * returns the target of a fuzzer. The registry names generators and shapes:
 * {@link register}, {@link registerValues} and {@link registerVariants}
 * state them, and {@link of}, {@link shapeOf} and {@link ofShape} read
 * them. {@link values} returns the values of a generator for a seed,
 * outside a property.
 *
 * A failing run keeps its minimal case in the store of the test, under
 * `testdata/prop`, and later runs replay it first.
 */

import { registerSentences } from "./detail/sentence.js";
import { FOR_ALL } from "./detail.js";
import { FORM_IDS } from "./form.js";

registerSentences([FOR_ALL, ...FORM_IDS]);

export { Case } from "./case.js";
export { Generator } from "./engine/generator.js";
export { forAll } from "./forall.js";
export {
  accumulates,
  containsInOrder,
  doesContain,
  doesMatch,
  doesNotContain,
  doesNotThrow,
  doesThrow,
  errorAs,
  errorIs,
  errorIsNot,
  hasError,
  hasLength,
  hasPrefix,
  hasSuffix,
  honoursCancellation,
  honoursDeadline,
  inRange,
  isAssociative,
  isCloseTo,
  isCommutative,
  isDeterministic,
  isEmpty,
  isEqualTo,
  isFalse,
  isIdempotent,
  isNil,
  isNotEmpty,
  isNotEqualTo,
  isNotNil,
  isNotPure,
  isPermutation,
  isPure,
  isTrue,
  noError,
  nullHandleSafe,
  pairwise,
  roundTrip,
} from "./forms.js";
export { fuzz } from "./fuzz.js";
export {
  bytes,
  dict,
  type ListOption,
  list,
  permutation,
  type SizeOption,
  type StringOption,
  string,
  stringMatching,
} from "./generators/collections.js";
export {
  type BooleanOption,
  boolean,
  composite,
  duration,
  type FloatOption,
  float,
  integer,
  just,
  oneOf,
  optional,
  type RecursiveOption,
  recursive,
  sampledFrom,
} from "./generators.js";
export {
  around,
  cases,
  draws,
  example,
  examples,
  explain,
  type FormOption,
  hermetic,
  maxChoices,
  type Option,
  replay,
  require,
  seed,
  shrink,
  shrinkTime,
  store,
  using,
  type Wrapper,
  workers,
} from "./option.js";
export { register, registerValues, registerVariants } from "./registry/register.js";
export { of, ofShape, shapeOf } from "./registry.js";
export { values } from "./values.js";
