/** The spec of the call record of one assertion call. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { check } from "../../src/index.js";
import { DEFINITION, encodeCall } from "../../src/record/call.js";
import { test as it } from "../../src/vitest.js";

describe("call", () => {
  describe("DEFINITION", () => {
    it("contains the version of the vendored definition", ({ seat }) => {
      const vendored = readFileSync(
        join(import.meta.dirname, "../../src/conformance/spec/VERSION"),
        "utf8",
      );

      check.equal(
        seat,
        DEFINITION,
        vendored.trim(),
        "the records state the vendored version",
      );
    });
  });

  describe("encodeCall", () => {
    it("writes the fields of a record in the order of the definition", ({ seat }) => {
      const line = encodeCall(
        {
          assertion: "equal",
          contract: "the count is right",
          verdict: "fail",
          aborting: false,
          where: { file: "store.test.ts", line: 42 },
          detail: { want: { type: "int", value: 2 } },
        },
        { seq: 3, parent: 1, run: 2, phase: "random" },
      );

      check.equal(
        seat,
        line,
        `{"definition":"${DEFINITION}","seq":3,"parent":1,"run":2,"phase":"random",` +
          '"assertion":"equal","contract":"the count is right","verdict":"fail","aborting":false,' +
          '"where":{"file":"store.test.ts","line":42},"detail":{"want":{"type":"int","value":2}}}',
        "the line of the record",
      );
    });

    it("writes the base name of the file of the call site", ({ seat }) => {
      const line = encodeCall(
        {
          assertion: "true",
          contract: "the flag is set",
          verdict: "pass",
          aborting: true,
          where: { file: "/a/b/store.test.ts", line: 42 },
        },
        { seq: 1 },
      );

      check.contains(
        seat,
        line,
        '"where":{"file":"store.test.ts","line":42}',
        "the base name",
      );
    });

    it("leaves out each field that the call or the place does not state", ({
      seat,
    }) => {
      const line = encodeCall(
        {
          assertion: "true",
          contract: "the flag is set",
          verdict: "pass",
          aborting: true,
        },
        { seq: 1 },
      );

      check.equal(
        seat,
        line,
        `{"definition":"${DEFINITION}","seq":1,"assertion":"true","contract":"the flag is set","verdict":"pass","aborting":true}`,
        "the line states the present fields alone",
      );
    });

    it("writes the error of a call of the verdict error", ({ seat }) => {
      const line = encodeCall(
        {
          assertion: "matches",
          contract: "the id is well formed",
          verdict: "error",
          aborting: false,
          error: "the pattern broke",
        },
        { seq: 1 },
      );

      check.hasSuffix(
        seat,
        line,
        ',"error":"the pattern broke"}',
        "the error is the last field",
      );
    });
  });
});
