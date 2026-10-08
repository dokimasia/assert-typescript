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
 * Each property form, such as {@link equal} or {@link roundTrip}, runs one
 * assertion on every generated input, which the option {@link using}
 * generates. {@link fuzz} replays the stored cases of a property and
 * returns the target of a fuzzer. The registry names generators and shapes:
 * {@link register}, {@link registerValues} and {@link registerVariants}
 * state them, and {@link of}, {@link shapeOf} and {@link ofShape} read
 * them.
 *
 * A failing run keeps its minimal case in the store of the test, under
 * `testdata/prop`, and later runs replay it first.
 */

import { FOR_ALL, registerSentences } from "./detail.js";
import { FORM_IDS } from "./forms.js";

registerSentences([FOR_ALL, ...FORM_IDS]);

export { Case } from "./case.js";
export { Generator } from "./engine/generator.js";
export { forAll } from "./forall.js";
export {
  accumulates,
  closeTo,
  contains,
  containsInOrder,
  doesNotThrow,
  equal,
  errorAs,
  errorIs,
  errorIsNot,
  hasError,
  hasPrefix,
  hasSuffix,
  honoursCancellation,
  honoursDeadline,
  inRange,
  isAssociative,
  isCommutative,
  isDeterministic,
  isEmpty,
  isFalse,
  isIdempotent,
  isNil,
  isNotEmpty,
  isNotNil,
  isNotPure,
  isPermutation,
  isPure,
  isTrue,
  length,
  matches,
  noError,
  notContains,
  notEqual,
  nullHandleSafe,
  pairwise,
  roundTrip,
  throws,
} from "./forms.js";
export { fuzz } from "./fuzz.js";
export {
  type BooleanOption,
  boolean,
  bytes,
  composite,
  dict,
  duration,
  type FloatOption,
  float,
  integer,
  just,
  type ListOption,
  list,
  oneOf,
  optional,
  permutation,
  type RecursiveOption,
  recursive,
  type SizeOption,
  type StringOption,
  sampledFrom,
  string,
  stringMatching,
} from "./generators.js";
export {
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
  workers,
} from "./option.js";
export {
  of,
  ofShape,
  register,
  registerValues,
  registerVariants,
  shapeOf,
} from "./registry.js";
