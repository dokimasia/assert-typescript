/** The spec of the assertion that a check fails. */

import { describe } from "vitest";
import { Failure } from "../src/failure.js";
import { byIdentity, check, soft } from "../src/index.js";
import { AssertionFailed, Recorder, type Seat, Standard } from "../src/seat.js";
import { test as it } from "../src/vitest.js";
import { records } from "./helpers.js";

describe("rejects", () => {
  describe("rejects", () => {
    it("passes a check that fails", async ({ seat }) => {
      const recorder = new Recorder();
      await check.rejects(recorder, "an empty name is refused", (inner) => {
        check.isNil(inner, "not empty", "it passes");
      });

      check.isFalse(seat, recorder.failed, "a failing check passes rejects");
    });

    it("returns the failure records of the check", async ({ seat }) => {
      const failures = await check.rejects(
        new Recorder(),
        "an empty name is refused",
        (inner) => {
          check.isNil(inner, "not empty", "it passes");
        },
      );

      check.isTrue(seat, failures[0] instanceof Failure, "the check returns records");
      check.equal(
        seat,
        failures.map((f) => [f.assertion, f.contract, f.detail]),
        [["nil", "it passes", { got: "not empty" }]],
        "the record is the failure of the check",
      );
    });

    it("reports a record of rejects without a detail for a check that passes", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      await check.rejects(recorder, "an empty name is refused", (inner) => {
        check.isNil(inner, null, "it passes");
      });

      check.equal(
        seat,
        recorder.failures.map((f) => [f.assertion, f.contract, f.detail]),
        [["rejects", "an empty name is refused", {}]],
        "rejects reports the passing check",
      );
    });

    it("returns no failure record for a check that passes", async ({ seat }) => {
      const failures = await check.rejects(new Recorder(), "it is refused", (inner) => {
        check.isNil(inner, null, "it passes");
      });

      check.equal(seat, failures, [], "a passing check has no record");
    });

    it("throws AssertionFailed on a standard seat for a check that passes", async ({
      seat,
    }) => {
      const thrown = await check.rejectsWith(
        seat,
        () =>
          check.rejects(new Standard(), "it is refused", (inner) => {
            check.isNil(inner, null, "it passes");
          }),
        "rejects throws on a standard seat",
      );

      check.isTrue(
        seat,
        thrown instanceof AssertionFailed,
        "the seat throws AssertionFailed",
      );
    });

    it("ends the check at its first failure that stops", async ({ seat }) => {
      let reached = false;
      const failures = await check.rejects(
        new Recorder(),
        "the first failure ends it",
        (inner) => {
          check.isNil(inner, 1, "the first");
          reached = true;
          check.isNil(inner, 2, "the second");
        },
      );

      check.isFalse(seat, reached, "the check stopped at its first failure");
      check.equal(
        seat,
        failures.map((f) => f.contract),
        ["the first"],
        "one record",
      );
    });

    it("ends the check at a message sent to fail of its seat", async ({ seat }) => {
      let reached = false;
      const recorder = new Recorder();
      await check.rejects(recorder, "a bare failure ends it", (inner) => {
        inner.fail("a message of the check's own");
        reached = true;
      });

      check.isFalse(seat, reached, "the check stopped at the message");
      check.isFalse(seat, recorder.failed, "the message fails the check");
    });

    it("keeps every failure that the recording surface reports", async ({ seat }) => {
      const failures = await check.rejects(new Recorder(), "both are kept", (inner) => {
        soft.isNil(inner, 1, "the first");
        soft.isNil(inner, 2, "the second");
      });

      check.equal(
        seat,
        failures.map((f) => f.contract),
        ["the first", "the second"],
        "both records are kept",
      );
    });

    it("counts a message sent to record of its seat as a failure without a record", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      const failures = await check.rejects(
        recorder,
        "a bare message fails the check",
        (inner) => {
          inner.record("a message of the check's own");
        },
      );

      check.isFalse(seat, recorder.failed, "the message fails the check");
      check.equal(seat, failures, [], "the message has no record");
    });

    it("awaits a check that returns a promise", async ({ seat }) => {
      const failures = await check.rejects(
        new Recorder(),
        "an async check fails",
        async (inner) => {
          await Promise.resolve();
          check.isTrue(inner, false, "it is true later");
        },
      );

      check.equal(
        seat,
        failures.map((f) => f.contract),
        ["it is true later"],
        "the record",
      );
    });

    it("rejects with what the check throws that is no failure", async ({ seat }) => {
      const boom = new RangeError("the check broke");
      const thrown = await check.rejectsWith(
        seat,
        () =>
          check.rejects(new Recorder(), "a broken check", () => {
            throw boom;
          }),
        "rejects rejects",
      );

      check.equal(
        seat,
        thrown,
        boom,
        "the rejection is the error of the check",
        byIdentity(),
      );
    });

    it("hands the check a signal that aborts when the check ends", async ({ seat }) => {
      let held: AbortSignal | undefined;
      let open = false;
      await check.rejects(new Recorder(), "the signal ends", (inner: Seat) => {
        held = inner.signal;
        open = inner.signal?.aborted === false;
        check.isTrue(inner, false, "it fails");
      });

      check.isTrue(seat, open, "the signal is open while the check runs");
      check.isTrue(
        seat,
        held?.aborted === true,
        "the signal aborts when the check ends",
      );
    });

    it("records the calls of the check under the call of rejects", async ({ seat }) => {
      const recorder = new Recorder();
      await check.rejects(recorder, "the calls of the check are recorded", (inner) => {
        check.isTrue(inner, true, "it passes first");
        check.isTrue(inner, false, "it fails then");
      });

      check.equal(
        seat,
        records(recorder).map((r) => [
          r["seq"],
          r["parent"],
          r["run"],
          r["assertion"],
          r["verdict"],
        ]),
        [
          [1, undefined, undefined, "rejects", "pass"],
          [2, 1, 1, "true", "pass"],
          [3, 1, 1, "true", "fail"],
        ],
        "the calls of the check are a run of rejects",
      );
    });

    it("returns a promise that the forgotten-await guard tracks", ({ seat }) => {
      const standard = new Standard();
      void check.rejects(standard, "nobody awaits this", (inner) => {
        check.isTrue(inner, false, "it fails");
      });
      const thrown = check.throws(
        seat,
        () => standard.flush(),
        "flush reports the check",
      );

      check.contains(
        seat,
        (thrown as Error).message,
        "nobody awaits this",
        "the report",
      );
    });
  });
});
