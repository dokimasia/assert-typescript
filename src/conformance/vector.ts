/**
 * The vectors of the vendored definition, and running one against this
 * library.
 *
 * A vector is a case of a family that the corpus of the assertions does
 * not state, with inputs and outputs of its own. This library runs the
 * vectors of the assertions that read files, of the history seam and its
 * checks, of the property engine, and of machines.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Fault } from "../matcher/fault.js";
import { RUNNERS } from "./files.js";
import { RUNNERS as HISTORY } from "./history/vectors.js";
import { checkProp, KINDS } from "./prop/vectors.js";
import { RUNNERS as STATEFUL } from "./stateful/vectors.js";

/** Where the vendored corpus is, relative to this module. */
const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "spec", "corpus");

/** The directories of the corpus whose files state the vectors that this library runs. */
const FAMILIES = ["files", "history", "prop", "stateful"];

/**
 * Returns the reason that the definition states for this language to skip
 * a vector, or undefined for a vector that this language runs.
 *
 * @param vector - The vector.
 * @returns The reason, or undefined.
 */
export function skipOf(vector: Vector): string | undefined {
  const skip = vector.raw["skip"] as Readonly<Record<string, unknown>> | undefined;
  const reason = skip?.["typescript"];
  return typeof reason === "string" ? reason : undefined;
}

/** One case of a vector file: its kind, its id, and its JSON. */
export interface Vector {
  /** The kind, as the vector file names it, such as `tree-equal`. */
  readonly kind: string;
  /** The vector's id, which names its kind first. */
  readonly id: string;
  /** The case's JSON object, as the vector file states it. */
  readonly raw: Readonly<Record<string, unknown>>;
}

/** A vector file, as the definition states it. */
interface VectorFile {
  readonly kind: string;
  readonly cases: readonly Readonly<Record<string, unknown>>[];
}

/**
 * Returns every vector of the families that this library runs: the files
 * in the order of their names, and the cases of each file in order.
 *
 * @returns The vectors.
 */
export function vectors(): Vector[] {
  const found: Vector[] = [];
  for (const family of FAMILIES) {
    const dir = join(CORPUS, family);
    for (const name of readdirSync(dir).sort()) {
      const file = JSON.parse(readFileSync(join(dir, name), "utf8")) as VectorFile;
      for (const raw of file.cases) {
        found.push({ kind: file.kind, id: raw["id"] as string, raw });
      }
    }
  }
  return found;
}

/**
 * Runs vector against this library in dir, an empty directory of the
 * vector's own. A vector of golden-match-tree writes its golden tree below
 * dir, which is the working directory, because golden.matchTree resolves a
 * name against the working directory.
 *
 * @param vector - The vector.
 * @param dir - The directory.
 * @returns How the run differs from the vector, as the path of the part of
 *   the vector at fault from the vector's id and a reason, or undefined
 *   when the two agree.
 */
export async function checkVector(
  vector: Vector,
  dir: string,
): Promise<string | undefined> {
  const files = RUNNERS[vector.kind];
  const history = HISTORY.get(vector.kind);
  const stateful = STATEFUL.get(vector.kind);
  const prop = KINDS.has(vector.kind);
  if (files === undefined && history === undefined && stateful === undefined && !prop)
    return `${vector.id}: ${JSON.stringify(vector.kind)} is no vector kind`;
  try {
    if (files !== undefined) await files(vector.raw, dir);
    else if (history !== undefined) history(vector.raw);
    else if (stateful !== undefined) await stateful(vector.raw);
    else await checkProp(vector.kind, vector.raw);
  } catch (err) {
    return (err as Fault).within(vector.id).message;
  }
  return undefined;
}
