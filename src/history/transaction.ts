/**
 * The transactions of a history of list appends, which the isolation checks
 * read.
 *
 * A transaction is one call whose operation is `txn`. Its arguments are its
 * micro-operations in the order it ran them: `["append", key, value]` and
 * `["read", key, null]`. An ok completion commits the transaction, and its
 * output repeats the micro-operations with each read's list filled in, or
 * null for an empty list. A fail completion aborts it. Every value is
 * appended to its key once, so a value names the append that produced it.
 * Keys and values compare by their typed literals.
 */

import { show } from "../matcher/inspect.js";
import { detail as literalOf } from "../record/literal.js";
import type { Event } from "./event.js";
import { identityOf } from "./history.js";

/** The operation of a transaction's call. */
export const TXN = "txn";

/** The function of a micro-operation that appends a value to a key. */
export const APPEND = "append";

/** The function of a micro-operation that reads a key's list. */
export const READ = "read";

/** A history that is no history of list-append transactions. */
export class TransactionError extends Error {
  /**
   * Returns the error of a history that is no history of list-append transactions.
   *
   * @param message - What is wrong, and where.
   */
  constructor(message: string) {
    super(message);
    this.name = "TransactionError";
  }
}

/**
 * One micro-operation of a transaction. value is the appended value of an
 * append. For a read, it is the list that the read returned, or undefined
 * for a read whose transaction did not commit.
 */
export interface Mop {
  /** The micro-operation's function. */
  readonly fn: typeof APPEND | typeof READ;
  /** The key. */
  readonly key: unknown;
  /** The appended value, or the list that a read returned. */
  readonly value: unknown;
}

/**
 * One call of a history, read as a transaction. completion and kind are
 * undefined for a pending transaction. mops come from the output of an ok
 * transaction, with each read's list, and from the invocation otherwise.
 */
export interface Transaction {
  /** The index of the call's invocation event. */
  readonly call: number;
  /** The index of the call's completion event. */
  readonly completion: number | undefined;
  /** How the call completed. */
  readonly kind: "ok" | "fail" | "unknown" | undefined;
  /** The process that made the call. */
  readonly process: number;
  /** The call's arguments. */
  readonly args: readonly unknown[];
  /** The call's output, for an ok call. */
  readonly output: unknown;
  /** The micro-operations. */
  readonly mops: readonly Mop[];
}

/**
 * Returns the identity of a key or a value of call.
 *
 * @param call - The call that states value.
 * @param value - The value.
 * @returns The identity.
 * @throws TransactionError for a value that no typed literal states.
 */
export function identity(call: number, value: unknown): string {
  const id = identityOf(value);
  if (id === undefined) {
    throw new TransactionError(
      `call ${call} states ${show(value)}, which no typed literal states`,
    );
  }
  return id;
}

/** Returns the micro-operation that one argument of an invocation states. */
function invoked(call: number, position: number, raw: unknown): Mop {
  if (
    !Array.isArray(raw) ||
    raw.length !== 3 ||
    (raw[0] !== APPEND && raw[0] !== READ)
  ) {
    throw new TransactionError(
      `argument ${position} of call ${call} is ${show(raw)}, not [append, key, value] or [read, key, null]`,
    );
  }
  const [fn, key, value] = raw as [typeof APPEND | typeof READ, unknown, unknown];
  if (fn === READ && value !== null && value !== undefined) {
    throw new TransactionError(
      `the read at argument ${position} of call ${call} states a list before it ran`,
    );
  }
  identity(call, key);
  if (fn === APPEND) identity(call, value);
  return { fn, key, value: fn === READ ? undefined : value };
}

