/** The spec of the searches of the dependency graph of committed transactions. */

import { describe } from "vitest";
import {
  alternates,
  components,
  type Graph,
  path,
  RELATIONS,
  simple,
  type Walk,
} from "../../src/history/cycle.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

/** Returns the graph of edges, with the targets of each transaction in ascending order. */
function graph(...edges: [number, number][]): Graph {
  const out = new Map<number, number[]>();
  for (const [a, b] of edges)
    out.set(
      a,
      [...(out.get(a) ?? []), b].sort((x, y) => x - y),
    );
  return out;
}

describe("cycle", () => {
  describe("RELATIONS", () => {
    it("orders the relations as a cycle's entry lists them", ({ seat }) => {
      check.equal(seat, RELATIONS, ["ww", "wr", "rw"], "ww, wr, rw");
    });
  });

  describe("components", () => {
    it("returns the components of two or more transactions in the order of their lowest", ({
      seat,
    }) => {
      const g = graph([4, 6], [6, 4], [0, 2], [2, 0], [2, 3], [3, 8]);

      check.equal(
        seat,
        components([6, 4, 3, 2, 0, 8], g),
        [
          [0, 2],
          [4, 6],
        ],
        "two components without the transactions of no cycle",
      );
    });

    it("returns one component of a cycle through three transactions", ({ seat }) => {
      check.equal(
        seat,
        components([0, 1, 2], graph([0, 1], [1, 2], [2, 0])),
        [[0, 1, 2]],
        "one component",
      );
    });

    it("returns no component of a graph without a cycle", ({ seat }) => {
      check.isEmpty(seat, components([0, 1], graph([0, 1])), "no component");
    });
  });

  describe("path", () => {
    it("returns the shortest path that comes first in the order of the targets", ({
      seat,
    }) => {
      const g = graph([0, 2], [0, 1], [1, 3], [2, 3], [3, 4]);

      check.equal(
        seat,
        path(0, 4, g, new Set([0, 1, 2, 3, 4])),
        [0, 1, 3, 4],
        "through 1",
      );
    });

    it("returns a path within the members alone", ({ seat }) => {
      const g = graph([0, 1], [0, 2], [1, 3], [2, 3]);

      check.equal(seat, path(0, 3, g, new Set([0, 2, 3])), [0, 2, 3], "through 2");
    });

    it("returns undefined for a goal without a path from the start", ({ seat }) => {
      check.isNil(seat, path(1, 0, graph([0, 1]), new Set([0, 1])), "no path");
    });

    it("returns the start alone for a start that is the goal", ({ seat }) => {
      check.equal(seat, path(2, 2, graph(), new Set([2])), [2], "no edge");
    });
  });

  describe("alternates", () => {
    const tests: { name: string; give: Walk; want: boolean }[] = [
      {
        name: "a walk whose rw edges are apart",
        give: [
          [0, "rw"],
          [1, "wr"],
          [2, "rw"],
          [3, "ww"],
        ],
        want: true,
      },
      {
        name: "a walk with two adjacent rw edges",
        give: [
          [0, "rw"],
          [1, "rw"],
          [2, "wr"],
        ],
        want: false,
      },
      {
        name: "a walk whose last rw edge is adjacent to its first",
        give: [
          [0, "rw"],
          [1, "wr"],
          [2, "rw"],
        ],
        want: false,
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.want} for ${tt.name}`, ({ seat }) => {
        check.equal(seat, alternates(tt.give), tt.want, "whether it alternates");
      });
    }
  });

  describe("simple", () => {
    it("starts a cycle at its first rw edge", ({ seat }) => {
      check.equal(
        seat,
        simple([
          [0, "wr"],
          [1, "rw"],
          [2, "ww"],
        ]),
        [
          [1, "rw"],
          [2, "ww"],
          [0, "wr"],
        ],
        "from 1",
      );
    });

    it("keeps a cycle without an rw edge as it starts", ({ seat }) => {
      const walk: Walk = [
        [0, "ww"],
        [1, "wr"],
      ];

      check.equal(seat, simple(walk), walk, "from 0");
    });

    it("keeps the part between two visits of a transaction that alternates", ({
      seat,
    }) => {
      check.equal(
        seat,
        simple([
          [0, "rw"],
          [2, "ww"],
          [4, "rw"],
          [6, "wr"],
          [4, "wr"],
        ]),
        [
          [4, "rw"],
          [6, "wr"],
        ],
        "the loop through 4 and 6",
      );
    });

    it("keeps the rest of a walk whose loop has two adjacent rw edges", ({ seat }) => {
      check.equal(
        seat,
        simple([
          [0, "rw"],
          [2, "ww"],
          [4, "rw"],
          [6, "rw"],
          [4, "wr"],
        ]),
        [
          [0, "rw"],
          [2, "ww"],
          [4, "wr"],
        ],
        "0, 2 and 4",
      );
    });
  });
});
