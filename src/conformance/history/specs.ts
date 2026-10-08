/**
 * The named specs of the definition, which a history vector names in place
 * of a spec of its own.
 *
 * A state is a decoded value: the register's value, the key-value map as a
 * Map in the order its keys were stored, and the queue and the set as an
 * array in order. Two values compare by their canonical texts. Every spec
 * accepts a call whose outcome is unknown in every state, checks no output
 * of a write, a put, an append, an enqueue or an add, and throws on an
 * operation that it does not define, which the check reports as a fault.
 * The key-value map and the set compare their states in any order.
 */

import type { Operation, Spec } from "../../history/index.js";
import { canonical } from "../literal.js";

/** The value of a key that the key-value spec does not store. */
const EMPTY = "";

/** Reports whether two decoded values have one canonical text. */
function same(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

/** Returns the error of an operation that the spec of a name does not define. */
function undefinedIn(name: string, op: Operation): Error {
  return new Error(
    `conformance: the ${name} spec has no operation ${JSON.stringify(op.name)}`,
  );
}

/** Steps a register's read, which outputs the state and changes nothing, and throws on any other operation. */
function read(state: unknown, op: Operation, name: string): unknown[] {
  if (op.name !== "read") throw undefinedIn(name, op);
  return !op.known || same(op.output, state) ? [state] : [];
}

/** Steps the register: a write stores its value, and a read outputs it. */
function register(state: unknown, op: Operation): unknown[] {
  if (op.name === "write") return [op.args[0]];
  return read(state, op, "register");
}

/**
 * Steps the register with compare-and-set. cas(from, to) outputs whether
 * the state equals from, and stores to when it does. A cas whose outcome is
 * unknown takes effect when the state equals from, and leaves the state
 * otherwise.
 */
function casRegister(state: unknown, op: Operation): unknown[] {
  if (op.name === "write") return register(state, op);
  if (op.name !== "cas") return read(state, op, "cas-register");
  const matches = same(state, op.args[0]);
  if (op.known && op.output !== matches) return [];
  return [matches ? op.args[1] : state];
}

/** Steps the register whose write may be lost: a write leaves the new value, then the old one. */
function lossyRegister(state: unknown, op: Operation): unknown[] {
  if (op.name === "write") return [op.args[0], state];
  return read(state, op, "lossy-register");
}

/** Returns the value that a key-value state stores under name, or the empty value. */
function lookup(state: ReadonlyMap<unknown, unknown>, name: unknown): unknown {
  for (const [stored, value] of state) if (same(stored, name)) return value;
  return EMPTY;
}

/**
 * Returns a key-value state with value under name: in the place of name
 * when the state stores it, and last otherwise. The map stores no empty
 * value, so two maps are equal exactly when every key reads the same value
 * from both.
 */
function withValue(
  state: ReadonlyMap<unknown, unknown>,
  name: unknown,
  value: unknown,
): Map<unknown, unknown> {
  const entries = [...state];
  const at = entries.findIndex(([stored]) => same(stored, name));
  if (at < 0) {
    if (value !== EMPTY) entries.push([name, value]);
  } else if (value === EMPTY) {
    entries.splice(at, 1);
  } else {
    entries[at] = [name, value];
  }
  return new Map(entries);
}

/** Steps the map from keys to strings: get outputs the value under a key, put stores one, and append extends one. */
function keyValue(state: unknown, op: Operation): unknown[] {
  const map = state as ReadonlyMap<unknown, unknown>;
  const name = op.args[0];
  const current = lookup(map, name);
  if (op.name === "get") return !op.known || same(op.output, current) ? [state] : [];
  if (op.name === "put") return [withValue(map, name, op.args[1])];
  if (op.name === "append") return [withValue(map, name, `${current}${op.args[1]}`)];
  throw undefinedIn("key-value", op);
}

/** Steps the queue: enqueue adds a value at the tail, and dequeue outputs the head, or null when the queue is empty. */
function queue(state: unknown, op: Operation): unknown[] {
  const items = state as readonly unknown[];
  if (op.name === "enqueue") return [[...items, op.args[0]]];
  if (op.name !== "dequeue") throw undefinedIn("queue", op);
  if (items.length === 0) return !op.known || op.output === null ? [state] : [];
  return !op.known || same(op.output, items[0]) ? [items.slice(1)] : [];
}

/**
 * Steps the set, which lists its values in the order they were added. add
 * adds a value when it is absent, and remove and contains output whether a
 * value is present. A remove whose outcome is unknown removes the value
 * when it is present.
 */
function set(state: unknown, op: Operation): unknown[] {
  const items = state as readonly unknown[];
  const value = op.args[0];
  const present = items.some((item) => same(item, value));
  if (op.name === "add") return [present ? state : [...items, value]];
  if (op.name === "contains") return !op.known || op.output === present ? [state] : [];
  if (op.name !== "remove") throw undefinedIn("set", op);
  if (op.known && op.output !== present) return [];
  return [items.filter((item) => !same(item, value))];
}

/** Returns the canonical texts of the values of a set state, sorted, which two states of equal values share in any order. */
function setText(state: unknown): string {
  return (state as readonly unknown[]).map(canonical).sort().join(",");
}

/** Returns a spec of an initial state and a step, whose states compare by their canonical texts. */
function canonicalSpec(
  initial: () => unknown,
  next: (state: unknown, op: Operation) => unknown[],
): Spec<unknown> {
  return { initial, next, equal: same, key: canonical };
}

/** The named specs of the definition, by name. */
export const SPECS: ReadonlyMap<string, Spec<unknown>> = new Map([
  ["register", canonicalSpec(() => null, register)],
  ["cas-register", canonicalSpec(() => null, casRegister)],
  ["key-value", canonicalSpec(() => new Map(), keyValue)],
  ["queue", canonicalSpec(() => [], queue)],
  [
    "set",
    {
      initial: () => [],
      next: set,
      equal: (a: unknown, b: unknown) => setText(a) === setText(b),
      key: setText,
    },
  ],
  ["lossy-register", canonicalSpec(() => null, lossyRegister)],
]);