/** Returns one micro-operation of an ok output, which repeats mop with a read's list. */
function repeated(call: number, position: number, mop: Mop, raw: unknown): Mop {
  const repeats =
    Array.isArray(raw) &&
    raw.length === 3 &&
    raw[0] === mop.fn &&
    identityOf(raw[1]) === identity(call, mop.key) &&
    (mop.fn === READ || identityOf(raw[2]) === identity(call, mop.value));
  if (!repeats) {
    throw new TransactionError(
      `micro-operation ${position} of the output of call ${call} is ${show(raw)}, which does not repeat ${show([mop.fn, mop.key, mop.value ?? null])}`,
    );
  }
  if (mop.fn === APPEND) return mop;
  const value = (raw as unknown[])[2];
  if (value === null || value === undefined)
    return { fn: READ, key: mop.key, value: [] };
  if (!Array.isArray(value)) {
    throw new TransactionError(
      `the read at micro-operation ${position} of the output of call ${call} returned ${show(value)}, not a list`,
    );
  }
  for (const element of value) identity(call, element);
  return { fn: READ, key: mop.key, value };
}

/** Returns the micro-operations of an ok output, which repeat invoked with lists. */
function returned(call: number, mops: readonly Mop[], output: unknown): Mop[] {
  if (!Array.isArray(output) || output.length !== mops.length) {
    throw new TransactionError(
      `the output of call ${call} does not repeat the micro-operations of its invocation`,
    );
  }
  return mops.map((mop, position) => repeated(call, position, mop, output[position]));
}

/** Returns the transaction of one call, whose completion is completion or undefined. */
function transactionOf(invocation: Event, completion: Event | undefined): Transaction {
  const call = invocation.index;
  const { operation, args } = invocation as Event & { kind: "invoke" };
  if (operation !== TXN) {
    throw new TransactionError(
      `call ${call} is ${JSON.stringify(operation)}, not ${JSON.stringify(TXN)}`,
    );
  }
  const mops = args.map((raw, position) => invoked(call, position, raw));
  const output = completion?.kind === "ok" ? completion.output : undefined;
  return {
    call,
    completion: completion?.index,
    kind: completion?.kind as Transaction["kind"],
    process: invocation.process,
    args,
    output,
    mops: completion?.kind === "ok" ? returned(call, mops, output) : mops,
  };
}

/** Records each value that txn appends, under its key, and refuses a second append of one value. */
function register(txn: Transaction, appended: Map<string, number>): void {
  for (const mop of txn.mops) {
    if (mop.fn !== APPEND) continue;
    const name = JSON.stringify([
      identity(txn.call, mop.key),
      identity(txn.call, mop.value),
    ]);
    const first = appended.get(name);
    if (first === txn.call) {
      throw new TransactionError(
        `call ${txn.call} appends ${show(mop.value)} to the key ${show(mop.key)} twice`,
      );
    }
    if (first !== undefined) {
      throw new TransactionError(
        `calls ${first} and ${txn.call} both append ${show(mop.value)} to the key ${show(mop.key)}`,
      );
    }
    appended.set(name, txn.call);
  }
}

/**
 * Returns a history's transactions in the order of their invocations.
 *
 * @param events - The events of the history.
 * @returns The transactions.
 * @throws TransactionError when a call is no list-append transaction, an ok
 *   output does not repeat its invocation's micro-operations, a key or a
 *   value has no typed literal, or a value is appended to one key twice.
 */
export function transactions(events: readonly Event[]): Transaction[] {
  const completions = new Map<number, Event>();
  for (const event of events) {
    if (event.kind !== "invoke") completions.set(event.call, event);
  }
  const appended = new Map<string, number>();
  const out: Transaction[] = [];
  for (const event of events) {
    if (event.kind !== "invoke") continue;
    const txn = transactionOf(event, completions.get(event.index));
    register(txn, appended);
    out.push(txn);
  }
  return out;
}

/**
 * Returns a transaction in the history's JSON form: the call, the
 * completion and its kind, the process, the args as typed literals, and the
 * output as a typed literal. A pending transaction states no completion and
 * no kind, and only an ok transaction states an output.
 *
 * @param txn - The transaction.
 * @returns The JSON value.
 */
export function transactionJson(txn: Transaction): Record<string, unknown> {
  return {
    call: txn.call,
    ...(txn.completion === undefined
      ? {}
      : { completion: txn.completion, kind: txn.kind }),
    process: txn.process,
    args: txn.args.map(literalOf),
    ...(txn.kind === "ok" ? { output: literalOf(txn.output) } : {}),
  };
}
