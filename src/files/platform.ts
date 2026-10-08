/**
 * What the file systems of the platform record, which decides what a tree
 * reads and what an assertion about a mode can check.
 *
 * Windows records no permission bits. Its file systems keep one bit, the
 * owner's write bit of a file, as the file's read-only attribute, so a tree
 * reads no mode and no execute bit there. Node writes the target of a link
 * there with backslashes, and an absolute target after the prefix `\\?\`,
 * so a tree reads a target back with slashes and without the prefix.
 */

import { sep } from "node:path";

/** What the file systems of one platform record. */
interface Platform {
  /** The permission bits that a tree reads of an entry: all nine, or none. */
  readonly recordedBits: number;
  /** Matches the prefix that Node writes before an absolute target of a link. */
  readonly namespace: RegExp;
  /** Why an assertion cannot read a mode, or undefined where the platform records modes. */
  readonly modeFault: string | undefined;
}

/** Every platform whose paths separate names with a slash. */
const POSIX: Platform = {
  recordedBits: 0o777,
  // A target is stored as written, so the pattern matches nothing.
  namespace: /(?!)/,
  modeFault: undefined,
};

/** Windows, whose paths separate names with a backslash. */
const WINDOWS: Platform = {
  recordedBits: 0,
  namespace: /^\\\\\?\\/,
  modeFault: "the file system records no permission bits",
};

/** The platform of this process, chosen by the separator of its paths. */
export const HOST = new Map([
  ["/", POSIX],
  ["\\", WINDOWS],
]).get(sep) as Platform;

/**
 * Returns the target of a link as a tree states it: the names separated
 * by slashes, without the prefix of an absolute target on Windows.
 *
 * @param written - The target that the file system returns for the link.
 * @returns The target.
 */
export function targetOf(written: string): string {
  return written.replace(HOST.namespace, "").split(sep).join("/");
}
