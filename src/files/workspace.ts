/**
 * The workspace of a test: a directory of the test's own, with a tree
 * written into it.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ofOperation } from "../matcher/fault.js";
import type { Cleanups, Seat } from "../matcher/seat.js";
import { end } from "../matcher/verdict.js";
import { mapOf, type Tree } from "./tree.js";
import { create, unlock } from "./writer.js";

/** The prefix of the name of a workspace's directory. */
const PREFIX = "dokimi-files-";

/**
 * Writes tree into a directory of the test's own, which the test removes
 * when it ends, and returns the directory's path.
 *
 * It creates every entry and writes over none. It never writes through a
 * link: it writes a link's target as the tree states it, inside or outside
 * the directory. Each file and each directory gets its stated mode. Where
 * the tree states none, a file gets 0o644, and a file that its owner may
 * execute and a directory get 0o755. It sets each mode after it writes the
 * entry, and the mode of a directory after every entry below it, so the
 * umask cannot change a mode, and the tree that it writes is the same on
 * every run. The test removes the directory also when the mode of a
 * directory in it forbids the owner to write it.
 *
 * It takes a seat that runs cleanups when the test ends, such as the seat
 * of the fixture of `@dokimi/assert/vitest`. On Windows only the owner's
 * write bit of a file's mode takes effect, as the file's read-only
 * attribute.
 *
 * A tree that breaks a rule of a tree ends the call with a fault before
 * the call writes anything, and so does an entry that the file system
 * cannot store as stated, such as a link where the platform refuses to
 * create one, or a second path that the file system maps to an entry
 * already written.
 *
 * @param seat - Where a fault is reported, and where the removal of the
 *   directory is registered.
 * @param tree - The tree.
 * @returns The directory's path, and the empty string when no directory
 *   could be created.
 * @example
 * const dir = files.workspace(seat, {
 *   "go.mod": files.text("module example.com/a\n"),
 *   "keys/id": files.text("secret\n").withMode(0o600),
 * });
 */
export function workspace(seat: Seat & Cleanups, tree: Tree): string {
  seat.helper();
  let dir = "";
  try {
    dir = mkdtempSync(join(tmpdir(), PREFIX));
    const created = dir;
    seat.cleanup(() => {
      unlock(created);
      rmSync(created, { recursive: true, force: true });
    });
    create(dir, mapOf(tree));
  } catch (err) {
    end(seat, ofOperation("files.workspace", err));
  }
  return dir;
}
