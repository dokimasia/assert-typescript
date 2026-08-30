/** The assertions about errors, thrown and handed back. */

import { expect, it } from "vitest";
import * as check from "../src/check.js";
import { Recorder } from "../src/seat.js";

class Conflict extends Error {
  readonly existing: string;

  constructor(existing: string) {
    super(`duplicate ${existing}`);
    this.name = "Conflict";
    this.existing = existing;
  }
}

it("noError passes nothing and reports something", () => {
  const passed = new Recorder();
  check.noError(passed, null, "the write succeeds");
  expect(passed.failed).toBe(false);

  const failed = new Recorder();
  check.noError(failed, new Error("boom"), "the write succeeds");
  expect(failed.failed).toBe(true);
});

it("hasError reports nothing and passes something", () => {
  const failed = new Recorder();
  check.hasError(failed, null, "it is refused");
  expect(failed.failed).toBe(true);

  const passed = new Recorder();
  check.hasError(passed, new Error("boom"), "it is refused");
  expect(passed.failed).toBe(false);
});

it("errorIs follows the chain of causes", () => {
  const root = new Conflict("id");
  const wrapped = new Error("while saving", { cause: root });

  const seat = new Recorder();
  check.errorIs(seat, wrapped, root, "the cause is reported");
  expect(seat.failed, seat.message).toBe(false);
});

it("errorIs matches a class as well as an instance", () => {
  const seat = new Recorder();
  check.errorIs(seat, new Conflict("id"), Conflict, "a duplicate conflicts");
  expect(seat.failed, seat.message).toBe(false);
});

it("errorIs reports an error that does not match", () => {
  const seat = new Recorder();
  check.errorIs(seat, new Error("boom"), TypeError, "it is a type error");
  expect(seat.failed).toBe(true);
});

it("errorIsNot is the negation", () => {
  const passed = new Recorder();
  check.errorIsNot(passed, new Error("boom"), TypeError, "not a type error");
  expect(passed.failed).toBe(false);

  const failed = new Recorder();
  failed.helper();
  check.errorIsNot(failed, new Conflict("id"), Conflict, "not a conflict");
  expect(failed.failed).toBe(true);
});

it("errorAs answers the matching error so its fields can be read", () => {
  const wrapped = new Error("while saving", { cause: new Conflict("widget") });

  const seat = new Recorder();
  const found = check.errorAs(seat, wrapped, Conflict, "a duplicate conflicts");

  expect(seat.failed, seat.message).toBe(false);
  expect(found?.existing).toBe("widget");
});

it("errorAs answers undefined and reports when nothing matches", () => {
  const seat = new Recorder();
  const found = check.errorAs(seat, new Error("boom"), Conflict, "it conflicts");

  expect(found).toBeUndefined();
  expect(seat.failed).toBe(true);
});

it("errorIs stops on a cycle in the cause chain", () => {
  const a = new Error("a");
  const b = new Error("b", { cause: a });
  (a as { cause?: unknown }).cause = b;

  const seat = new Recorder();
  expect(() => check.errorIs(seat, a, TypeError, "it terminates")).not.toThrow();
});

it("throws answers what was thrown", () => {
  const seat = new Recorder();
  const thrown = check.throws(
    seat,
    () => {
      throw new Conflict("widget");
    },
    "a duplicate is refused",
  );

  expect(seat.failed, seat.message).toBe(false);
  expect((thrown as Conflict).existing).toBe("widget");
});

it("throws reports a call that returns", () => {
  const seat = new Recorder();
  const thrown = check.throws(seat, () => 1, "it refuses");

  expect(seat.failed).toBe(true);
  expect(thrown).toBeUndefined();
});

it("throws refuses a callable that answers a promise", () => {
  // An unawaited rejection is not a throw, so passing here would make
  // the assertion lie about what it checked.
  const seat = new Recorder();
  check.throws(seat, async () => 1, "it refuses");

  expect(seat.failed).toBe(true);
  expect(seat.message).toContain("promise");
});

it("doesNotThrow passes a quiet call and reports a throwing one", () => {
  const passed = new Recorder();
  check.doesNotThrow(passed, () => 1, "it parses");
  expect(passed.failed).toBe(false);

  const failed = new Recorder();
  check.doesNotThrow(
    failed,
    () => {
      throw new Error("boom");
    },
    "it parses",
  );
  expect(failed.failed).toBe(true);
});

it("rejectsWith answers what the promise rejected with", async () => {
  const seat = new Recorder();
  const thrown = await check.rejectsWith(
    seat,
    () => Promise.reject(new Conflict("widget")),
    "it refuses",
  );

  expect(seat.failed, seat.message).toBe(false);
  expect((thrown as Conflict).existing).toBe("widget");
});

it("rejectsWith reports a promise that settles", async () => {
  const seat = new Recorder();
  await check.rejectsWith(seat, () => Promise.resolve(1), "it refuses");

  expect(seat.failed).toBe(true);
});
