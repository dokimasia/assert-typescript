// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The transactions of a history of list appends or of registers, which the
 * isolation checks read.
 *
 * A transaction is one call whose operation is `txn`. Its arguments are its
 * micro-operations in the order it ran them: `["append", key, value]`,
 * `["write", key, value]` and `["read", key, null]`. A history whose
 * micro-operations write is a register history, and every other history is
 * a list-append history. An ok completion commits the transaction. Its
 * output repeats the micro-operations with what each read returned: a list,
 * or null for an empty list, in a list-append history, and a value, or null
 * for the initial value, in a register history. A fail completion aborts
 * it. Every value is appended or written to its key once, so a value
 * identifies the micro-operation that produced it. Keys and values compare
 * by their typed literals.
 *
 * A read of a register is a read of the list of its one value, or of the
 * empty list for the initial value, so the checks read both workloads
 * alike.
 */

import { show } from "../matcher/inspect.js";
import { detail as literalOf } from "../record/literal.js";
import type { Event } from "./event.js";
import { identityOf } from "./history.js";

/** The elements of a micro-operation: its function, its key and its value. */
const MOP_LENGTH = 3;

/** The functions of a micro-operation. */
const FUNCTIONS: ReadonlySet<unknown> = new Set(["append", "write", "read"]);

/** Returns the micro-operation that one argument of an invocation states. */
function invoked(call: number, position: number, raw: unknown): Mop {
  if (!Array.isArray(raw) || raw.length !== MOP_LENGTH || !FUNCTIONS.has(raw[0])) {
    throw new TransactionError(
      `argument ${position} of call ${call} is ${show(raw)}, not [append, key, value], [write, key, value] or [read, key, null]`,
    );
  }
  const [fn, key, value] = raw as [Mop["fn"], unknown, unknown];
  const absent = value === null || value === undefined;
  if (fn === READ && !absent) {
    throw new TransactionError(
      `the read at argument ${position} of call ${call} states a value before it ran`,
    );
  }
  if (fn === WRITE && absent) {
    throw new TransactionError(
      `the write at argument ${position} of call ${call} writes null, the initial value of every key`,
    );
  }
  identity(call, key);
  if (fn !== READ) {
    identity(call, value);
  }
  return { fn, key, value: fn === READ ? undefined : value };
}

/**
 * Returns the list of the read at position of call, which returned value. A
 * register read returned one value, or null for the initial value, and a
 * list-append read returned a list, or null for the empty list.
 */
function listOf(
  call: number,
  position: number,
  value: unknown,
  ofRegisters: boolean,
): readonly unknown[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (!(ofRegisters || Array.isArray(value))) {
    throw new TransactionError(
      `the read at micro-operation ${position} of the output of call ${call} returned ${show(value)}, not a list`,
    );
  }
  const list: readonly unknown[] = ofRegisters ? [value] : (value as unknown[]);
  for (const element of list) {
    identity(call, element);
  }
  return list;
}

/** Returns an ok transaction with the list of each read. */
function readAs(txn: Transaction, ofRegisters: boolean): Transaction {
  if (txn.kind !== "ok") {
    return txn;
  }
  const mops = txn.mops.map((mop, position) =>
    mop.fn === READ
      ? { ...mop, value: listOf(txn.call, position, mop.value, ofRegisters) }
      : mop,
  );
  return { ...txn, mops };
}

/** Returns one micro-operation of an ok output, which repeats mop with what a read returned. */
function repeated(call: number, position: number, mop: Mop, raw: unknown): Mop {
  const repeats =
    Array.isArray(raw) &&
    raw.length === MOP_LENGTH &&
    raw[0] === mop.fn &&
    identityOf(raw[1]) === identity(call, mop.key) &&
    (mop.fn === READ || identityOf(raw[2]) === identity(call, mop.value));
  if (!repeats) {
    throw new TransactionError(
      `micro-operation ${position} of the output of call ${call} is ${show(raw)}, which does not repeat ${show([mop.fn, mop.key, mop.value ?? null])}`,
    );
  }
  if (mop.fn !== READ) {
    return mop;
  }
  const [, , value] = raw as unknown[];
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

/** Records each value that txn appends or writes, under its key, and refuses a second one of one value. */
function register(txn: Transaction, produced: Map<string, number>): void {
  for (const mop of txn.mops.filter((one) => one.fn !== READ)) {
    const name = JSON.stringify([
      identity(txn.call, mop.key),
      identity(txn.call, mop.value),
    ]);
    const first = produced.get(name);
    if (first === txn.call) {
      throw new TransactionError(
        `call ${txn.call} ${mop.fn}s ${show(mop.value)} to the key ${show(mop.key)} twice`,
      );
    }
    if (first !== undefined) {
      throw new TransactionError(
        `calls ${first} and ${txn.call} both ${mop.fn} ${show(mop.value)} to the key ${show(mop.key)}`,
      );
    }
    produced.set(name, txn.call);
  }
}

/** The operation of a transaction's call. */
export const TXN = "txn";

/** The function of a micro-operation that appends a value to a key. */
export const APPEND = "append";

/** The function of a micro-operation that reads a key's list or value. */
export const READ = "read";

/** The function of a micro-operation that writes a value to a register. */
export const WRITE = "write";

/** A history that is no history of list-append or register transactions. */
export class TransactionError extends Error {
  /**
   * Returns the error of a history that is no history of list-append or
   * register transactions.
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
 * append, and the written value of a write. For a read, it is the list that
 * the read returned, or undefined for a read whose transaction did not
 * commit. A register read returned the list of its one value, or the empty
 * list for the initial value.
 */
export interface Mop {
  /** The micro-operation's function. */
  readonly fn: typeof APPEND | typeof WRITE | typeof READ;
  /** The key. */
  readonly key: unknown;
  /** The appended or written value, or the list that a read returned. */
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

/**
 * Reports whether a history is a register history: whether one of its
 * micro-operations writes.
 *
 * @param txns - The transactions of the history.
 * @returns True for a register history.
 * @throws TransactionError for a history that both appends and writes.
 */
export function registers(txns: readonly Transaction[]): boolean {
  const first = (fn: Mop["fn"]): number | undefined =>
    txns.find((txn) => txn.mops.some((mop) => mop.fn === fn))?.call;
  const [appends, writes] = [first(APPEND), first(WRITE)];
  if (appends !== undefined && writes !== undefined) {
    throw new TransactionError(
      `call ${appends} appends and call ${writes} writes, and a history is either list-append or registers`,
    );
  }
  return writes !== undefined;
}

/**
 * Returns a history's transactions in the order of their invocations.
 *
 * @param events - The events of the history.
 * @returns The transactions.
 * @throws TransactionError when a call is no list-append or register
 *   transaction, an ok output does not repeat its invocation's
 *   micro-operations, a key or a value has no typed literal, a value is
 *   appended or written to one key twice, the history both appends and
 *   writes, or a list-append read returned no list.
 */
export function transactions(events: readonly Event[]): Transaction[] {
  const completions = new Map<number, Event>();
  for (const event of events) {
    if (event.kind !== "invoke") {
      completions.set(event.call, event);
    }
  }
  const produced = new Map<string, number>();
  const out: Transaction[] = [];
  for (const event of events.filter((one) => one.kind === "invoke")) {
    const txn = transactionOf(event, completions.get(event.index));
    register(txn, produced);
    out.push(txn);
  }
  const ofRegisters = registers(out);
  return out.map((txn) => readAs(txn, ofRegisters));
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
