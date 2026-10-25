// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the generators of the structural shapes and of the budget of
 * a recursive value. The decoded values are those of the definition's
 * reference implementation.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { Replaying } from "../../../../src/prop/engine/case/providers.js";
import { Case, DECODE } from "../../../../src/prop/engine/case.js";
import { IntegerBounds, type Value } from "../../../../src/prop/engine/choice.js";
import { Sizes } from "../../../../src/prop/engine/collection.js";
import {
  Bool,
  type Generator,
  Integer,
  Just,
} from "../../../../src/prop/engine/generator.js";
import {
  Budget,
  EnumShape,
  ListShape,
  MapShape,
  OptionalShape,
  RecordShape,
  Ref,
  Root,
} from "../../../../src/prop/engine/shape/structure.js";
import {
  canonical,
  Fields,
  Pairs,
  Variant,
} from "../../../../src/prop/engine/value.js";
import { test as it } from "../../../../src/vitest.js";
import { decodeFrom } from "../../../helpers.js";

/** The nodes that one value of a recursive shape may use. */
const BUDGET = 100;

/** The generator of an unsigned 8-bit integer. */
const UINT8 = new Integer(new IntegerBounds(0n, 255n));

/** Counts every node of the budget of the value in progress. */
function spendAll(budget: Budget): void {
  for (let node = 0; node < BUDGET; node += 1) {
    budget.spend();
  }
}

/** Returns what generator decodes from values while the value in progress has used its budget. */
function decodedSpent<T>(
  budget: Budget,
  generator: Generator<T>,
  ...values: Value[]
): T {
  return budget.value(() => {
    spendAll(budget);
    return decodeFrom(generator, ...values)[0];
  });
}

