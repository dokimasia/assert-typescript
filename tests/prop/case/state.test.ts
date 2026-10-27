// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the state of the case of a property's body. */

import { describe } from "vitest";
import { Failure } from "../../../src/failure.js";
import { check } from "../../../src/index.js";
import {
  CASES,
  check as checkState,
  Faulted,
  failedWith,
  isFinal,
  isSignal,
  locate,
  STATES,
  stateOf,
  stop,
} from "../../../src/prop/case/state.js";
import type { Failing } from "../../../src/prop/case.js";
import { Failed, Rejected, Skipped } from "../../../src/prop/engine/case/signals.js";
import { TraceError } from "../../../src/prop/engine/trace.js";
import { Repeated } from "../../../src/prop/engine/tree.js";
import { keyOf, ofRecord } from "../../../src/prop/identity.js";
import { test as it } from "../../../src/vitest.js";
import { caseAt as caseOn, CASE_SITE as SITE } from "../../helpers.js";

describe("state", () => {
  describe("STATES", () => {
    it("keeps the state of each case from its construction", ({ seat }) => {
      const { c } = caseOn({ site: SITE, pinned: false });

      check.isTrue(seat, STATES.get(c) === stateOf(c), "the state of the case");
    });
  });

  describe("CASES", () => {
    it("keeps the case of each engine case that a body runs on", ({ seat }) => {
      const { c, engine } = caseOn({ site: SITE, pinned: false });

      check.isTrue(seat, CASES.get(engine) === c, "the case of the engine case");
    });
  });

  describe("stateOf", () => {
    it("returns a state without records or a signal for a new case", ({ seat }) => {
      const state = stateOf(caseOn({ site: SITE, pinned: false }).c);

      check.isEqualTo(
        seat,
        [state.records, state.stopped, state.raised, state.cleanups],
        [[], undefined, undefined, []],
        "an empty state",
      );
    });
  });

  describe("Faulted", () => {
    it("keeps its fault and the text of the fault", ({ seat }) => {
      const fault = new Error("the store is gone");
      const signal = new Faulted(fault);

      check.isEqualTo(
        seat,
        [signal.fault === fault, signal.message],
        [true, "the store is gone"],
        "the signal has the fault and its text",
      );
    });
  });

  describe("isSignal", () => {
    it("reports the signals of the engine, which end a case", ({ seat }) => {
      check.isEqualTo(
        seat,
        [
          isSignal(new Rejected()),
          isSignal(new Failed("x")),
          isSignal(new Skipped("why")),
          isSignal(new TraceError(0, "x", "label")),
          isSignal(new Faulted(new Error("gone"))),
          isSignal(new Error("boom")),
        ],
        [true, true, true, true, true, false],
        "five signals and an error",
      );
    });
  });

  describe("isFinal", () => {
    it("reports the signals that end the run", ({ seat }) => {
      check.isEqualTo(
        seat,
        [
          isFinal(new Repeated()),
          isFinal(new TraceError(0, "x", "label")),
          isFinal(new Faulted(new Error("gone"))),
          isFinal(new Skipped("why")),
          isFinal(undefined),
        ],
        [true, true, true, false, false],
        "three final signals, a skip and no signal",
      );
    });
  });

  describe("check", () => {
    it("throws the signal that ended the case", ({ seat }) => {
      const state = stateOf(caseOn({ site: SITE, pinned: false }).c);
      const signal = new Rejected();
      state.stopped = signal;

      check.isTrue(
        seat,
        check.doesThrow(seat, () => checkState(state), "the case has ended") === signal,
        "the signal",
      );
    });

    it("returns for a case that runs", ({ seat }) => {
      const state = stateOf(caseOn({ site: SITE, pinned: false }).c);

      check.doesNotThrow(seat, () => checkState(state), "the case runs");
    });
  });

  describe("stop", () => {
    it("keeps the first signal as the signal that ended the case", ({ seat }) => {
      const state = stateOf(caseOn({ site: SITE, pinned: false }).c);
      const first = new Rejected();
      check.doesThrow(seat, () => stop(state, first), "the first signal");
      check.doesThrow(seat, () => stop(state, new Skipped("later")), "a later signal");

      check.isTrue(seat, state.stopped === first, "the first signal is kept");
    });

    it("throws an error that is no signal without keeping it", ({ seat }) => {
      const state = stateOf(caseOn({ site: SITE, pinned: false }).c);
      check.doesThrow(seat, () => stop(state, new TypeError("bad")), "the error");

      check.isNil(seat, state.stopped, "no signal is kept");
    });
  });

  describe("locate", () => {
    it("returns the call site of the property for a pinned location", ({ seat }) => {
      check.isEqualTo(seat, locate({ site: SITE, pinned: true }), SITE, "the site");
    });

    it("returns the frame of the caller's code for a free location", ({ seat }) => {
      check.hasSuffix(
        seat,
        locate({ site: SITE, pinned: false })?.file ?? "",
        "state.test.ts",
        "the frame of this spec",
      );
    });
  });

  describe("failedWith", () => {
    it("returns the failure of a record with its identity", ({ seat }) => {
      const record = new Failure("equal", "the totals agree", {}, SITE);
      const failed = failedWith(record);

      check.isEqualTo(
        seat,
        [failed.identity, (failed.record as Failing).failure],
        [keyOf(ofRecord(record)), record],
        "the identity and the record",
      );
    });
  });
});
