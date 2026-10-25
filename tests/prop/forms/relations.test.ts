// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the property forms of the relations between the results of several calls. Each form passes a true property and fails a false one. */

import { describe } from "vitest";
import * as forms from "../../../src/prop/forms/relations.js";
import { integer } from "../../../src/prop/generators.js";
import {
  type FormOption,
  hermetic,
  seed,
  store,
  using,
} from "../../../src/prop/option.js";
import { counter, type FormRow, formCases } from "../../helpers.js";

/** The options of a reproducible run of the digits. */
const DIGITS: FormOption[] = [using(integer(0, 9)), hermetic(), seed(1n), store("")];

/** The contract of every form of this spec. */
const MSG = "the property is true";

/** The forms of the module, by export. */
const ROWS: readonly FormRow[] = [
  {
    name: "isPermutation",
    assertion: "permutation",
    passing: (s) =>
      forms.isPermutation(
        s,
        (x: number) => [x, 1],
        (x) => [1, x],
        MSG,
        ...DIGITS,
      ),
    failing: (s) =>
      forms.isPermutation(
        s,
        (x: number) => [x],
        () => [10],
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "isIdempotent",
    assertion: "idempotent",
    passing: (s) => {
      let cell = 0;
      return forms.isIdempotent(
        s,
        (x: number) => {
          cell = x;
        },
        () => cell,
        MSG,
        ...DIGITS,
      );
    },
    failing: (s) => {
      const state = counter();
      return forms.isIdempotent(s, state.raise, state.read, MSG, ...DIGITS);
    },
  },
  {
    name: "accumulates",
    assertion: "accumulates",
    passing: (s) => {
      const state = counter();
      return forms.accumulates(s, state.raise, state.read, MSG, ...DIGITS);
    },
    failing: (s) =>
      forms.accumulates(
        s,
        () => undefined,
        () => 0,
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "isDeterministic",
    assertion: "deterministic",
    passing: (s) => forms.isDeterministic(s, (x: number) => x, MSG, ...DIGITS),
    failing: (s) => {
      const state = counter();
      return forms.isDeterministic(
        s,
        () => {
          state.raise();
          return state.read();
        },
        MSG,
        ...DIGITS,
      );
    },
  },
  {
    name: "isCommutative",
    assertion: "commutative",
    passing: (s) =>
      forms.isCommutative(s, (a: number, b: number) => a + b, MSG, ...DIGITS),
    failing: (s) =>
      forms.isCommutative(s, (a: number, b: number) => a - b, MSG, ...DIGITS),
  },
  {
    name: "isAssociative",
    assertion: "associative",
    passing: (s) =>
      forms.isAssociative(s, (a: number, b: number) => a + b, MSG, ...DIGITS),
    failing: (s) =>
      forms.isAssociative(s, (a: number, b: number) => a - b, MSG, ...DIGITS),
  },
  {
    name: "roundTrip",
    assertion: "round-trip",
    passing: (s) =>
      forms.roundTrip(
        s,
        (x: number) => String(x),
        (text) => Number(text),
        MSG,
        ...DIGITS,
      ),
    failing: (s) =>
      forms.roundTrip(
        s,
        (x: number) => String(x),
        () => 0,
        MSG,
        ...DIGITS,
      ),
  },
];

describe("relations", () => {
  formCases(ROWS, MSG);
});
