// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The scripts and the intervals of the history vectors, recorded into a
 * History through its seam. A part of a vector that does not read is a
 * fault at that part.
 */

import { type Call, History } from "../../history/history.js";
import {
  fromIntervals,
  type Interval,
  type IntervalError,
} from "../../history/interval.js";
import { Fault } from "../../matcher/fault.js";
import { decode, type Literal } from "../literal.js";

/** A vector's JSON object. */
type Raw = Readonly<Record<string, unknown>>;

/** The completion kinds that an interval entry may state. */
const COMPLETIONS: ReadonlySet<unknown> = new Set(["ok", "fail", "unknown"]);

/** Returns the values that a list of typed literals states, and a fault at member for a value that does not decode. */
function values(raw: unknown, member: string): unknown[] {
  if (!Array.isArray(raw)) {
    throw new Fault(member, "the member is no list");
  }
  return raw.map((literal, i) => {
    try {
      return decode(literal as Literal);
    } catch (err) {
      throw new Fault(`${member}[${i}]`, "the value is no typed literal", {
        cause: err,
      });
    }
  });
}

/** Returns the value of a typed literal, and a fault at member for one that does not decode. */
function value(raw: unknown, member: string): unknown {
  try {
    return decode(raw as Literal);
  } catch (err) {
    throw new Fault(member, "the value is no typed literal", { cause: err });
  }
}

/** Reports whether apply, a call of the seam, throws. */
function refuses(apply: () => void): boolean {
  try {
    apply();
  } catch {
    return true;
  }
  return false;
}

/** Returns the interval that one entry of a seam vector states, and a fault at member for one it cannot read. */
function intervalOf(raw: Raw, member: string): Interval {
  const kind = raw["kind"];
  const end = raw["end"];
  if (
    (end === undefined) !== (kind === undefined) ||
    (kind !== undefined && !COMPLETIONS.has(kind))
  ) {
    throw new Fault(
      member,
      "the entry states a completion kind and an end, or neither",
    );
  }
  return {
    client: Number(raw["client"]),
    operation: String(raw["operation"]),
    args: values(raw["args"], `${member}.args`),
    keys: values(raw["keys"], `${member}.keys`),
    start: raw["start"] as number,
    end: end as number | undefined,
    kind: kind as Interval["kind"],
    output: kind === "ok" ? value(raw["output"], `${member}.output`) : undefined,
    error: kind === "ok" ? undefined : raw["error"],
  };
}

/**
 * The recording of a script through a history, entry by entry. A resume
 * vector records its script up to the events of each check in turn.
 */
export class Recording {
  /** The history of the recorded entries. */
  readonly history = new History();
  /** The entries of the script. */
  readonly entries: readonly Raw[];
  /** The member of the vector that states the script. */
  readonly #member: string;
  /** The call of the number of each entry that invokes. */
  readonly #calls = new Map<unknown, Call>();
  /** The number of recorded entries. */
  #recorded = 0;

  /**
   * Returns the recording of script, which has recorded no entry.
   *
   * @param script - The script.
   * @param member - The member of the vector that states the script.
   * @throws Fault at member for a script that is no list.
   */
  constructor(script: unknown, member: string) {
    if (!Array.isArray(script)) {
      throw new Fault(member, "the script is no list");
    }
    this.entries = script as Raw[];
    this.#member = member;
  }

  /**
   * Records the entries up to end, and returns the entry whose call of the
   * seam throws, or undefined when the seam refuses none. It records no entry
   * after the refused one.
   *
   * @param end - The index after the last entry to record.
   * @returns The refused entry, or undefined.
   * @throws Fault at an entry that does not read.
   */
  through(end: number): number | undefined {
    for (; this.#recorded < end; this.#recorded += 1) {
      if (refuses(this.#apply(this.#recorded))) {
        return this.#recorded;
      }
    }
    return undefined;
  }

  /** Returns the call of the seam that the entry i states, and a fault at the entry for one that does not read. */
  #apply(i: number): () => void {
    const raw = this.entries[i] as Raw;
    const at = `${this.#member}[${i}]`;
    const completing = (
      number: unknown,
      complete: (call: Call) => void,
    ): (() => void) => {
      const call = this.#calls.get(number);
      if (call === undefined) {
        throw new Fault(
          at,
          `the entry completes call ${String(number)}, which the script does not open`,
        );
      }
      return () => complete(call);
    };
    if ("invoke" in raw) {
      const args = values(raw["args"], `${at}.args`);
      const keys = values(raw["keys"], `${at}.keys`);
      return () => {
        this.#calls.set(
          raw["invoke"],
          this.history.invoke(
            Number(raw["client"]),
            String(raw["operation"]),
            args,
            ...keys,
          ),
        );
      };
    }
    if ("ok" in raw) {
      const output = value(raw["output"], `${at}.output`);
      return completing(raw["ok"], (call) => call.ok(output));
    }
    if ("fail" in raw) {
      return completing(raw["fail"], (call) => call.fail(raw["error"]));
    }
    if ("unknown" in raw) {
      return completing(raw["unknown"], (call) => call.unknown(raw["error"]));
    }
    throw new Fault(at, "the entry states no call of the seam");
  }
}

/**
 * Records script through a history, and returns the history and the entry
 * whose call of the seam throws, or undefined when the seam refuses none.
 * It records no entry after the refused one.
 */
export function record(
  script: unknown,
  member: string,
): {
  readonly history: History;
  readonly refused: number | undefined;
} {
  const recording = new Recording(script, member);
  const refused = recording.through(recording.entries.length);
  return { history: recording.history, refused };
}

/** Returns the history of a seam vector's intervals and the entry that fromIntervals refuses, or undefined. */
export function intervals(raw: unknown): {
  readonly history: History | undefined;
  readonly refused: number | undefined;
} {
  if (!Array.isArray(raw)) {
    throw new Fault("intervals", "the intervals are no list");
  }
  const entries = (raw as Raw[]).map((entry, i) =>
    intervalOf(entry, `intervals[${i}]`),
  );
  try {
    return { history: fromIntervals(entries), refused: undefined };
  } catch (err) {
    // fromIntervals throws an IntervalError alone.
    return { history: undefined, refused: (err as IntervalError).entry };
  }
}
