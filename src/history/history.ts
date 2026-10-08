/**
 * A history: the invocations and the completions of the calls that the
 * clients of an object make, in one recording order.
 *
 * Each client starts on a process of its own, and processes are numbered in
 * the order of their first invocation. A call that completes as unknown may
 * still be in progress inside the subject, so its client continues on a new
 * process. Every process has at most one open call. The runtime runs one
 * thread, so the order in which the clients record is the order of the
 * events.
 */

import { show } from "../matcher/inspect.js";
import { encode, json, type Literal } from "../record/literal.js";
import type { Event } from "./event.js";

/**
 * Returns a typed literal with the entries of each map in the order of
 * their JSON texts, so two maps of equal entries have one literal.
 */
function normalized(literal: Literal): Literal {
  if (literal.type === "map" && Array.isArray(literal["entries"])) {
    const entries = (literal["entries"] as [Literal, Literal][])
      .map(([k, v]) => [normalized(k), normalized(v)] as const)
      .map((pair) => [json(pair), pair] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, pair]) => pair);
    return { ...literal, entries };
  }
  if (literal.type === "list" && Array.isArray(literal["items"])) {
    return { ...literal, items: (literal["items"] as Literal[]).map(normalized) };
  }
  if (literal.type === "record") {
    const fields = (literal["fields"] as [string, Literal][]).map(
      ([name, value]) => [name, normalized(value)] as const,
    );
    return { ...literal, fields };
  }
  return literal;
}

/**
 * Returns the identity of a key or a value: the JSON text of its typed
 * literal, with the entries of each map in one order. Two values have one
 * identity when their typed literals are equal, whatever order the entries
 * of a map are in.
 *
 * @param value - The value.
 * @returns The identity, or undefined for a value that no typed literal states.
 */
export function identityOf(value: unknown): string | undefined {
  const literal = encode(value);
  return literal === undefined ? undefined : json(normalized(literal));
}

/** The state of a history, which the checks read. */
interface State {
  /** The events, in recording order. */
  readonly events: Event[];
  /** The identities of each event's keys, and none for a completion. */
  readonly ids: (readonly string[])[];
  /** The index of the invocation of the open call of each client that has one. */
  readonly open: Map<number, number>;
  /** The process of each client. */
  readonly process: Map<number, number>;
  /** The number of processes so far. */
  processes: number;
}

/** The state of each history. */
const STATES = new WeakMap<History, State>();

/** The kind of a completion. */
type Ending = "ok" | "fail" | "unknown";

/**
 * An open call of a {@link History}, through which its client records the
 * completion. Two completions of one call are a usage error.
 */
export class Call {
  /** Records a completion of the call. */
  readonly #complete: (kind: Ending, value: unknown) => void;

  /**
   * Returns the call whose completions complete records. History.invoke
   * constructs each call.
   *
   * @param complete - Records a completion of the call.
   */
  constructor(complete: (kind: Ending, value: unknown) => void) {
    this.#complete = complete;
  }

  /**
   * Records that the call returned output and took effect.
   *
   * @param output - What the call returned.
   * @throws Error when the call has completed already.
   */
  ok(output: unknown): void {
    this.#complete("ok", output);
  }

  /**
   * Records that the call took no effect and returned nothing that a spec
   * checks, such as a refused connection. An error that states what the
   * subject observed is an output for {@link Call.ok}: a compare-and-set
   * that refuses because the value differs returns false.
   *
   * @param error - The call's error.
   * @throws Error when the call has completed already.
   */
  fail(error: unknown): void {
    this.#complete("fail", error);
  }

  /**
   * Records that the call ended without an outcome, such as a timeout, a
   * lost reply or a crash. The call may still take effect, so its client's
   * next invocation starts on a new process.
   *
   * @param error - The call's error.
   * @throws Error when the call has completed already.
   */
  unknown(error: unknown): void {
    this.#complete("unknown", error);
  }
}

/**
 * The events of one history, in recording order. The history keeps the
 * values that it receives and does not copy them, so a caller records a
 * copy of a value that the subject or the test changes later.
 */
export class History {
  /** Returns an empty history. */
  constructor() {
    STATES.set(this, {
      events: [],
      ids: [],
      open: new Map(),
      process: new Map(),
      processes: 0,
    });
  }

  /**
   * Records an invocation of operation with args by client, and returns the
   * call through which the client records the completion. keys lists the
   * keys that the call touches, and a call without keys touches every key.
   * Two keys are one key when their typed literals are equal, so two maps of
   * equal entries are one key whatever order their entries are in.
   *
   * @param client - The client that makes the call.
   * @param operation - The call's operation.
   * @param args - The call's arguments.
   * @param keys - The keys that the call touches.
   * @returns The call.
   * @throws Error when client has a call open.
   * @throws TypeError when a key has no typed literal.
   */
  invoke(
    client: number,
    operation: string,
    args: readonly unknown[],
    ...keys: unknown[]
  ): Call {
    const state = STATES.get(this) as State;
    const open = state.open.get(client);
    if (open !== undefined) {
      throw new Error(
        `history: invoke(${client}, ${JSON.stringify(operation)}) while call ${open} of client ${client} is open`,
      );
    }
    const ids = keys.map((key) => {
      const id = identityOf(key);
      if (id === undefined) {
        throw new TypeError(
          `history: invoke(${client}, ${JSON.stringify(operation)}) states the key ${show(key)}, which no typed literal states`,
        );
      }
      return id;
    });
    let process = state.process.get(client);
    if (process === undefined) {
      process = state.processes;
      state.processes += 1;
      state.process.set(client, process);
    }
    const index = state.events.length;
    state.events.push({
      index,
      kind: "invoke",
      call: index,
      client,
      process,
      operation,
      args,
      keys,
    });
    state.ids.push(ids);
    state.open.set(client, index);
    return new Call((kind, value) => complete(state, index, kind, value));
  }

  /**
   * Returns the recorded events in recording order: the events with the
   * indices 0 to n - 1 for every event recorded before the call.
   *
   * @returns A copy of the events.
   */
  events(): readonly Event[] {
    return [...(STATES.get(this) as State).events];
  }
}

/** Records the completion of kind of the call whose invocation is at index call. */
function complete(state: State, call: number, kind: Ending, value: unknown): void {
  const invocation = state.events[call] as Event;
  if (state.open.get(invocation.client) !== call) {
    throw new Error(`history: call ${call} completes a second time`);
  }
  state.open.delete(invocation.client);
  if (kind === "unknown") state.process.delete(invocation.client);
  const index = state.events.length;
  state.events.push({
    index,
    kind,
    call,
    client: invocation.client,
    process: invocation.process,
    output: kind === "ok" ? value : undefined,
    error: kind === "ok" ? undefined : value,
  });
  state.ids.push([]);
}

/**
 * Returns the events of a history and the identities of each event's keys,
 * each a copy, for a check of the history.
 *
 * @param history - The history.
 * @returns The events, and the identities of the keys of each.
 */
export function recorded(history: History): {
  readonly events: readonly Event[];
  readonly ids: readonly (readonly string[])[];
} {
  const state = STATES.get(history) as State;
  return { events: [...state.events], ids: [...state.ids] };
}
