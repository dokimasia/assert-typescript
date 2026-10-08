/**
 * The assertions that compare the tree in a directory with a wanted tree:
 * `equal`, `contains` and `unchanged`.
 *
 * A comparison reads the tree and follows no link. It compares a mode only
 * where the wanted entry states one, and otherwise the owner's execute bit
 * of a file. Content compares as bytes, so a file that ends in `\r\n` does
 * not equal text that ends in `\n`. Each assertion stops the test on a
 * failure, and has no recording form.
 */

import { callSite, type Where } from "../failure.js";
import { ofOperation } from "../matcher/fault.js";
import { track } from "../matcher/pending.js";
import { Mode, type Seat } from "../matcher/seat.js";
import { Running } from "../matcher/verdict.js";
import { differing } from "./difference.js";
import type { Entry } from "./entry.js";
import { readTree } from "./reader.js";
import { comparison, report } from "./record.js";
import { check, mapOf, type Tree } from "./tree.js";

/** Compares the tree in dir with want, and reports the verdict of the call. */
function compareRead(
  seat: Seat,
  op: string,
  assertion: string,
  dir: string,
  want: Tree,
  msg: string,
  contains: boolean,
): void {
  seat.helper();
  const running = Running.of(seat);
  const wanted = mapOf(want);
  let read: Map<string, Entry>;
  try {
    check(wanted);
    read = readTree(dir, true);
  } catch (err) {
    running.fault(Mode.Fatal, assertion, msg, ofOperation(op, err));
    return;
  }
  report(
    running,
    assertion,
    msg,
    comparison(wanted, read, differing(wanted, read, contains)),
    callSite(),
  );
}

/**
 * Checks that the tree in dir has the entries of want, no more and no
 * fewer, each as want states it. It stops the test with a record of
 * tree-equal when it does not. The record states want and got, the trees
 * of the entries at the first 64 paths that differ, and differences, the
 * number of those paths. An entry of got states its mode only where want
 * states one.
 *
 * A want that breaks a rule of a tree, an entry of the directory that is
 * no file, directory or link, and a tree that cannot be read end the call
 * with a fault.
 *
 * @param seat - Where the failure is reported.
 * @param dir - The directory, a path of the operating system.
 * @param want - The wanted tree.
 * @param msg - The contract under test.
 * @example
 * files.equal(seat, dir, {
 *   "a/a.go": files.text("package a\n\nfunc New() {}\n"),
 * }, "the rename rewrites the declaration");
 */
export function equal(seat: Seat, dir: string, want: Tree, msg: string): void {
  seat.helper();
  compareRead(seat, "files.equal", "tree-equal", dir, want, msg, false);
}

/**
 * Checks that the tree in dir has every entry of want, each as want states
 * it. The tree may have more entries. It stops the test with a record of
 * tree-contains when it does not. The comparison, the record and the
 * faults are those of {@link equal}, and a path that want lacks is no
 * difference.
 *
 * @param seat - Where the failure is reported.
 * @param dir - The directory, a path of the operating system.
 * @param want - The wanted entries.
 * @param msg - The contract under test.
 * @example
 * files.contains(seat, dir, { "out/report.txt": files.text("ok\n") },
 *   "the run writes its report");
 */
export function contains(seat: Seat, dir: string, want: Tree, msg: string): void {
  seat.helper();
  compareRead(seat, "files.contains", "tree-contains", dir, want, msg, true);
}

/** Returns the tree in dir, or undefined after the call ended with a fault. */
function readOrEnd(
  running: Running,
  dir: string,
  msg: string,
): Map<string, Entry> | undefined {
  try {
    return readTree(dir, true);
  } catch (err) {
    running.fault(
      Mode.Fatal,
      "tree-unchanged",
      msg,
      ofOperation("files.unchanged", err),
    );
    return undefined;
  }
}

/** Calls fn between two readings of the tree in dir, and reports the verdict. */
async function around(
  running: Running,
  dir: string,
  fn: () => unknown,
  msg: string,
  where: Where | undefined,
): Promise<void> {
  const before = readOrEnd(running, dir, msg);
  if (before === undefined) return;
  await fn();
  const after = readOrEnd(running, dir, msg);
  if (after === undefined) return;
  report(
    running,
    "tree-unchanged",
    msg,
    comparison(before, after, differing(before, after, false)),
    where,
  );
}

/**
 * Calls fn, and checks that the tree in dir after the call equals the tree
 * in it before the call, modes included. It stops the test with a record
 * of tree-unchanged when the trees differ, with the tree before the call
 * as the wanted one. A write of the bytes that a file has, and a change of
 * a timestamp, leave the tree unchanged. fn may return a promise, which
 * the call awaits, so await the call.
 *
 * A throw of fn, and a rejection of its promise, end the call with that
 * error, and compare nothing. The record and the faults are those of
 * {@link equal}.
 *
 * @param seat - Where the failure is reported.
 * @param dir - The directory, a path of the operating system.
 * @param fn - The callable.
 * @param msg - The contract under test.
 * @returns A promise of the verdict.
 * @example
 * await files.unchanged(seat, dir, () => migrate.dryRun(dir),
 *   "a dry run writes nothing");
 */
export function unchanged(
  seat: Seat,
  dir: string,
  fn: () => unknown,
  msg: string,
): Promise<void> {
  seat.helper();
  const where = callSite();
  return track(seat, msg, around(Running.of(seat, where), dir, fn, msg, where));
}
