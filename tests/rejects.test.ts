// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the assertion that a check fails. */

import { describe } from "vitest";
import { Failure } from "../src/failure.js";
import { fault } from "../src/fault.js";
import { byIdentity, check, soft } from "../src/index.js";
import { AssertionFailed, Recorder, type Seat, Standard } from "../src/seat.js";
import { test as it } from "../src/vitest.js";
import { records } from "./helpers.js";

describe("rejects", () => {
  describe("rejects", () => {
    it("passes a check that fails", async ({ seat }) => {
      const recorder = new Recorder();
      await check.doesReject(recorder, "an empty name is refused", (inner) => {
        check.isNil(inner, "not empty", "it passes");
      });

      check.isFalse(seat, recorder.failed, "a failing check passes rejects");
    });

    it("returns the failure records of the check", async ({ seat }) => {
      const failures = await check.doesReject(
        new Recorder(),
        "an empty name is refused",
        (inner) => {
          check.isNil(inner, "not empty", "it passes");
        },
      );

      check.isTrue(seat, failures[0] instanceof Failure, "the check returns records");
      check.isEqualTo(
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
      await check.doesReject(recorder, "an empty name is refused", (inner) => {
        check.isNil(inner, null, "it passes");
      });

      check.isEqualTo(
        seat,
        recorder.failures.map((f) => [f.assertion, f.contract, f.detail]),
        [["rejects", "an empty name is refused", {}]],
        "rejects reports the passing check",
      );
    });

    it("returns no failure record for a check that passes", async ({ seat }) => {
      const failures = await check.doesReject(
        new Recorder(),
        "it is refused",
        (inner) => {
          check.isNil(inner, null, "it passes");
        },
      );

      check.isEqualTo(seat, failures, [], "a passing check has no record");
    });

    it("throws AssertionFailed on a standard seat for a check that passes", async ({
      seat,
    }) => {
      const thrown = await check.rejectsWith(
        seat,
        () =>
          check.doesReject(new Standard(), "it is refused", (inner) => {
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
      const failures = await check.doesReject(
        new Recorder(),
        "the first failure ends it",
        (inner) => {
          check.isNil(inner, 1, "the first");
          reached = true;
          check.isNil(inner, 2, "the second");
        },
      );

      check.isFalse(seat, reached, "the check stopped at its first failure");
      check.isEqualTo(
        seat,
        failures.map((f) => f.contract),
        ["the first"],
        "one record",
      );
    });

    it("ends the check at a message sent to fail of its seat", async ({ seat }) => {
      let reached = false;
      const recorder = new Recorder();
      await check.doesReject(recorder, "a bare failure ends it", (inner) => {
        inner.fail("a message of the check's own");
        reached = true;
      });

      check.isFalse(seat, reached, "the check stopped at the message");
      check.isFalse(seat, recorder.failed, "the message fails the check");
    });

    it("keeps every failure that the recording surface reports", async ({ seat }) => {
      const failures = await check.doesReject(
        new Recorder(),
        "both are kept",
        (inner) => {
          soft.isNil(inner, 1, "the first");
          soft.isNil(inner, 2, "the second");
        },
      );

      check.isEqualTo(
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
      const failures = await check.doesReject(
        recorder,
        "a bare message fails the check",
        (inner) => {
          inner.record("a message of the check's own");
        },
      );

      check.isFalse(seat, recorder.failed, "the message fails the check");
      check.isEqualTo(seat, failures, [], "the message has no record");
    });

    it("awaits a check that returns a promise", async ({ seat }) => {
      const failures = await check.doesReject(
        new Recorder(),
        "an async check fails",
        async (inner) => {
          await Promise.resolve();
          check.isTrue(inner, false, "it is true later");
        },
      );

      check.isEqualTo(
        seat,
        failures.map((f) => f.contract),
        ["it is true later"],
        "the record",
      );
    });

    it("ends the call with the fault that ends the check", async ({ seat }) => {
      const broken = new RangeError("the check refuses its argument");
      const recorder = new Recorder();
      const failures = await check.doesReject(recorder, "a faulted check", (inner) => {
        fault(inner, broken);
        check.isTrue(inner, false, "it fails after the fault");
      });

      check.isEqualTo(
        seat,
        failures,
        [],
        "a check that ends with a fault returns an empty list",
      );
      check.hasLength(seat, recorder.faults, 1, "one fault");
      check.isEqualTo(
        seat,
        recorder.faults[0],
        broken,
        "the seat receives the fault",
        byIdentity(),
      );
      check.isEqualTo(
        seat,
        records(recorder).map((r) => [r["assertion"], r["verdict"], r["error"]]),
        [["rejects", "error", "the check refuses its argument"]],
        "the call record of rejects states the fault",
      );
    });

    it("rejects with the fault that ends the check on a seat without reportFault", async ({
      seat,
    }) => {
      const broken = new RangeError("the check refuses its argument");
      const thrown = await check.rejectsWith(
        seat,
        () =>
          check.doesReject(new Standard(), "a faulted check", (inner) => {
            fault(inner, broken);
          }),
        "rejects rejects",
      );

      check.isEqualTo(seat, thrown, broken, "the rejection is the fault", byIdentity());
    });

    it("passes a fault that the check notes to its seat", async ({ seat }) => {
      const noted = new Error("a file of the store is of a later format");
      const recorder = new Recorder();
      await check.doesReject(recorder, "a check that notes a fault", (inner) => {
        inner.reportFault?.(noted, false);
        check.isTrue(inner, false, "it fails");
      });

      check.hasLength(seat, recorder.faults, 1, "one noted fault");
      check.isEqualTo(
        seat,
        recorder.faults[0],
        noted,
        "the seat receives the noted fault",
        byIdentity(),
      );
      check.isFalse(seat, recorder.failed, "the failing check passes rejects");
    });

    it("ends the call as skipped for a check that skips before it fails", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      let reached = false;
      const failures = await check.doesReject(
        recorder,
        "a check that skips",
        (inner) => {
          inner.skip?.("the check needs a disk");
          reached = true;
        },
      );

      check.isFalse(seat, reached, "the skip ended the check");
      check.isEqualTo(seat, failures, [], "the skip has no record");
      check.isFalse(seat, recorder.failed, "the skip fails nothing");
      check.isEqualTo(
        seat,
        records(recorder).map((r) => [r["verdict"], r["reason"], "detail" in r]),
        [["skip", "the check needs a disk", false]],
        "the call of rejects ends as skipped",
      );
    });

    it("skips the test of a seat that skips its test with the reason of the check", async ({
      seat,
    }) => {
      class Skipping extends Recorder {
        readonly reasons: string[] = [];

        skip(reason: string): never {
          this.reasons.push(reason);
          throw new Error(`the test skips: ${reason}`);
        }
      }
      const skipping = new Skipping();
      const thrown = await check.rejectsWith(
        seat,
        () =>
          check.doesReject(skipping, "a check that skips", (inner) => {
            inner.skip?.("the check needs a disk");
          }),
        "rejects rejects with the skip of the seat",
      );

      check.isEqualTo(
        seat,
        [(thrown as Error).message, skipping.reasons],
        ["the test skips: the check needs a disk", ["the check needs a disk"]],
        "the seat skips with the reason",
      );
    });

    it("keeps the reason of the first skip", async ({ seat }) => {
      const recorder = new Recorder();
      await check.doesReject(recorder, "a check with two skips", (inner) => {
        try {
          inner.skip?.("the first reason");
        } catch {
          // The check runs on past the end of its first skip.
        }
        inner.skip?.("the second reason");
      });

      check.isEqualTo(
        seat,
        records(recorder).map((r) => r["reason"]),
        ["the first reason"],
        "the call of rejects has the first reason",
      );
    });

    it("passes a check that fails and then skips", async ({ seat }) => {
      const recorder = new Recorder();
      const failures = await check.doesReject(
        recorder,
        "a check that skips late",
        (inner) => {
          soft.isTrue(inner, false, "it fails first");
          inner.skip?.("the check needs a disk");
        },
      );

      check.isEqualTo(
        seat,
        failures.map((f) => f.contract),
        ["it fails first"],
        "the records of the check",
      );
      check.isEqualTo(
        seat,
        records(recorder)
          .filter((r) => r["assertion"] === "rejects")
          .map((r) => r["verdict"]),
        ["pass"],
        "rejects passes",
      );
    });

    it("passes a fault that the check notes to its seat for a check that then skips", async ({
      seat,
    }) => {
      const noted = new Error("a file of the store is of a later format");
      const recorder = new Recorder();
      const failures = await check.doesReject(
        recorder,
        "a check with a note",
        (inner) => {
          inner.reportFault?.(noted, false);
          inner.skip?.("the check needs a disk");
        },
      );

      check.isEqualTo(seat, failures, [], "the skip has no record");
      check.hasLength(seat, recorder.faults, 1, "one noted fault");
      check.isEqualTo(
        seat,
        recorder.faults[0],
        noted,
        "the seat receives the noted fault",
        byIdentity(),
      );
      check.isEqualTo(
        seat,
        records(recorder).map((r) => r["verdict"]),
        ["skip"],
        "the call of rejects ends as skipped",
      );
    });

    it("rejects with what the check throws that is no failure", async ({ seat }) => {
      const boom = new RangeError("the check broke");
      const thrown = await check.rejectsWith(
        seat,
        () =>
          check.doesReject(new Recorder(), "a broken check", () => {
            throw boom;
          }),
        "rejects rejects",
      );

      check.isEqualTo(
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
      await check.doesReject(new Recorder(), "the signal ends", (inner: Seat) => {
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
      await check.doesReject(
        recorder,
        "the calls of the check are recorded",
        (inner) => {
          check.isTrue(inner, true, "it passes first");
          check.isTrue(inner, false, "it fails then");
        },
      );

      check.isEqualTo(
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
      void check.doesReject(standard, "nobody awaits this", (inner) => {
        check.isTrue(inner, false, "it fails");
      });
      const thrown = check.doesThrow(
        seat,
        () => standard.flush(),
        "flush reports the check",
      );

      check.doesContain(
        seat,
        (thrown as Error).message,
        "nobody awaits this",
        "the report",
      );
    });
  });
});
