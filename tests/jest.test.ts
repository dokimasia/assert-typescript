// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the jest entry point, driven as a consumer's suite drives it.
 * It runs jest on the fixture suites in testdata/jest, which register the
 * matchers from the CommonJS build, and reads jest's report. The build
 * runs before this spec. It uses vitest's `expect` alone, because the
 * entry point delivers the verdicts of the standard's matchers to jest.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as check from "../src/check.js";
import { NAMES } from "../src/expect/matchers.js";
import * as api from "../src/jest/api.js";
import * as entry from "../src/jest.js";
import { Recorder } from "../src/seat.js";

vi.mock("@jest/globals", async () => {
  const { expect: jestExpect } = await import("expect");
  return { expect: jestExpect, afterEach: () => undefined };
});

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURES = join(import.meta.dirname, "testdata", "jest");

/** One test of jest's report. */
interface Result {
  readonly title: string;
  readonly status: string;
  readonly failureMessages: readonly string[];
}

/** The parts of jest's report that the spec reads. */
interface Report {
  readonly testResults: readonly {
    readonly name: string;
    readonly assertionResults: readonly Result[];
  }[];
}

/** The names that the fixture of the project names reads from jest's expect. */
interface Names {
  readonly chain: readonly string[];
  readonly expect: readonly string[];
}

