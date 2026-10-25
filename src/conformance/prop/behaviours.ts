// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The drivers of the forms of the assertions about errors, about what code
 * does when it runs, and of the relations between the results of several
 * calls.
 */

import * as prop from "../../prop/index.js";
import {
  CONTRACT,
  type Driver,
  FAILS,
  kind,
  OWN,
  OwnError,
  RAISES,
  subject,
} from "./drive.js";

/** The driver of each form of the assertions about behaviour and of the relations, by the form's id. */
export const BEHAVIOUR_DRIVERS: readonly (readonly [string, Driver])[] = [
  [
    "prop-err-absent",
    (seat, r) => prop.noError(seat, kind(FAILS, r, 0), CONTRACT, ...r.options),
  ],
  [
    "prop-err-present",
    (seat, r) => prop.hasError(seat, kind(FAILS, r, 0), CONTRACT, ...r.options),
  ],
  [
    "prop-err-is",
    (seat, r) => prop.errorIs(seat, kind(FAILS, r, 0), OWN, CONTRACT, ...r.options),
  ],
  [
    "prop-err-is-not",
    (seat, r) => prop.errorIsNot(seat, kind(FAILS, r, 0), OWN, CONTRACT, ...r.options),
  ],
  [
    "prop-err-as",
    (seat, r) =>
      prop.errorAs(seat, kind(FAILS, r, 0), OwnError, CONTRACT, ...r.options),
  ],
  [
    "prop-throws",
    (seat, r) => prop.doesThrow(seat, kind(RAISES, r, 0), CONTRACT, ...r.options),
  ],
  [
    "prop-not-throws",
    (seat, r) => prop.doesNotThrow(seat, kind(RAISES, r, 0), CONTRACT, ...r.options),
  ],
  [
    "prop-pure",
    (seat, r) => {
      const s = subject(r, "call", "observe");
      return prop.isPure(seat, s.observe, s.call, CONTRACT, ...r.options);
    },
  ],
  [
    "prop-not-pure",
    (seat, r) => {
      const s = subject(r, "call", "observe");
      return prop.isNotPure(seat, s.observe, s.call, CONTRACT, ...r.options);
    },
  ],
  [
    "prop-nil-context-safe",
    (seat, r) => {
      const s = subject(r, "signalled");
      return prop.nullHandleSafe(
        seat,
        (signal) => s.signalled(signal),
        CONTRACT,
        ...r.options,
      );
    },
  ],
  [
    "prop-honours-cancellation",
    (seat, r) => {
      const s = subject(r, "signalled");
      return prop.honoursCancellation(
        seat,
        (signal) => s.signalled(signal),
        CONTRACT,
        ...r.options,
      );
    },
  ],
  [
    "prop-honours-deadline",
    (seat, r) => {
      const s = subject(r, "signalled");
      return prop.honoursDeadline(
        seat,
        (signal) => s.signalled(signal),
        CONTRACT,
        ...r.options,
      );
    },
  ],
  [
    "prop-idempotent",
    (seat, r) => {
      const s = subject(r, "call", "observe");
      return prop.isIdempotent(seat, s.call, s.observe, CONTRACT, ...r.options);
    },
  ],
  [
    "prop-accumulates",
    (seat, r) => {
      const s = subject(r, "call", "observe");
      return prop.accumulates(seat, s.call, s.observe, CONTRACT, ...r.options);
    },
  ],
  [
    "prop-deterministic",
    (seat, r) => {
      const s = subject(r, "compute");
      return prop.isDeterministic(
        seat,
        (input) => r.bind(s.compute(input)),
        CONTRACT,
        ...r.options,
      );
    },
  ],
  [
    "prop-commutative",
    (seat, r) => {
      const s = subject(r, "combine");
      return prop.isCommutative(
        seat,
        (a, b) => r.bind(s.combine(a, b)),
        CONTRACT,
        ...r.options,
      );
    },
  ],
  [
    "prop-associative",
    (seat, r) => {
      const s = subject(r, "combine");
      return prop.isAssociative(
        seat,
        (a, b) => r.bind(s.combine(a, b)),
        CONTRACT,
        ...r.options,
      );
    },
  ],
  [
    "prop-round-trip",
    (seat, r) => {
      const s = subject(r, "render");
      return prop.roundTrip(
        seat,
        (input) => s.render(input),
        (text) => r.integer(text),
        CONTRACT,
        ...r.options,
      );
    },
  ],
];
