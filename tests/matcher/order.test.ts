/**
 * The spec of the assertion about how neighbouring items relate. It uses
 * vitest's `expect` alone, because the surfaces call this assertion.
 */

import { describe, expect, it } from "vitest";
import { pairwise } from "../../src/matcher/order.js";
import { Mode } from "../../src/matcher/seat.js";
import { Recorder } from "../../src/seat.js";

const ascending = (a: number, b: number) => a <= b;

describe("order", () => {
  describe("pairwise", () => {
    const tests: {
      name: string;
      give: number[];
      givePredicate: (a: number, b: number) => boolean;
      want?: Record<string, unknown>;
    }[] = [
      {
        name: "passes a sequence whose every neighbouring pair meets the predicate",
        give: [1, 2, 2, 3],
        givePredicate: ascending,
      },
      { name: "passes an empty sequence", give: [], givePredicate: ascending },
      { name: "passes a sequence of one item", give: [1], givePredicate: ascending },
      {
        name: "reports the index of the first pair that fails with its two items",
        give: [1, 3, 2],
        givePredicate: ascending,
        want: { index: 1, first: 3, second: 2 },
      },
      {
        name: "reports a repeated neighbour under a predicate of inequality",
        give: [1, 1],
        givePredicate: (a, b) => a !== b,
        want: { index: 0, first: 1, second: 1 },
      },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        const seat = new Recorder();
        pairwise(seat, Mode.Fatal, tt.give, tt.givePredicate, "the log is ordered");

        expect(seat.failures.map((f) => [f.assertion, f.detail])).toEqual(
          tt.want === undefined ? [] : [["pairwise", tt.want]],
        );
      });
    }
  });
});
