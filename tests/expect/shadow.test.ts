/**
 * The spec of the comparison of shadow mode. It uses vitest's `expect`
 * alone, because the comparison decides which calls the log states.
 */

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { type Comparison, compare, open } from "../../src/expect/shadow.js";
import { temporary } from "../helpers.js";

/** A passing call of vitest's toEqual on equal values. */
const AGREES: Comparison = {
  runner: "vitest",
  test: "reply > succeeds",
  matcher: "toEqual",
  negated: false,
  received: { a: 1 },
  expected: { a: 1 },
  passed: true,
};

/** Returns the lines that the log at path contains, each parsed. */
function linesOf(path: string): Record<string, unknown>[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Returns an asymmetric matcher, as the runners shape one. */
function anything(): { asymmetricMatch: () => boolean } {
  return { asymmetricMatch: () => true };
}

describe("shadow", () => {
  describe("open", () => {
    it("creates the log", () => {
      const log = join(temporary(), "shadow.jsonl");
      open(log);

      expect(readFileSync(log, "utf8")).toBe("");
    });

    it("throws an error with the path of a log that cannot take lines", () => {
      const log = join(temporary(), "missing", "shadow.jsonl");

      expect(() => open(log)).toThrow(`register: shadow mode cannot append to ${log}`);
    });
  });

  describe("compare", () => {
    it("appends nothing for a call whose verdicts agree", () => {
      const log = join(temporary(), "shadow.jsonl");
      open(log);

      expect([compare(log, AGREES), linesOf(log)]).toEqual([false, []]);
    });

    it("appends the line of a call that the standard fails and the runner passes", () => {
      const log = join(temporary(), "shadow.jsonl");
      const differs = compare(log, {
        ...AGREES,
        received: { a: undefined, b: 1 },
        expected: { b: 1 },
      });

      expect(differs).toBe(true);
      expect(linesOf(log)).toEqual([
        {
          test: "reply > succeeds",
          file: relative(process.cwd(), import.meta.filename),
          line: expect.any(Number),
          matcher: "toEqual",
          vitest: "pass",
          standard: "fail",
        },
      ]);
    });

    it("names a call under .not and the runner of the call", () => {
      const log = join(temporary(), "shadow.jsonl");
      compare(log, {
        ...AGREES,
        runner: "jest",
        matcher: "toStrictEqual",
        negated: true,
        received: -0,
        expected: 0,
      });

      expect(linesOf(log)).toEqual([
        expect.objectContaining({
          matcher: "not.toStrictEqual",
          jest: "pass",
          standard: "fail",
        }),
      ]);
    });

    it("states no call site for a call that no frame of a caller makes", async () => {
      const log = join(temporary(), "shadow.jsonl");
      queueMicrotask(compare.bind(null, log, { ...AGREES, passed: false }));
      await new Promise((resolve) => setImmediate(resolve));

      expect(linesOf(log)).toEqual([
        expect.objectContaining({ file: null, line: null }),
      ]);
    });

    it("appends the line of a call that the standard passes and the runner fails", () => {
      const log = join(temporary(), "shadow.jsonl");
      compare(log, { ...AGREES, passed: false });

      expect(linesOf(log)).toEqual([
        expect.objectContaining({ vitest: "fail", standard: "pass" }),
      ]);
    });

    {
      const tests = [
        { name: "an asymmetric matcher as the expected value", give: anything() },
        { name: "an asymmetric matcher inside an array", give: [1, anything()] },
        {
          name: "an asymmetric matcher as a value of a map",
          give: new Map([["a", anything()]]),
        },
        {
          name: "an asymmetric matcher as a key of a map",
          give: new Map([[anything(), 1]]),
        },
        { name: "an asymmetric matcher inside a set", give: new Set([anything()]) },
      ];
      for (const tt of tests) {
        it(`skips a call with ${tt.name}`, () => {
          const log = join(temporary(), "shadow.jsonl");
          open(log);

          expect(compare(log, { ...AGREES, expected: tt.give, passed: false })).toBe(
            false,
          );
        });
      }
    }

    it("skips a call whose received value contains an asymmetric matcher", () => {
      const log = join(temporary(), "shadow.jsonl");
      open(log);

      expect(
        compare(log, { ...AGREES, received: { a: anything() }, passed: false }),
      ).toBe(false);
    });

    it("compares a value that contains itself", () => {
      const log = join(temporary(), "shadow.jsonl");
      const cycle: Record<string, unknown> = {};
      cycle["self"] = cycle;

      expect(compare(log, { ...AGREES, received: cycle, expected: cycle })).toBe(false);
    });

    it("compares a value deeper than the depth of the standard's equality", () => {
      const log = join(temporary(), "shadow.jsonl");
      let deep: unknown = anything();
      for (let level = 0; level < 102; level += 1) deep = [deep];

      expect(compare(log, { ...AGREES, received: deep, expected: deep })).toBe(false);
    });
  });
});
