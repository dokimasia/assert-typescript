// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The call of a golden-match-tree vector: the golden tree of the vector
 * below the conventional directory, golden.matchTree on the workspace, and
 * the golden tree after the call.
 */

import { statSync } from "node:fs";
import { join } from "node:path";
import { encode } from "../../files/literal.js";
import { readTree } from "../../files/reader.js";
import { create } from "../../files/writer.js";
import { matchTree } from "../../golden.js";
import { Fault } from "../../matcher/fault.js";
import type { Recorder } from "../../seat.js";
import { sameJson } from "../equality.js";
import type { Literal } from "../literal.js";
import {
  argument,
  type FilesVector,
  isString,
  treeAt,
  valuesOf,
  within,
} from "./vector.js";

/** Where golden.matchTree resolves a name, relative to the working directory. */
const GOLDEN = "testdata/golden";

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
    throw new Fault("after", "the golden tree cannot be read", { cause: err });
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
export function goldenCall(
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
  return (seat) => {
    matchTree(seat, name, ws, update);
    if (v.after !== undefined) {
      compareAfter(join(dir, ...golden.split("/")), v.after);
    }
    return Promise.resolve();
  };
}
