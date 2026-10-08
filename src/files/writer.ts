/**
 * Writing a tree into a directory: the directory of a workspace, a
 * directory that exists, and a golden directory that an update makes
 * equal a tree.
 *
 * A write never follows a link. Node has no call that opens a path relative
 * to a directory, so a write creates each entry with a call that refuses an
 * entry that is there, in path order, so that each parent is a directory
 * that the write created or read before it writes below the parent. It sets
 * the mode of a file after it writes the file, and the mode of a directory
 * after every entry below it, so the umask cannot change a mode, and the
 * mode of a directory cannot stop a write below it.
 */

import {
  type BigIntStats,
  chmodSync,
  lstatSync,
  mkdirSync,
  opendirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Fault } from "../matcher/fault.js";
import { differs } from "./difference.js";
import { contentOf, type Entry, kindOf, PERMISSIONS, unstated } from "./entry.js";
import { kindOfStats, readTree } from "./reader.js";
import { check, full, pathsOf } from "./tree.js";

/** The permission bits with which a write creates a file, before it sets the file's mode. */
const CREATE_FILE = 0o600;

/** The permission bits with which a write creates a directory, before it sets the directory's mode. */
const CREATE_DIRECTORY = 0o700;

/** The mode that a write sets on a file that states none. */
export const FILE_MODE = 0o644;

/** The mode that a write sets on an executable file that states none. */
export const EXECUTABLE_MODE = 0o755;

/** The mode that a write sets on a directory that states none. */
export const DIRECTORY_MODE = 0o755;

/** One operation of a write: the path of the tree that it writes, and the operation. */
interface Step {
  readonly path: string;
  readonly run: () => void;
}

/** Returns the path of the operating system of the path of a tree in dir. */
function osPath(dir: string, path: string): string {
  return join(dir, ...path.split("/"));
}

/**
 * Returns the mode that a write sets on the file or the directory e: its
 * stated mode, and where it states none {@link FILE_MODE},
 * {@link EXECUTABLE_MODE} or {@link DIRECTORY_MODE}.
 *
 * @param e - The entry.
 * @returns The mode.
 */
export function modeOf(e: Entry): number {
  if (e.mode !== undefined) return e.mode;
  if (e.directory === true) return DIRECTORY_MODE;
  return e.executable === true ? EXECUTABLE_MODE : FILE_MODE;
}

/** Creates the entry e at at: a file written with its content and given its mode, a directory, or a link. */
function createEntry(at: string, e: Entry): void {
  const kind = kindOf(e);
  if (kind === "directory") {
    mkdirSync(at, { mode: CREATE_DIRECTORY });
    return;
  }
  if (kind === "link") {
    symlinkSync(e.link as string, at);
    return;
  }
  writeFileSync(at, contentOf(e), { flag: "wx", mode: CREATE_FILE });
  chmodSync(at, modeOf(e));
}

/**
 * Writes e over the entry of its kind at at: the target of a link, after
 * it removes the link itself, and the content and then the mode of a file,
 * after it gives the owner the permission to write the file.
 */
function replace(at: string, e: Entry): void {
  if (kindOf(e) === "link") {
    rmSync(at);
    symlinkSync(e.link as string, at);
    return;
  }
  chmodSync(at, CREATE_FILE);
  writeFileSync(at, contentOf(e));
  chmodSync(at, modeOf(e));
}

/**
 * Returns the steps before, then the steps that create each entry of whole
 * that kept lacks, in path order, and then the steps that give each
 * directory that they create its mode, deepest first.
 */
function creating(
  dir: string,
  whole: ReadonlyMap<string, Entry>,
  kept: ReadonlySet<string>,
  before: readonly Step[],
): Step[] {
  const steps = [...before];
  const modes: Step[] = [];
  for (const path of pathsOf(whole.keys())) {
    if (kept.has(path)) continue;
    const e = whole.get(path) as Entry;
    const at = osPath(dir, path);
    steps.push({ path, run: () => createEntry(at, e) });
    if (e.directory === true) modes.push({ path, run: () => chmodSync(at, modeOf(e)) });
  }
  return [...steps, ...modes.reverse()];
}

/**
 * Checks that dir is a directory that opens, then runs the steps that plan
 * returns, in order.
 *
 * @throws Fault for a dir that cannot be opened, the fault of plan, and a
 *   fault at the path of the first step that fails.
 */
function apply(dir: string, plan: () => readonly Step[]): void {
  try {
    opendirSync(dir).closeSync();
  } catch (err) {
    throw new Fault("", "the directory cannot be opened", err);
  }
  for (const step of plan()) {
    try {
      step.run();
    } catch (err) {
      throw new Fault(step.path, "the entry cannot be written", err);
    }
  }
}

/**
 * Writes tree into dir, a directory that exists. It creates every entry
 * and writes over none: a file of its content, a directory, and a link of
 * its target, inside or outside dir. Each file and each directory gets its
 * stated mode, and where it states none the mode of {@link modeOf}.
 *
 * @param dir - The directory.
 * @param tree - The tree.
 * @throws Fault for a tree that breaks a rule of a tree, before it writes
 *   anything, for a dir that cannot be opened, and at the path of the first
 *   entry that cannot be written, such as one that the file system maps to
 *   an entry that the write already wrote.
 */
export function create(dir: string, tree: ReadonlyMap<string, Entry>): void {
  check(tree);
  apply(dir, () => creating(dir, full(tree), new Set(), []));
}

