// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The vitest adapter: the standard's assertions on vitest's `expect`, and
 * a seat supplied per test.
 *
 * {@link register} adds a matcher for each assertion to vitest's `expect`
 * through `expect.extend`, so vitest's `expect.soft`, `resolves` and
 * reporters apply to them. It also applies a mode to the vitest matchers
 * that check what a standard assertion checks. An asynchronous matcher
 * that a test does not await fails the test when the test ends.
 *
 * {@link test} is a vitest `test` whose context has a seat for the
 * function form. The recording surface needs a place to report at the end
 * of the test, so that a failing assertion is seen without stopping the
 * ones after it. The fixture creates a {@link Collector} and flushes it
 * once the body is done, which fails the test with every failure that the
 * body recorded. Before the flush, the fixture runs the functions that the
 * test registered through the seat's `cleanup`, such as the removal of a
 * workspace, also after a test that failed.
 *
 * The collector's signal is the test's own, which vitest aborts when the
 * test times out and when the run is cancelled. With
 * `DOKIMI_ASSERT_RECORD=1`, the collector writes the call record of every
 * call into the array under the key `dokimi.assert` of the test's task
 * meta, one record per element, which vitest's JSON reporter writes for
 * each test. The reporter writes the report with `JSON.stringify`, which
 * writes a float's -0 as 0. writeRecord writes each record of another kind
 * into the array under its kind of the same meta, and it ignores
 * `DOKIMI_ASSERT_RECORD`.
 */

import { relative, sep } from "node:path";
import process from "node:process";
import { test as base, chai, expect } from "vitest";
import { attach, CALL_KIND } from "../artifact.js";
import { type Call, Pending } from "../expect/guard.js";
import { matchers, NAMES, type State } from "../expect/matchers.js";
import { compare, open } from "../expect/shadow.js";
import { refusal, STRICT } from "../expect/strict.js";
import type { Overlap } from "../expect/types.js";
import { nameTest } from "../matcher/seat.js";
import { own, write } from "../record/calls.js";
import { reading } from "../record/switch.js";
import { Collector, cleanUp, Recorder } from "../seat.js";

/** A task of vitest: its title, and the suite that contains it. */
interface Task {
  readonly name: string;
  readonly suite?: Task | undefined;
}

/** A test of vitest, as the state of a matcher names it. */
interface Test {
  readonly result?: { readonly state?: string; readonly errors?: readonly unknown[] };
  readonly context: {
    readonly onTestFinished: (handler: () => void) => void;
  };
}

/** The property of chai's `Assertion.prototype` under which register records the mode that it applied. */
const APPLIED = Symbol.for("@dokimi/assert.overlap");

/** The matchers that vitest's equality backs, which shadow mode compares. */
const EQUALITY = ["toEqual", "toStrictEqual"] as const;

/** The asynchronous matchers of each test that has not ended. */
const PENDING = new Pending();

/** Fails the test for the first call that it did not await, when the test ends. */
function end(finished: Test): void {
  const calls = PENDING.end(finished);
  const abandoned = calls.find((call) => call.abandoned);
  if (abandoned !== undefined) {
    throw abandoned.neverAwaited();
  }
  const failed = calls.find((call) => call.failed);
  if (failed !== undefined && finished.result?.state !== "fail") {
    throw failed.failedUnawaited();
  }
}

/** Starts the guard of a call of an asynchronous matcher in the test of state. */
function start(state: State, name: string): Call | undefined {
  const test = (state as { readonly task?: Test }).task;
  if (test === undefined) {
    return undefined;
  }
  if (!PENDING.has(test)) {
    try {
      test.context.onTestFinished(() => end(test));
    } catch {
      // vitest refuses a hook that a finished hook of the test adds.
      return undefined;
    }
  }
  return PENDING.start(test, name);
}

/** The matchers of the assertions, each of which reports to a recorder of its own. */
const MATCHERS = matchers({ seat: () => new Recorder(), start });

/** The parts of chai's utilities that shadow mode calls. */
interface Utilities {
  readonly flag: (object: object, key: string) => unknown;
  readonly overwriteMethod: (
    target: object,
    name: string,
    method: (original: (this: object, ...args: unknown[]) => unknown) => unknown,
  ) => void;
}

