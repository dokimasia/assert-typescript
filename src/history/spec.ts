/**
 * The sequential specification of an object, against which a check reads a
 * history, and the call as the specification sees it.
 */

import { equal as compare } from "../matcher/compare.js";
import { settings } from "../matcher/option.js";

/** The relaxations of the library's equality without an option. */
const STRICT = settings([]);

/**
 * A call as a spec sees it: its operation and its arguments, and its output
 * when the call completed as ok.
 */
export interface Operation {
  /** The call's operation. */
  readonly name: string;
  /** The call's arguments. */
  readonly args: readonly unknown[];
  /** Whether the call completed as ok. A call whose outcome is unknown, and a pending call, is not known. */
  readonly known: boolean;
  /** What the call returned when known is set, and undefined otherwise. */
  readonly output: unknown;
  /**
   * Reports whether the call may have returned value. A call that is not
   * known may have taken effect with any output, so it reports true for it.
   * For a known call, it reports whether output equals value as check.equal
   * compares them, without an option.
   *
   * @param value - A value that the spec's state states.
   * @returns Whether the call may have returned value.
   */
  returned(value: unknown): boolean;
}

/** The operation of a call: what a spec sees of it. */
export class CallOperation implements Operation {
  readonly name: string;
  readonly args: readonly unknown[];
  readonly known: boolean;
  readonly output: unknown;

  /**
   * Returns the operation of a call.
   *
   * @param name - The call's operation.
   * @param args - The call's arguments.
   * @param known - Whether the call completed as ok.
   * @param output - What the call returned, when it is known.
   */
  constructor(
    name: string,
    args: readonly unknown[],
    known: boolean,
    output?: unknown,
  ) {
    this.name = name;
    this.args = args;
    this.known = known;
    this.output = output;
  }

  returned(value: unknown): boolean {
    return !this.known || compare(this.output, value, STRICT);
  }
}

/**
 * The sequential specification of an object: its state before any call, and
 * the states that an operation may leave. S is the type of a state.
 *
 * initial and next are required, and next is synchronous: a spec states a
 * sequential object, and the search calls next once per state. equal and key
 * are optional:
 *
 * - Without equal, two states compare as check.equal compares them,
 *   without an option.
 * - Without key, a state's key is a canonical text that every state equal
 *   to it under that comparison shares, for a state without a cycle.
 *
 * equal must be exact. The search merges two configurations whose states
 * equal reports equal, so an equality coarser than the spec's meaning turns
 * a linearizable history into a violated one. A stated key agrees with
 * equal: two states that equal reports equal have one key. A key that
 * splits two equal states costs the search time, and changes no verdict.
 *
 * next, equal and key must not change their arguments.
 */
export interface Spec<S> {
  /** Returns the state before any call. */
  initial(): S;
  /**
   * Returns the states that may follow state when op takes effect, in the
   * order the search tries them, and none when the spec rejects op in
   * state. For a call whose outcome is unknown, it returns the states that
   * the call leaves when it takes effect.
   */
  next(state: S, op: Operation): readonly S[];
  /** Reports whether two states are interchangeable. */
  equal?(a: S, b: S): boolean;
  /** Returns a text that every state equal to state shares, for the search's memo. */
  key?(state: S): string;
}

/** The steps of the budget that a call of a spec's next from a state counts for, when it is not one. */
export const COST: unique symbol = Symbol("history.cost");

/** A spec with the cost of its steps. */
export interface Costed<S> extends Spec<S> {
  /** Returns the steps that a call of next from state counts for. */
  readonly [COST]: (state: S) => number;
}

/** The most levels that the key of a state walks, where the library's equality stops comparing. */
const MAX_DEPTH = 100;

/** Returns the canonical texts of values, sorted. */
function sortedKeys(
  values: Iterable<unknown>,
  depth: number,
  seen: Set<object>,
): string {
  return [...values]
    .map((value) => keyAt(value, depth, seen))
    .sort()
    .join(",");
}

