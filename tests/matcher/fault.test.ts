/**
 * The spec of the faults of the library. It uses vitest's `expect` alone,
 * as every spec of the matcher does.
 */

import { describe, expect, it } from "vitest";
import { Fault, ofOperation } from "../../src/matcher/fault.js";

describe("fault", () => {
  describe("new Fault", () => {
    it("returns a fault whose message states the place, the reason and the cause", () => {
      const fault = new Fault(
        "a/b.txt",
        "the entry cannot be read",
        new Error("EACCES"),
      );

      expect(fault.message).toBe("a/b.txt: the entry cannot be read: EACCES");
    });

    it("returns a fault whose message leaves out an empty place and an absent cause", () => {
      expect(new Fault("", "the literal is no object").message).toBe(
        "the literal is no object",
      );
    });

    it("returns a fault that keeps its place, its reason and its cause", () => {
      const cause = new Error("EACCES");
      const fault = new Fault("a", "the entry cannot be read", cause);

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
        new Fault("a", "the entry cannot be written", cause).within("w").cause,
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
