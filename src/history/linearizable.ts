/**
 * The check that a history is linearizable: that the calls of each of its
 * partitions have an order that respects their real-time order and that the
 * spec accepts.
 */

import { callSite, Failure } from "../failure.js";
import { Fault, ofOperation } from "../matcher/fault.js";
import { Mode, type Seat } from "../matcher/seat.js";
import { Running } from "../matcher/verdict.js";
import { detail as literalOf } from "../record/literal.js";
import { History, recorded } from "./history.js";
import { configure, type Option } from "./option.js";
import {
  type Checked,
  callsOf,
  concurrency,
  type Partition,
  partitionsOf,
  type Span,
  spanJson,
} from "./partition.js";
import {
  type Ending,
  type Limit,
  Search,
  type SpecError,
  type Verdict,
} from "./search.js";
import type { Spec } from "./spec.js";

/** The assertion of the record. */
export const LINEARIZABLE = "linearizable";

/** The operation that the faults of a check name. */
const OP = "history.isLinearizable";

/**
 * The detail of the record of a check: the ten fields of the definition. A
 * check that passed states the outcome, the partitions and the steps, and
 * leaves the fields of a reported partition empty.
 */
export interface Detail<S> {
  /** How the check ended. */
  readonly outcome: Verdict;
  /** The number of partitions. */
  readonly partitions: number;
  /** The steps of the partitions up to and including the reported one, and of every partition of a check that passed. */
  readonly steps: number;
  /** The keys of the reported partition, and none for every key. */
  readonly partition: readonly unknown[];
  /** The number of calls of the reported partition. */
  readonly calls: number;
  /** The most calls of the reported partition that are open at one event. */
  readonly concurrency: number;
  /** The frontier's order of calls. */
  readonly linearized: readonly Span[];
  /** The frontier's states. */
  readonly states: readonly S[];
  /** The calls that the spec rejected at the frontier. */
  readonly candidates: readonly Span[];
  /** The limit that stopped an undecided check, and undefined for a violated one. */
  readonly limit: Limit | undefined;
}

/** Returns the detail of a check that reports partition p of partitions, whose search ended as ending. */
function reported<S>(
  p: Partition,
  ending: Ending<S>,
  partitions: number,
  steps: number,
): Detail<S> {
  const spans = (positions: readonly number[]) =>
    positions.map((position) => (p.calls[position] as Checked).span);
  return {
    outcome: ending.outcome,
    partitions,
    steps,
    partition: p.keys,
    calls: p.calls.length,
    concurrency: concurrency(p.calls),
    linearized: spans(ending.linearized),
    states: ending.states,
    candidates: spans(ending.candidates),
    limit: ending.limit,
  };
}

/** Returns the detail of a check that passed in steps, over partitions. */
function passed<S>(partitions: number, steps: number): Detail<S> {
  return {
    outcome: "passed",
    partitions,
    steps,
    partition: [],
    calls: 0,
    concurrency: 0,
    linearized: [],
    states: [],
    candidates: [],
    limit: undefined,
  };
}

/**
 * Returns the detail of the check of history against spec under options:
 * the first violated partition, else the first undecided one, else a pass.
 *
 * @param history - The history.
 * @param spec - The spec.
 * @param options - The limits of the check.
 * @returns The detail.
 * @throws SpecError when a function of the spec throws.
 */
export function check<S>(
  history: History,
  spec: Spec<S>,
  options: readonly Option[],
): Detail<S> {
  const config = configure(options);
  const deadline =
    config.timeLimit > 0
      ? performance.now() + config.timeLimit
      : Number.POSITIVE_INFINITY;
  const { events, ids } = recorded(history);
  const partitions = partitionsOf(callsOf(events, ids));
  let steps = 0;
  let undecided: Detail<S> | undefined;
  for (const p of partitions) {
    const ending = new Search(p.calls, spec, config, deadline).run();
    steps += ending.steps;
    if (ending.outcome === "passed") continue;
    const detail = reported(p, ending, partitions.length, steps);
    if (ending.outcome === "violated") return detail;
    undecided ??= detail;
  }
  return undecided ?? passed(partitions.length, steps);
}

/**
 * Returns the detail of the check of every call of history as one
 * partition, whatever keys the calls state, with the default limits. A
 * machine of stateful checks the history of its steps this way, because its
 * spec states one state of the whole subject. A history without calls passes
 * in no partition.
 *
 * @param history - The history.
 * @param spec - The spec.
 * @returns The detail, and the states after the order that the search
 *   found: the initial state for a history without calls, and none for a
 *   check that did not pass.
 * @throws SpecError when a function of the spec throws.
 */
