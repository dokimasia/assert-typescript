/**
 * The spec of the assertions about an error value. It uses vitest's
 * `expect` alone, because the surfaces call these assertions.
 */

import { describe, expect, it } from "vitest";
import * as errors from "../../src/matcher/errors.js";
import { Mode } from "../../src/matcher/seat.js";
import { Recorder } from "../../src/seat.js";

/** An error with a field of its own. */
class Conflict extends Error {
  readonly existing: string;

  constructor(existing: string) {
    super(`duplicate ${existing}`);
    this.name = "Conflict";
    this.existing = existing;
  }
}

/** Returns the assertion and the detail of each failure that seat received. */
function reported(seat: Recorder): [string, unknown][] {
  return seat.failures.map((f) => [f.assertion, f.detail]);
}

describe("errors", () => {
  describe("noError", () => {
    it("passes null", () => {
      const seat = new Recorder();
      errors.noError(seat, Mode.Fatal, null, "the write succeeds");

      expect(seat.failed).toBe(false);
    });

    it("reports got for an error", () => {
      const err = new Error("boom");
      const seat = new Recorder();
      errors.noError(seat, Mode.Fatal, err, "the write succeeds");

      expect(reported(seat)).toEqual([["err-absent", { got: err }]]);
    });
  });

  describe("hasError", () => {
    it("passes an error", () => {
      const seat = new Recorder();
      errors.hasError(seat, Mode.Fatal, new Error("boom"), "it is refused");

      expect(seat.failed).toBe(false);
    });

    it("reports null without a detail", () => {
      const seat = new Recorder();
      errors.hasError(seat, Mode.Fatal, null, "it is refused");

      expect(reported(seat)).toEqual([["err-present", {}]]);
    });
  });

  describe("errorIs", () => {
    it("passes an error whose cause is the target", () => {
      const root = new Conflict("id");
      const seat = new Recorder();
      errors.errorIs(
        seat,
        Mode.Fatal,
        new Error("while saving", { cause: root }),
        root,
        "the cause is reported",
      );

      expect(seat.failed).toBe(false);
    });

    it("passes an instance of the target class", () => {
      const seat = new Recorder();
      errors.errorIs(
        seat,
        Mode.Fatal,
        new Conflict("id"),
        Conflict,
        "a duplicate conflicts",
      );

      expect(seat.failed).toBe(false);
    });

    it("passes an error of the same name with the same message as the target", () => {
      const seat = new Recorder();
      errors.errorIs(
        seat,
        Mode.Fatal,
        new Error("boom"),
        new Error("boom"),
        "it is boom",
      );

      expect(seat.failed).toBe(false);
    });

    it("passes a value that is no error but is the target", () => {
      const seat = new Recorder();
      errors.errorIs(seat, Mode.Fatal, "a reason", "a reason", "it is the reason");

      expect(seat.failed).toBe(false);
    });

    it("reports the target with the error for an error that does not match", () => {
      const err = new Error("boom");
      const seat = new Recorder();
      errors.errorIs(seat, Mode.Fatal, err, TypeError, "it is a type error");

      expect(reported(seat)).toEqual([["err-is", { want: TypeError, got: err }]]);
    });

    it("reports an error whose chain of causes is a cycle", () => {
      const a = new Error("a");
      const b = new Error("b", { cause: a });
      (a as { cause?: unknown }).cause = b;
      const seat = new Recorder();
      errors.errorIs(seat, Mode.Fatal, a, TypeError, "it terminates");

      expect(reported(seat)).toEqual([["err-is", { want: TypeError, got: a }]]);
    });
  });

  describe("errorIsNot", () => {
    it("passes an error that does not match", () => {
      const seat = new Recorder();
      errors.errorIsNot(
        seat,
        Mode.Fatal,
        new Error("boom"),
        TypeError,
        "not a type error",
      );

      expect(seat.failed).toBe(false);
    });

    it("reports got for an error that matches", () => {
      const err = new Conflict("id");
      const seat = new Recorder();
      errors.errorIsNot(seat, Mode.Fatal, err, Conflict, "not a conflict");

      expect(reported(seat)).toEqual([["err-is-not", { got: err }]]);
    });
  });

  describe("errorAs", () => {
    it("returns the error of the class in the chain of causes", () => {
      const wrapped = new Error("while saving", { cause: new Conflict("widget") });
      const found = errors.errorAs(
        new Recorder(),
        Mode.Fatal,
        wrapped,
        Conflict,
        "a duplicate conflicts",
      );

      expect(found?.existing).toBe("widget");
    });

    it("passes an error with the class in its chain of causes", () => {
      const seat = new Recorder();
      errors.errorAs(
        seat,
        Mode.Fatal,
        new Error("while saving", { cause: new Conflict("widget") }),
        Conflict,
        "a duplicate conflicts",
      );

      expect(seat.failed).toBe(false);
    });

    it("returns undefined for an error without the class in its chain", () => {
      expect(
        errors.errorAs(
          new Recorder(),
          Mode.Fatal,
          new Error("boom"),
          Conflict,
          "it conflicts",
        ),
      ).toBeUndefined();
    });

    it("reports the class with the error for an error without the class in its chain", () => {
      const err = new Error("boom");
      const seat = new Recorder();
      errors.errorAs(seat, Mode.Fatal, err, Conflict, "it conflicts");

      expect(reported(seat)).toEqual([["err-as", { want: Conflict, got: err }]]);
    });
  });
});
