/**
 * Reading a tree from a directory, and the entry at one path.
 *
 * A reader follows no link: a link is an entry with its target. It states
 * the permission bits of each file and each directory as the platform
 * records them.
 */

import {
  type BigIntStats,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  type Stats,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { Fault } from "../matcher/fault.js";
import {
  bytes,
  directory,
  type Entry,
  type Kind,
  link,
  PERMISSIONS,
  unstated,
} from "./entry.js";
import { HOST, targetOf } from "./platform.js";

/** The content that a reader states of a file whose content it does not read. */
const UNREAD = new Uint8Array(0);

/**
 * Returns the kind of the entry that stats describes, and undefined for a
 * device, a pipe, a socket or any other entry that no tree states.
 *
 * @param stats - What lstat returned for the entry.
 * @returns The kind, or undefined.
 */
export function kindOfStats(stats: Stats | BigIntStats): Kind | undefined {
  if (stats.isSymbolicLink()) return "link";
  if (stats.isDirectory()) return "directory";
  if (stats.isFile()) return "file";
  return undefined;
}

/**
 * Returns the entry at osPath, which lstat described as stats: a link with
 * its target, and a file or a directory with the permission bits that the
 * platform records. With modes false, it states the owner's execute bit of
 * a file alone. With content false, it reads no file's content.
 */
function entryOf(
  osPath: string,
  at: string,
  stats: Stats,
  modes: boolean,
  content: boolean,
): Entry {
  const kind = kindOfStats(stats);
  if (kind === undefined)
    throw new Fault(at, "the entry is no file, directory or link");
  if (kind === "link") return link(targetOf(readlinkSync(osPath)));
  const read =
    kind === "file" ? bytes(content ? readFileSync(osPath) : UNREAD) : directory();
  const bits = read.withMode(stats.mode & PERMISSIONS & HOST.recordedBits);
  return modes && HOST.recordedBits !== 0 ? bits : unstated(bits);
}

/** Returns what read returns, and a fault at at for an error of the file system. */
function guarded(at: string, read: () => Entry): Entry {
  try {
    return read();
  } catch (err) {
    throw err instanceof Fault ? err : new Fault(at, "the entry cannot be read", err);
  }
}

/** Reads the entries below the directory names of dir into tree. */
function walk(
  dir: string,
  names: readonly string[],
  modes: boolean,
  tree: Map<string, Entry>,
): void {
  let children: string[];
  try {
    children = readdirSync(join(dir, ...names));
  } catch (err) {
    throw new Fault(names.join("/"), "the tree cannot be read", err);
  }
  for (const name of children) {
    const path = [...names, name];
    const osPath = join(dir, ...path);
    const at = path.join("/");
    const e = guarded(at, () => entryOf(osPath, at, lstatSync(osPath), modes, true));
    tree.set(at, e);
    if (e.directory === true) walk(dir, path, modes, tree);
  }
}

/**
 * Returns the tree in dir: every entry below it, each link as a link with
 * its target, and the permission bits of each file and each directory as
 * the platform records them. With modes false, it states the owner's
 * execute bit of each file alone, as an update of a golden tree reads the
 * golden tree. The root may be a link to a directory.
 *
 * @param dir - The directory, a path of the operating system.
 * @param modes - Whether the tree states the modes of its entries.
 * @returns The tree.
 * @throws Fault for a root that is no directory and for a tree that cannot
 *   be read, and at the path of an entry that is no file, directory or
 *   link or that cannot be read.
 */
export function readTree(dir: string, modes: boolean): Map<string, Entry> {
  let root: Stats;
  try {
    root = statSync(dir);
  } catch (err) {
    throw new Fault("", "the tree cannot be read", err);
  }
  if (!root.isDirectory()) throw new Fault("", "the root of the tree is no directory");
  const tree = new Map<string, Entry>();
  walk(dir, [], modes, tree);
  return tree;
}

/**
 * Returns the entry at path, a path of the operating system, with its
 * permission bits as the platform records them. It follows no link at the
 * path, and the platform resolves a link among the names before the last
 * one. Nothing is at a path below a file.
 *
 * @param path - The path.
 * @param content - Whether it reads the content of a file.
 * @returns The entry, or undefined when nothing is at the path.
 * @throws Fault for an entry that is no file, directory or link, and for
 *   any other error of the file system than one that finds nothing.
 */
export function readPath(path: string, content: boolean): Entry | undefined {
  let stats: Stats | undefined;
  try {
    stats = lstatSync(path, { throwIfNoEntry: false });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOTDIR") return undefined;
    throw new Fault("", "the entry cannot be read", err);
  }
  const found = stats;
  return found === undefined
    ? undefined
    : guarded("", () => entryOf(path, "", found, true, content));
}
