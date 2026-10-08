/**
 * The identity of a failure: what the shrinker keeps a failure by.
 *
 * - A failure record of an assertion with a call site is kept by its
 *   assertion and its call site. A record without a call site is kept by
 *   its assertion and its contract, which are the same for every case that
 *   fails at one call.
 * - A message that the body passes to the case's fail or record is kept by
 *   the innermost frame of the caller's code.
 * - An error that the body raises is kept by its type and the innermost
 *   frame of the caller's code in its stack.
 *
 * The caller's code is every frame outside this library. Two failures are
 * one failure when their identities are equal, and a message is no part of
 * an identity.
 */

import { basename } from "node:path";
import { type Failure, siteIn, type Where } from "../failure.js";

/** What a failure is kept by. */
export interface Identity {
  /** The assertion that reported the failure, and undefined for a message and for an error. */
  readonly assertion?: string | undefined;
  /** The contract of an assertion's record without a call site. */
  readonly contract?: string | undefined;
  /** The type of a raised value, and undefined otherwise. */
  readonly error?: string | undefined;
  /** The innermost frame of the caller's code, or the call site of an assertion's record. */
  readonly where?: Where | undefined;
}

/**
 * Returns the identity of a failure record, or of a message that the body
 * passed to the case, which is a record without an assertion.
 *
 * @param failure - The record.
 * @returns The identity.
 */
export function ofRecord(failure: Failure): Identity {
  const assertion = failure.assertion === "" ? undefined : failure.assertion;
  return {
    assertion,
    contract:
      assertion !== undefined && failure.where === undefined
        ? failure.contract
        : undefined,
    where: failure.where,
  };
}

/** Returns the type of a raised value: the name of its class, or the kind of a primitive. */
function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (typeof value !== "object" && typeof value !== "function") return typeof value;
  const name = (value as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof name === "string" && name !== "" ? name : "Object";
}

/**
 * Returns the identity of a value that the body raised: its type and the
 * innermost frame of the caller's code in its stack, or fallback for a
 * value without a stack that names such a frame.
 *
 * @param value - The raised value.
 * @param fallback - The call site of the property.
 * @returns The identity.
 */
export function ofError(value: unknown, fallback: Where | undefined): Identity {
  const stack = value instanceof Error ? value.stack : undefined;
  return {
    error: typeOf(value),
    where: (stack === undefined ? undefined : siteIn(stack)) ?? fallback,
  };
}

/**
 * Returns the text that two identities share exactly when they are equal.
 *
 * @param identity - The identity.
 * @returns The text.
 */
export function keyOf(identity: Identity): string {
  return JSON.stringify([
    identity.assertion ?? null,
    identity.contract ?? null,
    identity.error ?? null,
    identity.where?.file ?? null,
    identity.where?.line ?? null,
  ]);
}

/**
 * Returns the identity whose text keyOf returned.
 *
 * @param key - The text.
 * @returns The identity.
 */
export function fromKey(key: string): Identity {
  const [assertion, contract, error, file, line] = JSON.parse(key) as (
    | string
    | number
    | null
  )[];
  return {
    assertion: (assertion as string | null) ?? undefined,
    contract: (contract as string | null) ?? undefined,
    error: (error as string | null) ?? undefined,
    where: file === null ? undefined : { file: file as string, line: line as number },
  };
}

/**
 * Returns the text of an identity, as a sentence states it.
 *
 * @param identity - The identity.
 * @returns The text.
 */
export function textOf(identity: Identity): string {
  const where =
    identity.where === undefined
      ? ""
      : ` at ${basename(identity.where.file)}:${identity.where.line}`;
  if (identity.error !== undefined) return `a ${identity.error} thrown${where}`;
  if (identity.assertion === undefined) return `a message${where}`;
  const contract =
    identity.contract === undefined ? "" : ` of ${JSON.stringify(identity.contract)}`;
  return `${identity.assertion}${contract}${where}`;
}

/**
 * Returns the identity in the form of a store entry: the base name of its
 * file and its line beside the assertion, the contract or the error.
 *
 * @param identity - The identity.
 * @returns The entry's identity, a JSON object.
 */
export function entryOf(identity: Identity): Record<string, string | number> {
  const keys: Record<string, string | number> = {};
  if (identity.assertion !== undefined) keys["assertion"] = identity.assertion;
  if (identity.contract !== undefined) keys["contract"] = identity.contract;
  if (identity.error !== undefined) keys["error"] = identity.error;
  if (identity.where !== undefined) {
    keys["file"] = basename(identity.where.file);
    keys["line"] = identity.where.line;
  }
  return keys;
}
