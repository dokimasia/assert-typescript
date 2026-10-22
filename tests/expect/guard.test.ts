// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the record of the asynchronous matchers of each test. It
 * uses vitest's `expect` alone, because the record delivers the failure
 * of an unawaited matcher to the runner.
 */

import { describe, expect, it } from "vitest";
import { Call, Pending } from "../../src/expect/guard.js";

/** The end of the path of this spec, with either separator. */
const SPEC = /[/\\]tests[/\\]expect[/\\]guard\.test\.ts:\d+:\d+/;

describe("guard", () => {
  describe("new Call", () => {
    it("returns a call that has not settled", () => {
      const call = new Call("completesWithin");

      expect([call.name, call.settled, call.failed, call.abandoned]).toEqual([
        "completesWithin",
        false,
        false,
        false,
      ]);
    });
  });

  describe("Call.settle", () => {
    it("marks the call settled with its verdict", () => {
      const call = new Call("completesWithin");
      call.settle(true);

      expect([call.settled, call.failed]).toEqual([true, true]);
    });
  });

  describe("Call.abandon", () => {
    it("marks the call abandoned", () => {
      const call = new Call("completesWithin");
      call.abandon();

      expect(call.abandoned).toBe(true);
    });
  });

  describe("Call.neverAwaited", () => {
    it("returns the error that names the call", () => {
      expect(new Call("completesWithin").neverAwaited().message).toBe(
        "completesWithin was never awaited, so it asserted nothing. Add await to the call.",
      );
    });

    it("returns an error whose first frame is the start of the call", () => {
      const stack = String(new Call("completesWithin").neverAwaited().stack);

      expect(stack.split("\n")[1]).toMatch(SPEC);
    });

    it("returns an error without frames of the library", () => {
      const stack = String(new Call("completesWithin").neverAwaited().stack);

      expect(stack).not.toMatch(/[/\\]src[/\\]expect[/\\]/);
    });
  });

  describe("Call.failedUnawaited", () => {
    it("returns the error that names the call", () => {
      expect(new Call("isPure").failedUnawaited().message).toBe(
        "isPure failed, and the test did not await it. Add await to the call.",
      );
    });
  });

  describe("Pending.start", () => {
    it("records the call under its test", () => {
      const pending = new Pending();
      const call = pending.start("a test", "isPure");

      expect([pending.has("a test"), pending.end("a test")]).toEqual([true, [call]]);
    });

    it("records the calls of a test in the order of their start", () => {
      const pending = new Pending();
      const first = pending.start("a test", "isPure");
      const second = pending.start("a test", "eventually");

      expect(pending.end("a test")).toEqual([first, second]);
    });
  });

  describe("Pending.has", () => {
    it("returns false for a test without a call", () => {
      expect(new Pending().has("a test")).toBe(false);
    });
  });

  describe("Pending.end", () => {
    it("marks each call that has not settled abandoned", () => {
      const pending = new Pending();
      const settled = pending.start("a test", "isPure");
      const running = pending.start("a test", "eventually");
      settled.settle(false);
      pending.end("a test");

      expect([settled.abandoned, running.abandoned]).toEqual([false, true]);
    });

    it("forgets the calls of the test", () => {
      const pending = new Pending();
      pending.start("a test", "isPure");
      pending.end("a test");

      expect([pending.has("a test"), pending.end("a test")]).toEqual([false, []]);
    });

    it("keeps the calls of another test", () => {
      const pending = new Pending();
      const other = pending.start("another test", "isPure");
      pending.end("a test");

      expect(pending.end("another test")).toEqual([other]);
    });
  });
});
