/**
 * The spec of the verdict of an assertion call: a pass, a failure or a
 * fault, and the call record of each. It uses vitest's `expect` alone,
 * because every assertion reports its verdict through it.
 */

import { describe, expect, it, onTestFinished } from "vitest";
import { Failure } from "../../src/failure.js";
import { Mode } from "../../src/matcher/seat.js";
import {
  end,
  fail,
  fault,
  faultText,
  pass,
  Running,
} from "../../src/matcher/verdict.js";
import { VARIABLE } from "../../src/record/switch.js";
import { Recorder } from "../../src/seat.js";
import { Plain, records, setRecording } from "../helpers.js";

describe("verdict", () => {
  it("ends every call with the fault of a switch that is neither 0 nor 1", () => {
    onTestFinished(setRecording("yes"));
    const seat = new Plain();
    pass(seat, Mode.Soft, "true", "the count is right");
    fail(seat, Mode.Soft, "true", "it fails");
    fault(seat, Mode.Soft, "true", "it faults", new Error("a fault"));
    Running.of(seat).passRun(Mode.Soft, "prop-for-all", "a run", undefined, {});
    Running.of(seat).failRun(Mode.Soft, new Failure("prop-for-all", "a run", {}), {});

    expect(seat.received).toEqual(
      Array(5).fill(["fail", `${VARIABLE}: "yes" is neither 0 nor 1`]),
    );
  });

  it("writes no call record under a switch that is neither 0 nor 1", () => {
    onTestFinished(setRecording("yes"));
    const seat = new Recorder();
    pass(seat, Mode.Soft, "true", "the count is right");

    expect(seat.records).toEqual([]);
  });

  describe("faultText", () => {
    it("returns the message of an error", () => {
      expect(faultText(new RangeError("a range"))).toBe("a range");
    });

    it("returns the text of a value that is no error", () => {
      expect(faultText(42)).toBe("42");
    });
  });

  describe("end", () => {
    it("sends the text of the fault to fail", () => {
      const seat = new Plain();
      end(seat, new Error("a fault"));

      expect(seat.received).toEqual([["fail", "a fault"]]);
    });

    it("marks the frame of the call as a helper", () => {
      const seat = new Plain();
      end(seat, new Error("a fault"));

      expect(seat.helpers).toBe(1);
    });

    it("writes no call record", () => {
      const seat = new Recorder();
      end(seat, new Error("a fault"));

      expect(seat.records).toEqual([]);
    });
  });

  describe("pass", () => {
    it("writes the call record of the pass with its call site", () => {
      const seat = new Recorder();
      pass(seat, Mode.Soft, "true", "the flag is set");

      expect(records(seat)).toEqual([
        {
          definition: expect.any(String),
          seq: 1,
          assertion: "true",
          contract: "the flag is set",
          verdict: "pass",
          aborting: false,
          where: { file: "verdict.test.ts", line: expect.any(Number) },
        },
      ]);
    });

    it("sends the seat no message", () => {
      const seat = new Plain();
      pass(seat, Mode.Fatal, "true", "the flag is set");

      expect(seat.received).toEqual([]);
    });
  });

  describe("fail", () => {
    it("writes the typed literal of each field of the detail in the call record", () => {
      const seat = new Recorder();
      fail(seat, Mode.Fatal, "equal", "the count is right", { want: 2, got: 1.5 });

      expect(records(seat)[0]?.["detail"]).toEqual({
        want: { type: "int", value: 2 },
        got: { type: "float", value: 1.5 },
      });
    });

    it("reports the failure's record to a seat that takes records", () => {
      const seat = new Recorder();
      fail(seat, Mode.Fatal, "equal", "the count is right", { want: 2, got: 1.5 });

      expect(seat.failures).toEqual([
        new Failure(
          "equal",
          "the count is right",
          { want: 2, got: 1.5 },
          expect.anything(),
        ),
      ]);
    });

    it("sends the sentence of the failure to fail under Mode.Fatal", () => {
      const seat = new Plain();
      fail(seat, Mode.Fatal, "equal", "the count is right", { want: 1, got: 2 });

      expect(seat.received).toEqual([["fail", "the count is right: want 1, got 2"]]);
    });

    it("sends the sentence of the failure to record under Mode.Soft", () => {
      const seat = new Plain();
      fail(seat, Mode.Soft, "true", "it is set");

      expect(seat.received).toEqual([["record", "it is set"]]);
    });

    it("marks the frame of the call as a helper", () => {
      const seat = new Plain();
      fail(seat, Mode.Soft, "true", "it is set");

      expect(seat.helpers).toBeGreaterThan(0);
    });
  });

  describe("fault", () => {
    it("ends a call of Mode.Soft through fail", () => {
      const seat = new Plain();
      fault(seat, Mode.Soft, "matches", "the id is well formed", new Error("it broke"));

      expect(seat.received).toEqual([["fail", "it broke"]]);
    });

    it("reports no failure record", () => {
      const seat = new Recorder();
      fault(seat, Mode.Soft, "matches", "the id is well formed", new Error("it broke"));

      expect(seat.failures).toEqual([]);
    });

    it("writes a call record of the verdict error with the text of the fault", () => {
      const seat = new Recorder();
      fault(seat, Mode.Soft, "matches", "the id is well formed", new Error("it broke"));

      expect(records(seat)).toEqual([
        {
          definition: expect.any(String),
          seq: 1,
          assertion: "matches",
          contract: "the id is well formed",
          verdict: "error",
          aborting: false,
          where: expect.any(Object),
          error: "it broke",
        },
      ]);
    });
  });

  describe("Running.of", () => {
    it("reports the call site that it was given", () => {
      const seat = new Recorder();
      const where = { file: "/elsewhere/caller.ts", line: 7 };
      Running.of(seat, where).fail(Mode.Fatal, "true", "it is set", {});

      expect(seat.failures[0]?.where).toEqual(where);
    });
  });

  describe("Running.begin", () => {
    it("numbers its call before a later call on the seat", () => {
      const seat = new Recorder();
      const outer = Running.begin(seat);
      pass(seat, Mode.Fatal, "true", "a call after the start");
      outer.pass(Mode.Fatal, "eventually", "the outer call");

      expect(records(seat).map((r) => [r["seq"], r["assertion"]])).toEqual([
        [1, "eventually"],
        [2, "true"],
      ]);
    });

    it("sends a seat that records nothing no message for a pass", () => {
      const seat = new Plain();
      Running.begin(seat).pass(Mode.Fatal, "eventually", "the outer call");

      expect(seat.received).toEqual([]);
    });
  });

  describe("Running.slot", () => {
    it("returns the slot of a call on a seat that records calls", () => {
      expect(Running.begin(new Recorder()).slot).toBeDefined();
    });

    it("returns undefined for a call on a seat that records nothing", () => {
      expect(Running.begin(new Plain()).slot).toBeUndefined();
    });

    it("returns undefined for a call that runs no body", () => {
      expect(Running.of(new Recorder()).slot).toBeUndefined();
    });
  });

  describe("Running.passRun", () => {
    it("writes the detail of the run in the call record of the pass", () => {
      const seat = new Recorder();
      const run = { outcome: "passed", cases: 100, rejected: 0, seed: "7" };
      Running.of(seat).passRun(
        Mode.Fatal,
        "prop-for-all",
        "the count is right",
        { file: "/a/p.test.ts", line: 3 },
        run,
      );

      expect(records(seat).map((r) => [r["verdict"], r["detail"], r["where"]])).toEqual(
        [["pass", run, { file: "p.test.ts", line: 3 }]],
      );
    });

    it("writes the call site that it reads for a run without one", () => {
      const seat = new Recorder();
      Running.of(seat).passRun(Mode.Fatal, "prop-for-all", "a run", undefined, {});

      expect(records(seat)[0]?.["where"]).toEqual({
        file: "verdict.test.ts",
        line: expect.any(Number),
      });
    });
  });

  describe("Running.failRun", () => {
    const run = { outcome: "counterexample", cases: 3, rejected: 0, seed: "7" };
    const failure = new Failure("prop-for-all", "it fails", {
      outcome: "counterexample",
    });

    it("writes the detail of the run in place of the detail of the failure", () => {
      const seat = new Recorder();
      Running.of(seat).failRun(Mode.Fatal, failure, run);

      expect(records(seat).map((r) => [r["verdict"], r["detail"]])).toEqual([
        ["fail", run],
      ]);
    });

    it("reports the failure's record", () => {
      const seat = new Recorder();
      Running.of(seat).failRun(Mode.Fatal, failure, run);

      expect(seat.failures).toEqual([failure]);
    });

    it("writes the call site of the failure", () => {
      const seat = new Recorder();
      const placed = new Failure(
        "prop-for-all",
        "it fails",
        {},
        { file: "/a/p.test.ts", line: 9 },
      );
      Running.of(seat).failRun(Mode.Fatal, placed, run);

      expect(records(seat)[0]?.["where"]).toEqual({ file: "p.test.ts", line: 9 });
    });
  });
});
