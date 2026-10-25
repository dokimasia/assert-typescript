// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The parts of a files vector: its tree literals and its arguments, each
 * read with a fault at the part of the vector that does not read.
 */

import { join } from "node:path";
import { directory, type Entry } from "../../files/entry.js";
import { decode as decodeTree } from "../../files/literal.js";
import { Fault, faultText } from "../../matcher/fault.js";
import type { Recorder } from "../../seat.js";
import { type Literal, Objects } from "../literal.js";

/** A files vector, as its JSON states it. */
export interface FilesVector {
  readonly workspace?: unknown;
  readonly args?: readonly unknown[];
  readonly subject?: { readonly kind?: string };
  readonly golden?: unknown;
  readonly expect?: unknown;
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly after?: unknown;
}

/**
 * Returns the call of the assertion of the vector v, whose directory is dir
 * and whose workspace is ws. The call throws a fault of what it observes
 * beside its call record.
 *
 * @throws Fault for an input of v that the call cannot take.
 */
export type Caller = (
  v: FilesVector,
  dir: string,
  ws: string,
) => (seat: Recorder) => Promise<void>;

/** Returns tree below the directory under, with under as a directory of its own. */
export function within(
  under: string,
  tree: ReadonlyMap<string, Entry>,
): Map<string, Entry> {
  return new Map([
    [under, directory()],
    ...[...tree].map(([path, e]): [string, Entry] => [`${under}/${path}`, e]),
  ]);
}

/** Returns the tree that the tree literal at member of a vector states. */
export function treeAt(literal: unknown, member: string): Map<string, Entry> {
  try {
    return decodeTree(literal);
  } catch (err) {
    throw (err as Fault).within(member);
  }
}

/** Returns the n arguments that v states, as typed literals. */
export function argsOf(v: FilesVector, n: number): readonly unknown[] {
  const args = v.args ?? [];
  if (args.length !== n) {
    throw new Fault("args", `the number of arguments is ${args.length}, want ${n}`);
  }
  return args;
}

/** Returns the values of the n typed literals that v states as its arguments. */
export function valuesOf(v: FilesVector, n: number): unknown[] {
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
export function argument<T>(
  values: readonly unknown[],
  i: number,
  what: string,
  is: (value: unknown) => boolean,
): T {
  const value = values[i];
  if (!is(value)) {
    throw new Fault(`args[${i}]`, `the argument is no ${what}`);
  }
  return value as T;
}

/** Reports whether value is a string. */
export function isString(value: unknown): boolean {
  return typeof value === "string";
}

/** Returns the path of the operating system of the path, relative to ws, that the argument at i states. */
export function pathAt(values: readonly unknown[], i: number, ws: string): string {
  return join(ws, ...argument<string>(values, i, "string", isString).split("/"));
}
