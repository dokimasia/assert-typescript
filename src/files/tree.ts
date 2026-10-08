/**
 * A tree of files, and the rules that every tree keeps.
 */

import { Fault } from "../matcher/fault.js";
import { directory, type Entry, kindOf } from "./entry.js";

/**
 * A tree of files: each entry at its path, relative to the tree's root and
 * separated by slashes. A path is one or more names, none of them empty,
 * `.` or `..`, and none containing a backslash or NUL. No entry is below a
 * file or a link. The directories of a tree are the ones that it states and
 * every parent of an entry.
 *
 * @example
 * const tree: files.Tree = {
 *   "go.mod": files.text("module example.com/a\n"),
 *   "keys/id": files.text("secret\n").withMode(0o600),
 * };
 */
export type Tree = Readonly<Record<string, Entry>>;

/**
 * Compares two paths as the bytes of their UTF-8 encoding, the order in
 * which a tree lists its paths.
 *
 * @param a - A path.
 * @param b - Another path.
 * @returns A negative number when a comes first, 0 for equal paths, and a
 *   positive number when b comes first.
 */
export function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * Returns paths in the order of their UTF-8 bytes.
 *
 * @param paths - Paths of a tree.
 * @returns A new array of the paths, in order.
 */
export function pathsOf(paths: Iterable<string>): string[] {
  return [...paths].sort(compareBytes);
}

/**
 * Returns the directories above path, outermost first: `a`, then `a/b`,
 * for `a/b/c`.
 *
 * @param path - A path of a tree.
 * @returns The parents of the path.
 */
export function parentsOf(path: string): string[] {
  const names = path.split("/");
  return names.slice(1).map((_, i) => names.slice(0, i + 1).join("/"));
}

/**
 * Returns why path breaks a rule of a path: it is no UTF-8 text, or one of
 * its names is empty, `.` or `..`, or contains a backslash or NUL.
 *
 * @param path - A path of a tree.
 * @returns The reason, or undefined for a path that keeps the rules.
 */
export function pathFault(path: string): string | undefined {
  if (!path.isWellFormed()) return `the path ${JSON.stringify(path)} is no UTF-8 text`;
  const name = path
    .split("/")
    .find((one) => one === "" || one === "." || one === ".." || /[\\\0]/.test(one));
  return name === undefined
    ? undefined
    : `the path ${JSON.stringify(path)} has the name ${JSON.stringify(name)}`;
}

/** Reports whether target is UTF-8 text without NUL that is not empty. */
function isTarget(target: string): boolean {
  return target !== "" && !target.includes("\0") && target.isWellFormed();
}

/** Returns why the entry at path breaks a rule of a tree, or undefined. */
function entryFault(
  tree: ReadonlyMap<string, unknown>,
  path: string,
): string | undefined {
  const fault = pathFault(path);
  if (fault !== undefined) return fault;
  const e = tree.get(path);
  const kind = kindOf(e);
  if (kind === undefined) return "the entry states no file, directory or link";
  const target = (e as Entry).link as string;
  if (kind === "link" && !isTarget(target)) {
    return `the link to ${JSON.stringify(target)} states no target of UTF-8 text without NUL`;
  }
  for (const parent of parentsOf(path)) {
    const above = kindOf(tree.get(parent));
    if (above === "file" || above === "link") {
      return `the entry is below ${JSON.stringify(parent)}, which is a ${above}`;
    }
  }
  return undefined;
}

/**
 * Checks that tree keeps the rules of a tree: each path keeps the rules of
 * a path, each value is an entry that states one kind, each link states a
 * target of UTF-8 text without NUL that is not empty, and no entry is below
 * a file or a link.
 *
 * @param tree - The tree.
 * @throws Fault at the first path, in path order, whose entry breaks a rule.
 */
export function check(tree: ReadonlyMap<string, unknown>): void {
  for (const path of pathsOf(tree.keys())) {
    const reason = entryFault(tree, path);
    if (reason !== undefined) throw new Fault(path, reason);
  }
}

/**
 * Returns a copy of tree that also states every directory that tree
 * implies: each parent of an entry that tree does not state, without a
 * mode.
 *
 * @param tree - The tree.
 * @returns The copy.
 */
export function full(tree: ReadonlyMap<string, Entry>): Map<string, Entry> {
  const out = new Map(tree);
  for (const path of tree.keys()) {
    for (const parent of parentsOf(path)) {
      if (!out.has(parent)) out.set(parent, directory());
    }
  }
  return out;
}

/**
 * Returns the entries of tree by path.
 *
 * @param tree - The tree, as a test states it.
 * @returns A map of the same entries.
 */
export function mapOf(tree: Tree): Map<string, Entry> {
  return new Map(Object.entries(tree));
}

/**
 * Returns the entries of a map as a tree, its paths in path order.
 *
 * @param map - The entries by path.
 * @returns The tree.
 */
export function treeOf(map: ReadonlyMap<string, Entry>): Tree {
  return Object.fromEntries(
    pathsOf(map.keys()).map((path) => [path, map.get(path) as Entry]),
  );
}
