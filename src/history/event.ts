/**
 * The events of a history, and the JSON form in which a record states them.
 *
 * Every event states its index in recording order, its kind, the call that
 * it belongs to, the client that made the call and the process that the
 * client was on. An invocation states the operation, the arguments and the
 * keys of the call. An ok completion states the output, and a fail or an
 * unknown completion the error.
 */

import { faultText } from "../matcher/verdict.js";
import { detail as literalOf } from "../record/literal.js";

/** The kind of an event: the invocation of a call, or how the call completed. */
export type Kind = "invoke" | "ok" | "fail" | "unknown";

/** The invocation of a call, which starts it. */
export interface Invocation {
  /** The event's position in recording order, from 0. */
  readonly index: number;
  /** The event's kind. */
  readonly kind: "invoke";
  /** The index of the call's invocation, which is the event's own index. */
  readonly call: number;
  /** The client that made the call. */
  readonly client: number;
  /** The process that made the call. */
  readonly process: number;
  /** The call's operation. */
  readonly operation: string;
  /** The call's arguments. */
  readonly args: readonly unknown[];
  /** The keys that the call touches. A call without keys touches every key. */
  readonly keys: readonly unknown[];
}

/** The completion of a call: ok with its output, or fail or unknown with its error. */
export interface Completion {
  /** The event's position in recording order. */
  readonly index: number;
  /** The event's kind. */
  readonly kind: "ok" | "fail" | "unknown";
  /** The index of the call's invocation. */
  readonly call: number;
  /** The client that made the call. */
  readonly client: number;
  /** The process that made the call. */
  readonly process: number;
  /** What the call returned, for an ok completion, and undefined otherwise. */
  readonly output: unknown;
  /** The call's error, for a fail or an unknown completion, and undefined otherwise. */
  readonly error: unknown;
}

/** One recorded event of a history: an invocation, or the completion of the call that an invocation started. */
export type Event = Invocation | Completion;

/**
 * Returns an event in the history's JSON form: the index, the kind, the
 * call, the client and the process, and then the operation, the args and
 * the keys of an invocation, the output of an ok completion, or the text of
 * the error of a fail or an unknown completion. The args, the keys and the
 * output are typed literals, and a value that no typed literal states is
 * an opaque literal of its text.
 *
 * @param event - The event.
 * @returns The JSON value.
 */
export function eventJson(event: Event): Record<string, unknown> {
  const head = {
    index: event.index,
    kind: event.kind,
    call: event.call,
    client: event.client,
    process: event.process,
  };
  if (event.kind === "invoke") {
    return {
      ...head,
      operation: event.operation,
      args: event.args.map(literalOf),
      keys: event.keys.map(literalOf),
    };
  }
  if (event.kind === "ok") return { ...head, output: literalOf(event.output) };
  return { ...head, error: faultText(event.error) };
}
