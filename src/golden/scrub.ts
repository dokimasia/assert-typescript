// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The scrubbers of a golden comparison. A scrubber replaces the parts of a
 * text that change from run to run, so both sides compare equal.
 */

const TIMESTAMP =
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/gu;
const HASH = /\b[0-9a-f]{32,128}\b/gu;
const RUN_ID = /\brun_[0-9a-zA-Z]{16}\b/gu;

/** A replacement applied to both sides before they are compared. */
export type Scrubber = (text: string) => string;

/**
 * Replaces ISO-8601 and RFC-3339 timestamps.
 *
 * @returns A scrubber, to pass to a comparing call.
 */
export function scrubTimestamps(): Scrubber {
  return (text) => text.replace(TIMESTAMP, "SCRUBBED_TIMESTAMP");
}

/**
 * Replaces hex digests between 32 and 128 characters.
 *
 * @returns A scrubber, to pass to a comparing call.
 */
export function scrubHashes(): Scrubber {
  return (text) => text.replace(HASH, "SCRUBBED_HASH");
}

/**
 * Replaces identifiers shaped like `run_` and sixteen characters.
 *
 * @returns A scrubber, to pass to a comparing call.
 */
export function scrubRunIds(): Scrubber {
  return (text) => text.replace(RUN_ID, "SCRUBBED_RUN_ID");
}

/**
 * Replaces the value of each named JSON field.
 *
 * It matches the field's text rather than parsing, so it works on output
 * that is nearly JSON as well as on output that is.
 *
 * @param fields The field names whose values are replaced.
 * @returns A scrubber, to pass to a comparing call.
 */
export function scrubJsonFields(...fields: string[]): Scrubber {
  if (fields.length === 0) {
    return (text) => text;
  }

  const names = fields.map((f) => f.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  const pattern = new RegExp(`("(?:${names.join("|")})"\\s*:\\s*)"[^"]*"`, "gu");
  return (text) => text.replace(pattern, '$1"SCRUBBED"');
}

/** Applies every scrubber, in the order given. */
export function scrub(text: string, scrubbers: readonly Scrubber[]): string {
  return scrubbers.reduce((acc, s) => s(acc), text);
}