export function whole<S>(
  history: History,
  spec: Spec<S>,
): { readonly detail: Detail<S>; readonly states: readonly S[] } {
  const { events, ids } = recorded(history);
  const calls = callsOf(events, ids);
  const ending = new Search(calls, spec, configure([]), Number.POSITIVE_INFINITY).run();
  if (ending.outcome === "passed") {
    return {
      detail: passed(calls.length === 0 ? 0 : 1, ending.steps),
      states: ending.states,
    };
  }
  return { detail: reported({ keys: [], calls }, ending, 1, ending.steps), states: [] };
}

/**
 * Returns the detail of a failing check as the record states it: each field
 * of the definition by its name, with its TypeScript value, and null for the
 * limit of a violated check.
 *
 * @param detail - The detail.
 * @returns The fields.
 */
export function fieldsOf(detail: Detail<unknown>): Record<string, unknown> {
  return { ...detail, limit: detail.limit ?? null };
}

/**
 * Returns the detail of a failing check as its call record states it: the
 * counts as numbers, each key and each state as a typed literal, each call
 * in the history's JSON form, and null for the limit of a violated check.
 *
 * @param detail - The detail.
 * @returns The JSON value.
 */
export function detailJson(detail: Detail<unknown>): Record<string, unknown> {
  return {
    outcome: detail.outcome,
    partitions: detail.partitions,
    steps: detail.steps,
    partition: detail.partition.map(literalOf),
    calls: detail.calls,
    concurrency: detail.concurrency,
    linearized: detail.linearized.map(spanJson),
    states: detail.states.map(literalOf),
    candidates: detail.candidates.map(spanJson),
    limit: detail.limit ?? null,
  };
}

/**
 * Checks that the calls of each partition of history have a linearization
 * that spec accepts: an order that respects their real-time order and that
 * spec accepts as a sequence. It fails the seat with one record of the
 * assertion linearizable when the check does not pass, whose contract is
 * msg and whose location is the call of isLinearizable.
 *
 * The check removes the calls that failed. A call that completed as ok is
 * known, and takes effect between its invocation and its completion. A
 * call whose outcome is unknown, and a pending call, takes effect at some
 * point after its invocation, or never. Call a precedes call b in real time
 * when a completed before b was invoked. Two calls that share a key are in
 * one partition, and a call without keys puts every call into one
 * partition. The check searches the partitions in the order of their first
 * invocation, each from the spec's initial state, one at a time, with the
 * search that the definition fixes. It reports the first violated
 * partition, and otherwise the first undecided one. An undecided check fails
 * as a violated one does.
 *
 * The record's detail states the ten fields of the definition: outcome,
 * partitions, steps, partition, calls, concurrency, linearized, states,
 * candidates and limit. linearized and candidates are spans of the history's
 * calls, and limit is null for a violated check.
 *
 * A history that is no History, a spec without initial or next, and a
 * function of the spec that throws end the call with a fault. The fault of
 * a function that throws names the call that the search stepped.
 *
 * @param seat - Where the failure is reported.
 * @param history - The history.
 * @param spec - The sequential specification.
 * @param msg - The contract under test.
 * @param options - The limits of the check: budget, memoLimit, timeLimit and workers.
 */
export function isLinearizable<S>(
  seat: Seat,
  history: History,
  spec: Spec<S>,
  msg: string,
  ...options: Option[]
): void {
  seat.helper();
  const run = Running.of(seat);
  if (!(history instanceof History)) {
    run.fault(
      Mode.Fatal,
      LINEARIZABLE,
      msg,
      ofOperation(OP, "the history is no History"),
    );
    return;
  }
  if (typeof spec?.initial !== "function" || typeof spec.next !== "function") {
    run.fault(
      Mode.Fatal,
      LINEARIZABLE,
      msg,
      ofOperation(OP, "the spec states no initial or no next"),
    );
    return;
  }
  let detail: Detail<S>;
  try {
    detail = check(history, spec, options);
  } catch (err) {
    const { call, message, cause } = err as SpecError;
    const at = call === undefined ? "" : `calls[${call}]`;
    run.fault(
      Mode.Fatal,
      LINEARIZABLE,
      msg,
      ofOperation(OP, new Fault(at, message, cause)),
    );
    return;
  }
  if (detail.outcome === "passed") {
    run.pass(Mode.Fatal, LINEARIZABLE, msg);
    return;
  }
  run.failRun(
    Mode.Fatal,
    new Failure(LINEARIZABLE, msg, fieldsOf(detail), callSite()),
    detailJson(detail),
  );
}
