// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the search for the first cycle of each kind among the dependencies of a history. */

import { describe } from "vitest";
import type { Edge } from "../../src/history/anomaly.js";
import type { Relation } from "../../src/history/cycle.js";
import { Dependencies } from "../../src/history/dependencies.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

/** Returns the evidence of a dependency of to on from, on the key x. */
function edge(from: number, to: number, relation: Relation): Edge {
  return {
    from,
    to,
    relation,
    key: "x",
    value: undefined,
    empty: false,
    next: undefined,
    register: false,
  };
}

/** Returns the dependencies of edges between committed transactions. */
function dependenciesOf(...edges: Edge[]): Dependencies {
  const evidence = new Map<string, Edge[]>();
  for (const one of edges) {
    const key = `${one.from} ${one.to}`;
    evidence.set(key, [...(evidence.get(key) ?? []), one]);
  }
  const committed = new Set(edges.flatMap((one) => [one.from, one.to]));
  return new Dependencies(evidence, committed);
}

describe("dependencies", () => {
  describe("Dependencies.instance", () => {
    it("returns a G0 cycle of two write-write dependencies", ({ seat }) => {
      const found = dependenciesOf(edge(0, 1, "ww"), edge(1, 0, "ww")).instance("G0");

      check.isEqualTo(
        seat,
        found?.cycle,
        [
          { call: 0, relations: ["ww"] },
          { call: 1, relations: ["ww"] },
        ],
        "a cycle of 0 and 1",
      );
    });

    it("returns a G2 cycle of two adjacent read-write dependencies, which no other kind of cycle is", ({
      seat,
    }) => {
      const skew = dependenciesOf(edge(0, 1, "rw"), edge(1, 0, "rw"));

      check.isEqualTo(
        seat,
        [
          skew.instance("G2")?.calls,
          skew.instance("G-single"),
          skew.instance("G-nonadjacent"),
        ],
        [[0, 1], undefined, undefined],
        "a write skew",
      );
    });

    it("returns a G-nonadjacent cycle of two read-write dependencies apart", ({
      seat,
    }) => {
      const found = dependenciesOf(
        edge(0, 1, "rw"),
        edge(1, 2, "wr"),
        edge(2, 3, "rw"),
        edge(3, 0, "wr"),
      ).instance("G-nonadjacent");

      check.isEqualTo(
        seat,
        found?.cycle,
        [
          { call: 0, relations: ["rw"] },
          { call: 1, relations: ["wr"] },
          { call: 2, relations: ["rw"] },
          { call: 3, relations: ["wr"] },
        ],
        "the alternating cycle",
      );
    });

    it("returns undefined for dependencies without a cycle", ({ seat }) => {
      check.isNil(
        seat,
        dependenciesOf(edge(0, 1, "ww"), edge(1, 2, "wr")).instance("G2"),
        "no cycle",
      );
    });
  });
});
