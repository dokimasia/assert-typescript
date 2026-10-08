/**
 * The runners of the files vectors.
 *
 * A files vector states the tree of a workspace, the arguments of a call
 * of an assertion that reads files, or its subject, the golden tree of a
 * vector of golden-match-tree, and the verdict and the detail of the call.
 * A runner writes the workspace below the vector's directory, makes the
 * call on a recorder, and compares the call record with the vector.
 */

import { statSync } from "node:fs";
import { join } from "node:path";
import { directory, type Entry } from "../files/entry.js";
import * as files from "../files/index.js";
import { decode as decodeTree, encode } from "../files/literal.js";
import { readTree } from "../files/reader.js";
import { type Tree, treeOf } from "../files/tree.js";
import { create } from "../files/writer.js";
import { matchTree } from "../golden.js";
import { Fault } from "../matcher/fault.js";
import type { Seat } from "../matcher/seat.js";
import { faultText } from "../matcher/verdict.js";
import { Recorder } from "../seat.js";
import { type Literal, Objects, sameJson } from "./literal.js";
import { SUBJECTS } from "./subject.js";

/** The contract of the call of a files vector. */
export const CONTRACT = "the files of the vector are as the vector states";

/** The directory below the vector's directory that a runner writes the workspace into. */
const WORKSPACE = "workspace";

/** Where golden.matchTree resolves a name, relative to the working directory. */
const GOLDEN = "testdata/golden";

/** A files vector, as its JSON states it. */
interface FilesVector {
  readonly workspace?: unknown;
  readonly args?: readonly unknown[];
  readonly subject?: { readonly kind?: string };
  readonly golden?: unknown;
  readonly expect?: unknown;
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly after?: unknown;
}

/**
 * Runs the JSON of one vector against this library, in dir, an empty
 * directory of the vector's own.
 *
 * @throws Fault at the part of the vector that the run contradicts, or that
 *   the runner cannot take.
 */
export type Runner = (
  raw: Readonly<Record<string, unknown>>,
  dir: string,
) => Promise<void>;

/**
 * Returns the call of the assertion of the vector v, whose directory is dir
 * and whose workspace is ws. The call throws a fault of what it observes
 * beside its call record.
 *
 * @throws Fault for an input of v that the call cannot take.
 */
type Caller = (
  v: FilesVector,
  dir: string,
  ws: string,
) => (seat: Recorder) => Promise<void>;

/** Returns tree below the directory under, with under as a directory of its own. */
function within(under: string, tree: ReadonlyMap<string, Entry>): Map<string, Entry> {
  return new Map([
    [under, directory()],
    ...[...tree].map(([path, e]): [string, Entry] => [`${under}/${path}`, e]),
  ]);
}

/** Returns the tree that the tree literal at member of a vector states. */
function treeAt(literal: unknown, member: string): Map<string, Entry> {
  try {
    return decodeTree(literal);
  } catch (err) {
    throw (err as Fault).within(member);
  }
}

/** Returns the n arguments that v states, as typed literals. */
function argsOf(v: FilesVector, n: number): readonly unknown[] {
  const args = v.args ?? [];
  if (args.length !== n) {
    throw new Fault("args", `the number of arguments is ${args.length}, want ${n}`);
  }
  return args;
}

/** Returns the values of the n typed literals that v states as its arguments. */
function valuesOf(v: FilesVector, n: number): unknown[] {
  const objects = new Objects();
  return argsOf(v, n).map((literal, i) => {
    try {
      return objects.decode(literal as Literal);
    } catch (err) {
      const at = `args[${i}]`;
      throw err instanceof Fault ? err.within(at) : new Fault(at, faultText(err));
    }
  });
}

/** Returns the argument at i, after it checks it with is, which names it as what. */
function argument<T>(
  values: readonly unknown[],
  i: number,
  what: string,
  is: (value: unknown) => boolean,
): T {
  const value = values[i];
  if (!is(value)) throw new Fault(`args[${i}]`, `the argument is no ${what}`);
  return value as T;
}

/** Reports whether value is a string. */
function isString(value: unknown): boolean {
  return typeof value === "string";
}

