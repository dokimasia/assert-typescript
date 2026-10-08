/**
 * Reading the content of one file, so that the text assertions apply to
 * it.
 */

import { Fault, ofOperation } from "../matcher/fault.js";
import type { Seat } from "../matcher/seat.js";
import { end } from "../matcher/verdict.js";
import { contentOf, kindOf } from "./entry.js";
import { readPath } from "./reader.js";

/**
 * Returns the content of the file at path, a path of the operating system,
 * decoded as UTF-8, so that a test composes it with the text assertions.
 *
 * No file at path, a link to a file included, and a file that cannot be
 * read end the call with a fault, which stops the test.
 *
 * @param seat - Where a fault is reported.
 * @param path - The path.
 * @returns The content, and the empty string after a fault on a seat whose
 *   `fail` returns.
 * @example
 * check.contains(seat, files.read(seat, path), "version 2", "the file states the new version");
 */
export function read(seat: Seat, path: string): string {
  seat.helper();
  try {
    const e = readPath(path, true);
    if (kindOf(e) !== "file")
      throw new Fault("", `no file is at the path ${JSON.stringify(path)}`);
    return Buffer.from(contentOf(e as NonNullable<typeof e>)).toString("utf8");
  } catch (err) {
    end(seat, ofOperation("files.read", err));
    return "";
  }
}
