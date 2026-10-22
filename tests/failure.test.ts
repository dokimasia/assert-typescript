// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the record that a failing assertion reports, and of its sentence. */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runInThisContext } from "node:vm";
import { describe, onTestFinished } from "vitest";
import { callSite, directoryOf, Failure, render, stackOf } from "../src/failure.js";
import { check } from "../src/index.js";
import { Recorder } from "../src/seat.js";
import { test as it } from "../src/vitest.js";

/** The end of the path of this spec, with either separator. */
const SPEC = "[/\\\\]tests[/\\\\]failure\\.test\\.ts$";

describe("failure", () => {
  describe("new Failure", () => {
    it("returns a record of the fields that it was given", ({ seat }) => {
      const held = new Failure("equal", "the values match", { want: 2, got: 1 });

      check.isEqualTo(
        seat,
        [held.assertion, held.contract, held.detail],
        ["equal", "the values match", { want: 2, got: 1 }],
        "the record contains what the assertion reported",
      );
    });

    it("returns a record with the call site that it was given", ({ seat }) => {
      const where = { file: "/a/store.test.ts", line: 3 };

      check.isEqualTo(
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

      check.isEqualTo(seat, held.want, 2, "want is the detail's");
    });

    it("returns undefined for a detail without want", ({ seat }) => {
      check.isEqualTo(
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

      check.isEqualTo(seat, held.got, null, "got is the detail's null");
    });

    it("returns undefined for a detail without got", ({ seat }) => {
      check.isEqualTo(
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

      check.isEqualTo(
        seat,
        plain.caseFailure,
        undefined,
        "a plain failure has no case",
      );
    });

    it("returns undefined for a field failure that is no record", ({ seat }) => {
      const named = new Failure("prop-for-all", "a failure that is no record", {
        failure: "lost",
      });

      check.isEqualTo(seat, named.caseFailure, undefined, "text is no record");
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
        check.isEqualTo(seat, render(tt.give), tt.want, "the sentence of the record");
      });
    }
  });

  describe("callSite", () => {
    it("returns the file of the call outside the library", ({ seat }) => {
      check.doesMatch(seat, callSite()?.file, SPEC, "the caller is this spec");
    });

    it("returns the path of a frame whose file is a URL", ({ seat }) => {
      const path = join(tmpdir(), "caller.js");
      const call = runInThisContext("(read) => read()", {
        filename: pathToFileURL(path).href,
      }) as (read: () => unknown) => unknown;

      check.isEqualTo(
        seat,
        call(callSite),
        { file: path, line: 1 },
        "the site of the caller",
      );
    });

    it("passes over a frame without a line", ({ seat }) => {
      const [where] = [0].map(callSite);

      check.doesMatch(seat, where?.file, SPEC, "the caller of map is this spec");
    });

    it("passes over a frame of an installed package", ({ seat }) => {
      const call = runInThisContext("(read) => read()", {
        filename: join(tmpdir(), "node_modules", "runner", "index.js"),
      }) as (read: () => unknown) => { file?: string } | undefined;

      check.doesMatch(
        seat,
        call(callSite)?.file,
        SPEC,
        "the caller of the package is this spec",
      );
    });

    it("returns the caller below more frames of a package than the limit of V8", ({
      seat,
    }) => {
      const nest = runInThisContext(
        "(function nest(depth, read) { return depth === 0 ? read() : nest(depth - 1, read); })",
        { filename: join(tmpdir(), "node_modules", "runner", "deep.js") },
      ) as (depth: number, read: () => unknown) => { file?: string } | undefined;

      check.doesMatch(
        seat,
        nest(20, callSite)?.file,
        SPEC,
        "the caller of the package is this spec",
      );
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
      check.isEqualTo(recorder, 1, 2, "the values match");
      const where = recorder.failures[0]?.where;

      check.doesMatch(seat, where?.file, SPEC, "the failure names this spec");
      check.isTrue(seat, (where?.line ?? 0) > 0, "the failure names a line");
    });
  });

  describe("directoryOf", () => {
    it("returns the directory of the module that calls it", ({ seat }) => {
      check.isEqualTo(
        seat,
        directoryOf(),
        import.meta.dirname,
        "the directory of this spec",
      );
    });

    it("returns the directory of a caller whose file is a URL", ({ seat }) => {
      const call = runInThisContext("(read) => read()", {
        filename: pathToFileURL(join(tmpdir(), "module.js")).href,
      }) as (read: () => string) => string;

      check.isEqualTo(seat, call(directoryOf), tmpdir(), "the directory of the module");
    });

    it("returns the directory of the caller's file where a runner maps stacks", ({
      seat,
    }) => {
      const prepare = Error.prepareStackTrace;
      const mapped = () => "Error: mapped\n    at /elsewhere/src/module.ts:1:1";
      Error.prepareStackTrace = mapped;
      onTestFinished(() => {
        Error.prepareStackTrace = prepare;
      });

      check.isEqualTo(
        seat,
        [directoryOf(), Error.prepareStackTrace === mapped],
        [import.meta.dirname, true],
        "the directory of this spec, and the runner's mapping kept",
      );
    });

    it("returns the current directory for a caller whose frame has no file", ({
      seat,
    }) => {
      check.isEqualTo(seat, [0].map(directoryOf), ["."], "the current directory");
    });
  });

  describe("stackOf", () => {
    /** Sets the frame limit of V8 to limit until the test ends. */
    function limitFrames(limit: number): void {
      const before = Error.stackTraceLimit;
      Error.stackTraceLimit = limit;
      onTestFinished(() => {
        Error.stackTraceLimit = before;
      });
    }

    /** Returns the stack of stackOf below depth more frames. */
    function nested(depth: number): string {
      return depth === 0 ? stackOf("read the stack") : nested(depth - 1);
    }

    it("returns a stack of more frames than the limit of V8", ({ seat }) => {
      limitFrames(2);

      check.isTrue(
        seat,
        nested(20).split("\n").length > 20,
        "the stack has the frames of every call",
      );
    });

    it("restores the limit of V8", ({ seat }) => {
      limitFrames(2);
      stackOf("read the stack");

      check.isEqualTo(seat, Error.stackTraceLimit, 2, "the limit is the same");
    });

    it("returns the stack of an error of the message", ({ seat }) => {
      check.hasPrefix(
        seat,
        stackOf("read the stack"),
        "Error: read the stack\n",
        "the first line",
      );
    });
  });
});
