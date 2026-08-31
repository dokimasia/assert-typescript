/**
 * The corpus, and driving it against both surfaces.
 *
 * This is what checks meaning rather than membership: the same cases
 * run in every implementation of the standard, so a library that means
 * something different by the same name fails here.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as check from "../check.js";
import type { Recorder } from "../seat.js";
import * as soft from "../soft.js";
import { LANGUAGE, names } from "./definition.js";
import { decode, type Literal } from "./literal.js";

/** Where the vendored corpus sits, relative to this module. */
const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "spec", "corpus");

/** An assertion as a corpus case calls it: a seat, then its arguments. */
type Invoker = (seat: Recorder, ...args: unknown[]) => unknown;

/** One corpus case: what an assertion is given, and what it must report. */
export interface Case {
  /** The case's id, which names its assertion first. */
  readonly id: string;
  /** The assertion under test, by canonical id. */
  readonly assertion: string;
  /** Its arguments, already decoded. */
  readonly args: readonly unknown[];
  /** Whether the assertion must pass or fail. */
  readonly expect: "pass" | "fail";
  /**
   * What the failure's record must hold, keyed by the names the
   * assertion declares. Every field stated must match; a field the
   * case leaves out is not checked.
   */
  readonly detail: Readonly<Record<string, unknown>>;
  /**
   * The behaviour this case hands the assertion in place of arguments,
   * or undefined for a case that states values.
   */
  readonly subject?: string;
  /** Why a language skips this case, by language. */
  readonly skip: Readonly<Record<string, string>>;
}

/** Both surfaces, so every case is driven through each. */
export const SURFACES: Record<string, Record<string, Invoker>> = {
  check: check as unknown as Record<string, Invoker>,
  soft: soft as unknown as Record<string, Invoker>,
};

/**
 * Answer every case the vendored corpus states.
 *
 * @returns The cases, with their arguments decoded.
 */
export function cases(): Case[] {
  const found: Case[] = [];
  for (const file of readdirSync(CORPUS).sort()) {
    if (!file.endsWith(".json")) continue;

    const document = JSON.parse(readFileSync(join(CORPUS, file), "utf8")) as {
      assertion: string;
      cases: {
        id: string;
        args?: Literal[];
        expect: "pass" | "fail";
        detail?: Record<string, Literal>;
        subject?: { kind: string };
        skip?: Record<string, string>;
      }[];
    };

    for (const one of document.cases) {
      found.push({
        id: one.id,
        assertion: document.assertion,
        args: (one.args ?? []).map(decode),
        expect: one.expect,
        ...(one.subject ? { subject: one.subject.kind } : {}),
        detail: Object.fromEntries(
          Object.entries(one.detail ?? {}).map(([name, value]) => [
            name,
            decode(value),
          ]),
        ),
        skip: one.skip ?? {},
      });
    }
  }
  return found;
}

/**
 * Answer why this language skips a case, or undefined when it does not.
 *
 * @param one The case to ask about.
 * @returns The declared reason, or undefined.
 */
export function skipReason(one: Case): string | undefined {
  return one.skip[LANGUAGE];
}

/**
 * Answer the name this language gives a case's assertion.
 *
 * @param one The case to ask about.
 * @returns The member name, or undefined when the naming table has none.
 */
export function memberFor(one: Case): string | undefined {
  return names()[one.assertion];
}

/**
 * Hold a recorder to what a case says must have happened.
 *
 * @param one The case that was driven.
 * @param recorder The seat the assertion reported to.
 * @returns What went wrong, or undefined when the two agree.
 */
export function mismatch(one: Case, recorder: Recorder): string | undefined {
  if (one.expect === "pass") {
    return recorder.failed ? `expected a pass, got: ${recorder.message}` : undefined;
  }
  if (!recorder.failed) return "expected a failure, got a pass";

  const [record] = recorder.failures;
  if (record === undefined) {
    return "reported no record; the assertion did not report one";
  }

  for (const [name, want] of Object.entries(one.detail)) {
    if (!(name in record.detail)) {
      return `the record holds no detail "${name}", want ${show(want)}`;
    }
    const held = record.detail[name];
    if (!same(held, want)) {
      return `detail "${name}" is ${show(held)}, want ${show(want)}`;
    }
  }
  return undefined;
}

/** Say one value for a mismatch message. */
function show(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Whether a reported value matches what a case states.
 *
 * A NaN is unequal to itself under the standard's own rules, which
 * would make a case stating one impossible to satisfy. Here the
 * question is whether the assertion reported the value the case named,
 * so two NaNs count as the same value.
 *
 * @param held What the assertion reported.
 * @param want What the case states.
 * @returns Whether they are the same value.
 */
function same(held: unknown, want: unknown): boolean {
  if (typeof held === "number" && typeof want === "number") {
    if (Number.isNaN(held) && Number.isNaN(want)) return true;
  }
  return JSON.stringify(held) === JSON.stringify(want);
}
