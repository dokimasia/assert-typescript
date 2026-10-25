// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The JSON text of a call record. */

/**
 * Returns the JSON text of a JSON value, on one line, with the keys of
 * each object in the order the object lists them.
 *
 * It writes -0 as `-0`, where `JSON.stringify` writes `0`, so a float's
 * sign survives the text.
 *
 * @param value - A JSON value: null, a boolean, a finite number, a
 *   string, an array or a plain object of JSON values.
 * @returns The text.
 * @throws TypeError for a number that is not finite and for a value that
 *   is no JSON value, which no caller in this library builds.
 */
export function json(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`record: ${value} is no JSON number`);
      }
      return Object.is(value, -0) ? "-0" : JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map(json).join(",")}]`;
      }
      const fields = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${JSON.stringify(k)}:${json(v)}`);
      return `{${fields.join(",")}}`;
    }
    default:
      throw new TypeError(`record: a ${typeof value} is no JSON value`);
  }
}
