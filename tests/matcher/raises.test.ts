/**
 * The spec of the assertions about a call that throws. It uses vitest's
 * `expect` alone, because the surfaces call these assertions.
 */

import { describe, expect, it } from "vitest";
import * as raising from "../../src/matcher/raises.js";
import { Mode } from "../../src/matcher/seat.js";
import { Recorder } from "../../src/seat.js";

/** An error with a field of its own. */
class Conflict extends Error {
  readonly existing: string;

  constructor(existing: string) {
    super(`duplicate ${existing}`);
    this.existing = existing;
  }
}

/** Returns the assertion and the detail of each failure that seat received. */
function reported(seat: Recorder): [string, unknown][] {
  return seat.failures.map((f) => [f.assertion, f.detail]);
}

/** Returns once every callback that the event loop has queued has run. */
function settled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("raises", () => {
  describe("throws", () => {
    it("returns what the function threw", () => {
      const thrown = raising.throws(
        new Recorder(),
        Mode.Fatal,
        () => {
          throw new Conflict("widget");
        },
        "a duplicate is refused",
      );

      expect((thrown as Conflict).existing).toBe("widget");
    });

    it("passes a function that throws", () => {
      const seat = new Recorder();
      raising.throws(
        seat,
        Mode.Fatal,
        () => {
          throw new Conflict("widget");
        },
        "a duplicate is refused",
      );

      expect(seat.failed).toBe(false);
    });

    it("reports a function that returns", () => {
      const seat = new Recorder();
      raising.throws(seat, Mode.Fatal, () => 1, "it refuses");

      expect(reported(seat)).toEqual([["throws", {}]]);
    });

    it("returns undefined for a function that returns", () => {
      expect(
        raising.throws(new Recorder(), Mode.Fatal, () => 1, "it refuses"),
      ).toBeUndefined();
    });

    it("reports a function that returns a promise", () => {
      const seat = new Recorder();
      raising.throws(seat, Mode.Fatal, async () => 1, "it refuses");

      expect(reported(seat)).toEqual([["throws", {}]]);
    });

    it("keeps the rejection of a returned promise from becoming an unhandled rejection", async () => {
      const seat = new Recorder();
      raising.throws(
        seat,
        Mode.Fatal,
        async () => {
          throw new Error("refused later");
        },
        "it refuses",
      );
      await settled();

      expect(reported(seat)).toEqual([["throws", {}]]);
    });
  });

  describe("doesNotThrow", () => {
    it("passes a function that returns", () => {
      const seat = new Recorder();
      raising.doesNotThrow(seat, Mode.Fatal, () => 1, "it parses");

      expect(seat.failed).toBe(false);
    });

    it("reports got for a function that throws", () => {
      const err = new Error("boom");
      const seat = new Recorder();
      raising.doesNotThrow(
        seat,
        Mode.Fatal,
        () => {
          throw err;
        },
        "it parses",
      );

      expect(reported(seat)).toEqual([["not-throws", { got: err }]]);
    });
  });

  describe("rejectsWith", () => {
    it("returns what the promise rejected with", async () => {
      const thrown = await raising.rejectsWith(
        new Recorder(),
        Mode.Fatal,
        () => Promise.reject(new Conflict("widget")),
        "it refuses",
      );

      expect((thrown as Conflict).existing).toBe("widget");
    });

    it("passes a function whose promise rejects", async () => {
      const seat = new Recorder();
      await raising.rejectsWith(
        seat,
        Mode.Fatal,
        () => Promise.reject(new Error("refused")),
        "it refuses",
      );

      expect(seat.failed).toBe(false);
    });

    it("reports a function whose promise resolves", async () => {
      const seat = new Recorder();
      await raising.rejectsWith(
        seat,
        Mode.Fatal,
        () => Promise.resolve(1),
        "it refuses",
      );

      expect(reported(seat)).toEqual([["throws", {}]]);
    });

    it("returns undefined for a promise that resolves", async () => {
      expect(
        await raising.rejectsWith(
          new Recorder(),
          Mode.Fatal,
          () => Promise.resolve(1),
          "it refuses",
        ),
      ).toBeUndefined();
    });
  });
});
