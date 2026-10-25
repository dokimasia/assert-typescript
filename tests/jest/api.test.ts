// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the jest adapter, on jest's `expect` in a vitest worker. A
 * mock of `@jest/globals` hands the adapter that `expect`, and keeps each
 * hook that the adapter adds after a test. A case that registers the
 * matchers restores jest's matchers when it ends. It uses vitest's
 * `expect` alone, because the adapter delivers the verdicts of the
 * standard's matchers to jest.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect as jest } from "expect";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import * as check from "../../src/check.js";
import { NAMES } from "../../src/expect/matchers.js";
import type { Failure } from "../../src/failure.js";
import { register } from "../../src/jest/api.js";
import { Recorder } from "../../src/seat.js";
import { temporary } from "../helpers.js";

/** The hooks that the adapter adds after each test, in the order of their addition. */
const HOOKS = vi.hoisted(() => [] as (() => void)[]);

vi.mock("@jest/globals", async () => {
  const { expect: jestExpect } = await import("expect");
  return { expect: jestExpect, afterEach: (hook: () => void) => HOOKS.push(hook) };
});

/** The symbol under which jest keeps its registry of matchers on the global object. */
const REGISTRY = Symbol.for("$$jest-matchers-object");

/** Returns jest's registry of matchers. */
function registry(): Record<string, unknown> {
  return (
    (globalThis as Record<PropertyKey, unknown>)[REGISTRY] as {
      readonly matchers: Record<string, unknown>;
    }
  ).matchers;
}