/** Returns the key of an object, by the shape that the library's equality reads. */
function objectKey(value: object, depth: number, seen: Set<object>): string {
  const inner = (v: unknown) => keyAt(v, depth + 1, seen);
  if ([Number, String, Boolean, BigInt, Symbol].some((box) => value instanceof box)) {
    return `boxed:${value.constructor.name}:${inner(value.valueOf())}`;
  }
  if (Array.isArray(value)) return `[${value.map(inner).join(",")}]`;
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const items = Array.from(value as unknown as ArrayLike<unknown>, inner);
    return `${value.constructor.name}[${items.join(",")}]`;
  }
  if (value instanceof Map) {
    const entries = [...value].map(([k, v]) => `${inner(k)}=${inner(v)}`);
    return `map{${entries.sort().join(",")}}`;
  }
  if (value instanceof Set) return `set{${sortedKeys(value, depth + 1, seen)}}`;
  if (value instanceof Date) return `date:${value.getTime()}`;
  if (value instanceof RegExp) return `regexp:${String(value)}`;
  if (value instanceof Error) return `error:${value.name}:${value.message}`;
  const fields = Object.keys(value)
    .sort()
    .map(
      (name) =>
        `${JSON.stringify(name)}=${inner((value as Record<string, unknown>)[name])}`,
    );
  return `{${fields.join(",")}}`;
}

/** Returns the key of value at a depth of the walk, with the objects around it in seen. */
function keyAt(value: unknown, depth: number, seen: Set<object>): string {
  if (depth > MAX_DEPTH) return "deep";
  switch (typeof value) {
    case "number":
      return Number.isNaN(value) ? "NaN" : `number:${value === 0 ? 0 : value}`;
    case "bigint":
      return `bigint:${value}`;
    case "string":
      return `string:${JSON.stringify(value)}`;
    case "boolean":
      return `${value}`;
    case "undefined":
      return "undefined";
    case "object":
      if (value === null) return "null";
      if (seen.has(value)) return "cycle";
      seen.add(value);
      try {
        return objectKey(value, depth, seen);
      } finally {
        seen.delete(value);
      }
    default:
      return typeof value;
  }
}

/**
 * Returns the default key of a state: a canonical text that every state
 * that check.equal reports equal to it shares, for a state without a cycle.
 * A function and a symbol have the key of their type alone.
 *
 * @param state - The state.
 * @returns The key.
 */
export function stateKey(state: unknown): string {
  return keyAt(state, 0, new Set());
}

/**
 * Reports whether two states are equal as check.equal compares them,
 * without an option.
 *
 * @param a - A state.
 * @param b - Another state.
 * @returns Whether they are equal.
 */
export function sameState(a: unknown, b: unknown): boolean {
  return compare(a, b, STRICT);
}

/**
 * Returns the spec that the subject's own sequential behaviour states. Its
 * state is the list of the calls applied so far: the operation and the
 * arguments of each, as an operation that is not known. A check against it
 * finds a call of a history that was not atomic.
 *
 * next builds a subject with factory, applies the calls of the state in
 * order, and then applies the operation. It accepts the operation when the
 * call may have returned the subject's output, as Operation.returned
 * reports. Two states are equal when they list equal operations with equal
 * arguments, in one order. A step from a state of d calls applies d + 1
 * calls, and counts for d + 1 steps of the budget.
 *
 * The subject must return the same outputs for the same calls. A subject
 * with hidden state returns other outputs on a replay, and the check then
 * reports a violation that did not happen.
 *
 * @param factory - Returns a fresh subject, which applies an operation to
 *   its arguments and returns the output.
 * @returns The spec.
 */
export function specFrom(
  factory: () => (operation: string, args: readonly unknown[]) => unknown,
): Spec<readonly Operation[]> {
  const spec: Costed<readonly Operation[]> = {
    initial: () => [],
    next(state, op) {
      const subject = factory();
      for (const applied of state) subject(applied.name, applied.args);
      if (!op.returned(subject(op.name, op.args))) return [];
      return [[...state, new CallOperation(op.name, op.args, false)]];
    },
    equal: (a, b) =>
      a.length === b.length &&
      a.every((x, i) => {
        const y = b[i] as Operation;
        return x.name === y.name && sameState(x.args, y.args);
      }),
    key: (state) =>
      state.map((op) => `${JSON.stringify(op.name)}${stateKey(op.args)}`).join(";"),
    [COST]: (state) => state.length + 1,
  };
  return spec;
}
