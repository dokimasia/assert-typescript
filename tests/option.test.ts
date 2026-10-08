/** The spec of the relaxations that a caller passes to one comparison. */

import { describe } from "vitest";
import { check } from "../src/index.js";
import * as matcher from "../src/matcher/option.js";
import { byIdentity, equateEmpty, equateNans } from "../src/option.js";
import { Recorder } from "../src/seat.js";
import { test as it } from "../src/vitest.js";

describe("option", () => {
  it("re-exports the relaxations of the matcher", ({ seat }) => {
    check.equal(
      seat,
      [
        equateEmpty === matcher.equateEmpty,
        equateNans === matcher.equateNans,
        byIdentity === matcher.byIdentity,
      ],
      [true, true, true],
      "each public option is the matcher's function",
    );
  });

  describe("equateEmpty", () => {
    it("relaxes the call that it is passed to alone", ({ seat }) => {
      const recorder = new Recorder();
      check.equal(recorder, null as unknown, [] as unknown, "relaxed", equateEmpty());
      check.equal(recorder, null as unknown, [] as unknown, "strict");

      check.equal(
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
      check.equal(recorder, Number.NaN, Number.NaN, "relaxed", equateNans());
      check.equal(recorder, Number.NaN, Number.NaN, "strict");

      check.equal(
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
      check.equal(recorder, { n: 1 }, { n: 1 }, "by identity", byIdentity());
      check.equal(recorder, { n: 1 }, { n: 1 }, "by structure");

      check.equal(
        seat,
        recorder.failures.map((f) => f.contract),
        ["by identity"],
        "only the call with the option fails",
      );
    });
  });
});