/** Returns the path of the operating system of the path, relative to ws, that the argument at i states. */
function pathAt(values: readonly unknown[], i: number, ws: string): string {
  return join(ws, ...argument<string>(values, i, "string", isString).split("/"));
}

/** Returns the call record of the one call of seat, parsed. */
function recordOf(seat: Recorder): Record<string, unknown> {
  return JSON.parse(seat.records[0] as string) as Record<string, unknown>;
}

/**
 * Compares the call record with the outcome that a vector expects: a pass,
 * or a failure whose detail states exactly the fields stated, each the
 * same JSON value.
 */
function compareVerdict(
  record: Readonly<Record<string, unknown>>,
  expect: unknown,
  stated: Readonly<Record<string, unknown>>,
): void {
  if (expect !== "pass" && expect !== "fail") {
    throw new Fault(
      "expect",
      `the vector expects ${JSON.stringify(expect)}, neither pass nor fail`,
    );
  }
  const verdict = record["verdict"];
  if (verdict !== expect) {
    const error = record["error"] === undefined ? "" : ` (${record["error"]})`;
    throw new Fault("expect", `the check ends as ${verdict}${error}, want ${expect}`);
  }
  if (expect === "pass") return;
  const detail = record["detail"] as Readonly<Record<string, unknown>>;
  const names = Object.keys(stated).sort();
  const fields = Object.keys(detail).sort();
  if (!sameJson(fields, names)) {
    throw new Fault(
      "detail",
      `the record states the fields ${JSON.stringify(fields)}, want ${JSON.stringify(names)}`,
    );
  }
  for (const name of names) {
    if (!sameJson(detail[name], stated[name])) {
      throw new Fault(
        `detail.${name}`,
        `the field is ${JSON.stringify(detail[name])}, want ${JSON.stringify(stated[name])}`,
      );
    }
  }
}

/**
 * Returns the runner of the files vectors whose calls build returns. The
 * runner writes the workspace into the directory workspace below the
 * vector's directory, makes the call on a recorder, and compares the
 * verdict and the detail of its call record with the vector's.
 */
function checkFiles(build: Caller): Runner {
  return async (raw, dir) => {
    const v = raw as FilesVector;
    const tree = treeAt(v.workspace, "workspace");
    try {
      create(dir, within(WORKSPACE, tree));
    } catch (err) {
      throw (err as Fault).within("workspace");
    }
    const call = build(v, dir, join(dir, WORKSPACE));
    const seat = new Recorder();
    await call(seat);
    compareVerdict(recordOf(seat), v.expect, v.detail ?? {});
  };
}

/** Returns the caller of a comparison of trees, whose one argument is the wanted tree. */
function treeCall(
  compare: (seat: Seat, dir: string, want: Tree, msg: string) => void,
): Caller {
  return (v, _dir, ws) => {
    const want = treeOf(treeAt(argsOf(v, 1)[0], "args[0]"));
    return async (seat) => compare(seat, ws, want, CONTRACT);
  };
}

/**
 * Returns the call of a tree-unchanged vector, whose subject reads or
 * writes the files of the workspace. The call throws a fault at the
 * subject for a subject that throws.
 */
function unchangedCall(
  v: FilesVector,
  _dir: string,
  ws: string,
): (seat: Recorder) => Promise<void> {
  const kind = v.subject?.kind;
  const touch = SUBJECTS[kind ?? ""]?.().files;
  if (touch === undefined) {
    throw new Fault("subject.kind", `${JSON.stringify(kind)} is no subject of files`);
  }
  return async (seat) => {
    let failed: unknown;
    await files.unchanged(
      seat,
      ws,
      () => {
        try {
          touch(ws);
        } catch (err) {
          failed = err;
        }
      },
      CONTRACT,
    );
    if (failed !== undefined) throw new Fault("subject", "the subject fails", failed);
  };
}

/** Throws a fault when dir is not the working directory. */
function checkWorkingDirectory(dir: string): void {
  const here = statSync(".", { bigint: true });
  const there = statSync(dir, { bigint: true });
  if (here.dev !== there.dev || here.ino !== there.ino) {
    throw new Fault(
      "",
      "the directory of the vector is not the working directory, which golden.matchTree resolves a name against",
    );
  }
}

