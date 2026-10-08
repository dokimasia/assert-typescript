/**
 * The rules by which a tree read from a directory differs from a wanted
 * tree.
 *
 * Two entries at one path differ when their kinds differ, when two files
 * have other content or two links other targets, when the wanted entry
 * states a mode and the entry read has other permission bits, and when the
 * wanted file states no mode and the owner's execute bits differ. A
 * platform that records no permission bits compares neither.
 */

import {
  bitsOf,
  contentOf,
  type Entry,
  kindOf,
  OWNER_EXECUTE,
  PERMISSIONS,
} from "./entry.js";
import { HOST } from "./platform.js";
import { full, pathsOf } from "./tree.js";

/** Returns the permission bits that a comparison reads of an entry where w is wanted. */
function compared(w: Entry): number {
  if (w.mode !== undefined) return PERMISSIONS & HOST.recordedBits;
  return kindOf(w) === "file" ? OWNER_EXECUTE & HOST.recordedBits : 0;
}

/**
 * Reports whether g, the entry read at a path, differs from w, the wanted
 * entry there.
 *
 * @param w - The wanted entry.
 * @param g - The entry read, or undefined when nothing was read there.
 * @returns True when the two differ.
 */
export function differs(w: Entry, g: Entry | undefined): boolean {
  if (g === undefined || kindOf(w) !== kindOf(g)) return true;
  return (
    !Buffer.from(contentOf(w)).equals(contentOf(g)) ||
    w.link !== g.link ||
    ((bitsOf(w) ^ bitsOf(g)) & compared(w)) !== 0
  );
}

/**
 * Returns the paths at which got, a tree read from a directory, differs
 * from want, in path order. want implies the parents of its entries. A
 * path differs when one of the two trees has it and the other does not, or
 * when the entries at it differ.
 *
 * @param want - The wanted tree.
 * @param got - The tree read.
 * @param contains - Whether a path that want lacks is no difference.
 * @returns The paths that differ.
 */
export function differing(
  want: ReadonlyMap<string, Entry>,
  got: ReadonlyMap<string, Entry>,
  contains: boolean,
): string[] {
  const wanted = full(want);
  const out = [...wanted.keys()].filter((path) =>
    differs(wanted.get(path) as Entry, got.get(path)),
  );
  if (!contains) out.push(...[...got.keys()].filter((path) => !wanted.has(path)));
  return pathsOf(out);
}
