/**
 * A history built from calls that a log recorded with a start and an end on
 * one clock.
 */

import { show } from "../matcher/inspect.js";
import { type Call, History, identityOf } from "./history.js";

/**
 * A call recorded with a start and an end on one clock, as a log of a
 * system's calls states it. A pending call states no end and no kind.
 */
export interface Interval {
  /** The client that made the call. */
  readonly client: number;
  /** The call's operation. */
  readonly operation: string;
  /** The call's arguments. */
  readonly args: readonly unknown[];
  /** The keys that the call touches. A call without keys touches every key. */
  readonly keys: readonly unknown[];
  /** The time the call started, an integer. */
  readonly start: number | bigint;
  /** The time the call completed, and undefined for a pending call. */
  readonly end?: number | bigint | undefined;
  /** How the call completed, and undefined for a pending call. */
  readonly kind?: "ok" | "fail" | "unknown" | undefined;
  /** What the call returned, for ok. */
  readonly output?: unknown;
  /** The call's error, for fail and unknown. */
  readonly error?: unknown;
}

/** An entry that {@link fromIntervals} refuses, with its position. */
export class IntervalError extends RangeError {
  /** The position of the entry. */
  readonly entry: number;

  /**
   * Returns the error of the entry at a position, and the rule it breaks.
   *
   * @param entry - The position of the entry.
   * @param reason - The rule that the entry breaks.
   */
  constructor(entry: number, reason: string) {
    super(`history: entry ${entry} ${reason}`);
    this.name = "IntervalError";
    this.entry = entry;
  }
}

/** The kinds that complete a call. */
const COMPLETIONS: ReadonlySet<unknown> = new Set(["ok", "fail", "unknown"]);

/** Reports whether two closed intervals share an instant. A pending interval has no end. */
function overlap(a: Interval, b: Interval): boolean {
  return (
    (a.end === undefined || b.start <= a.end) &&
    (b.end === undefined || a.start <= b.end)
  );
}

/** Returns the rule that entry breaks, against the earlier entries of its client, or undefined. */
function refusal(
  entry: Interval,
  earlier: readonly [number, Interval][],
): string | undefined {
  if (entry.kind !== undefined && !COMPLETIONS.has(entry.kind)) {
    return `states the kind ${show(entry.kind)}, which completes no call`;
  }
  if ((entry.kind === undefined) !== (entry.end === undefined)) {
    return "states a completion kind and an end, or neither";
  }
  if (entry.end !== undefined && entry.end < entry.start) {
    return `ends at ${entry.end}, before it starts at ${entry.start}`;
  }
  const bad = entry.keys.findIndex((one) => identityOf(one) === undefined);
  if (bad >= 0) {
    return `states the key ${show(entry.keys[bad])}, which no typed literal states`;
  }
  const other = earlier.find(([, before]) => overlap(before, entry));
  if (other !== undefined)
    return `overlaps entry ${other[0]} of client ${entry.client}`;
  return undefined;
}

/** A moment of an entry: its invocation or its completion, at its time. */
type Moment = readonly [time: number | bigint, phase: 0 | 1, entry: number];

/**
 * Compares two moments by time, then phase, then entry. An entry has one
 * moment of each phase, so no two moments are equal.
 */
function byMoment(a: Moment, b: Moment): number {
  if (a[0] < b[0]) return -1;
  if (a[0] > b[0]) return 1;
  return a[1] - b[1] || a[2] - b[2];
}

/**
 * Returns the history of calls recorded with a start and an end on one
 * clock. The events are in time order. At one time, an invocation comes
 * before a completion, and the invocations, or the completions, keep the
 * order of their entries. Each interval is closed, so two entries that
 * share an instant overlap, and a pending entry overlaps every later entry
 * of its client. Times are compared and never subtracted, so they may be
 * numbers or bigints.
 *
 * @param entries - The calls.
 * @returns The history.
 * @throws RangeError for the first entry, in the given order, that states
 *   a kind that completes no call, an end without a kind or a kind without
 *   an end, an end before its start, a key that no typed literal states, or
 *   an interval that overlaps an earlier entry of its client. The error's
 *   message names the entry.
 */
export function fromIntervals(entries: readonly Interval[]): History {
  const earlier = new Map<number, [number, Interval][]>();
  entries.forEach((entry, position) => {
    const own = earlier.get(entry.client) ?? [];
    const reason = refusal(entry, own);
    if (reason !== undefined) throw new IntervalError(position, reason);
    own.push([position, entry]);
    earlier.set(entry.client, own);
  });
  const moments: Moment[] = [];
  entries.forEach((entry, position) => {
    moments.push([entry.start, 0, position]);
    if (entry.end !== undefined) moments.push([entry.end, 1, position]);
  });
  moments.sort(byMoment);
  const history = new History();
  const calls = new Map<number, Call>();
  for (const [, phase, position] of moments) {
    const entry = entries[position] as Interval;
    if (phase === 0) {
      calls.set(
        position,
        history.invoke(entry.client, entry.operation, entry.args, ...entry.keys),
      );
      continue;
    }
    const call = calls.get(position) as Call;
    if (entry.kind === "ok") call.ok(entry.output);
    else if (entry.kind === "fail") call.fail(entry.error);
    else call.unknown(entry.error);
  }
  return history;
}
