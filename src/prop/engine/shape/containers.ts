// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The builders of the structural shapes: list, fixed-list, set, map,
 * optional, record, enum and ref. A container that can exit and refers back
 * takes its exit once a value has used its budget.
 */

import { Sizes } from "../collection.js";
import type { Generator } from "../generator.js";
import { ShapeError } from "./error.js";
import { countParameter, type Node, pairsOf, sizesOf } from "./parameters.js";
import type { Reader } from "./reader.js";
import {
  EnumShape,
  ListShape,
  MapShape,
  OptionalShape,
  RecordShape,
  Ref,
} from "./structure.js";

/** Returns the generator of a list, a fixed-list or a set. */
export function listShape(
  reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const kind = node["shape"];
  const of = reader.child(node["of"], `${where}.of`);
  let sizes: Sizes;
  if (kind === "fixed-list") {
    const size = countParameter(node, "size", where);
    if (size === undefined) {
      throw new ShapeError(`prop: ${where} is a fixed-list and states no size`);
    }
    sizes = new Sizes(size, size);
  } else {
    sizes = sizesOf(node, where);
  }
  const exits = kind !== "fixed-list" && reader.exits(node) && reader.refersBack(node);
  return new ListShape(of, sizes, kind === "set", exits, reader.budget);
}

/** Returns the generator of a map from keys to values. */
export function mapShape(
  reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const key = reader.child(node["key"], `${where}.key`);
  const of = reader.child(node["of"], `${where}.of`);
  const exits = reader.exits(node) && reader.refersBack(node);
  return new MapShape(key, of, sizesOf(node, where), exits, reader.budget);
}

/** Returns the generator of an optional value. */
export function optionalShape(
  reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const of = reader.child(node["of"], `${where}.of`);
  return new OptionalShape(of, reader.refersBack(node), reader.budget);
}

/** Returns the generator of a record of named fields. */
export function recordShape(
  reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  return new RecordShape(
    pairsOf(node, "fields", where).map(
      ([name, of]) => [name, reader.child(of, `${where}.${name}`)] as const,
    ),
  );
}

/** Returns the generator of an enum of named variants with optional payloads. */
export function enumShape(
  reader: Reader,
  node: Node,
  where: string,
): Generator<unknown> {
  const variants = pairsOf(node, "variants", where).map(
    ([name, of]) =>
      [
        name,
        of === null || of === undefined
          ? undefined
          : reader.child(of, `${where}.${name}`),
      ] as const,
  );
  const exit = reader.refersBack(node) ? reader.exitVariant(node) : undefined;
  return new EnumShape(variants, exit, reader.budget);
}

/** Returns the generator of a named definition. The reader refused every ref to no definition before it built a shape. */
export function refShape(reader: Reader, node: Node): Generator<unknown> {
  const name = String(node["name"]);
  return new Ref(name, reader.built, reader.cyclic.has(name), reader.budget);
}
