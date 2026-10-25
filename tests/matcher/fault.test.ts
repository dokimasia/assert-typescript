// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the faults of the library. It uses vitest's `expect` alone,
 * as every spec of the matcher does.
 */

import { describe, expect, it, onTestFinished, vi } from "vitest";
import {
  end,
  Fault,
  faultText,
  noteFault,
  ofOperation,
} from "../../src/matcher/fault.js";
import { Recorder } from "../../src/seat.js";
import { Plain, thrownBy } from "../helpers.js";

describe("fault", () => {
  describe("faultText", () => {
    it("returns the message of an error", () => {
      expect(faultText(new RangeError("a range"))).toBe("a range");
    });

    it("returns the text of a value that is no error", () => {
      expect(faultText(42)).toBe("42");
    });
  });

  describe("end", () => {
    it("passes the fault to reportFault of a seat that takes faults, as ending", () => {
      const broken = new Error("a fault");
      const seat = new Recorder();
      end(seat, broken);

      expect(seat.faults).toEqual([broken]);
      expect(seat.message).toBe("a fault");
    });

    it("throws the fault for a seat without reportFault", () => {
      const broken = new Error("a fault");
      const seat = new Plain();

      expect(thrownBy(() => end(seat, broken))).toBe(broken);
      expect(seat.received).toEqual([]);
    });

    it("throws an error of the text of a fault that is no error", () => {
      const thrown = thrownBy(() => end(new Plain(), 42));

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe("42");
    });

    it("marks the frame of the call as a helper", () => {
      const seat = new Plain();
      thrownBy(() => end(seat, new Error("a fault")));

      expect(seat.helpers).toBe(1);
    });

    it("writes no call record", () => {
      const seat = new Recorder();
      end(seat, new Error("a fault"));

      expect(seat.records).toEqual([]);
    });
  });

  describe("noteFault", () => {
    it("passes the fault to reportFault of a seat that takes faults, as noted", () => {
      const noted = new Error("a file of the store is skipped");
      const seat = new Recorder();
      noteFault(seat, noted);

      expect(seat.faults).toEqual([noted]);
      expect(seat.failed).toBe(false);
    });

    it("writes the message of the fault through console.warn for a seat without reportFault", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      onTestFinished(() => warn.mockRestore());
      const seat = new Plain();
      noteFault(seat, new Error("a file of the store is skipped"));

      expect(warn.mock.calls).toEqual([["a file of the store is skipped"]]);
      expect(seat.received).toEqual([]);
    });
  });

  describe("new Fault", () => {
    it("returns a fault whose message states the place, the reason and the cause", () => {
      const fault = new Fault("a/b.txt", "the entry cannot be read", {
        cause: new Error("EACCES"),
      });

      expect(fault.message).toBe("a/b.txt: the entry cannot be read: EACCES");
    });

    it("returns a fault whose message leaves out an empty place and an absent cause", () => {
      expect(new Fault("", "the literal is no object").message).toBe(
        "the literal is no object",
      );
    });

    it("returns a fault that keeps its place, its reason and its cause", () => {
      const cause = new Error("EACCES");
      const fault = new Fault("a", "the entry cannot be read", { cause });

      expect([fault.name, fault.at, fault.reason, fault.cause]).toEqual([
        "Fault",
        "a",
        "the entry cannot be read",
        cause,
      ]);
    });
  });

  describe("Fault.within", () => {
    it("returns the fault at the joined selector of a larger input", () => {
      const fault = new Fault("type", 'the type "list" is not tree').within("args[0]");

      expect(fault.message).toBe('args[0].type: the type "list" is not tree');
    });

    it("returns the fault at the outer part for a fault of the whole input", () => {
      expect(new Fault("", "the literal is no object").within("golden").message).toBe(
        "golden: the literal is no object",
      );
    });

    it("returns a fault with the same cause", () => {
      const cause = new Error("EEXIST");

      expect(
        new Fault("a", "the entry cannot be written", { cause }).within("w").cause,
      ).toBe(cause);
    });
  });

  describe("ofOperation", () => {
    it("returns an error whose message names the operation before the fault", () => {
      const error = ofOperation("files.read", new Fault("", "no file is at the path"));

      expect(error.message).toBe("files.read: no file is at the path");
    });

    it("returns an error that states the text of a value that is no error", () => {
      expect(ofOperation("files.read", "boom").message).toBe("files.read: boom");
    });
  });
});
