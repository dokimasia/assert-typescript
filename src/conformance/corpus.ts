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
import type { Option } from "../matcher/option.js";
import * as option from "../option.js";
import { DEFINITION } from "../record/call.js";
import type { Recorder } from "../seat.js";
import * as soft from "../soft.js";
import {
  type AssertionSpec,
  assertions,
  LANGUAGE,
  names,
  relaxationNames,
} from "./definition.js";
import { canonical, decode, type Literal, Objects } from "./literal.js";

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
  /** The ids of the relaxations that the call passes. */
  readonly options: readonly string[];
  /** Whether the assertion must pass or fail. */
  readonly expect: "pass" | "fail";
  /**
   * What the failure's record must state, keyed by the names the
   * assertion declares. Every field stated must match; a field the case
   * leaves out is not checked.
   */
  readonly detail: Readonly<Record<string, unknown>>;
  /** The detail fields that the assertion declares: a failure's record states exactly these. */
  readonly fields: readonly string[];
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

/** A corpus file, as the definition states it. */
interface CorpusFile {
  readonly assertion: string;
  readonly cases: readonly {
    readonly id: string;
    readonly args?: readonly Literal[];
    readonly options?: readonly string[];
    readonly expect: "pass" | "fail";
    readonly detail?: Readonly<Record<string, Literal>>;
    readonly subject?: { readonly kind: string };
    readonly skip?: Readonly<Record<string, string>>;
  }[];
}

/**
 * Answer every case the vendored corpus states.
 *
 * @returns The cases, with their arguments decoded: the references of one
 *   case decode to one object per id.
 */
export function cases(): Case[] {
  const declared = assertions();
  const found: Case[] = [];
  for (const file of readdirSync(CORPUS).sort()) {
    if (!file.endsWith(".json")) continue;

    const document = JSON.parse(readFileSync(join(CORPUS, file), "utf8")) as CorpusFile;
    for (const one of document.cases) {
      const objects = new Objects();
      found.push({
        id: one.id,
        assertion: document.assertion,
        args: (one.args ?? []).map((arg) => objects.decode(arg)),
        options: one.options ?? [],
        expect: one.expect,
        ...(one.subject ? { subject: one.subject.kind } : {}),
        detail: Object.fromEntries(
          Object.entries(one.detail ?? {}).map(([name, value]) => [
            name,
            decode(value),
          ]),
        ),
        fields: (declared[document.assertion] as AssertionSpec).detail_fields,
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
 * Returns the options that a case's call passes, as this language names
 * each relaxation.
 *
 * @param one The case to ask about.
 * @returns One option per relaxation that the case names.
 */
export function optionsOf(one: Case): Option[] {
  const named = relaxationNames();
  return one.options.map((id) => {
    const make = (option as unknown as Record<string, () => Option>)[named[id] ?? ""];
    if (make === undefined) throw new Error(`${one.id}: no option names ${id}`);
    return make();
  });
}

/** Whether a reported value is the value that a case states. */
function same(held: unknown, want: unknown): boolean {
  return canonical(held) === canonical(want);
}

/** Returns how the names of a detail differ from the fields that a case's assertion declares. */
function fieldsMismatch(whose: string, detail: object, one: Case): string | undefined {
  const stated = JSON.stringify(Object.keys(detail).sort());
  const declared = JSON.stringify([...one.fields].sort());
  return stated === declared
    ? undefined
    : `${whose} states the fields ${stated}, want ${declared}`;
}

/** Holds the first failure record of a failing case to what the case states. */
function recordMismatch(one: Case, recorder: Recorder): string | undefined {
  if (!recorder.failed) return "expected a failure, got a pass";
  const [record] = recorder.failures;
  if (record === undefined)
    return "reported no record; the assertion did not report one";
  if (record.assertion !== one.assertion) {
    return `the record is of ${record.assertion}, want ${one.assertion}`;
  }
  if (record.contract !== one.id) {
    return `the record states the contract ${JSON.stringify(record.contract)}, want ${JSON.stringify(one.id)}`;
  }
  const fields = fieldsMismatch("the record", record.detail, one);
  if (fields !== undefined) return fields;
  for (const [name, want] of Object.entries(one.detail)) {
    if (!same(record.detail[name], want)) {
      return `detail "${name}" is ${canonical(record.detail[name])}, want ${canonical(want)}`;
    }
  }
  return undefined;
}

/**
 * Hold a recorder to what a case says must have happened.
 *
 * The runner passes the case's id as the assertion's message. The first
 * record of a failing case names the case's assertion, states the id as
 * its contract, contains exactly the case's fields, and has the case's
 * value for every field that the case states. The recorder keeps the
 * case's one call record: of this library's definition, numbered 1
 * without a parent, with the case's assertion, the id as its contract, the
 * verdict that the case expects, the surface of the call, and a failure's
 * fields as typed literals.
 *
 * @param one The case that was driven.
 * @param recorder The seat the assertion reported to.
 * @param aborting Whether the case ran on the aborting surface.
 * @returns What went wrong, or undefined when the two agree.
 */
export function mismatch(
  one: Case,
  recorder: Recorder,
  aborting: boolean,
): string | undefined {
  if (one.expect === "pass" && recorder.failed) {
    return `expected a pass, got: ${recorder.message}`;
  }
  const record = one.expect === "fail" ? recordMismatch(one, recorder) : undefined;
  return record ?? callMismatch(one, recorder, aborting);
}

/** Holds the one call record that a recorder keeps to what a case states. */
function callMismatch(
  one: Case,
  recorder: Recorder,
  aborting: boolean,
): string | undefined {
  const lines = recorder.records;
  if (lines.length !== 1)
    return `the recorder keeps ${lines.length} call records, want 1`;
  const { where, detail, ...call } = JSON.parse(lines[0] as string) as Record<
    string,
    unknown
  >;
  void where;
  const want = {
    definition: DEFINITION,
    seq: 1,
    assertion: one.assertion,
    contract: one.id,
    verdict: one.expect,
    aborting,
  };
  if (JSON.stringify(call) !== JSON.stringify(want)) {
    return `the call record is ${JSON.stringify(call)}, want ${JSON.stringify(want)}`;
  }
  if (one.expect === "pass") {
    return detail === undefined
      ? undefined
      : `a passing call record states the detail ${JSON.stringify(detail)}`;
  }
  const fields = detail as Record<string, Literal>;
  const named = fieldsMismatch("the call record", fields, one);
  if (named !== undefined) return named;
  for (const [name, want] of Object.entries(one.detail)) {
    const literal = fields[name] as Literal;
    let held: unknown;
    try {
      held = decode(literal);
    } catch (err) {
      return `the call record's ${name} is no typed literal: ${(err as Error).message}`;
    }
    if (!same(held, want)) {
      return `the call record's ${name} is ${JSON.stringify(literal)}, want ${canonical(want)}`;
    }
  }
  return undefined;
}
