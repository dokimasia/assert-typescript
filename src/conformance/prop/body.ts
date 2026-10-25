// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The bodies of the property vectors, stated as data.
 *
 * A body spec draws one value, labelled `value`, from its `draw` generator.
 * It then classifies the case under each `classify` label whose predicate
 * is true, rejects the case when `rejects-when` is true, skips the run with
 * the reason of the first `skips` entry whose predicate is true, and fails
 * it with the identity of the first `fails` entry whose predicate is true,
 * in that order.
 *
 * Four named bodies state what no predicate can:
 *
 * - `draws-nothing` requests no input.
 * - `diverges` draws an integer in [0, 9] on its first call and a boolean on
 *   every later call.
 * - `fails-once` draws an integer in [0, 10^9] and fails with identity
 *   `once` the first time that it draws a value above 1,000.
 * - `fails-then-skips` draws an integer in [0, 10^9] and fails with
 *   identity `once` the first time that it draws a value above 1,000. Every
 *   later call draws its value and then skips with the reason `after`.
 */

import type { Case } from "../../prop/engine/case.js";
import type { Body } from "../../prop/engine/execution.js";
import { build } from "./generator.js";
import { type Predicate, predicate } from "./predicate.js";

/** A body's JSON object. */
type Spec = Readonly<Record<string, unknown>>;

/** Returns a label, an identity or a reason, which a spec states as a string. */
function nameOf(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      `prop: ${JSON.stringify(value)} is no label, no identity and no reason`,
    );
  }
  return value;
}

/** The generator of the integer that `fails-once` and `fails-then-skips` draw. */
const WIDE = { gen: "integer", min: 0, max: 1_000_000_000 } as const;

/** The value above which `fails-once` and `fails-then-skips` fail. */
const FAILS_ABOVE = 1000n;

/** Returns the body that requests no input. */
function nothing(): Body {
  return () => undefined;
}

/** Returns a body that requests other bounds after its first call. */
function diverging(): Body {
  let calls = 0;
  const digit = build({ gen: "integer", min: 0, max: 9 });
  const coin = build({ gen: "boolean" });
  return (c: Case) => {
    c.draw(calls > 0 ? coin : digit, DRAWN);
    calls += 1;
  };
}

/** Returns a body that fails only the first time it draws above 1,000. */
function failingOnce(): Body {
  let failed = false;
  const wide = build(WIDE);
  return (c: Case) => {
    const value = c.draw(wide, DRAWN) as bigint;
    if (value > FAILS_ABOVE && !failed) {
      failed = true;
      c.fail("once");
    }
  };
}

/** Returns a body that fails above 1,000 once, then skips every call. */
function failingThenSkipping(): Body {
  let failed = false;
  const wide = build(WIDE);
  return (c: Case) => {
    const value = c.draw(wide, DRAWN) as bigint;
    if (failed) {
      c.skip("after");
    }
    if (value > FAILS_ABOVE) {
      failed = true;
      c.fail("once");
    }
  };
}

/** Returns the entries of the list key of a spec, each its string under name and its predicate. */
function entriesOf(
  spec: Spec,
  key: string,
  name: string,
): (readonly [string, Predicate])[] {
  const entries = spec[key] ?? [];
  if (!Array.isArray(entries)) {
    throw new Error(`prop: ${key} is ${JSON.stringify(entries)}, not a list`);
  }
  return entries.map((entry: Spec) => [nameOf(entry[name]), predicate(entry["when"])]);
}

/** Returns the string of the first entry whose predicate is true of value, or undefined. */
function firstOf(
  entries: readonly (readonly [string, Predicate])[],
  value: unknown,
): string | undefined {
  return entries.find(([, test]) => test(value))?.[0];
}

/** Returns a body that draws once, then classifies, rejects, skips and fails. */
function drawing(spec: Spec): Body {
  const generator = build(spec["draw"]);
  const classify = spec["classify"] ?? {};
  if (typeof classify !== "object" || classify === null || Array.isArray(classify)) {
    throw new Error(`prop: classify is ${JSON.stringify(classify)}, not an object`);
  }
  const labels = Object.entries(classify).map(
    ([label, when]) => [label, predicate(when)] as const,
  );
  const rejects = "rejects-when" in spec ? predicate(spec["rejects-when"]) : undefined;
  const skips = entriesOf(spec, "skips", "reason");
  const fails = entriesOf(spec, "fails", "identity");
  return (c: Case) => {
    const value = c.draw(generator, DRAWN);
    for (const [label, test] of labels) {
      if (test(value)) {
        c.classify(label);
      }
    }
    if (rejects !== undefined) {
      c.assume(!rejects(value));
    }
    const reason = firstOf(skips, value);
    if (reason !== undefined) {
      c.skip(reason);
    }
    const identity = firstOf(fails, value);
    if (identity !== undefined) {
      c.fail(identity);
    }
  };
}

/** The label of a body's one draw. */
export const DRAWN = "value";

/**
 * Returns a fresh body for a spec. A named body keeps its own state.
 *
 * @param spec - The body's JSON object.
 * @returns The body.
 * @throws Error for a spec that names no body or misstates an entry.
 */
export function buildBody(spec: Spec): Body {
  switch (spec["kind"]) {
    case "draws-nothing":
      return nothing();
    case "diverges":
      return diverging();
    case "fails-once":
      return failingOnce();
    case "fails-then-skips":
      return failingThenSkipping();
    case undefined:
      return drawing(spec);
    default:
      throw new Error(`prop: ${JSON.stringify(spec["kind"])} names no body`);
  }
}
