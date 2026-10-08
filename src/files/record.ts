/**
 * The record of a comparison of trees that fails, and the verdict of a
 * comparison.
 *
 * A record states want and got, the trees of the entries at the first 64
 * paths that differ, and differences, the number of those paths. A missing
 * entry is in want alone, an extra one in got alone, and a changed one in
 * both. An entry of got states its mode only where the wanted entry at its
 * path states one, and a file of got that states no mode states whether
 * its owner may execute it. The call record states each tree as a tree
 * literal.
 */

import { Failure, type Where } from "../failure.js";
import { Mode } from "../matcher/seat.js";
import type { Running } from "../matcher/verdict.js";
import { detail } from "../record/literal.js";
import { type Entry, unstated } from "./entry.js";
import { CONTENT_LIMIT, encode } from "./literal.js";
import { full, pathsOf, treeOf } from "./tree.js";

/** The most paths that a record lists. */
export const MAX_PATHS = 64;

/** The detail of a comparison of trees that fails. */
export interface Comparison {
  /** The wanted entries at the paths that differ, and null for a missing golden tree. */
  readonly want: ReadonlyMap<string, Entry> | null;
  /** The entries read at the paths that differ. */
  readonly got: ReadonlyMap<string, Entry>;
  /** The number of paths that differ. */
  readonly differences: number;
}

/**
 * Returns read, an entry read where w is wanted, as the comparison read
 * it: with its mode where both state one, and otherwise with the owner's
 * execute bit of a file alone.
 */
function asCompared(read: Entry, w: Entry | undefined): Entry {
  return read.mode !== undefined && w?.mode !== undefined ? read : unstated(read);
}

/**
 * Returns the record of a comparison of got with want that found paths,
 * the paths that differ in path order.
 *
 * @param want - The wanted tree.
 * @param got - The tree read.
 * @param paths - The paths that differ.
 * @returns The record, or undefined when no path differs.
 */
export function comparison(
  want: ReadonlyMap<string, Entry>,
  got: ReadonlyMap<string, Entry>,
  paths: readonly string[],
): Comparison | undefined {
  if (paths.length === 0) return undefined;
  const wanted = full(want);
  const listed = paths.slice(0, MAX_PATHS);
  const record = { want: new Map<string, Entry>(), got: new Map<string, Entry>() };
  for (const path of listed) {
    const w = wanted.get(path);
    const g = got.get(path);
    if (w !== undefined) record.want.set(path, w);
    if (g !== undefined) record.got.set(path, asCompared(g, w));
  }
  return { ...record, differences: paths.length };
}

/**
 * Returns the record of a golden tree that is missing: no wanted tree, the
 * first 64 entries of got in path order, each without its mode, and the
 * number of the entries of got.
 *
 * @param got - The tree read.
 * @returns The record.
 */
export function missing(got: ReadonlyMap<string, Entry>): Comparison {
  const paths = pathsOf(got.keys());
  const listed = paths
    .slice(0, MAX_PATHS)
    .map((path): [string, Entry] => [path, unstated(got.get(path) as Entry)]);
  return { want: null, got: new Map(listed), differences: paths.length };
}

/**
 * Reports the verdict of a call of a comparison of trees: a pass without a
 * record, and otherwise a failure that stops the test. The failure's detail
 * states want and got as trees, and its call record as tree literals.
 *
 * @param running - The call.
 * @param assertion - The canonical id.
 * @param contract - The caller's message.
 * @param record - The record, or undefined when no path differs.
 * @param where - The call site.
 */
export function report(
  running: Running,
  assertion: string,
  contract: string,
  record: Comparison | undefined,
  where: Where | undefined,
): void {
  if (record === undefined) {
    running.pass(Mode.Fatal, assertion, contract);
    return;
  }
  const want = record.want;
  const failure = new Failure(
    assertion,
    contract,
    {
      want: want === null ? null : treeOf(want),
      got: treeOf(record.got),
      differences: record.differences,
    },
    where,
  );
  running.failRun(Mode.Fatal, failure, {
    want: want === null ? detail(null) : encode(want, CONTENT_LIMIT),
    got: encode(record.got, CONTENT_LIMIT),
    differences: detail(record.differences),
  });
}
