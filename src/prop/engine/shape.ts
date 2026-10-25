// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Shapes: a language-neutral description of a type's values, read into a
 * generator.
 *
 * A shape is a JSON object whose `shape` key names its id. A shape file is a
 * root shape that may also state `definitions`, the shapes that a `ref`
 * names, and `source`, the language and the type it was read from, which no
 * reader compares. read turns a shape file into a generator of the engine.
 * Two implementations that read one shape decode the same value from the
 * same choices.
 *
 * Structural shapes decode as the generators do: bool as boolean, an int up
 * to 64 bits wide as integer, float, char and string as string, bytes, list,
 * fixed-list and set as list, map as dict, optional, and literal as
 * sampled-from. A record decodes its fields in order, an enum an index and
 * then the chosen variant's payload, and a ref the definition it names.
 *
 * Domain shapes decode to the form in which the definition states their
 * values:
 *
 * - uuid and ip-address: bytes in network order.
 * - decimal: the unscaled integer.
 * - date: days since 1970-01-01. time-of-day: units since midnight.
 *   duration: units. offset: seconds east of UTC. zone: its name.
 * - instant: a record of its seconds since 1970-01-01T00:00:00Z and the
 *   units within the second.
 * - local-date-time: a record of its date and its time of day.
 * - zoned-date-time: a record of its instant and its zone.
 * - wall-time: a record of its local-date-time and its zone.
 *
 * A key that a shape does not take fails the read, and the failure names
 * where the key is. A value of a recursive shape has a budget of 100 nodes,
 * where a node is the value of a definition that can refer to itself through
 * refs. Once a value has used its budget, every container that refers back
 * takes its exit: an optional is absent, a list, a set or a map takes no
 * further element, and an enum takes its first variant that does not refer
 * back. A definition that can refer to itself without passing through such
 * a container has no finite value, and fails the read.
 */

import type { Generator } from "./generator.js";
import {
  enumShape,
  listShape,
  mapShape,
  optionalShape,
  recordShape,
  refShape,
} from "./shape/containers.js";
import { ShapeError, shown } from "./shape/error.js";
import { isNode } from "./shape/parameters.js";
import { type Builder, Reader } from "./shape/reader.js";
import {
  boolShape,
  bytesShape,
  charShape,
  decimalShape,
  floatShape,
  intShape,
  ipShape,
  literalShape,
  stringShape,
  uuidShape,
} from "./shape/scalars.js";
import {
  dateShape,
  durationShape,
  instantShape,
  localShape,
  offsetShape,
  timeOfDayShape,
  wallShape,
  zonedShape,
  zoneShape,
} from "./shape/times.js";

/** The builder of each shape, by id. */
const BUILDERS: ReadonlyMap<string, Builder> = new Map<string, Builder>([
  ["bool", boolShape],
  ["int", intShape],
  ["float", floatShape],
  ["char", charShape],
  ["string", stringShape],
  ["bytes", bytesShape],
  ["list", listShape],
  ["fixed-list", listShape],
  ["set", listShape],
  ["map", mapShape],
  ["optional", optionalShape],
  ["record", recordShape],
  ["enum", enumShape],
  ["literal", literalShape],
  ["ref", refShape],
  ["uuid", uuidShape],
  ["ip-address", ipShape],
  ["decimal", decimalShape],
  ["instant", instantShape],
  ["date", dateShape],
  ["time-of-day", timeOfDayShape],
  ["local-date-time", localShape],
  ["duration", durationShape],
  ["offset", offsetShape],
  ["zone", zoneShape],
  ["zoned-date-time", zonedShape],
  ["wall-time", wallShape],
]);

/**
 * Returns the generator of a shape file. A ref to a name that the file does
 * not define decodes the value of the generator that externals states for
 * the name. Such a generator counts no node of the budget, and the read
 * follows no ref inside it.
 *
 * @param document - The shape file, as its JSON parses.
 * @param externals - The generators of names that the file does not define.
 * @returns The generator.
 * @throws ShapeError for a shape that the vocabulary does not have, a key
 *   that a shape does not take, a parameter that it cannot read, a ref to a
 *   name that neither the file nor externals states, and a definition with
 *   no finite value.
 */
export function read(
  document: unknown,
  externals: ReadonlyMap<string, Generator<unknown>> = new Map(),
): Generator<unknown> {
  if (!isNode(document)) {
    throw new ShapeError(`prop: ${shown(document)} is not a shape`);
  }
  return new Reader(document, externals, BUILDERS).root();
}
