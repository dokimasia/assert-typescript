// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the property forms of the assertions about the contents of a value. Each form passes a true property and fails a false one. */

import { describe } from "vitest";
import * as forms from "../../../src/prop/forms/contents.js";
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
    name: "doesContain",
    assertion: "contains",
    passing: (s) => forms.doesContain(s, (x: number) => [x, 0], 0, MSG, ...DIGITS),
    failing: (s) => forms.doesContain(s, (x: number) => [x], 10, MSG, ...DIGITS),
  },
  {
    name: "doesNotContain",
    assertion: "not-contains",
    passing: (s) => forms.doesNotContain(s, (x: number) => [x], 10, MSG, ...DIGITS),
    failing: (s) => forms.doesNotContain(s, (x: number) => [x], 0, MSG, ...DIGITS),
  },
  {
    name: "containsInOrder",
    assertion: "contains-in-order",
    passing: (s) =>
      forms.containsInOrder(s, (x: number) => `a${x}b`, ["a", "b"], MSG, ...DIGITS),
    failing: (s) =>
      forms.containsInOrder(s, (x: number) => `${x}`, ["a"], MSG, ...DIGITS),
  },
  {
    name: "hasPrefix",
    assertion: "has-prefix",
    passing: (s) => forms.hasPrefix(s, (x: number) => `a${x}`, "a", MSG, ...DIGITS),
    failing: (s) => forms.hasPrefix(s, (x: number) => `${x}`, "a", MSG, ...DIGITS),
  },
  {
    name: "hasSuffix",
    assertion: "has-suffix",
    passing: (s) => forms.hasSuffix(s, (x: number) => `${x}b`, "b", MSG, ...DIGITS),
    failing: (s) => forms.hasSuffix(s, (x: number) => `${x}`, "b", MSG, ...DIGITS),
  },
  {
    name: "doesMatch",
    assertion: "matches",
    passing: (s) =>
      forms.doesMatch(s, (x: number) => `${x}`, "^[0-9]$", MSG, ...DIGITS),
    failing: (s) => forms.doesMatch(s, (x: number) => `${x}`, "^a", MSG, ...DIGITS),
  },
  {
    name: "isCloseTo",
    assertion: "close-to",
    passing: (s) => forms.isCloseTo(s, (x: number) => x, 5, 5, MSG, ...DIGITS),
    failing: (s) => forms.isCloseTo(s, (x: number) => x, 0, 0.5, MSG, ...DIGITS),
  },
  {
    name: "inRange",
    assertion: "in-range",
    passing: (s) => forms.inRange(s, (x: number) => x, 0, 9, MSG, ...DIGITS),
    failing: (s) => forms.inRange(s, (x: number) => x, 0, 4, MSG, ...DIGITS),
  },
  {
    name: "pairwise",
    assertion: "pairwise",
    passing: (s) =>
      forms.pairwise(
        s,
        (x: number) => [x, x + 1],
        (a, b) => a < b,
        MSG,
        ...DIGITS,
      ),
    failing: (s) =>
      forms.pairwise(
        s,
        (x: number) => [x, x],
        (a, b) => a < b,
        MSG,
        ...DIGITS,
      ),
  },
];

describe("contents", () => {
  formCases(ROWS, MSG);
});
