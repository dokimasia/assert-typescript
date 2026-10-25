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
  if (!Array.isArray(script)) {
    throw new Fault(member, "the script is no list");
  }
  const history = new History();
  const calls = new Map<unknown, Call>();
  for (const [i, raw] of (script as Raw[]).entries()) {
    const at = `${member}[${i}]`;
    const completing = (
      number: unknown,
      complete: (call: Call) => void,
    ): (() => void) => {
      const call = calls.get(number);
      if (call === undefined) {
        throw new Fault(
          at,
          `the entry completes call ${String(number)}, which the script does not open`,
        );
      }
      return () => complete(call);
    };
    let apply: () => void;
    if ("invoke" in raw) {
      const args = values(raw["args"], `${at}.args`);
      const keys = values(raw["keys"], `${at}.keys`);
      apply = () => {
        calls.set(
          raw["invoke"],
          history.invoke(
            Number(raw["client"]),
            String(raw["operation"]),
            args,
            ...keys,
          ),
        );
      };
    } else if ("ok" in raw) {
      const output = value(raw["output"], `${at}.output`);
      apply = completing(raw["ok"], (call) => call.ok(output));
    } else if ("fail" in raw) {
      apply = completing(raw["fail"], (call) => call.fail(raw["error"]));
    } else if ("unknown" in raw) {
      apply = completing(raw["unknown"], (call) => call.unknown(raw["error"]));
    } else {
      throw new Fault(at, "the entry states no call of the seam");
    }
    if (refuses(apply)) {
      return { history, refused: i };
    }
  }
  return { history, refused: undefined };
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
