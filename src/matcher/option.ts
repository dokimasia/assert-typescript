/**
 * Relaxations a caller applies to one comparison.
 *
 * An option applies to the call it is passed to and to nothing else.
 * There is no global setting, because a comparison rule changed in one
 * place and read in another is how two tests come to mean different
 * things by the same assertion.
 */

/** One relaxation of the comparison rules. */
export interface Option {
  /** Which rule this option relaxes. */
  readonly kind: "equate-empty" | "equate-nans" | "by-identity";
}

/** What the options in force allow. */
export interface Relaxations {
  /** Whether an absent collection equals an empty one. */
  readonly equateEmpty: boolean;
  /** Whether NaN equals itself. */
  readonly equateNans: boolean;
  /** Whether a reference equals only a reference to the same object. */
  readonly byIdentity: boolean;
}

/**
 * Treat an absent collection as equal to an empty one.
 *
 * Off by default, because empty is not absent: a reply carrying no
 * items and a reply that carried none are different answers.
 *
 * @returns The option, to pass to a comparing assertion.
 */
export function equateEmpty(): Option {
  return { kind: "equate-empty" };
}

/**
 * Treat NaN as equal to itself.
 *
 * Off by default, because IEEE 754 says NaN equals nothing, including
 * NaN, and a test that wants two NaNs to match is usually testing that
 * a computation failed the same way twice.
 *
 * @returns The option, to pass to a comparing assertion.
 */
export function equateNans(): Option {
  return { kind: "equate-nans" };
}

/**
 * Compare references by the objects they refer to.
 *
 * An object, an array and a function equal only themselves under this
 * option, wherever the comparison meets one: at the top, in an element
 * of a list, in a key or a value of a map, and in a field of a record. A
 * value that is no reference compares as it does without the option.
 *
 * @returns The option, to pass to a comparing assertion.
 */
export function byIdentity(): Option {
  return { kind: "by-identity" };
}

/**
 * Answer what the given options turn on.
 *
 * @param options The options passed to one call.
 * @returns The relaxations in force for that comparison.
 */
export function settings(options: readonly Option[]): Relaxations {
  return {
    equateEmpty: options.some((o) => o.kind === "equate-empty"),
    equateNans: options.some((o) => o.kind === "equate-nans"),
    byIdentity: options.some((o) => o.kind === "by-identity"),
  };
}
