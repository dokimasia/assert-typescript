/** The spec of the record that a failing assertion reports, and of its sentence. */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runInThisContext } from "node:vm";
import { describe } from "vitest";
import { callSite, Failure, render } from "../src/failure.js";
import { check } from "../src/index.js";
import { Recorder } from "../src/seat.js";
import { test as it } from "../src/vitest.js";

/** The end of the path of this spec, with either separator. */
const SPEC = "[/\\\\]tests[/\\\\]failure\\.test\\.ts$";

describe("failure", () => {
  describe("new Failure", () => {
    it("returns a record of the fields that it was given", ({ seat }) => {
      const held = new Failure("equal", "the values match", { want: 2, got: 1 });

      check.equal(
        seat,
        [held.assertion, held.contract, held.detail],
        ["equal", "the values match", { want: 2, got: 1 }],
        "the record contains what the assertion reported",
      );
    });

    it("returns a record with the call site that it was given", ({ seat }) => {
      const where = { file: "/a/store.test.ts", line: 3 };

      check.equal(
        seat,
        new Failure("true", "it is set", {}, where).where,
        where,
        "the site",
      );
    });

    it("returns a record without where for an unknown call site", ({ seat }) => {
      const held = new Failure("true", "the flag is set", {});

      check.isFalse(
        seat,
        Object.hasOwn(held, "where"),
        "the record has no field where",
      );
    });
  });

  describe("Failure.want", () => {
    it("returns the want of the detail", ({ seat }) => {
      const held = new Failure("equal", "the values match", { want: 2, got: null });

      check.equal(seat, held.want, 2, "want is the detail's");
    });

    it("returns undefined for a detail without want", ({ seat }) => {
      check.equal(
        seat,
        new Failure("true", "the flag is set", {}).want,
        undefined,
        "an assertion without want states none",
      );
    });
  });

  describe("Failure.got", () => {
    it("returns null for a got that is null", ({ seat }) => {
      const held = new Failure("equal", "the values match", { want: 2, got: null });

      check.equal(seat, held.got, null, "got is the detail's null");
    });

    it("returns undefined for a detail without got", ({ seat }) => {
      check.equal(
        seat,
        new Failure("true", "the flag is set", {}).got,
        undefined,
        "an assertion without got states none",
      );
    });
  });

  describe("Failure.caseFailure", () => {
    it("returns the record of the failing case of a property", ({ seat }) => {
      const inner = new Failure("equal", "the case fails", { want: 1, got: 2 });
      const property = new Failure("prop-for-all", "the property is true", {
        failure: inner,
      });

      check.isTrue(
        seat,
        property.caseFailure === inner,
        "the case's record is the inner one",
      );
    });

    it("returns undefined for a failure without a failing case", ({ seat }) => {
      const plain = new Failure("equal", "the values match", { want: 1, got: 2 });

      check.equal(seat, plain.caseFailure, undefined, "a plain failure has no case");
    });

    it("returns undefined for a field failure that is no record", ({ seat }) => {
      const named = new Failure("prop-for-all", "a failure that is no record", {
        failure: "lost",
      });

      check.equal(seat, named.caseFailure, undefined, "text is no record");
    });
  });

  describe("render", () => {
    const tests = [
      {
        name: "returns the contract alone for an empty detail",
        give: new Failure("true", "the flag is set", {}),
        want: "the flag is set",
      },
      {
        name: "returns want before got",
        give: new Failure("length", "every item comes back", { got: 2, want: 3 }),
        want: "every item comes back: want 3, got 2",
      },
      {
        name: "returns a field outside the order after the fields of the order",
        give: new Failure("made-up", "the contract", { zebra: 1, got: 2, apple: 3 }),
        want: "the contract: got 2, apple 3, zebra 1",
      },
      {
        name: "returns a string in quotes",
        give: new Failure("has-prefix", "the line names the method", {
          got: "",
          prefix: "GET ",
        }),
        want: 'the line names the method: got "", prefix "GET "',
      },
      {
        name: "returns each value as show renders it",
        give: new Failure("equal", "the reply is kept", {
          want: new Map([["a", 1]]),
          got: () => undefined,
        }),
        want: 'the reply is kept: want Map(1) {"a" => 1}, got [function got]',
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(seat, render(tt.give), tt.want, "the sentence of the record");
      });
    }
  });

  describe("callSite", () => {
    it("returns the file of the call outside the library", ({ seat }) => {
      check.matches(seat, callSite()?.file, SPEC, "the caller is this spec");
    });

    it("returns the path of a frame whose file is a URL", ({ seat }) => {
      const path = join(tmpdir(), "caller.js");
      const call = runInThisContext("(read) => read()", {
        filename: pathToFileURL(path).href,
      }) as (read: () => unknown) => unknown;

      check.equal(
        seat,
        call(callSite),
        { file: path, line: 1 },
        "the site of the caller",
      );
    });

    it("passes over a frame without a line", ({ seat }) => {
      const [where] = [0].map(callSite);

      check.matches(seat, where?.file, SPEC, "the caller of map is this spec");
    });

    it("returns undefined for a call that no frame outside the library made", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      queueMicrotask(check.isTrue.bind(null, recorder, false, "a microtask calls it"));
      await new Promise((resolve) => setImmediate(resolve));
      const failure = recorder.failures[0];

      check.isNotNil(seat, failure, "the assertion failed");
      check.isFalse(
        seat,
        Object.hasOwn(failure as object, "where"),
        "the failure has no call site",
      );
    });

    it("returns the site of an assertion call that a failure reports", ({ seat }) => {
      const recorder = new Recorder();
      check.equal(recorder, 1, 2, "the values match");
      const where = recorder.failures[0]?.where;

      check.matches(seat, where?.file, SPEC, "the failure names this spec");
      check.isTrue(seat, (where?.line ?? 0) > 0, "the failure names a line");
    });
  });
});
