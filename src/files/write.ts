/**
 * Writing a tree over the entries of a directory that exists, such as an
 * edit between two runs of the code under test.
 */

import { ofOperation } from "../matcher/fault.js";
import type { Seat } from "../matcher/seat.js";
import { end } from "../matcher/verdict.js";
import { mapOf, type Tree } from "./tree.js";
import { overwrite } from "./writer.js";

/**
 * Writes tree into dir, a directory that exists. Where nothing is at a
 * path of the tree, it creates the entry as a workspace does. A file
 * replaces the content of the file at its path, a link replaces the target
 * of the link at its path, and a directory keeps its entries. Each entry
 * that the tree states gets its stated mode, and where it states none
 * 0o644, or 0o755 for an executable file and a directory. A parent that
 * the tree implies keeps its mode when it exists, and gets 0o755 when the
 * call creates it. Every other entry of dir keeps its content and its
 * mode. It never follows a link: it replaces a link by removing the link
 * itself.
 *
 * A tree that breaks a rule of a tree, a dir that is no directory, an
 * entry of another kind than the tree states, a parent of an entry that is
 * no directory, and a path that the file system maps to an entry at
 * another path of the tree each end the call with a fault before the call
 * writes anything. A link is another kind than a directory, a link to a
 * directory included. An error of the file system ends the call with a
 * fault at the path of its entry.
 *
 * @param seat - Where a fault is reported.
 * @param dir - The directory, a path of the operating system.
 * @param tree - The tree.
 * @example
 * const dir = files.workspace(seat, { "api/store.gen.go": files.text(generated) });
 * check.noError(seat, run(dir), "the first run writes the file");
 * files.write(seat, dir, { "api/store.gen.go": files.text(edited) });
 */
export function write(seat: Seat, dir: string, tree: Tree): void {
  seat.helper();
  try {
    overwrite(dir, mapOf(tree));
  } catch (err) {
    end(seat, ofOperation("files.write", err));
  }
}
