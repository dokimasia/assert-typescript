// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the property forms of the assertions about one value. Each form passes a true property and fails a false one. */

import { describe } from "vitest";
import { equateNans } from "../../../src/index.js";
import * as forms from "../../../src/prop/forms/values.js";
import { integer } from "../../../src/prop/generators.js";
import {
  type FormOption,
  hermetic,
  seed,
  store,
  using,
} from "../../../src/prop/option.js";
import { type FormRow, formCases } from "../../helpers.js";

/** The options of a reproducible run of the digits. */
const DIGITS: FormOption[] = [using(integer(0, 9)), hermetic(), seed(1n), store("")];

/** The contract of every form of this spec. */
const MSG = "the property is true";

/** The forms of the module, by export. */
const ROWS: readonly FormRow[] = [
  {
    name: "isEqualTo",
    assertion: "equal",
    passing: (s) =>
      forms.isEqualTo(
        s,
        (x: number) => x,
        (x) => x,
        MSG,
        ...DIGITS,
      ),
    failing: (s) =>
      forms.isEqualTo(
        s,
        (x: number) => x,
        () => 0,
        MSG,
        ...DIGITS,
      ),
    relaxed: (s) =>
      forms.isEqualTo(
        s,
        () => Number.NaN,
        () => Number.NaN,
        MSG,
        equateNans(),
        ...DIGITS,
      ),
  },
  {
    name: "isNotEqualTo",
    assertion: "not-equal",
    passing: (s) =>
      forms.isNotEqualTo(
        s,
        (x: number) => x,
        (x) => x + 1,
        MSG,
        ...DIGITS,
      ),
    failing: (s) =>
      forms.isNotEqualTo(
        s,
        (x: number) => x,
        (x) => x,
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "isTrue",
    assertion: "true",
    passing: (s) => forms.isTrue(s, (x: number) => x >= 0, MSG, ...DIGITS),
    failing: (s) => forms.isTrue(s, (x: number) => x < 5, MSG, ...DIGITS),
  },
  {
    name: "isFalse",
    assertion: "false",
    passing: (s) => forms.isFalse(s, (x: number) => x < 0, MSG, ...DIGITS),
    failing: (s) => forms.isFalse(s, (x: number) => x >= 5, MSG, ...DIGITS),
  },
  {
    name: "isNil",
    assertion: "nil",
    passing: (s) => forms.isNil(s, () => null, MSG, ...DIGITS),
    failing: (s) => forms.isNil(s, (x: number) => x, MSG, ...DIGITS),
  },
  {
    name: "isNotNil",
    assertion: "not-nil",
    passing: (s) => forms.isNotNil(s, (x: number) => x, MSG, ...DIGITS),
    failing: (s) => forms.isNotNil(s, () => undefined, MSG, ...DIGITS),
  },
  {
    name: "hasLength",
    assertion: "length",
    passing: (s) => forms.hasLength(s, (x: number) => [x], 1, MSG, ...DIGITS),
    failing: (s) => forms.hasLength(s, (x: number) => [x], 2, MSG, ...DIGITS),
  },
  {
    name: "isEmpty",
    assertion: "empty",
    passing: (s) => forms.isEmpty(s, () => [], MSG, ...DIGITS),
    failing: (s) => forms.isEmpty(s, (x: number) => [x], MSG, ...DIGITS),
  },
  {
    name: "isNotEmpty",
    assertion: "not-empty",
    passing: (s) => forms.isNotEmpty(s, (x: number) => [x], MSG, ...DIGITS),
    failing: (s) => forms.isNotEmpty(s, () => "", MSG, ...DIGITS),
  },
];

describe("values", () => {
  formCases(ROWS, MSG);
});
