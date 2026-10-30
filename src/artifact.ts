// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The records of other kinds in the artifact of a test.
 *
 * A tool of dokimasia writes its own records into the task meta of a vitest
 * test, beside the call records. The fixture of `@dokimi/assert/vitest`
 * attaches the meta of its test to its seat, and {@link writeRecord} pushes
 * each record onto the array under its kind.
 */

import { end, Fault, ofOperation } from "./matcher/fault.js";
import type { Seat } from "./matcher/seat.js";

/** The pattern of the kind of a record. */
const KIND = /^dokimi\.[a-z][a-z0-9-]*$/u;

/** The task meta of the test of each seat that the vitest fixture supplies. */
const METAS = new WeakMap<object, Record<string, unknown>>();

/** Returns the object that record is the JSON text of, or undefined for any other text. */
function objectOf(record: string): object | undefined {
  let value: unknown;
  try {
    value = JSON.parse(record);
  } catch {
    return undefined;
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : undefined;
}

/** The kind of the call records of this library. */
export const CALL_KIND = "dokimi.assert";

/**
 * Makes writeRecord write the records of seat into meta.
 *
 * @param seat - The seat that the vitest fixture supplies.
 * @param meta - The task meta of the test of the seat.
 */
export function attach(seat: object, meta: Record<string, unknown>): void {
  METAS.set(seat, meta);
}

/**
 * Writes record, the JSON text of one record of kind, into the artifact of
 * the test of seat. The artifact is the task meta of a vitest test, which
 * vitest's JSON reporter writes. writeRecord parses the record and pushes
 * the object onto the array under the key kind, in the order of the calls.
 * A tool of dokimasia writes its own records beside the call records this
 * way.
 *
 * The seat of the fixture of `@dokimi/assert/vitest` writes the record. A
 * Recorder, a Collector that a test constructs, a Standard, a case of a
 * property and the seat that doesReject or eventually hands a body do not
 * write it. writeRecord ignores DOKIMI_ASSERT_RECORD.
 *
 * In these cases writeRecord does not write the record, and it ends the
 * call with a fault as fault ends one:
 *
 * - kind does not match `dokimi\.[a-z][a-z0-9-]*`.
 * - kind is `dokimi.assert`, the kind of the call records of this library.
 * - record is not the JSON text of one object.
 *
 * @param seat - The seat of the tool's call.
 * @param kind - The kind of the record.
 * @param record - The JSON text of the record.
 * @throws The fault, for a refused kind or record on a seat without
 *   reportFault.
 * @example
 * writeRecord(seat, "dokimi.suite", JSON.stringify({ suite: "ledger", seed: "7" }));
 */
export function writeRecord(seat: Seat, kind: string, record: string): void {
  let refused: Fault | undefined;
  let value: object | undefined;
  if (!KIND.test(kind)) {
    refused = new Fault(
      "kind",
      `${JSON.stringify(kind)} does not match dokimi\\.[a-z][a-z0-9-]*`,
    );
  } else if (kind === CALL_KIND) {
    refused = new Fault("kind", `${kind} is the kind of the call records of assert`);
  } else {
    value = objectOf(record);
    refused =
      value === undefined
        ? new Fault("record", "the record is not one JSON object")
        : undefined;
  }
  if (refused !== undefined) {
    end(seat, ofOperation("writeRecord", refused));
    return;
  }
  const meta = METAS.get(seat);
  if (meta !== undefined) {
    const records = (meta[kind] ?? []) as unknown[];
    records.push(value);
    meta[kind] = records;
  }
}
