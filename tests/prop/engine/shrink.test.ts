// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the shrinker: the smallest case of each failure. Each shrunk
 * case and each count of runs is the result of the definition's reference
 * implementation on the same body and choices.
 */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { MAX_CHOICES } from "../../../src/prop/engine/case.js";
import {
  type Choice,
  FloatBounds,
  IntegerBounds,
  SequenceBounds,
} from "../../../src/prop/engine/choice.js";
import { Sizes } from "../../../src/prop/engine/collection.js";
import type { Body, Execution } from "../../../src/prop/engine/execution.js";
import {
  Bytes,
  Float,
  Integer,
  Just,
  List,
  Recursive,
} from "../../../src/prop/engine/generator.js";
import { replaced } from "../../../src/prop/engine/shrink/nodes.js";
import {
  DEFAULT_BUDGET,
  Exhausted,
  Shrinker,
} from "../../../src/prop/engine/shrink.js";
import { canonical } from "../../../src/prop/engine/value.js";
import { drive } from "../../../src/prop/engine/work.js";
import { test as it } from "../../../src/vitest.js";
import { body, executed, integers, shrinkerOf } from "../../helpers.js";

const DIGIT = new Integer(new IntegerBounds(0n, 9n));
const WIDE = new Integer(new IntegerBounds(0n, 1_000_000_000n));
const SMALL = new Integer(new IntegerBounds(0n, 1000n));
const PERCENT = new List(new Integer(new IntegerBounds(0n, 100n)), new Sizes());
const UNIT = new Float(new FloatBounds(0, 10));
const SIGNED = new Integer(new IntegerBounds(-100n, 100n));
const SIGNED_LIST = new List(SIGNED, new Sizes());
const NESTED = new List(new List(DIGIT, new Sizes()), new Sizes());
const POSITIVE = new Integer(new IntegerBounds(1n, 1000n));
const SIGNED_FLOAT = new Float(new FloatBounds(-10, 10));
const BYTES = new Bytes(new SequenceBounds(256));
const PAIR_BYTES = new Bytes(new SequenceBounds(256, 2));
const JUST = new Just(7n);
const TREE = new Recursive<unknown>(
  DIGIT,
  100,
  (self) => new List(self, new Sizes(0, 3)),
);
const WIDE32 = new Float(new FloatBounds(0, 2 ** 25, false, 32));
const ANY_FLOAT = new Float(
  new FloatBounds(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
);
const NARROW = new Float(new FloatBounds(2.6, 2.9));

/** The trees that the body of the run of siblings fails for: [[9, 5]], [9, 5] and [9]. */
const EXACT = new Set([canonical([[9n, 5n]]), canonical([9n, 5n]), canonical([9n])]);

/** Returns a shrinker that starts from the failing case of choices, after its shrink. */
async function shrunk(
  of: Body,
  choices: readonly Choice[],
  budget = DEFAULT_BUDGET,
): Promise<Shrinker> {
  const shrinker = new Shrinker(of, await executed(of, choices), MAX_CHOICES, budget);
  await drive(shrinker.shrinkAll());
  return shrinker;
}

/** Returns the values that an execution's case drew. */
function drawn(execution: Execution): unknown[] {
  return execution.case.draws.map((one) => one.value);
}

/** Reports whether a nested list contains wanted anywhere. */
function contains(value: unknown, wanted: bigint): boolean {
  return Array.isArray(value)
    ? value.some((item) => contains(item, wanted))
    : value === wanted;
}

/** The sum of a list of bigints. */
function sum(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

const above = body((c) => {
  if (c.draw(WIDE, "n") > 1000n) {
    c.fail("above");
  }
});

describe("shrink", () => {
  describe("DEFAULT_BUDGET", () => {
    it("allows 2000 runs", ({ seat }) => {
      check.isEqualTo(seat, DEFAULT_BUDGET, 2000, "the budget");
    });
  });

  describe("new Exhausted", () => {
    it("returns the signal of a spent budget", ({ seat }) => {
      const signal = new Exhausted();

      check.isEqualTo(
        seat,
        [signal.name, signal.message],
        ["Exhausted", "prop: the shrink budget is spent"],
        "the name and the message",
      );
    });
  });

  describe("Shrinker.run", () => {
    it("passes each run of the budget to the observer", async ({ seat }) => {
      const phases: string[] = [];
      const shrinker = new Shrinker(
        above,
        await executed(above, integers(2000n)),
        MAX_CHOICES,
        1,
        (phase) => phases.push(phase),
      );
      const execution = await drive(shrinker.run(integers(5n), "explain"));

      check.isEqualTo(
        seat,
        [execution.status, shrinker.runs, phases],
        ["passed", 1, ["explain"]],
        "one run",
      );
    });

    it("throws Exhausted once the budget is spent", async ({ seat }) => {
      const shrinker = new Shrinker(
        above,
        await executed(above, integers(2000n)),
        MAX_CHOICES,
        0,
      );

      check.errorIs(
        seat,
        check.doesThrow(
          seat,
          () => shrinker.run(integers(5n)).next(),
          "no run is left",
        ),
        Exhausted,
        "the budget is spent",
      );
    });

    it("throws Exhausted once the time is spent", async ({ seat }) => {
      const shrinker = new Shrinker(
        above,
        await executed(above, integers(2000n)),
        MAX_CHOICES,
        10,
        undefined,
        Number.MIN_VALUE,
      );
      const start = performance.now();
      while (performance.now() === start) {
        // The platform clock moves on before the run.
      }

      check.errorIs(
        seat,
        check.doesThrow(
          seat,
          () => shrinker.run(integers(5n)).next(),
          "the time is spent",
        ),
        Exhausted,
        "the deadline is past",
      );
    });
  });

  describe("Shrinker.sizeOf", () => {
    it("returns the number of choices that a run of the choices recorded", async ({
      seat,
    }) => {
      const shrinker = await shrinkerOf(above, integers(2000n));

      check.isEqualTo(
        seat,
        [shrinker.sizeOf(integers(2000n)), shrinker.sizeOf(integers(5n))],
        [1, undefined],
        "the first case, and choices that no run had",
      );
    });
  });

  describe("Shrinker.consider", () => {
    it("makes a smaller candidate that fails the same way the best case", async ({
      seat,
    }) => {
      const shrinker = await shrinkerOf(above, integers(2000n));
      const accepted = await drive(
        shrinker.consider(replaced(shrinker.nodes, 0, 1500n)),
      );

      check.isEqualTo(
        seat,
        [accepted, drawn(shrinker.best.execution), shrinker.runs],
        [true, [1500n], 1],
        "1500 after one run",
      );
    });

    it("refuses a candidate that passes", async ({ seat }) => {
      const shrinker = await shrinkerOf(above, integers(2000n));

      check.isEqualTo(
        seat,
        [
          await drive(shrinker.consider(replaced(shrinker.nodes, 0, 5n))),
          shrinker.runs,
        ],
        [false, 1],
        "one run",
      );
    });

    it("refuses a candidate that is no smaller without a run", async ({ seat }) => {
      const shrinker = await shrinkerOf(above, integers(2000n));

      check.isEqualTo(
        seat,
        [
          await drive(shrinker.consider(replaced(shrinker.nodes, 0, 3000n))),
          shrinker.runs,
        ],
        [false, 0],
        "no run",
      );
    });
  });

  describe("Shrinker.sweep", () => {
    it("tries the candidates of each new best case until none is accepted", async ({
      seat,
    }) => {
      const shrinker = await shrinkerOf(above, integers(2000n));
      const accepted = await drive(
        shrinker.sweep(function* () {
          const value = shrinker.nodes[0]?.choice.value as bigint;
          yield replaced(shrinker.nodes, 0, value - 300n);
        }),
      );

      check.isEqualTo(
        seat,
        [accepted, drawn(shrinker.best.execution)],
        [true, [1100n]],
        "steps of 300 down to 1100",
      );
    });

    it("reports false when no candidate is accepted", async ({ seat }) => {
      const shrinker = await shrinkerOf(above, integers(2000n));

      check.isFalse(seat, await drive(shrinker.sweep(() => [])), "no candidate");
    });
  });

  describe("Shrinker.shrinkAll", () => {
    const tests: { name: string; give: [Body, Choice[]]; want: [unknown[], number] }[] =
      [
        {
          name: "an integer to the boundary by bisection",
          give: [above, integers(2000n)],
          want: [[1001n], 21],
        },
        {
          name: "a list to its first element when only that element matters",
          give: [
            body((c) => {
              const values = c.draw(PERCENT, "xs");
              if ((values[0] ?? 0n) > 10n) {
                c.fail("first");
              }
            }),
            integers(1n, 50n, ...Array.from({ length: 7 }, () => [1n, 3n]).flat(), 0n),
          ],
          want: [[[11n]], 21],
        },
        {
          name: "a list to the smallest sum of 10",
          give: [
            body((c) => {
              if (sum(c.draw(PERCENT, "xs")) >= 10n) {
                c.fail("ten");
              }
            }),
            integers(1n, 9n, 1n, 1n, 1n, 2n, 1n, 9n, 0n),
          ],
          want: [[[10n]], 38],
        },
        {
          name: "a list to the one element that fails",
          give: [
            body((c) => {
              if (c.draw(PERCENT, "xs").includes(50n)) {
                c.fail("fifty");
              }
            }),
            integers(1n, 3n, 1n, 50n, 0n),
          ],
          want: [[[50n]], 18],
        },
        {
          name: "a tree to the subtree that contains a 9",
          give: [
            body((c) => {
              if (contains(c.draw(TREE, "tree"), 9n)) {
                c.fail("nine");
              }
            }),
            integers(1n, 1n, 0n, 9n, 0n),
          ],
          want: [[9n], 12],
        },
        {
          name: "an integer across its target to a nearer value",
          give: [
            body((c) => {
              const value = c.draw(SIGNED, "x");
              if ((value >= 2n || value <= -2n) && value !== 2n) {
                c.fail("far");
              }
            }),
            integers(3n),
          ],
          want: [[-2n], 5],
        },
        {
          name: "a list that is not its reverse to [0, 1]",
          give: [
            body((c) => {
              const values = c.draw(SIGNED_LIST, "xs");
              if (values.some((value, i) => value !== values.at(-1 - i))) {
                c.fail("reverse");
              }
            }),
            integers(1n, 0n, 1n, -1n, 0n),
          ],
          want: [[[0n, 1n]], 24],
        },
        {
          name: "two lists to one list of two values",
          give: [
            body((c) => {
              if (new Set(c.draw(NESTED, "xss").flat()).size >= 2) {
                c.fail("mixed");
              }
            }),
            integers(1n, 1n, 1n, 0n, 1n, 1n, 2n, 0n, 0n),
          ],
          want: [[[[0n, 1n]]], 36],
        },
        {
          name: "two integers one apart to the smallest pair",
          give: [
            body((c) => {
              const x = c.draw(POSITIVE, "x");
              const y = c.draw(POSITIVE, "y");
              if (x >= 10n && (x - y === 1n || y - x === 1n)) {
                c.fail("one");
              }
            }),
            integers(36n, 37n),
          ],
          want: [[10n, 9n], 56],
        },
        {
          name: "nothing for values on both sides of the target",
          give: [
            body((c) => {
              const x = c.draw(SIGNED, "x");
              if (c.draw(SIGNED, "y") - x >= 7n) {
                c.fail("spread");
              }
            }),
            integers(-3n, 4n),
          ],
          want: [[-3n, 4n], 14],
        },
        {
          name: "an unrelated float to its target",
          give: [
            body((c) => {
              c.draw(UNIT, "v");
              if (c.draw(WIDE, "n") > 1000n) {
                c.fail("above");
              }
            }),
            [
              { kind: "float", value: 3.75 },
              { kind: "integer", value: 2000n },
            ],
          ],
          want: [[0, 1001n], 27],
        },
        {
          name: "a byte string to its one high byte",
          give: [
            body((c) => {
              if (c.draw(BYTES, "b").some((byte) => byte > 200)) {
                c.fail("high");
              }
            }),
            [{ kind: "sequence", value: [1, 250, 3, 4] }],
          ],
          want: [[Uint8Array.of(201)], 20],
        },
        {
          name: "a count with its items",
          give: [
            body((c) => {
              const count = c.draw(DIGIT, "count");
              const items = Array.from({ length: Number(count) }, () =>
                c.draw(DIGIT, "item"),
              );
              if (count >= 2n && items.at(-1) === 9n) {
                c.fail("nine");
              }
            }),
            integers(3n, 0n, 0n, 9n),
          ],
          want: [[2n, 0n, 9n], 32],
        },
        {
          name: "a count with the list that it sizes",
          give: [
            body((c) => {
              const count = Number(c.draw(DIGIT, "count"));
              if (c.draw(new List(DIGIT, new Sizes(count, count)), "xs").includes(9n)) {
                c.fail("nine");
              }
            }),
            integers(3n, 1n, 0n, 1n, 0n, 1n, 9n, 0n),
          ],
          want: [[1n, [9n]], 41],
        },
        {
          name: "an index into an earlier list",
          give: [
            body((c) => {
              const values = c.draw(PERCENT, "xs");
              const index = Number(c.draw(DIGIT, "i"));
              if ((values[index] ?? 0n) > 50n) {
                c.fail("indexed");
              }
            }),
            integers(1n, 0n, 1n, 60n, 0n, 1n),
          ],
          want: [[[51n], 0n], 62],
        },
        {
          name: "an index into earlier bytes",
          give: [
            body((c) => {
              const value = c.draw(BYTES, "b");
              const index = Number(c.draw(DIGIT, "i"));
              if ((value[index] ?? 0) > 200) {
                c.fail("high");
              }
            }),
            [
              { kind: "sequence", value: [1, 250] },
              { kind: "integer", value: 1n },
            ],
          ],
          want: [[Uint8Array.of(201), 0n], 40],
        },
        {
          name: "an index into earlier bytes of at least two",
          give: [
            body((c) => {
              const value = c.draw(PAIR_BYTES, "b");
              const index = Number(c.draw(DIGIT, "i"));
              if ((value[index] ?? 0) > 200) {
                c.fail("high");
              }
            }),
            [
              { kind: "sequence", value: [1, 250] },
              { kind: "integer", value: 1n },
            ],
          ],
          want: [[Uint8Array.of(0, 201), 1n], 23],
        },
        {
          name: "an integer after a just",
          give: [
            body((c) => {
              c.draw(JUST, "j");
              if (c.draw(SMALL, "n") > 50n) {
                c.fail("above");
              }
            }),
            integers(60n),
          ],
          want: [[7n, 51n], 13],
        },
        {
          name: "the elements of a multiset in sorted order",
          give: [
            body((c) => {
              const values = c.draw(PERCENT, "xs");
              if (values.includes(3n) && values.includes(5n)) {
                c.fail("both");
              }
            }),
            integers(1n, 5n, 1n, 3n, 0n),
          ],
          want: [[[3n, 5n]], 47],
        },
        {
          name: "a sum of two integers onto the second",
          give: [
            body((c) => {
              if (c.draw(SMALL, "x") + c.draw(SMALL, "y") > 500n) {
                c.fail("sum");
              }
            }),
            integers(300n, 300n),
          ],
          want: [[0n, 501n], 37],
        },
        {
          name: "two equal integers together",
          give: [
            body((c) => {
              const x = c.draw(SMALL, "x");
              if (x === c.draw(SMALL, "y") && x > 0n) {
                c.fail("equal");
              }
            }),
            integers(400n, 400n),
          ],
          want: [[1n, 1n], 55],
        },
        {
          name: "two equal integers together beside an unrelated one",
          give: [
            body((c) => {
              const x = c.draw(SMALL, "x");
              const y = c.draw(SMALL, "y");
              c.draw(SMALL, "z");
              if (x === y && x > 0n) {
                c.fail("equal");
              }
            }),
            integers(400n, 400n, 7n),
          ],
          want: [[1n, 1n, 0n], 70],
        },
        {
          name: "a fraction to fewer fractional bits",
          give: [
            body((c) => {
              const value = c.draw(UNIT, "v");
              if (value > 2.5 && !Number.isInteger(value)) {
                c.fail("fraction");
              }
            }),
            [{ kind: "float", value: 2.875 }],
          ],
          want: [[2.75], 6],
        },
        {
          name: "a fraction away from its target to an integer",
          give: [
            body((c) => {
              if (c.draw(UNIT, "v") > 2.5) {
                c.fail("bigger");
              }
            }),
            [{ kind: "float", value: 2.875 }],
          ],
          want: [[3], 5],
        },
        {
          name: "an integral float as an integer",
          give: [
            body((c) => {
              if (c.draw(UNIT, "v") > 2.5) {
                c.fail("bigger");
              }
            }),
            [{ kind: "float", value: 9 }],
          ],
          want: [[3], 6],
        },
        {
          name: "a negative integral float above zero",
          give: [
            body((c) => {
              if (Math.abs(c.draw(SIGNED_FLOAT, "v")) >= 3) {
                c.fail("large");
              }
            }),
            [{ kind: "float", value: -9 }],
          ],
          want: [[3], 8],
        },
        {
          name: "a float of width 32 past the integers that the width cannot state",
          give: [
            body((c) => {
              if (c.draw(WIDE32, "v") >= 2 ** 24 + 2) {
                c.fail("big");
              }
            }),
            [{ kind: "float", value: 2 ** 25 }],
          ],
          want: [[2 ** 24 + 2], 49],
        },
        {
          name: "nothing for two equal floats that must remain equal",
          give: [
            body((c) => {
              const x = c.draw(UNIT, "x");
              if (x === c.draw(UNIT, "y") && x > 1) {
                c.fail("same");
              }
            }),
            [
              { kind: "float", value: 5.5 },
              { kind: "float", value: 5.5 },
            ],
          ],
          want: [[5.5, 5.5], 9],
        },
        {
          name: "nothing for two equal byte strings that must remain equal",
          give: [
            body((c) => {
              const x = c.draw(BYTES, "x");
              const y = c.draw(BYTES, "y");
              if (
                x.length > 0 &&
                x.length === y.length &&
                x.every((byte, i) => byte === y[i])
              ) {
                c.fail("same");
              }
            }),
            [
              { kind: "sequence", value: [7, 9] },
              { kind: "sequence", value: [7, 9] },
            ],
          ],
          want: [[Uint8Array.of(7, 9), Uint8Array.of(7, 9)], 27],
        },
      ];
    for (const tt of tests) {
      it(`shrinks ${tt.name}`, async ({ seat }) => {
        const shrinker = await shrunk(...tt.give);

        check.isEqualTo(
          seat,
          [drawn(shrinker.best.execution), shrinker.runs],
          tt.want,
          "the smallest case and the runs it took",
        );
      });
    }

    const more: { name: string; give: [Body, Choice[]]; want: [unknown[], number] }[] =
      [
        {
          name: "nothing for an infinite float",
          give: [
            body((c) => {
              if (c.draw(ANY_FLOAT, "v") === Number.POSITIVE_INFINITY) {
                c.fail("infinite");
              }
            }),
            [{ kind: "float", value: Number.POSITIVE_INFINITY }],
          ],
          want: [[Number.POSITIVE_INFINITY], 2],
        },
        {
          name: "a negative fraction to fewer fractional bits",
          give: [
            body((c) => {
              const value = c.draw(SIGNED_FLOAT, "v");
              if (value < -2.5 && !Number.isInteger(value)) {
                c.fail("fraction");
              }
            }),
            [{ kind: "float", value: -2.875 }],
          ],
          want: [[-2.75], 6],
        },
        {
          name: "nothing for a fraction whose roundings leave its bounds",
          give: [
            body((c) => {
              if (c.draw(NARROW, "v") > 2.8) {
                c.fail("narrow");
              }
            }),
            [{ kind: "float", value: 2.875 }],
          ],
          want: [[2.875], 2],
        },
        {
          name: "an integer after two empty spans",
          give: [
            body((c) => {
              c.draw(JUST, "j");
              c.draw(JUST, "k");
              if (c.draw(SMALL, "n") > 50n) {
                c.fail("above");
              }
            }),
            integers(60n),
          ],
          want: [[7n, 7n, 51n], 13],
        },
        {
          name: "two negative integers one apart towards their target together",
          give: [
            body((c) => {
              const x = c.draw(SIGNED, "x");
              const y = c.draw(SIGNED, "y");
              if (x <= -10n && (x - y === 1n || y - x === 1n)) {
                c.fail("one");
              }
            }),
            integers(-36n, -37n),
          ],
          want: [[-10n, -11n], 54],
        },
        {
          name: "a tree to its one leaf of 9 by deleting a run of siblings",
          give: [
            body((c) => {
              if (EXACT.has(canonical(c.draw(TREE, "tree")))) {
                c.fail("exact");
              }
            }),
            integers(1n, 1n, 1n, 1n, 0n, 9n, 1n, 0n, 5n, 0n, 0n),
          ],
          want: [[[9n]], 41],
        },
        {
          name: "an integer after an empty byte string",
          give: [
            body((c) => {
              c.draw(BYTES, "b");
              if (c.draw(WIDE, "n") > 1000n) {
                c.fail("above");
              }
            }),
            [
              { kind: "sequence", value: [] },
              { kind: "integer", value: 2000n },
            ],
          ],
          want: [[new Uint8Array(0), 1001n], 25],
        },
        {
          name: "a sum of two integers onto the second up to its cap",
          give: [
            body((c) => {
              const x = c.draw(SMALL, "x");
              const y = c.draw(SMALL, "y");
              if (x + y > 500n && y <= 400n) {
                c.fail("sum");
              }
            }),
            integers(300n, 300n),
          ],
          want: [[101n, 400n], 53],
        },
      ];
    for (const tt of more) {
      it(`shrinks ${tt.name}`, async ({ seat }) => {
        const shrinker = await shrunk(...tt.give);

        check.isEqualTo(
          seat,
          [drawn(shrinker.best.execution), shrinker.runs],
          tt.want,
          "the smallest case and the runs it took",
        );
      });
    }

    it("shrinks the choices of a body that draws through the random source alone", async ({
      seat,
    }) => {
      const shrinker = await shrunk(
        body((c) => {
          if (c.random() > 1000n) {
            c.fail("above");
          }
        }),
        integers(5000n),
      );

      check.isEqualTo(
        seat,
        [shrinker.best.execution.case.choices, shrinker.runs],
        [integers(1001n), 22],
        "1001 in 22 runs",
      );
    });

    it("shrinks the failure with the smallest case first among those that a shrink found", async ({
      seat,
    }) => {
      const three = body((c) => {
        const x = c.draw(SMALL, "x");
        const y = c.draw(SMALL, "y");
        if (y === 0n && x >= 100n) {
          c.fail("p");
        }
        if (x === 75n) {
          c.fail("q");
        }
        if (x >= 100n && y >= 100n) {
          c.fail("a");
        }
      });
      const shrinker = await shrunk(three, integers(150n, 150n));

      check.isEqualTo(
        seat,
        [
          [...shrinker.failures].map(([identity, failure]) => [
            identity,
            drawn(failure.execution),
          ]),
          shrinker.runs,
        ],
        [
          [
            ["a", [100n, 100n]],
            ["p", [100n, 0n]],
            ["q", [75n, 0n]],
          ],
          76,
        ],
        "three identities, each shrunk",
      );
    });

    it("shrinks the first found failure first when its case is the smallest", async ({
      seat,
    }) => {
      const spots = body((c) => {
        const x = c.draw(SMALL, "x");
        const y = c.draw(SMALL, "y");
        if (x > 800n && y > 300n) {
          c.fail("big");
        }
        if (x === 0n && y >= 1n) {
          c.fail("zero");
        }
        if (x === 450n) {
          c.fail("half");
        }
      });
      const shrinker = await shrunk(spots, integers(900n, 500n), 68);

      check.isEqualTo(
        seat,
        [...shrinker.failures].map(([identity, failure]) => [
          identity,
          drawn(failure.execution),
        ]),
        [
          ["big", [801n, 301n]],
          ["zero", [0n, 1n]],
          ["half", [450n, 500n]],
        ],
        "the budget ends before the shrink of half",
      );
    });

    it("keeps a failure of another identity that a candidate finds", async ({
      seat,
    }) => {
      const two = body((c) => {
        const value = c.draw(SMALL, "x");
        if (value % 2n === 1n) {
          c.fail("odd");
        }
        if (value > 50n) {
          c.fail("big");
        }
      });
      const shrinker = await shrunk(two, integers(78n));

      check.isEqualTo(
        seat,
        [
          [...shrinker.failures.keys()],
          drawn(shrinker.failures.get("big")?.execution as Execution),
          drawn(shrinker.failures.get("odd")?.execution as Execution),
        ],
        [["big", "odd"], [52n], [1n]],
        "both identities shrunk",
      );
    });

    it("stops at a spent budget with the smallest case found", async ({ seat }) => {
      const shrinker = await shrunk(above, integers(2000n), 10);

      check.isEqualTo(
        seat,
        [shrinker.runs, (drawn(shrinker.best.execution)[0] as bigint) > 1001n],
        [10, true],
        "ten runs and a case above the minimum",
      );
    });

    it("throws an error of the body that is no signal", async ({ seat }) => {
      let calls = 0;
      const breaking = body((c) => {
        calls += 1;
        if (calls > 1) {
          throw new TypeError("the body broke");
        }
        c.draw(WIDE, "n");
        c.fail("first");
      });
      const shrinker = new Shrinker(
        breaking,
        await executed(breaking, integers(5n)),
        MAX_CHOICES,
        10,
      );

      check.errorIs(
        seat,
        await check.rejectsWith(
          seat,
          () => drive(shrinker.shrinkAll()),
          "the body throws",
        ),
        TypeError,
        "the body's error",
      );
    });
  });
});