/** Compares the golden tree in dir, read without its modes, with after, the tree that a vector states. */
function compareAfter(dir: string, after: unknown): void {
  let got: Literal;
  try {
    got = encode(readTree(dir, false), Number.POSITIVE_INFINITY);
  } catch (err) {
    throw new Fault("after", "the golden tree cannot be read", err);
  }
  if (!sameJson(got, after)) {
    throw new Fault(
      "after",
      `the golden tree is ${JSON.stringify(got)}, want ${JSON.stringify(after)}`,
    );
  }
}

/**
 * Returns the call of a golden-match-tree vector, whose arguments are the
 * name and update. golden.matchTree resolves the name against the working
 * directory, so the call refuses a dir that is not the working directory,
 * and writes the vector's golden tree below the conventional directory of
 * dir. The call throws a fault at after for a golden tree after the call
 * that differs from the one that the vector states.
 */
function goldenCall(
  v: FilesVector,
  dir: string,
  ws: string,
): (seat: Recorder) => Promise<void> {
  const values = valuesOf(v, 2);
  const name = argument<string>(values, 0, "string", isString);
  const update = argument<boolean>(
    values,
    1,
    "bool",
    (value) => typeof value === "boolean",
  );
  checkWorkingDirectory(dir);
  const golden = `${GOLDEN}/${name}`;
  if (v.golden !== null) {
    const tree = treeAt(v.golden, "golden");
    try {
      create(dir, within(golden, tree));
    } catch (err) {
      throw (err as Fault).within("golden");
    }
  }
  return async (seat) => {
    matchTree(seat, name, ws, update);
    if (v.after !== undefined) compareAfter(join(dir, ...golden.split("/")), v.after);
  };
}

/** Returns the caller of an assertion of the kind of the entry at a path, whose one argument is the path. */
function kindCall(assertion: (seat: Seat, path: string, msg: string) => void): Caller {
  return (v, _dir, ws) => {
    const path = pathAt(valuesOf(v, 1), 0, ws);
    return async (seat) => assertion(seat, path, CONTRACT);
  };
}

/** Returns the call of a links-to vector, whose arguments are the path and the target. */
function linksToCall(
  v: FilesVector,
  _dir: string,
  ws: string,
): (seat: Recorder) => Promise<void> {
  const values = valuesOf(v, 2);
  const path = pathAt(values, 0, ws);
  const target = argument<string>(values, 1, "string", isString);
  return async (seat) => files.linksTo(seat, path, target, CONTRACT);
}

/** Returns the call of a has-content vector, whose arguments are the path and the content, as text or as bytes. */
function hasContentCall(
  v: FilesVector,
  _dir: string,
  ws: string,
): (seat: Recorder) => Promise<void> {
  const values = valuesOf(v, 2);
  const path = pathAt(values, 0, ws);
  const content = argument<string | Uint8Array>(
    values,
    1,
    "text and no bytes",
    (value) => typeof value === "string" || value instanceof Uint8Array,
  );
  return async (seat) => files.hasContent(seat, path, content, CONTRACT);
}

/** Returns the call of a has-mode vector, whose arguments are the path and the mode. */
function hasModeCall(
  v: FilesVector,
  _dir: string,
  ws: string,
): (seat: Recorder) => Promise<void> {
  const values = valuesOf(v, 2);
  const path = pathAt(values, 0, ws);
  const mode = argument<number>(values, 1, "int", (value) =>
    Number.isSafeInteger(value),
  );
  return async (seat) => files.hasMode(seat, path, mode, CONTRACT);
}

/** The runner of each kind of files vector, by the kind's name. */
export const RUNNERS: Readonly<Record<string, Runner>> = {
  "tree-equal": checkFiles(treeCall(files.equal)),
  "tree-contains": checkFiles(treeCall(files.contains)),
  "tree-unchanged": checkFiles(unchangedCall),
  "golden-match-tree": checkFiles(goldenCall),
  "path-absent": checkFiles(kindCall(files.absent)),
  "is-file": checkFiles(kindCall(files.isFile)),
  "is-dir": checkFiles(kindCall(files.isDir)),
  "links-to": checkFiles(linksToCall),
  "has-content": checkFiles(hasContentCall),
  "has-mode": checkFiles(hasModeCall),
};
