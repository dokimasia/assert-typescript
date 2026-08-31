/**
 * This library, checked against the standard it implements.
 *
 * Three mechanisms, because there are three ways to disagree: the
 * corpus for what an assertion means, the completeness gate for
 * whether it is there at all, and the overlay for a gap this language
 * declares it cannot close.
 */

export {
  type Case,
  cases,
  memberFor,
  mismatch,
  SURFACES,
  skipReason,
} from "./corpus.js";
export {
  type AssertionSpec,
  assertions,
  type Divergence,
  declinesRelaxation,
  diverges,
  LANGUAGE,
  names,
  type Overlay,
  overlay,
  relaxationNames,
  version,
} from "./definition.js";
export { decode, type Literal } from "./literal.js";
