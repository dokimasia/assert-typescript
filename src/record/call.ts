/**
 * The call record of one assertion call.
 *
 * A record states the call's number in its test, the assertion, the
 * contract, the verdict, the surface, the call site, and the detail of a
 * failure. Each record is one JSON object on one line, with its fields in
 * the order the definition lists them.
 */

import { basename } from "node:path";
import { json } from "./literal.js";

/** The definition version that this library implements, which every call record states. */
export const DEFINITION = "7.2.1";

/** How a call ended. */
export type Verdict = "pass" | "fail" | "error";

/** The kind of a property's case that a call ran in. */
export type Phase =
  | "example"
  | "stored"
  | "simplest"
  | "random"
  | "prefix"
  | "edge"
  | "coverage"
  | "replay"
  | "shrink"
  | "explain"
  | "token"
  | "fuzz";

/** The site of a call. */
export interface Site {
  /** The path of the file. A record states its base name. */
  readonly file: string;
  /** The line, from 1. */
  readonly line: number;
}

/** The record of one call, before the calls that keep it give it its number. */
export interface Call {
  /** The canonical id of the assertion. */
  readonly assertion: string;
  /** The caller's message, unchanged. */
  readonly contract: string;
  /** How the call ended. */
  readonly verdict: Verdict;
  /** Whether the call was made on the aborting surface. */
  readonly aborting: boolean;
  /** The call site, when the call could read it. */
  readonly where?: Site;
  /** The detail: an object of JSON values, on a failure and for a property's run. */
  readonly detail?: Readonly<Record<string, unknown>>;
  /** The text of the fault that ended a call of the verdict `error`. */
  readonly error?: string;
}

/** Where a numbered call is among the calls of its test. */
export interface Place {
  /** The call's number in its test, from 1. */
  readonly seq: number;
  /** The number of the call whose body this call ran in. */
  readonly parent?: number;
  /** The run of that body, from 1. */
  readonly run?: number;
  /** The phase of that run, for a call in a property's case. */
  readonly phase?: Phase;
}

/**
 * Returns the call record of call at place, as one line of JSON.
 *
 * @param call - The call.
 * @param place - Its number, and its parent, run and phase in a body.
 * @returns The record's text, with a field that is not present left out.
 */
export function encodeCall(call: Call, place: Place): string {
  return json({
    definition: DEFINITION,
    seq: place.seq,
    parent: place.parent,
    run: place.run,
    phase: place.phase,
    assertion: call.assertion,
    contract: call.contract,
    verdict: call.verdict,
    aborting: call.aborting,
    where:
      call.where === undefined
        ? undefined
        : { file: basename(call.where.file), line: call.where.line },
    detail: call.detail,
    error: call.error,
  });
}
