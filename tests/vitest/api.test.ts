// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the vitest adapter, driven as a consumer's suite drives it.
 * It uses vitest's own matchers alone, because the adapter delivers the
 * verdicts of the standard's matchers to vitest. A case that registers
 * the matchers restores vitest's matchers when it ends.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, chai, describe, expect, onTestFinished } from "vitest";
import { writeRecord } from "../../src/artifact.js";
import * as check from "../../src/check.js";
import { NAMES } from "../../src/expect/matchers.js";
import type { Failure } from "../../src/failure.js";
import { takesSkips } from "../../src/matcher/seat.js";
import { Collector, Recorder } from "../../src/seat.js";
import * as soft from "../../src/soft.js";
import { test as it, RECORDS, register } from "../../src/vitest/api.js";
import { setRecording, temporary } from "../helpers.js";

/** The end of the path of this spec, with either separator. */
const SPEC = /[/\\]tests[/\\]vitest[/\\]api\.test\.ts$/u;

/** Returns the names of the members of target and of its prototypes. */
function membersOf(target: object): string[] {
  const names: string[] = [];
  for (let at: object | null = target; at !== null; at = Object.getPrototypeOf(at)) {
    names.push(...Object.getOwnPropertyNames(at));
  }
  return names;
}

/** The members of chai's assertion chain, before a call of register in this worker. */
const CHAIN = membersOf(chai.Assertion.prototype);

/** The own properties of expect and of expect.not, before a call of register in this worker. */
const EXPECT = [
  ...Object.getOwnPropertyNames(expect),
  ...Object.getOwnPropertyNames(expect.not),
];

/** Returns the objects that a call of register changes. */
function registries(): object[] {
  const global = globalThis as Record<PropertyKey, unknown>;
  return [
    chai.Assertion.prototype,
    expect,
    expect.not,
    (global[Symbol.for("$$jest-matchers-object")] as { readonly matchers: object })
      .matchers,
    global[Symbol.for("asymmetric-matchers-object")] as object,
  ];
}

/** Returns the function that restores the objects that register changes to their state now. */
function snapshot(): () => void {
  const kept = registries().map(
    (target) => [target, Object.getOwnPropertyDescriptors(target)] as const,
  );
  return () => {
    for (const [target, descriptors] of kept) {
      for (const key of Reflect.ownKeys(target)) {
        if (!(key in descriptors)) {
          delete (target as Record<PropertyKey, unknown>)[key];
        }
      }
      Object.defineProperties(target, descriptors);
    }
  };
}

/** Restores the objects that register changes when the test ends. */
function pristine(): void {
  onTestFinished(snapshot());
}

/** Returns the message of what fn throws, or the empty string. */
function thrownBy(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return (err as Error).message;
  }
  return "";
}

/** Returns what fn throws. */
function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

/** Returns the sentence of the failure that a call of the function form reports. */
function sentenceOf(call: (seat: Recorder) => unknown): string {
  const seat = new Recorder();
  call(seat);
  return seat.message;
}

/** The messages of the errors of each test that keeps them, in the order of the tests. */
const ERRORS: string[][] = [];

/** Keeps the messages of the errors of the test when it ends, after every hook that the test adds later. */
function keepErrors(): void {
  onTestFinished(({ task }) => {
    ERRORS.push((task.result?.errors ?? []).map((err) => String(err.message)));
  });
}