describe("structure", () => {
  describe("Budget.value", () => {
    it("counts the nodes of a value from zero while it decodes", ({ seat }) => {
      const budget = new Budget();
      const inner = budget.value(() => {
        spendAll(budget);
        return budget.value(() => budget.exhausted);
      });

      check.isFalse(seat, inner, "the inner value has used no node");
    });
  });

  describe("Budget.spend", () => {
    it("counts one node of the value in progress", ({ seat }) => {
      const budget = new Budget();
      const exhausted = budget.value(() => {
        for (let node = 1; node < BUDGET; node += 1) {
          budget.spend();
        }
        const before = budget.exhausted;
        budget.spend();
        return [before, budget.exhausted];
      });

      check.isEqualTo(seat, exhausted, [false, true], "the 100th node uses the budget");
    });
  });

  describe("Budget.exhausted", () => {
    it("reports false outside a value", ({ seat }) => {
      check.isFalse(seat, new Budget().exhausted, "no value is in progress");
    });
  });

  describe("Root", () => {
    it("decodes the value of its node", ({ seat }) => {
      check.isEqualTo(
        seat,
        decodeFrom(new Root(UINT8, new Budget()), 4n)[0],
        4n,
        "the node's value",
      );
    });
  });

  describe("Ref", () => {
    it("decodes the value of the definition that it names", ({ seat }) => {
      const ref = new Ref("d", new Map([["d", UINT8]]), false, new Budget());

      check.isEqualTo(seat, decodeFrom(ref, 3n)[0], 3n, "the definition's value");
    });

    for (const [cyclic, want] of [
      [true, true],
      [false, false],
    ] as const) {
      it(`${cyclic ? "counts" : "does not count"} a node for each value of a ${cyclic ? "cyclic" : "acyclic"} definition`, ({
        seat,
      }) => {
        const budget = new Budget();
        const ref = new Ref("d", new Map([["d", new Just(1)]]), cyclic, budget);
        const c = new Case(new Replaying([]));
        const exhausted = budget.value(() => {
          for (let node = 0; node < BUDGET; node += 1) {
            ref[DECODE](c);
          }
          return budget.exhausted;
        });

        check.isEqualTo(seat, exhausted, want, "the budget after 100 values");
      });
    }
  });

  describe("OptionalShape", () => {
    it("decodes a present value from the flag 1 alone", ({ seat }) => {
      const optional = new OptionalShape(UINT8, false, new Budget());

      check.isEqualTo(
        seat,
        [decodeFrom(optional)[0], decodeFrom(optional, 1n, 5n)[0]],
        [undefined, 5n],
        "absent, then 5",
      );
    });

    it("is absent once the value has used its budget", ({ seat }) => {
      const budget = new Budget();

      check.isEqualTo(
        seat,
        decodedSpent(budget, new OptionalShape(UINT8, true, budget), 1n, 5n),
        undefined,
        "the exit",
      );
    });
  });

  describe("ListShape", () => {
    it("decodes an element after each continue flag", ({ seat }) => {
      const list = new ListShape(UINT8, new Sizes(), false, false, new Budget());

      check.isEqualTo(
        seat,
        decodeFrom(list, 1n, 3n, 1n, 4n, 0n)[0],
        [3n, 4n],
        "two elements",
      );
    });

    it("discards an element that repeats an earlier one of a set", ({ seat }) => {
      const set = new ListShape(UINT8, new Sizes(), true, false, new Budget());

      check.isEqualTo(
        seat,
        decodeFrom(set, 1n, 3n, 1n, 3n, 0n)[0],
        [3n],
        "one element",
      );
    });

    it("is empty once the value has used its budget", ({ seat }) => {
      const budget = new Budget();

      check.isEqualTo(
        seat,
        decodedSpent(
          budget,
          new ListShape(UINT8, new Sizes(), false, true, budget),
          1n,
          3n,
        ),
        [],
        "the exit",
      );
    });
  });

  describe("MapShape", () => {
    it("decodes an entry after each continue flag", ({ seat }) => {
      const map = new MapShape(UINT8, UINT8, new Sizes(), false, new Budget());

      check.isEqualTo(
        seat,
        canonical(decodeFrom(map, 1n, 1n, 2n, 0n)[0]),
        canonical(new Pairs([[1n, 2n]])),
        "one entry",
      );
    });

    it("is empty once the value has used its budget", ({ seat }) => {
      const budget = new Budget();
      const map = new MapShape(UINT8, UINT8, new Sizes(), true, budget);

      check.isEqualTo(
        seat,
        canonical(decodedSpent(budget, map, 1n, 1n, 2n)),
        canonical(new Pairs([])),
        "the exit",
      );
    });
  });

  describe("RecordShape", () => {
    it("decodes its fields in order", ({ seat }) => {
      const record = new RecordShape([
        ["id", UINT8],
        ["ok", new Bool({ num: 1n, den: 2n })],
      ]);

      check.isEqualTo(
        seat,
        canonical(decodeFrom(record, 4n, 1n)[0]),
        canonical(
          new Fields([
            ["id", 4n],
            ["ok", true],
          ]),
        ),
        "an id and a flag",
      );
    });
  });

  describe("EnumShape", () => {
    it("decodes the payload of the variant that an index chooses", ({ seat }) => {
      const optional = new EnumShape(
        [
          ["none", undefined],
          ["some", UINT8],
        ],
        undefined,
        new Budget(),
      );
      const [bare] = decodeFrom(optional);

      check.isEqualTo(
        seat,
        [bare.name, bare.hasPayload, canonical(decodeFrom(optional, 1n, 9n)[0])],
        ["none", false, canonical(new Variant("some", 9n))],
        "a bare variant and a payload",
      );
    });

    it("takes its exit once the value has used its budget", ({ seat }) => {
      const budget = new Budget();
      const node = new EnumShape(
        [
          ["branch", UINT8],
          ["leaf", undefined],
        ],
        1,
        budget,
      );

      check.isEqualTo(
        seat,
        decodedSpent(budget, node, 0n, 7n).name,
        "leaf",
        "the variant that does not refer back",
      );
    });
  });
});
