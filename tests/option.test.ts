// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the relaxations that a caller passes to one comparison. */

import { describe } from "vitest";
import { check } from "../src/index.js";
import * as matcher from "../src/matcher/option.js";
import { byIdentity, equateBy, equateEmpty, equateNans } from "../src/option.js";
import { Recorder } from "../src/seat.js";
import { test as it } from "../src/vitest.js";

describe("option", () => {
  it("re-exports the relaxations of the matcher", ({ seat }) => {
    check.isEqualTo(
      seat,
      [
        equateEmpty === matcher.equateEmpty,
        equateNans === matcher.equateNans,
        byIdentity === matcher.byIdentity,
        equateBy === matcher.equateBy,
      ],
      [true, true, true, true],
      "each public option is the matcher's function",
    );
  });

  describe("equateBy", () => {
    it("relaxes the call that it is passed to alone", ({ seat }) => {
      const recorder = new Recorder();
      const lower = equateBy(
        (v): v is string => typeof v === "string",
        (t) => t.toLowerCase(),
      );
      check.isEqualTo(recorder, "A", "a", "by the lower case", lower);
      check.isEqualTo(recorder, "A", "a", "strict");

      check.isEqualTo(
        seat,
        recorder.failures.map((f) => f.contract),
        ["strict"],
        "only the call without the option fails",
      );
    });
  });

  describe("equateEmpty", () => {
    it("relaxes the call that it is passed to alone", ({ seat }) => {
      const recorder = new Recorder();
      check.isEqualTo(
        recorder,
        null as unknown,
        [] as unknown,
        "relaxed",
        equateEmpty(),
      );
      check.isEqualTo(recorder, null as unknown, [] as unknown, "strict");

      check.isEqualTo(
        seat,
        recorder.failures.map((f) => f.contract),
        ["strict"],
        "only the call without the option fails",
      );
    });
  });

  describe("equateNans", () => {
    it("relaxes the call that it is passed to alone", ({ seat }) => {
      const recorder = new Recorder();
      check.isEqualTo(recorder, Number.NaN, Number.NaN, "relaxed", equateNans());
      check.isEqualTo(recorder, Number.NaN, Number.NaN, "strict");

      check.isEqualTo(
        seat,
        recorder.failures.map((f) => f.contract),
        ["strict"],
        "only the call without the option fails",
      );
    });
  });

  describe("byIdentity", () => {
    it("narrows the call that it is passed to alone", ({ seat }) => {
      const recorder = new Recorder();
      check.isEqualTo(recorder, { n: 1 }, { n: 1 }, "by identity", byIdentity());
      check.isEqualTo(recorder, { n: 1 }, { n: 1 }, "by structure");

      check.isEqualTo(
        seat,
        recorder.failures.map((f) => f.contract),
        ["by identity"],
        "only the call with the option fails",
      );
    });
  });
});
