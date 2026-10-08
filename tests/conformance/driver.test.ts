/** The spec of the driver of a corpus case that names a behaviour in place of a value. */

import { describe } from "vitest";
import { Controlled } from "../../src/clock.js";
import { runSubject } from "../../src/conformance/driver.js";
import { check } from "../../src/index.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";

describe("driver", () => {
  describe("runSubject", () => {
    it("returns true for a case that it ran", async ({ seat }) => {
      const recorder = new Recorder();
      const ran = await runSubject(
        "check",
        "throws",
        "raises",
        recorder,
        "throws/raises",
      );

      check.isTrue(seat, ran, "the driver ran the case");
      check.isFalse(seat, recorder.failed, "a subject that raises passes throws");
    });

    it("returns false for a behaviour that it does not know", async ({ seat }) => {
      check.isFalse(
        seat,
        await runSubject("check", "throws", "no-such-kind", new Recorder(), "a case"),
        "the driver knows no such behaviour",
      );
    });

    it("returns false for an assertion that takes no behaviour", async ({ seat }) => {
      check.isFalse(
        seat,
        await runSubject("check", "equal", "raises", new Recorder(), "a case"),
        "equal takes values",
      );
    });

    it("returns false for a surface that it does not know", async ({ seat }) => {
      check.isFalse(
        seat,
        await runSubject("expect", "throws", "raises", new Recorder(), "a case"),
        "the library has no surface expect",
      );
    });

    it("drives eventuallyTrue with a predicate that reads the seated behaviour", async ({
      seat,
    }) => {
      const recorder = new Recorder().withClock(new Controlled(0));
      await runSubject("soft", "eventually-true", "settles-after", recorder, "a case");

      check.isFalse(
        seat,
        recorder.failed,
        "the behaviour settles on its third attempt",
      );
    });
  });
});
