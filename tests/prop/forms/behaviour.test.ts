// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the property forms of the assertions about errors and about what code does when it runs. Each form passes a true property and fails a false one. */

import { describe } from "vitest";
import * as forms from "../../../src/prop/forms/behaviour.js";
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

/** The sentinel error of the error forms. */
const SENTINEL = new Error("the sentinel");

/** The contract of every form of this spec. */
const MSG = "the property is true";

/** The forms of the module, by export. */
const ROWS: readonly FormRow[] = [
  {
    name: "noError",
    assertion: "err-absent",
    passing: (s) => forms.noError(s, () => null, MSG, ...DIGITS),
    failing: (s) =>
      forms.noError(
        s,
        (x: number) => (x >= 5 ? new Error("big") : null),
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "hasError",
    assertion: "err-present",
    passing: (s) => forms.hasError(s, () => new Error("e"), MSG, ...DIGITS),
    failing: (s) => forms.hasError(s, () => null, MSG, ...DIGITS),
  },
  {
    name: "errorIs",
    assertion: "err-is",
    passing: (s) => forms.errorIs(s, () => SENTINEL, SENTINEL, MSG, ...DIGITS),
    failing: (s) => forms.errorIs(s, () => null, SENTINEL, MSG, ...DIGITS),
  },
  {
    name: "errorIsNot",
    assertion: "err-is-not",
    passing: (s) => forms.errorIsNot(s, () => null, SENTINEL, MSG, ...DIGITS),
    failing: (s) => forms.errorIsNot(s, () => SENTINEL, SENTINEL, MSG, ...DIGITS),
  },
  {
    name: "errorAs",
    assertion: "err-as",
    passing: (s) =>
      forms.errorAs(s, () => new TypeError("t"), TypeError, MSG, ...DIGITS),
    failing: (s) => forms.errorAs(s, () => new Error("e"), TypeError, MSG, ...DIGITS),
  },
  {
    name: "doesThrow",
    assertion: "throws",
    passing: (s) =>
      forms.doesThrow(
        s,
        () => {
          throw new Error("e");
        },
        MSG,
        ...DIGITS,
      ),
    failing: (s) => forms.doesThrow(s, () => 1, MSG, ...DIGITS),
  },
  {
    name: "doesNotThrow",
    assertion: "not-throws",
    passing: (s) => forms.doesNotThrow(s, () => 1, MSG, ...DIGITS),
    failing: (s) =>
      forms.doesNotThrow(
        s,
        (x: number) => {
          if (x >= 5) {
            throw new Error("big");
          }
        },
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "isPure",
    assertion: "pure",
    passing: (s) =>
      forms.isPure(
        s,
        () => 0,
        () => undefined,
        MSG,
        ...DIGITS,
      ),
    failing: (s) => {
      const state = counter();
      return forms.isPure(s, state.read, state.raise, MSG, ...DIGITS);
    },
  },
  {
    name: "isNotPure",
    assertion: "not-pure",
    passing: (s) => {
      const state = counter();
      return forms.isNotPure(s, state.read, state.raise, MSG, ...DIGITS);
    },
    failing: (s) =>
      forms.isNotPure(
        s,
        () => 0,
        () => undefined,
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "nullHandleSafe",
    assertion: "nil-context-safe",
    passing: (s) => forms.nullHandleSafe(s, (_signal, x: number) => x, MSG, ...DIGITS),
    failing: (s) =>
      forms.nullHandleSafe(
        s,
        (signal) => (signal as AbortSignal).aborted,
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "honoursCancellation",
    assertion: "honours-cancellation",
    passing: (s) =>
      forms.honoursCancellation(
        s,
        async (signal) => {
          signal.throwIfAborted();
        },
        MSG,
        ...DIGITS,
      ),
    failing: (s) => forms.honoursCancellation(s, async () => "done", MSG, ...DIGITS),
  },
  {
    name: "honoursDeadline",
    assertion: "honours-deadline",
    passing: (s) =>
      forms.honoursDeadline(
        s,
        async (signal) => {
          signal.throwIfAborted();
        },
        MSG,
        ...DIGITS,
      ),
    failing: (s) => forms.honoursDeadline(s, async () => "done", MSG, ...DIGITS),
  },
];

describe("behaviour", () => {
  formCases(ROWS, MSG);
});