/** Returns what lstat states of at, or undefined when nothing is there. */
function statsAt(at: string, path: string): BigIntStats | undefined {
  try {
    return lstatSync(at, { bigint: true, throwIfNoEntry: false });
  } catch (err) {
    throw new Fault(path, "the entry cannot be read", err);
  }
}

/**
 * Throws the fault of the entry at path, which lstat described as stats,
 * where a tree states e: an entry that is no file, directory or link, one
 * of another kind than e, and one that is the entry at a path in read.
 */
function refuse(
  path: string,
  stats: BigIntStats,
  e: Entry,
  read: ReadonlyMap<string, BigIntStats>,
): void {
  const kind = kindOfStats(stats);
  if (kind === undefined)
    throw new Fault(path, "the entry is no file, directory or link");
  if (kind !== kindOf(e)) {
    throw new Fault(path, `the entry is a ${kind}, and the tree states a ${kindOf(e)}`);
  }
  for (const [other, seen] of read) {
    if (seen.dev === stats.dev && seen.ino === stats.ino) {
      throw new Fault(
        path,
        `the file system maps the path to the entry at ${JSON.stringify(other)}`,
      );
    }
  }
}

/**
 * Reads the entry at each path of the full tree of tree in dir, in path
 * order, and returns the steps that write tree over them: the replacement
 * of each file and each link that is there, the steps of {@link create}
 * for each entry that is missing, and then the mode of each directory that
 * is there and that tree states, deepest first.
 */
function overwriting(dir: string, tree: ReadonlyMap<string, Entry>): Step[] {
  const whole = full(tree);
  const there = new Set<string>();
  const read = new Map<string, BigIntStats>();
  const replaced: Step[] = [];
  const modes: Step[] = [];
  for (const path of pathsOf(whole.keys())) {
    const e = whole.get(path) as Entry;
    const at = osPath(dir, path);
    const stats = statsAt(at, path);
    if (stats === undefined) continue;
    refuse(path, stats, e, read);
    there.add(path);
    read.set(path, stats);
    if (e.directory !== true) replaced.push({ path, run: () => replace(at, e) });
    else if (tree.has(path)) modes.push({ path, run: () => chmodSync(at, modeOf(e)) });
  }
  return [...creating(dir, whole, there, replaced), ...modes.reverse()];
}

/**
 * Writes tree into dir, a directory that exists. Where nothing is at a
 * path of the tree, it creates the entry as {@link create} does. A file
 * replaces the content of the file at its path, also of a file that its
 * owner may not write, and a link replaces the target of the link at its
 * path. A directory keeps its entries. Each entry that tree states gets
 * its stated mode, and where it states none the mode of {@link modeOf}. A
 * parent that tree implies keeps its mode where it exists. Every entry
 * that tree does not state keeps its content and its mode.
 *
 * @param dir - The directory.
 * @param tree - The tree.
 * @throws Fault for a tree that breaks a rule of a tree and for a dir that
 *   cannot be opened. Before it writes anything, it throws a fault at the
 *   first path, in path order, whose entry cannot be read, is of another
 *   kind than tree states, or is the entry at an earlier path. A link is
 *   another kind than a directory. It throws a fault at the path of the
 *   first entry that cannot be written.
 */
export function overwrite(dir: string, tree: ReadonlyMap<string, Entry>): void {
  check(tree);
  apply(dir, () => overwriting(dir, tree));
}

/**
 * Makes dir equal tree, as an update of a golden tree does. It creates dir
 * and its parents when they are missing. It removes each entry that tree
 * lacks or states in another form, and writes each entry that dir then
 * lacks, as {@link create} writes it. It removes a link, and never the
 * entry that the link points to. It compares no mode, and writes each file
 * and each directory with the mode of {@link modeOf} for an entry that
 * states none.
 *
 * @param dir - The directory.
 * @param tree - The tree.
 * @throws Fault for a tree that breaks a rule of a tree, for a directory
 *   that cannot be created or read, and at the path of the first entry
 *   that cannot be removed or written.
 */
export function update(dir: string, tree: ReadonlyMap<string, Entry>): void {
  check(tree);
  try {
    mkdirSync(dir, { recursive: true, mode: DIRECTORY_MODE });
  } catch (err) {
    throw new Fault("", "the directory cannot be created", err);
  }
  const current = readTree(dir, false);
  const wanted = new Map([...full(tree)].map(([path, e]) => [path, unstated(e)]));
  const kept = new Set<string>();
  const removals: Step[] = [];
  for (const path of pathsOf(current.keys()).reverse()) {
    const w = wanted.get(path);
    if (w !== undefined && !differs(w, current.get(path))) {
      kept.add(path);
      continue;
    }
    removals.push({
      path,
      run: () => rmSync(osPath(dir, path), { recursive: true, force: true }),
    });
  }
  apply(dir, () => creating(dir, wanted, kept, removals));
}

/**
 * Gives the owner of dir and of each directory below it the permission to
 * read, write and search it, so that every entry below dir can be removed,
 * also below a directory whose mode forbids it. It follows no link, and
 * changes nothing at a path where no directory is.
 *
 * @param dir - The directory.
 */
export function unlock(dir: string): void {
  const stats = lstatSync(dir, { throwIfNoEntry: false });
  if (stats === undefined || !stats.isDirectory()) return;
  chmodSync(dir, (stats.mode & PERMISSIONS) | CREATE_DIRECTORY);
  for (const name of readdirSync(dir)) unlock(join(dir, name));
}
