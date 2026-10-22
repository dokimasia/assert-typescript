// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The zone list and every offset change of its zones, as the definition's
 * zone table states them.
 *
 * The zone shapes sample the list, and the zoned-date-time and wall-time
 * shapes generate a value near one of a zone's changes in one case of four.
 * The list's order is the definition's: UTC first, so a zone shrinks to UTC.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { directoryOf } from "../../failure.js";

/** The zone table of the vendored definition, which the build copies beside this module's directory. */
const table = JSON.parse(
  readFileSync(join(directoryOf(), "../../conformance/spec/zones.json"), "utf8"),
) as {
  readonly zones: readonly { name: string; changes: [number, number, number][] }[];
};

/** One offset change: its first second, and the offsets before and after it, in seconds east of UTC. */
export interface Change {
  /** The change's first second, in seconds since 1970-01-01T00:00:00Z. */
  readonly at: bigint;
  /** The offset before the change. */
  readonly before: bigint;
  /** The offset from the change on. */
  readonly after: bigint;
}

/** A zone of the list, and its offset changes in time order. */
export interface Zone {
  /** The zone's name in the IANA time-zone database. */
  readonly name: string;
  /** The zone's offset changes, in time order. */
  readonly changes: readonly Change[];
}

/** The zone list, in the definition's order. */
export const ZONES: readonly Zone[] = table.zones.map((zone) => ({
  name: zone.name,
  changes: zone.changes.map(([at, before, after]) => ({
    at: BigInt(at as number),
    before: BigInt(before as number),
    after: BigInt(after as number),
  })),
}));