/** Wraps vitest's equality matchers, so that each logs a call whose verdict the standard's equality would change. */
function shadow(log: string): void {
  chai.use((c, utils) => {
    const tools = utils as unknown as Utilities;
    for (const matcher of EQUALITY) {
      tools.overwriteMethod(
        c.Assertion.prototype,
        matcher,
        (original) =>
          function (this: object, expected: unknown) {
            const test = tools.flag(this, "vitest-test") as Test | undefined;
            const errors = (): number => test?.result?.errors?.length ?? 0;
            const before = errors();
            let passed = false;
            try {
              const result = original.call(this, expected);
              passed = errors() === before;
              return result;
            } finally {
              compare(log, {
                runner: "vitest",
                test: expect.getState().currentTestName ?? "",
                matcher,
                negated: tools.flag(this, "negate") === true,
                received: tools.flag(this, "object"),
                expected,
                passed,
              });
            }
          },
      );
    }
  });
}

/**
 * Returns the path of a test: the segments of its file's path relative to
 * the working directory, the titles of its describe blocks and its own
 * title.
 */
function pathOf(file: string, task: Task): string[] {
  const titles: string[] = [];
  for (let { suite } = task; suite?.suite !== undefined; suite = suite.suite) {
    titles.unshift(suite.name);
  }
  return [...relative(process.cwd(), file).split(sep), ...titles, task.name];
}

/** The seat of a fixture's test, which skips the test through skip of the test's context. */
class TestSeat extends Collector {
  readonly #skip: (note?: string) => never;

  /**
   * Returns the seat of a test whose context skips it with skip.
   *
   * @param skip - The skip of the test's context.
   */
  constructor(skip: (note?: string) => never) {
    super();
    this.#skip = skip;
  }

  /**
   * Skips the test, and does not return.
   *
   * @param reason - Why the test skips.
   */
  skip(reason: string): never {
    this.#skip(reason);
  }
}

/**
 * Adds the standard's assertions to vitest's `expect`.
 *
 * Call it from a file that `setupFiles` names. vitest runs a setup file
 * before each test file, so one worker can run `register` many times. A
 * repeated call with the same mode registers the same matchers again and
 * changes nothing else.
 *
 * @param overlap - What happens to vitest's overlapping matchers, and
 *   `{ mode: "allow" }` when omitted.
 * @throws Error when a chai plugin already defines one of the assertion
 *   names. The message contains the name.
 * @throws Error when an earlier call in this worker chose another mode.
 * @throws Error when shadow mode cannot append to its log.
 * @example
 * // vitest.setup.ts
 * import { register } from "@dokimi/assert/vitest";
 *
 * register();
 */
export function register(overlap: Overlap = { mode: "allow" }): void {
  const prototype = chai.Assertion.prototype as unknown as Record<PropertyKey, unknown>;
  const applied = prototype[APPLIED] as Overlap["mode"] | undefined;
  if (applied !== undefined && applied !== overlap.mode) {
    throw new Error(
      `register: an earlier call in this worker chose the mode ${applied}, and this call chooses ${overlap.mode}`,
    );
  }
  if (applied === undefined) {
    const taken = NAMES.find((name) => name in prototype);
    if (taken !== undefined) {
      throw new Error(
        `register: chai's Assertion already has a property named ${taken}, which a plugin defines`,
      );
    }
    if (overlap.mode === "shadow") {
      open(overlap.log);
    }
  }
  expect.extend(MATCHERS);
  if (applied !== undefined) {
    return;
  }
  if (overlap.mode === "shadow") {
    shadow(overlap.log);
  }
  if (overlap.mode === "strict") {
    expect.extend(
      Object.fromEntries(Object.keys(STRICT).map((name) => [name, refusal(name)])),
    );
  }
  Object.defineProperty(prototype, APPLIED, {
    value: overlap.mode,
    configurable: true,
  });
}

/** The key of a test's task meta under which the call records of the test are. */
export const RECORDS = CALL_KIND;

/** What this adapter adds to a vitest test's context. */
export interface SeatFixture {
  /** The seat to pass to an assertion. */
  seat: Collector;
}

/**
 * A vitest `test` that supplies a seat.
 *
 * Everything `soft` records on the seat is thrown when the body ends,
 * so a test that records two failures reports both at once. A property
 * whose run skips skips the test through the seat.
 */
export const test = base.extend<SeatFixture>({
  seat: async ({ task, signal, skip }, use) => {
    const collector = new TestSeat(skip).withSignal(signal);
    nameTest(collector, pathOf(task.file.filepath, task));
    const meta = task.meta as Record<string, unknown>;
    attach(collector, meta);
    const read = reading();
    if ("on" in read && read.on) {
      const records: unknown[] = [];
      meta[RECORDS] = records;
      write(own(collector), (_seq, line) => {
        records.push(JSON.parse(line));
      });
    }
    await use(collector);
    await cleanUp(collector);
    collector.flush();
  },
});