describe("api", () => {
  describe("register", () => {
    it("adds a matcher under a name that vitest does not define", () => {
      expect([CHAIN.includes("toEqual"), EXPECT.includes("soft")]).toEqual([
        true,
        true,
      ]);
      expect(
        NAMES.filter((name) => CHAIN.includes(name) || EXPECT.includes(name)),
      ).toEqual([]);
    });

    it("adds a matcher for each assertion to the chain", () => {
      pristine();
      register();
      const chain = expect(1) as unknown as Record<string, unknown>;

      expect(NAMES.filter((name) => typeof chain[name] !== "function")).toEqual([]);
    });

    it("fails a call with the sentence of the function form", () => {
      pristine();
      register();

      expect(thrownBy(() => expect(1).isEqualTo(2, "the values match"))).toBe(
        sentenceOf((seat) => check.isEqualTo(seat, 1, 2, "the values match")),
      );
    });

    it("states the got and the want of a failure as the actual and the expected", () => {
      pristine();
      register();
      const err = caught(() => expect(1).isEqualTo(2, "the values match")) as {
        actual?: unknown;
        expected?: unknown;
      };

      expect([err.actual, err.expected]).toEqual([1, 2]);
    });

    it("hands a reporter the failure record at the line of the call in the test", () => {
      pristine();
      register();
      const err = caught(() =>
        expect([1]).hasLength(2, "every item comes back"),
      ) as Record<string, { meta?: { failure?: Failure } } | undefined>;
      const failure = err["__vitest_error_context__"]?.meta?.failure;

      expect([failure?.assertion, failure?.where?.file]).toEqual([
        "length",
        expect.stringMatching(SPEC),
      ]);
    });

    it("refuses a call under .not with the negative to call", () => {
      pristine();
      register();

      expect(thrownBy(() => expect(1).not.isEqualTo(2, "the values differ"))).toBe(
        "isEqualTo does not take .not. Call isNotEqualTo instead.",
      );
    });

    it("applies a matcher to the value that a promise resolves to", async () => {
      pristine();
      register();

      await expect(
        expect(Promise.resolve(1)).resolves.isEqualTo(2, "the reply is two"),
      ).rejects.toThrow("the reply is two: want 2, got 1");
    });

    it("registers the matchers again on a second call with the same mode", () => {
      pristine();
      register();
      register();

      expect(thrownBy(() => expect(true).isTrue("the flag is set"))).toBe("");
    });

    it("throws for a call with another mode than an earlier call chose", () => {
      pristine();
      register();

      expect(thrownBy(() => register({ mode: "strict" }))).toBe(
        "register: an earlier call in this worker chose the mode allow, and this call chooses strict",
      );
    });

    it("throws for an assertion name that a chai plugin defines", () => {
      pristine();
      Object.defineProperty(chai.Assertion.prototype, "isTrue", {
        get: () => undefined,
        configurable: true,
      });

      expect(thrownBy(() => register())).toBe(
        "register: chai's Assertion already has a property named isTrue, which a plugin defines",
      );
    });

    it("throws for a log that shadow mode cannot append to", () => {
      pristine();
      const log = join(temporary(), "missing", "shadow.jsonl");

      expect(thrownBy(() => register({ mode: "shadow", log }))).toBe(
        `register: shadow mode cannot append to ${log}`,
      );
    });

    describe("with expect.soft", () => {
      const ran: string[] = [];

      it.fails("records each failure, and runs the calls after it", () => {
        pristine();
        keepErrors();
        register();
        expect.soft(1).isEqualTo(2, "the first contract");
        expect.soft([1]).hasLength(2, "the second contract");
        ran.push("after");
      });

      it("reports each failure that the soft calls recorded", () => {
        expect([ERRORS.shift(), ran]).toEqual([
          [
            sentenceOf((seat) => check.isEqualTo(seat, 1, 2, "the first contract")),
            sentenceOf((seat) => check.hasLength(seat, [1], 2, "the second contract")),
          ],
          ["after"],
        ]);
      });
    });

    describe("with an asynchronous matcher", () => {
      it("passes a test that awaits a matcher that passes", async () => {
        pristine();
        register();

        await expect(() => Promise.reject(new Error("refused"))).rejectsWith(
          "the call is refused",
        );
      });

      it.fails("fails a test that ends before the matcher settles", () => {
        pristine();
        keepErrors();
        register();
        void expect(
          () => new Promise<void>((resolve) => setTimeout(resolve, 20)),
        ).completesWithin(1000, "the work ends in time");
      });

      it("reports the matcher that the test did not await", () => {
        expect(ERRORS.shift()).toEqual([
          "completesWithin was never awaited, so it asserted nothing. Add await to the call.",
        ]);
      });

      it.fails("fails a test whose matcher failed while the test did not await it", async () => {
        pristine();
        keepErrors();
        register();
        expect(() => Promise.resolve(1))
          .rejectsWith("the call is refused")
          .catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      it("reports the failure that the test did not await", () => {
        expect(ERRORS.shift()).toEqual([
          "rejectsWith failed, and the test did not await it. Add await to the call.",
        ]);
      });

      it.fails("fails a test whose second matcher is still running at the end", async () => {
        pristine();
        keepErrors();
        register();
        await expect(() => Promise.reject(new Error("refused"))).rejectsWith(
          "the first call is refused",
        );
        void expect(
          () => new Promise<void>((resolve) => setTimeout(resolve, 20)),
        ).completesWithin(1000, "the work ends in time");
      });

      it("reports the second matcher that the test did not await", () => {
        expect(ERRORS.shift()).toEqual([
          "completesWithin was never awaited, so it asserted nothing. Add await to the call.",
        ]);
      });

      it("starts no guard for a call in a finished hook of the test", () => {
        pristine();
        register();
        const refused = (): Promise<never> => Promise.reject(new Error("refused"));
        onTestFinished(async () => {
          await expect(refused).rejectsWith("the call of the hook is refused");
        });
      });

      describe("outside a test", () => {
        // vitest collects this block before any test runs, so these calls
        // are made by no test, and the matchers are restored before the
        // tests run.
        const dir = mkdtempSync(join(tmpdir(), "dokimi-outside-"));
        afterAll(() => rmSync(dir, { recursive: true, force: true }));
        const log = join(dir, "shadow.jsonl");
        const restore = snapshot();
        register({ mode: "shadow", log });
        expect({ a: undefined, b: 1 }).toEqual({ b: 1 });
        const settled = expect(() => Promise.reject(new Error("refused")))
          .rejectsWith("the call outside a test is refused")
          .then(() => "settled");
        restore();

        it("starts no guard for a call that no test makes", async () => {
          expect(await settled).toBe("settled");
        });

        it("logs a call of shadow mode that no test makes under the empty name", () => {
          expect((JSON.parse(readFileSync(log, "utf8")) as { test: string }).test).toBe(
            "",
          );
        });
      });
    });

    describe("in shadow mode", () => {
      const dir = mkdtempSync(join(tmpdir(), "dokimi-shadow-"));
      afterAll(() => rmSync(dir, { recursive: true, force: true }));
      const log = join(dir, "shadow.jsonl");

      it("logs a call of toEqual that vitest passes and the standard fails", () => {
        pristine();
        register({ mode: "shadow", log });
        expect({ a: undefined, b: 1 }).toEqual({ b: 1 });
        expect([1]).toEqual([1]);
      });

      it("keeps the verdict of a call that vitest fails", () => {
        pristine();
        register({ mode: "shadow", log });

        expect(thrownBy(() => expect(-0).toEqual(0))).not.toBe("");
      });

      it.fails("logs a soft call that vitest fails", () => {
        pristine();
        register({ mode: "shadow", log });
        expect.soft(-0).toStrictEqual(0);
      });

      it("states the test, the call site and both verdicts of each logged call", () => {
        const lines = readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as Record<string, unknown>);

        expect(lines).toEqual([
          {
            test: "api > register > in shadow mode > logs a call of toEqual that vitest passes and the standard fails",
            file: join("tests", "vitest", "api.test.ts"),
            line: expect.any(Number),
            matcher: "toEqual",
            vitest: "pass",
            standard: "fail",
          },
          expect.objectContaining({
            matcher: "toEqual",
            vitest: "fail",
            standard: "pass",
          }),
          expect.objectContaining({
            matcher: "toStrictEqual",
            vitest: "fail",
            standard: "pass",
          }),
        ]);
      });
    });

    describe("in strict mode", () => {
      it("refuses toEqual with the assertion to call", () => {
        pristine();
        register({ mode: "strict" });

        expect(thrownBy(() => expect(1).toEqual(1))).toBe(
          "toEqual is refused in strict mode. Call isEqualTo instead.",
        );
      });

      it("refuses toThrow under .not with the negative to call", () => {
        pristine();
        register({ mode: "strict" });
        const quiet = (): undefined => undefined;

        expect(thrownBy(() => expect(quiet).not.toThrow())).toBe(
          "not.toThrow is refused in strict mode. Call doesNotThrow instead.",
        );
      });

      it("keeps the matchers that no assertion overlaps", () => {
        pristine();
        register({ mode: "strict" });

        expect(thrownBy(() => expect(1).toBe(1))).toBe("");
      });
    });
  });

  describe("RECORDS", () => {
    it("contains the key dokimi.assert", () => {
      expect(RECORDS).toBe("dokimi.assert");
    });
  });

  describe("test", () => {
    it("supplies a Collector as the seat", ({ seat }) => {
      expect(seat).toBeInstanceOf(Collector);
    });

    it("supplies a seat whose signal is the signal of the context", ({
      seat,
      signal,
    }) => {
      expect(seat.signal).toBe(signal);
    });

    it("supplies a seat that collects nothing of a passing assertion", ({ seat }) => {
      check.isNotNil(seat, {}, "it exists");
      soft.doesContain(seat, [1, 2], 1, "it is there");

      expect(seat.collected).toEqual([]);
    });

    it.fails("reports the failures that the seat collected when the body ends", ({
      seat,
    }) => {
      soft.isEqualTo(seat, 1, 2, "the first contract");
    });

    describe("with cleanups", () => {
      const ran: string[] = [];

      it("registers cleanups on the seat", ({ seat }) => {
        seat.cleanup(() => {
          ran.push("first");
        });
        seat.cleanup(() => {
          ran.push("second");
        });

        expect(ran).toEqual([]);
      });

      it("runs the cleanups of a test after its body, the last registered first", () => {
        expect(ran.splice(0)).toEqual(["second", "first"]);
      });

      it.fails("registers a cleanup in a test that fails", ({ seat }) => {
        seat.cleanup(() => {
          ran.push("after a failure");
        });
        check.isTrue(seat, false, "the test fails");
      });

      it("runs the cleanups of a test that failed", () => {
        expect(ran.splice(0)).toEqual(["after a failure"]);
      });

      it.fails("fails a test whose cleanup throws", ({ seat }) => {
        seat.cleanup(() => {
          throw new Error("the directory is busy");
        });
      });

      it.fails("fails a test whose cleanup rejects", ({ seat }) => {
        seat.cleanup(() => Promise.reject(new Error("the socket is busy")));
      });
    });

    describe("with a skip", () => {
      it("skips the test through the seat", ({ seat }) => {
        if (takesSkips(seat)) {
          seat.skip("the environment lacks a capability");
        }
      });

      it("ends the test that the seat skipped as skipped with the reason", ({
        task,
      }) => {
        const result = task.suite?.tasks[0]?.result;
        const note = result !== undefined && "note" in result ? result.note : undefined;

        expect([result?.state, note]).toEqual([
          "skip",
          "the environment lacks a capability",
        ]);
      });
    });

    it("writes no call record into the task meta with recording off", ({
      seat,
      task,
    }) => {
      check.isTrue(seat, true, "the flag is set");

      expect(task.meta).not.toHaveProperty(RECORDS);
    });

    it("writes each record of another kind into the task meta with recording off", ({
      seat,
      task,
    }) => {
      writeRecord(seat, "dokimi.suite", '{"seed":"7"}');
      writeRecord(seat, "dokimi.suite", '{"seed":"8"}');

      expect((task.meta as Record<string, unknown>)["dokimi.suite"]).toEqual([
        { seed: "7" },
        { seed: "8" },
      ]);
    });

    describe("with recording on", () => {
      let restore: () => void = () => undefined;
      beforeAll(() => {
        restore = setRecording("1");
      });
      afterAll(() => restore());

      it("writes the call record of each call into the task meta in call order", ({
        seat,
        task,
      }) => {
        check.isTrue(seat, true, "the first is true");
        soft.isEqualTo(seat, 1, 2, "the second fails");
        const records = (task.meta as Record<string, unknown>)[RECORDS] as Record<
          string,
          unknown
        >[];

        expect(
          records.map((r) => [r["seq"], r["assertion"], r["verdict"], r["aborting"]]),
        ).toEqual([
          [1, "true", "pass", true],
          [2, "equal", "fail", false],
        ]);
        expect(records[1]?.["detail"]).toEqual({
          want: { type: "int", value: 2 },
          got: { type: "int", value: 1 },
        });
        // The flush clears the recorded failure, which the fixture would
        // otherwise report when the body ends.
        expect(() => seat.flush()).toThrow("the second fails");
      });
    });
  });
});
