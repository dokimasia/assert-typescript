// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Relaxations a caller applies to one comparison.
 *
 * An option applies to the call it is passed to and to nothing else.
 * There is no global setting, because a comparison rule changed in one
 * place and read in another is how two tests come to mean different
 * things by the same assertion.
 */

/**
 * The transform of an option of equate-by: the guard of the values that it
 * accepts, and the function that it applies to such a value.
 */
export interface Transform {
  /** Reports whether the transform accepts a value. */
  readonly is: (value: unknown) => boolean;
  /** Returns the value that a value of the guard compares by. */
  readonly f: (value: unknown) => unknown;
}

/**
 * One relaxation of the comparison rules. An option of equate-empty,
 * equate-nans or by-identity has no state, so a caller can reuse it across
 * calls. An option of equate-by keeps its transform. The order of the
 * options matters only between two options of equate-by whose guards accept
 * one value.
 */
export interface Option {
  /** Which rule this option relaxes. */
  readonly kind: "equate-empty" | "equate-nans" | "by-identity" | "equate-by";
  /** The transform of an option of equate-by, and absent for every other option. */
  readonly transform?: Transform;
}

/** What the options in force allow. */
export interface Relaxations {
  /** Whether an absent collection equals an empty one. */
  readonly equateEmpty: boolean;
  /** Whether NaN equals itself. */
  readonly equateNans: boolean;
  /** Whether a reference equals only a reference to the same object. */
  readonly byIdentity: boolean;
  /** The transforms of the options of equate-by, in the order of the call. */
  readonly transforms: readonly Transform[];
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
 * Makes a value that `is` accepts compare by `f(value)`, for the call it is
 * passed to.
 *
 * The rule applies at the top, to an element of a list, to a key or a value
 * of a map and to a field of a record. At one place at most one transform
 * applies. The result compares as it is, and its parts compare under every
 * transform again. The last equateBy of a call whose guard accepts a value
 * applies, and it applies before byIdentity.
 *
 * The record of isEqualTo states f(want) and f(got) in place of want and got
 * when the guard accepts them, and the record of isNotEqualTo states f(got).
 * An error that f throws passes through the call. f must not change its
 * argument, and its result must not contain its argument.
 *
 * @param is - The guard of the values that compare by f.
 * @param f - The transform.
 * @returns The option, to pass to a comparing assertion.
 * @throws TypeError for a guard or a transform that is no function.
 * @example
 * check.isEqualTo(seat, got, want, "the stored page is the written page",
 *   equateBy((v): v is Page => v instanceof Page, (page) => page.text));
 */
export function equateBy<T>(
  is: (value: unknown) => value is T,
  f: (value: T) => unknown,
): Option {
  if (typeof is !== "function") {
    throw new TypeError(`equateBy: the guard ${String(is)} is no function`);
  }
  if (typeof f !== "function") {
    throw new TypeError(`equateBy: the transform ${String(f)} is no function`);
  }
  return { kind: "equate-by", transform: { is, f: f as (value: unknown) => unknown } };
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
    transforms: options.flatMap((o) =>
      o.transform === undefined ? [] : [o.transform],
    ),
  };
}

/**
 * Returns a value under the last transform whose guard accepts it.
 *
 * @param value - The value.
 * @param relax - The relaxations of the comparison.
 * @returns The result of the transform, or the value itself when no guard
 *   accepts it.
 */
export function transformed(value: unknown, relax: Relaxations): unknown {
  const transform = relax.transforms.findLast((t) => t.is(value));
  return transform === undefined ? value : transform.f(value);
}
