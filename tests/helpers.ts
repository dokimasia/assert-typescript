/**
 * The helpers, the subjects and the tables that more than one spec uses.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import type * as check from "../src/check.js";
import type { Controlled } from "../src/clock.js";
import { unlock } from "../src/files/writer.js";
import { type Call, History } from "../src/history/history.js";
import type { Spec } from "../src/history/spec.js";
import { Case } from "../src/prop/case.js";
import { Case as Engine, type Provider, Replaying } from "../src/prop/engine/case.js";
import { VARIABLE } from "../src/record/switch.js";
import { Recorder, type Seat } from "../src/seat.js";

/** Whether the platform is Windows, whose file systems record no permission bits. */
export const WINDOWS = process.platform === "win32";

/**
 * Whether the file system grants this process every permission whatever
 * the mode: on Windows, and for root. A test of an error that a permission
 * causes cannot run then.
 */
export const UNENFORCED = WINDOWS || process.getuid?.() === 0;

/**
 * Whether the file system reports a name past its length limit as absent,
 * as Windows does. A test of a path that the file system refuses cannot run
 * then.
 */
export const LONG_NAMES_ABSENT = WINDOWS;

/** Returns a new directory, which is removed when the test ends, also below a directory that forbids it. */
export function temporary(): string {
  const dir = mkdtempSync(join(tmpdir(), "dokimi-test-"));
  onTestFinished(() => {
    unlock(dir);
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/** Makes dir the working directory of the process until the test ends. */
export function enter(dir: string): void {
  const before = process.cwd();
  process.chdir(dir);
  onTestFinished(() => process.chdir(before));
}

/** Sets the umask of the process to mask until the test ends. */
export function umask(mask: number): void {
  const before = process.umask(mask);
  onTestFinished(() => {
    process.umask(before);
  });
}

/** The umasks that a test of the modes that a write sets runs under. */
export const UMASKS: readonly number[] = [0o022, 0o027, 0o077];

/** Sets the environment variable name to value, or unsets it for undefined, until the test ends. */
export function setVariable(name: string, value: string | undefined): void {
  const before = process.env[name];
  const assign = (stated: string | undefined): void => {
    if (stated === undefined) Reflect.deleteProperty(process.env, name);
    else process.env[name] = stated;
  };
  assign(value);
  onTestFinished(() => assign(before));
}

/** Returns the message of what fn throws, or the empty string when it returns. */
export function thrown(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return (err as Error).message;
  }
  return "";
}

/** The key of `globalThis` under which the process keeps its reading of the switch. */
const READING = Symbol.for("dokimi.assert.record.switch");

/**
 * Sets `DOKIMI_ASSERT_RECORD` to value, or unsets it for undefined, and
 * makes the process read the variable again at its next call.
 *
 * @param value - The value of the variable.
 * @returns The function that restores the variable's value before the
 *   call, and makes the process read it again.
 */
export function setRecording(value: string | undefined): () => void {
  const before = process.env[VARIABLE];
  assign(value);
  return () => assign(before);
}

/** Sets the variable of the switch, and drops the process's reading of it. */
function assign(value: string | undefined): void {
  if (value === undefined) Reflect.deleteProperty(process.env, VARIABLE);
  else process.env[VARIABLE] = value;
  Reflect.deleteProperty(globalThis, READING);
}

/** A seat that takes sentences only, and keeps each with the member that received it. */
export class Plain implements Seat {
  /** The member and the message of each sentence, in call order. */
  readonly received: [string, string][] = [];
  /** How many times helper was called. */
  helpers = 0;

  helper(): void {
    this.helpers += 1;
  }

  fail(message: string): void {
    this.received.push(["fail", message]);
  }

  record(message: string): void {
    this.received.push(["record", message]);
  }
}

/** Returns the call records that recorder keeps, parsed. */
export function records(recorder: Recorder): Record<string, unknown>[] {
  return recorder.records.map((line) => JSON.parse(line) as Record<string, unknown>);
}

/**
 * The register of the history specs: one value, initially null. A write
 * leaves its value, and a read outputs the value and leaves it.
 */
export const REGISTER: Spec<unknown> = {
  initial: () => null,
  next: (state, op) => {
    if (op.name === "write") return [op.args[0]];
    return op.returned(state) ? [state] : [];
  },
};

/** Returns a micro-operation of a transaction that appends value to key. */
export function append(key: unknown, value: unknown): unknown[] {
  return ["append", key, value];
}

/** Returns a micro-operation of a transaction that read values from key. */
export function readOf(key: unknown, values: unknown): unknown[] {
  return ["read", key, values];
}

/**
 * Invokes a transaction of mops by client, stating each read without its
 * list, on the keys of mops in the order of their first micro-operation.
 */
export function invokeTxn(
  history: History,
  client: number,
  ...mops: unknown[][]
): Call {
  const invoked = mops.map(([fn, key, value]) => [
    fn,
    key,
    fn === "read" ? null : value,
  ]);
  const keys = [...new Set(mops.map(([, key]) => key))];
  return history.invoke(client, "txn", invoked, ...keys);
}

/** Records a transaction of mops by client that commits at once and returns mops as they are. */
export function runTxn(history: History, client: number, ...mops: unknown[][]): void {
  invokeTxn(history, client, ...mops).ok(mops.map((mop) => [...mop]));
}

/**
 * Returns a read skew: call 0 sees call 1's append to y and not its append
 * to x. Call 1 completes as completes, or never for undefined. When
 * observed is false, call 0 reads y empty, and no read observes call 1's
 * appends.
 */
export function readSkew(
  completes: "ok" | "unknown" | undefined,
  observed: boolean,
): History {
  const history = new History();
  const reader = invokeTxn(history, 0, readOf("x", null), readOf("y", null));
  const writer = invokeTxn(history, 1, append("x", 1), append("y", 2));
  if (completes === "ok") writer.ok([append("x", 1), append("y", 2)]);
  else if (completes === "unknown") writer.unknown("timed out");
  reader.ok([readOf("x", []), readOf("y", observed ? [2] : [])]);
  return history;
}

/** Returns a write skew: each of calls 0 and 1 reads the key that the other appends to. */
export function writeSkew(): History {
  const history = new History();
  const first = invokeTxn(history, 0, readOf("x", null), append("y", 1));
  const second = invokeTxn(history, 1, readOf("y", null), append("x", 2));
  first.ok([readOf("x", []), append("y", 1)]);
  second.ok([readOf("y", []), append("x", 2)]);
  return history;
}

/** Returns a case of a property's body on a recorder, whose engine case takes its values from provider, and that engine case. */
export function bodyCase(provider: Provider): {
  readonly c: Case;
  readonly engine: Engine;
} {
  const engine = new Engine(provider);
  const location = { site: undefined, pinned: false };
  return { c: new Case(engine, new Recorder(), undefined, location), engine };
}

/** Returns the provider that replays integer choices of values, in order. */
export function replaying(...values: number[]): Replaying {
  return new Replaying(
    values.map((value) => ({ kind: "integer", value: BigInt(value) })),
  );
}

/** A subject that never reads its signal. */
export async function ignores(): Promise<string> {
  return "did the work";
}

/** The assertions that `check` and `soft` both export. */
export type Surface = Omit<typeof check, "rejects">;

/**
 * One failing call of an assertion on surface: on seat, with arguments
 * built against the clock that seat reads, and with the message msg.
 *
 * @returns What the assertion returns.
 */
export type Failing = (
  surface: Surface,
  seat: Seat,
  clock: Controlled,
  msg: string,
) => unknown;

/**
 * A failing call of each assertion that `check` and `soft` both export, by
 * name.
 *
 * Each entry builds its arguments again for each call. A stateful subject
 * starts clean, and a subject that takes time advances the clock that the
 * seat reads.
 */
export const FAILING: Readonly<Record<keyof Surface, Failing>> = {
  equal: (s, seat, _clock, msg) => s.equal(seat, 1, 2, msg),
  notEqual: (s, seat, _clock, msg) => s.notEqual(seat, 1, 1, msg),
  isTrue: (s, seat, _clock, msg) => s.isTrue(seat, false, msg),
  isFalse: (s, seat, _clock, msg) => s.isFalse(seat, true, msg),
  isNil: (s, seat, _clock, msg) => s.isNil(seat, 0, msg),
  isNotNil: (s, seat, _clock, msg) => s.isNotNil(seat, null, msg),
  length: (s, seat, _clock, msg) => s.length(seat, [1], 2, msg),
  isEmpty: (s, seat, _clock, msg) => s.isEmpty(seat, [1], msg),
  isNotEmpty: (s, seat, _clock, msg) => s.isNotEmpty(seat, [], msg),
  contains: (s, seat, _clock, msg) => s.contains(seat, [1], 2, msg),
  notContains: (s, seat, _clock, msg) => s.notContains(seat, [1], 1, msg),
  containsInOrder: (s, seat, _clock, msg) =>
    s.containsInOrder(seat, "ab", ["b", "a"], msg),
  hasPrefix: (s, seat, _clock, msg) => s.hasPrefix(seat, "ab", "b", msg),
  hasSuffix: (s, seat, _clock, msg) => s.hasSuffix(seat, "ab", "a", msg),
  matches: (s, seat, _clock, msg) => s.matches(seat, "ab", "^b", msg),
  closeTo: (s, seat, _clock, msg) => s.closeTo(seat, 1, 2, 0.5, msg),
  inRange: (s, seat, _clock, msg) => s.inRange(seat, 5, 0, 1, msg),
  pairwise: (s, seat, _clock, msg) => s.pairwise(seat, [2, 1], (a, b) => a < b, msg),
  noError: (s, seat, _clock, msg) => s.noError(seat, new Error("boom"), msg),
  hasError: (s, seat, _clock, msg) => s.hasError(seat, null, msg),
  errorIs: (s, seat, _clock, msg) => s.errorIs(seat, new Error("boom"), TypeError, msg),
  errorIsNot: (s, seat, _clock, msg) => {
    const err = new Error("boom");
    return s.errorIsNot(seat, err, err, msg);
  },
  errorAs: (s, seat, _clock, msg) => s.errorAs(seat, new Error("boom"), TypeError, msg),
  throws: (s, seat, _clock, msg) => s.throws(seat, () => 1, msg),
  doesNotThrow: (s, seat, _clock, msg) =>
    s.doesNotThrow(
      seat,
      () => {
        throw new Error("boom");
      },
      msg,
    ),
  rejectsWith: (s, seat, _clock, msg) =>
    s.rejectsWith(seat, () => Promise.resolve(1), msg),
  honoursCancellation: (s, seat, _clock, msg) =>
    s.honoursCancellation(seat, ignores, msg),
  honoursDeadline: (s, seat, _clock, msg) => s.honoursDeadline(seat, ignores, msg),
  completesWithin: (s, seat, clock, msg) =>
    s.completesWithin(
      seat,
      0,
      () => {
        clock.advance(5);
        return Promise.resolve();
      },
      msg,
    ),
  nullHandleSafe: (s, seat, _clock, msg) =>
    s.nullHandleSafe(seat, (signal) => (signal as AbortSignal).aborted, msg),
  isPure: (s, seat, _clock, msg) => {
    const state = [1];
    return s.isPure(
      seat,
      () => [...state],
      () => state.push(2),
      msg,
    );
  },
  eventually: (s, seat, _clock, msg) =>
    s.eventually(seat, 5, 1, (trial) => s.isTrue(trial, false, "it converges"), msg),
  eventuallyTrue: (s, seat, _clock, msg) => s.eventuallyTrue(seat, 5, () => false, msg),
  noTaskLeaks: (s, seat, _clock, msg) => {
    const done = s.noTaskLeaks(seat, msg);
    const timer = setTimeout(() => undefined, 5000);
    done();
    clearTimeout(timer);
  },
  isIdempotent: (s, seat, _clock, msg) => {
    const state: number[] = [];
    return s.isIdempotent(
      seat,
      (x: number) => state.push(x),
      1,
      () => [...state],
      msg,
    );
  },
  accumulates: (s, seat, _clock, msg) => {
    let cell = 0;
    return s.accumulates(
      seat,
      (x: number) => {
        cell = x;
      },
      7,
      () => cell,
      msg,
    );
  },
  isDeterministic: (s, seat, _clock, msg) => {
    let calls = 0;
    return s.isDeterministic(
      seat,
      () => {
        calls += 1;
        return calls;
      },
      1,
      msg,
    );
  },
  isCommutative: (s, seat, _clock, msg) =>
    s.isCommutative(seat, (a: number, b: number) => a - b, 2, 3, msg),
  isAssociative: (s, seat, _clock, msg) =>
    s.isAssociative(seat, (a: number, b: number) => a - b, 2, 3, 5, msg),
  roundTrip: (s, seat, _clock, msg) =>
    s.roundTrip(
      seat,
      (x: number) => String(Math.abs(x)),
      (text: string) => Number(text),
      -42,
      msg,
    ),
  hasStableOrder: (s, seat, _clock, msg) => {
    let items = [1, 2, 3];
    return s.hasStableOrder(
      seat,
      () => {
        items = [...items.slice(1), ...items.slice(0, 1)];
        return items;
      },
      msg,
    );
  },
  noDuplicates: (s, seat, _clock, msg) => s.noDuplicates(seat, () => [1, 2, 2, 3], msg),
  isMonotonic: (s, seat, _clock, msg) => {
    let count = 0;
    return s.isMonotonic(
      seat,
      () => count,
      () => {
        count = (count + 1) % 4;
      },
      5,
      msg,
    );
  },
  isTotal: (s, seat, _clock, msg) =>
    s.isTotal(
      seat,
      () => {
        throw new Error("refused");
      },
      [1, 2, 3],
      msg,
    ),
  isNotPure: (s, seat, _clock, msg) =>
    s.isNotPure(
      seat,
      () => 0,
      () => undefined,
      msg,
    ),
  failsAfterClose: (s, seat, _clock, msg) =>
    s.failsAfterClose(
      seat,
      () => undefined,
      () => undefined,
      new Error("closed"),
      msg,
    ),
  isPoisoned: (s, seat, _clock, msg) =>
    s.isPoisoned(
      seat,
      () => undefined,
      () => undefined,
      msg,
    ),
  isPermutation: (s, seat, _clock, msg) =>
    s.isPermutation(seat, [1, 1, 2], [1, 2, 2], msg),
};

/**
 * The assertions of `check` and `soft` that return a promise. The
 * forgotten-await guard tracks each promise that one of them returns.
 */
export const TRACKED: readonly string[] = [
  "accumulates",
  "completesWithin",
  "eventually",
  "eventuallyTrue",
  "failsAfterClose",
  "hasStableOrder",
  "honoursCancellation",
  "honoursDeadline",
  "isAssociative",
  "isCommutative",
  "isDeterministic",
  "isIdempotent",
  "isMonotonic",
  "isNotPure",
  "isPoisoned",
  "isPure",
  "isTotal",
  "noDuplicates",
  "nullHandleSafe",
  "rejectsWith",
  "roundTrip",
];