const dir = mkdtempSync(join(tmpdir(), "dokimi-jest-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let report: Report = { testResults: [] };
let names: Names = { chain: [], expect: [] };
let shadow: Record<string, unknown>[] = [];

beforeAll(() => {
  const output = join(dir, "report.json");
  spawnSync(
    process.execPath,
    [
      join(ROOT, "node_modules", "jest", "bin", "jest.js"),
      "--config",
      join(FIXTURES, "jest.config.cjs"),
      "--json",
      "--outputFile",
      output,
      "--cacheDirectory",
      join(dir, "cache"),
      "--maxWorkers=2",
      "--no-watchman",
    ],
    {
      env: {
        ...process.env,
        DOKIMI_SHADOW_LOG: join(dir, "shadow.jsonl"),
        DOKIMI_NAMES_FILE: join(dir, "names.json"),
      },
      encoding: "utf8",
    },
  );
  report = JSON.parse(readFileSync(output, "utf8")) as Report;
  names = JSON.parse(readFileSync(join(dir, "names.json"), "utf8")) as Names;
  shadow = readFileSync(join(dir, "shadow.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}, 120_000);

/** Returns the result of the test title in the fixture file, which is under the directory of project. */
function resultOf(project: string, file: string, title: string): Result {
  const suite = report.testResults.find(
    (one) => one.name === join(FIXTURES, project, file),
  );
  const found = suite?.assertionResults.find((one) => one.title === title);
  if (found === undefined) {
    throw new Error(`jest reported no test ${title} of ${file}`);
  }
  return found;
}

/** Returns the line of the fixture file of project that contains text. */
function lineOf(project: string, file: string, text: string): number {
  const lines = readFileSync(join(FIXTURES, project, file), "utf8").split("\n");
  return lines.findIndex((line) => line.includes(text)) + 1;
}

/** Returns the sentence of the failure that a call of the function form reports. */
function sentenceOf(call: (seat: Recorder) => unknown): string {
  const seat = new Recorder();
  call(seat);
  return seat.message;
}

describe("jest", () => {
  it("exports register", () => {
    expect([Object.keys(entry), entry.register]).toEqual([["register"], api.register]);
  });

  describe("register", () => {
    describe("in the default mode", () => {
      const statuses = [
        ["passes a call that passes", "passed"],
        ["fails a call that fails", "failed"],
        ["fails a call under .not", "failed"],
        ["fails a call under resolves", "failed"],
        ["passes the count of expect.assertions", "passed"],
        ["fails with two soft failures, and runs the call after them", "failed"],
        ["fails with a thrown failure after a soft failure", "failed"],
        ["fails with an awaited soft failure, and runs on", "failed"],
        ["fails a soft call under .not", "failed"],
        [
          "passes the count of expect.assertions with two soft calls that pass",
          "passed",
        ],
        ["passes an awaited matcher that passes", "passed"],
        ["fails an awaited matcher that fails", "failed"],
        ["fails a matcher that is still running at the end", "failed"],
        ["passes the test after it", "passed"],
        ["passes an unawaited matcher that passed before the end", "passed"],
        ["passes an unawaited matcher in a concurrent test", "passed"],
      ] as const;
      for (const [title, status] of statuses) {
        it(`reports the fixture "${title}" as ${status}`, () => {
          expect(resultOf("allow", "matchers.fixture.cjs", title).status).toBe(status);
        });
      }

      it("fails a call with the sentence of the function form at the line of the call", () => {
        const [message] = resultOf(
          "allow",
          "matchers.fixture.cjs",
          "fails a call that fails",
        ).failureMessages;
        const line = lineOf("allow", "matchers.fixture.cjs", "// the failing call");

        expect(message).toContain(
          sentenceOf((seat) => check.isEqualTo(seat, 1, 2, "the values match")),
        );
        expect(message).toContain(`matchers.fixture.cjs:${line}:`);
      });

      it("refuses a call under .not with the negative to call", () => {
        expect(
          resultOf("allow", "matchers.fixture.cjs", "fails a call under .not")
            .failureMessages[0],
        ).toContain("isEqualTo does not take .not. Call isNotEqualTo instead.");
      });

      it("reports both failures of the soft calls", () => {
        const result = resultOf(
          "allow",
          "matchers.fixture.cjs",
          "fails with two soft failures, and runs the call after them",
        );

        expect(result.failureMessages).toEqual([
          expect.stringContaining("the first contract"),
          expect.stringContaining("the second contract"),
        ]);
      });

      it("reports the thrown failure before the soft failure", () => {
        const result = resultOf(
          "allow",
          "matchers.fixture.cjs",
          "fails with a thrown failure after a soft failure",
        );

        expect(result.failureMessages).toEqual([
          expect.stringContaining("the thrown contract"),
          expect.stringContaining("the soft contract"),
        ]);
      });

      it("reports the matcher that the test did not await", () => {
        expect(
          resultOf(
            "allow",
            "matchers.fixture.cjs",
            "fails a matcher that is still running at the end",
          ).failureMessages[0],
        ).toContain(
          "completesWithin was never awaited, so it asserted nothing. Add await to the call.",
        );
      });
    });

    describe("in shadow mode", () => {
      it("keeps the verdict of each call", () => {
        const results = report.testResults
          .filter((one) => one.name.endsWith("equality.fixture.cjs"))
          .flatMap((one) => one.assertionResults)
          .map((one) => [one.title, one.status]);

        expect(results.filter(([, status]) => status === "failed")).toEqual([
          ["fails a call that both fail", "failed"],
        ]);
        expect(results).toHaveLength(7);
      });

      it("logs each call whose verdict the standard's equality changes", () => {
        expect(shadow).toEqual([
          {
            test: "disagrees on a field that is undefined",
            file: join("tests", "testdata", "jest", "shadow", "equality.fixture.cjs"),
            line: lineOf("shadow", "equality.fixture.cjs", "toEqual({ b: 1 })"),
            matcher: "toEqual",
            jest: "pass",
            standard: "fail",
          },
          expect.objectContaining({
            test: "disagrees on negative zero",
            matcher: "not.toEqual",
            jest: "pass",
            standard: "fail",
          }),
          expect.objectContaining({
            test: "disagrees on NaN",
            matcher: "toEqual",
            jest: "pass",
            standard: "fail",
          }),
        ]);
      });
    });

    describe("in strict mode", () => {
      const refusals = [
        [
          "refuses toEqual",
          "toEqual is refused in strict mode. Call isEqualTo instead.",
        ],
        [
          "refuses toEqual under .not",
          "not.toEqual is refused in strict mode. Call isNotEqualTo instead.",
        ],
        [
          "refuses toEqual under resolves",
          "toEqual is refused in strict mode. Call isEqualTo instead.",
        ],
        [
          "refuses toHaveLength under .not",
          "not.toHaveLength is refused in strict mode, and the standard has no negative of hasLength.",
        ],
        [
          "refuses toThrow",
          "toThrow is refused in strict mode. Call doesThrow instead.",
        ],
      ] as const;
      for (const [title, message] of refusals) {
        it(`${title.replace(/^refuses/u, "fails the call of")} with the assertion to call`, () => {
          expect(
            resultOf("strict", "refusals.fixture.cjs", title).failureMessages[0],
          ).toContain(message);
        });
      }

      it("keeps the matchers that no assertion overlaps", () => {
        expect(
          ["keeps toBe", "keeps toMatchObject"].map(
            (title) => resultOf("strict", "refusals.fixture.cjs", title).status,
          ),
        ).toEqual(["passed", "passed"]);
      });

      it("refuses no matcher that the running jest does not define", () => {
        expect(
          resultOf(
            "strict",
            "refusals.fixture.cjs",
            "adds no toThrowError where jest defines none",
          ).status,
        ).toBe("passed");
      });
    });

    describe("on the names of jest", () => {
      it("reads the names of jest's chain and of jest's expect", () => {
        expect([
          names.chain.includes("toEqual"),
          names.expect.includes("extend"),
        ]).toEqual([true, true]);
      });

      it("adds a matcher under a name that jest does not define", () => {
        expect(
          [...NAMES, "soft"].filter(
            (name) => names.chain.includes(name) || names.expect.includes(name),
          ),
        ).toEqual([]);
      });
    });
  });
});
