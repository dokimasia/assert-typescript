// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The drivers of the forms of the assertions about one value and its
 * contents: equality, truth, absence, size, containment, text, numbers and
 * order.
 */

import * as prop from "../../prop/index.js";
import { CONTRACT, type Driver, fn, kind, PREDICATES } from "./drive.js";

/** The driver of each form of the assertions about a value, by the form's id. */
export const VALUE_DRIVERS: readonly (readonly [string, Driver])[] = [
  [
    "prop-equal",
    (seat, r) => prop.isEqualTo(seat, fn(r, 0), fn(r, 1), CONTRACT, ...r.options),
  ],
  [
    "prop-not-equal",
    (seat, r) => prop.isNotEqualTo(seat, fn(r, 0), fn(r, 1), CONTRACT, ...r.options),
  ],
  [
    "prop-true",
    (seat, r) =>
      prop.isTrue(
        seat,
        fn(r, 0) as (input: unknown) => boolean,
        CONTRACT,
        ...r.options,
      ),
  ],
  [
    "prop-false",
    (seat, r) =>
      prop.isFalse(
        seat,
        fn(r, 0) as (input: unknown) => boolean,
        CONTRACT,
        ...r.options,
      ),
  ],
  ["prop-nil", (seat, r) => prop.isNil(seat, fn(r, 0), CONTRACT, ...r.options)],
  ["prop-not-nil", (seat, r) => prop.isNotNil(seat, fn(r, 0), CONTRACT, ...r.options)],
  [
    "prop-length",
    (seat, r) =>
      prop.hasLength(seat, fn(r, 0), r.args[0] as number, CONTRACT, ...r.options),
  ],
  ["prop-empty", (seat, r) => prop.isEmpty(seat, fn(r, 0), CONTRACT, ...r.options)],
  [
    "prop-not-empty",
    (seat, r) => prop.isNotEmpty(seat, fn(r, 0), CONTRACT, ...r.options),
  ],
  [
    "prop-contains",
    (seat, r) => prop.doesContain(seat, fn(r, 0), r.args[0], CONTRACT, ...r.options),
  ],
  [
    "prop-not-contains",
    (seat, r) => prop.doesNotContain(seat, fn(r, 0), r.args[0], CONTRACT, ...r.options),
  ],
  [
    "prop-contains-in-order",
    (seat, r) =>
      prop.containsInOrder(
        seat,
        fn(r, 0),
        r.args[0] as string[],
        CONTRACT,
        ...r.options,
      ),
  ],
  [
    "prop-permutation",
    (seat, r) =>
      prop.isPermutation(
        seat,
        fn(r, 0) as (input: unknown) => unknown[],
        fn(r, 1) as (input: unknown) => unknown[],
        CONTRACT,
        ...r.options,
      ),
  ],
  [
    "prop-has-prefix",
    (seat, r) =>
      prop.hasPrefix(seat, fn(r, 0), r.args[0] as string, CONTRACT, ...r.options),
  ],
  [
    "prop-has-suffix",
    (seat, r) =>
      prop.hasSuffix(seat, fn(r, 0), r.args[0] as string, CONTRACT, ...r.options),
  ],
  [
    "prop-matches",
    (seat, r) =>
      prop.doesMatch(seat, fn(r, 0), r.args[0] as string, CONTRACT, ...r.options),
  ],
  [
    "prop-close-to",
    (seat, r) =>
      prop.isCloseTo(
        seat,
        fn(r, 0),
        r.args[0] as number,
        r.args[1] as number,
        CONTRACT,
        ...r.options,
      ),
  ],
  [
    "prop-in-range",
    (seat, r) =>
      prop.inRange(
        seat,
        fn(r, 0),
        r.args[0] as number,
        r.args[1] as number,
        CONTRACT,
        ...r.options,
      ),
  ],
  [
    "prop-pairwise",
    (seat, r) =>
      prop.pairwise(
        seat,
        fn(r, 0) as (input: unknown) => unknown[],
        kind(PREDICATES, r, 1),
        CONTRACT,
        ...r.options,
      ),
  ],
];
