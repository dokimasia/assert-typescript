// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The runners of the files vectors.
 *
 * A files vector states the tree of a workspace, the arguments of a call
 * of an assertion that reads files, or its subject, the golden tree of a
 * vector of golden-match-tree, and the verdict and the detail of the call.
 * A runner writes the workspace below the vector's directory, makes the
 * call on a recorder, and compares the call record with the vector.
 */

import { join } from "node:path";
import * as files from "../files/index.js";
import { type Tree, treeOf } from "../files/tree.js";
import { create } from "../files/writer.js";
import { Fault } from "../matcher/fault.js";
import type { Seat } from "../matcher/seat.js";
import { compareText } from "../order.js";
import { Recorder } from "../seat.js";
import { sameJson } from "./equality.js";
import { goldenCall } from "./files/golden.js";
import {
  argsOf,
  argument,
  type Caller,
  type FilesVector,
  isString,
  pathAt,
  treeAt,
  valuesOf,
  within,
} from "./files/vector.js";
import { SUBJECTS } from "./subject.js";

/** The directory below the vector's directory that a runner writes the workspace into. */
const WORKSPACE = "workspace";

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
  if (expect === "pass") {
    return;
  }
  const detail = record["detail"] as Readonly<Record<string, unknown>>;
  const names = Object.keys(stated).sort(compareText);
  const fields = Object.keys(detail).sort(compareText);
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
    if (failed !== undefined) {
      throw new Fault("subject", "the subject fails", { cause: failed });
    }
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

/** The contract of the call of a files vector. */
export const CONTRACT = "the files of the vector are as the vector states";

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