/** Restores jest's matchers, its expect and the hooks of the adapter to their state now, when the test ends. */
function pristine(): void {
  const kept = [jest, jest.not, registry()].map(
    (target) => [target, Object.getOwnPropertyDescriptors(target)] as const,
  );
  const hooks = HOOKS.length;
  jest.setState({ suppressedErrors: [] });
  onTestFinished(() => {
    HOOKS.splice(hooks);
    for (const [target, descriptors] of kept) {
      for (const key of Reflect.ownKeys(target)) {
        if (!(key in descriptors)) {
          delete (target as Record<PropertyKey, unknown>)[key];
        }
      }
      Object.defineProperties(target, descriptors);
    }
  });
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

/** Returns the message of what fn throws, or the empty string. */
function thrownBy(fn: () => unknown): string {
  return (caught(fn) as Error | undefined)?.message ?? "";
}

/** Returns the sentence of the failure that a call of the function form reports. */
function sentenceOf(call: (seat: Recorder) => unknown): string {
  const seat = new Recorder();
  call(seat);
  return seat.message;
}

/** Returns the messages of the errors that the soft calls of the test kept. */
function suppressed(): string[] {
  return jest.getState().suppressedErrors.map((err) => err.message);
}

describe("api", () => {
  describe("register", () => {
    it("adds a matcher for each assertion to the chain", () => {
      pristine();
      register();
      const chain = jest(1) as unknown as Record<string, unknown>;

      expect(NAMES.filter((name) => typeof chain[name] !== "function")).toEqual([]);
    });

    it("fails a call with the sentence of the function form", () => {
      pristine();
      register();

      expect(thrownBy(() => jest(1).isEqualTo(2, "the values match"))).toBe(
        sentenceOf((seat) => check.isEqualTo(seat, 1, 2, "the values match")),
      );
    });

    it("hands a reporter the failure record and both values in the result of the matcher", () => {
      pristine();
      register();
      const err = caught(() => jest(1).isEqualTo(2, "the values match")) as {
        matcherResult?: {
          actual?: unknown;
          expected?: unknown;
          meta?: { failure?: Failure };
        };
      };
      const result = err.matcherResult;

      expect([
        result?.actual,
        result?.expected,
        result?.meta?.failure?.assertion,
      ]).toEqual([1, 2, "equal"]);
    });

    it("refuses a call under .not with the negative to call", () => {
      pristine();
      register();

      expect(thrownBy(() => jest(1).not.isEqualTo(2, "the values differ"))).toBe(
        "isEqualTo does not take .not. Call isNotEqualTo instead.",
      );
    });

    it("applies a matcher to the value that a promise resolves to", async () => {
      pristine();
      register();

      await expect(
        jest(Promise.resolve(1)).resolves.isEqualTo(2, "the reply is two"),
      ).rejects.toThrow("the reply is two: want 2, got 1");
    });

    it("registers the matchers again on a second call with the same mode", () => {
      pristine();
      register();
      register();

      expect([
        thrownBy(() => jest(true).isTrue("the flag is set")),
        HOOKS.length,
      ]).toEqual(["", 1]);
    });

    it("throws for a call with another mode than an earlier call chose", () => {
      pristine();
      register();

      expect(thrownBy(() => register({ mode: "strict" }))).toBe(
        "register: an earlier call in this test file chose the mode allow, and this call chooses strict",
      );
    });

    it("throws for an assertion name that jest's expect already has", () => {
      pristine();
      jest.extend({ isTrue: () => ({ pass: true, message: () => "" }) });

      expect(thrownBy(() => register())).toBe(
        "register: jest's expect already has a matcher named isTrue",
      );
    });

    it("throws for a property named soft that jest's expect already has", () => {
      pristine();
      Object.defineProperty(jest, "soft", {
        value: () => undefined,
        configurable: true,
      });

      expect(thrownBy(() => register())).toBe(
        "register: jest's expect already has a property named soft",
      );
    });

    it("throws for a log that shadow mode cannot append to", () => {
      pristine();
      const log = join(temporary(), "missing", "shadow.jsonl");

      expect(thrownBy(() => register({ mode: "shadow", log }))).toBe(
        `register: shadow mode cannot append to ${log}`,
      );
    });

    it("throws in shadow mode for a global object without jest's registry", () => {
      pristine();
      const held = Object.getOwnPropertyDescriptor(
        globalThis,
        REGISTRY,
      ) as PropertyDescriptor;
      delete (globalThis as Record<PropertyKey, unknown>)[REGISTRY];
      onTestFinished(() => {
        Object.defineProperty(globalThis, REGISTRY, held);
      });
      const log = join(temporary(), "shadow.jsonl");

      expect(thrownBy(() => register({ mode: "shadow", log }))).toBe(
        "register: shadow mode cannot read jest's registry of matchers",
      );
    });

    it("throws in shadow mode for a registry without toStrictEqual", () => {
      pristine();
      Reflect.deleteProperty(registry(), "toStrictEqual");
      const log = join(temporary(), "shadow.jsonl");

      expect(thrownBy(() => register({ mode: "shadow", log }))).toBe(
        "register: shadow mode cannot read jest's toStrictEqual from its registry",
      );
    });

    describe("with expect.soft", () => {
      it("records the failure of a matcher, and returns", () => {
        pristine();
        register();
        jest.soft(1).isEqualTo(2, "the first contract");
        jest.soft([1]).not.toContain(1);

        expect(suppressed()).toEqual([
          sentenceOf((seat) => check.isEqualTo(seat, 1, 2, "the first contract")),
          expect.stringContaining("not.toContain"),
        ]);
      });

      it("records the failure of a matcher under resolves", async () => {
        pristine();
        register();
        await jest.soft(Promise.resolve(1)).resolves.isEqualTo(2, "the reply is two");

        expect(suppressed()).toEqual(["the reply is two: want 2, got 1"]);
      });

      it("returns a property of the chain that is no matcher", () => {
        pristine();
        register();

        expect(
          (jest.soft(1) as unknown as Record<string, unknown>)["then"],
        ).toBeUndefined();
      });

      it("returns what a passing matcher returns", () => {
        pristine();
        register();

        expect([jest.soft(1).isEqualTo(1, "the values match"), suppressed()]).toEqual([
          undefined,
          [],
        ]);
      });

      it("throws an error that no matcher reported", () => {
        pristine();
        register();

        expect(thrownBy(() => jest.soft(1).toHaveBeenCalled())).toContain(
          "value must be a mock or spy function",
        );
      });

      it("throws a rejection that no matcher reported", async () => {
        pristine();
        register();

        await expect(
          jest.soft(Promise.resolve(1)).resolves.toHaveBeenCalled(),
        ).rejects.toThrow("value must be a mock or spy function");
      });
    });

    describe("with an asynchronous matcher", () => {
      it("passes a test that awaits a matcher that passes", async () => {
        pristine();
        register();
        await jest(() => Promise.reject(new Error("refused"))).rejectsWith(
          "the call is refused",
        );

        expect(thrownBy(() => HOOKS.at(-1)?.())).toBe("");
      });

      it("fails the test that ended before the matcher settled", async () => {
        pristine();
        register();
        const pending = jest(
          () => new Promise<void>((resolve) => setTimeout(resolve, 20)),
        ).completesWithin(1000, "the work ends in time");

        expect(thrownBy(() => HOOKS.at(-1)?.())).toBe(
          "completesWithin was never awaited, so it asserted nothing. Add await to the call.",
        );
        await pending;
      });

      it("starts no guard for a call that no test makes", async () => {
        pristine();
        register();
        const state = jest.getState();
        const name = state.currentTestName;
        Object.assign(state, { currentTestName: undefined });
        const pending = jest(
          () => new Promise<void>((resolve) => setTimeout(resolve, 20)),
        ).completesWithin(1000, "the work ends in time");
        Object.assign(state, { currentTestName: name });

        expect(thrownBy(() => HOOKS.at(-1)?.())).toBe("");
        await pending;
      });
    });

    describe("in shadow mode", () => {
      it("logs a call of toEqual that jest passes and the standard fails", () => {
        pristine();
        const log = join(temporary(), "shadow.jsonl");
        register({ mode: "shadow", log });
        jest({ a: undefined, b: 1 }).toEqual({ b: 1 });
        jest([1]).toEqual([1]);

        expect(JSON.parse(readFileSync(log, "utf8"))).toEqual({
          test: expect.stringContaining("logs a call of toEqual"),
          file: join("tests", "jest", "api.test.ts"),
          line: expect.any(Number),
          matcher: "toEqual",
          jest: "pass",
          standard: "fail",
        });
      });

      it("logs a call that no test makes under the empty name", () => {
        pristine();
        const log = join(temporary(), "shadow.jsonl");
        register({ mode: "shadow", log });
        const state = jest.getState();
        const name = state.currentTestName;
        Object.assign(state, { currentTestName: undefined });
        jest({ a: undefined, b: 1 }).toEqual({ b: 1 });
        Object.assign(state, { currentTestName: name });

        expect((JSON.parse(readFileSync(log, "utf8")) as { test: string }).test).toBe(
          "",
        );
      });

      it("keeps the verdict and the message of a call under .not", () => {
        pristine();
        const log = join(temporary(), "shadow.jsonl");
        register({ mode: "shadow", log });

        expect(thrownBy(() => jest(-0).not.toStrictEqual(-0))).toContain(
          "not.toStrictEqual",
        );
        expect(readFileSync(log, "utf8")).toBe("");
      });
    });

    describe("in strict mode", () => {
      it("refuses toEqual with the assertion to call", () => {
        pristine();
        register({ mode: "strict" });

        expect(thrownBy(() => jest(1).toEqual(1))).toBe(
          "toEqual is refused in strict mode. Call isEqualTo instead.",
        );
      });

      it("refuses only the overlapping matchers that the running jest defines", () => {
        pristine();
        // jest 30 defines no toThrowError, which vitest adds to the registry
        // that it shares with jest's expect in this worker.
        Reflect.deleteProperty(registry(), "toThrowError");
        register({ mode: "strict" });

        expect(["toThrow" in jest(1), "toThrowError" in jest(1)]).toEqual([
          true,
          false,
        ]);
      });

      it("keeps the matchers that no assertion overlaps", () => {
        pristine();
        register({ mode: "strict" });

        expect(thrownBy(() => jest(1).toBe(1))).toBe("");
      });
    });
  });
});
