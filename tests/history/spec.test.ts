/**
 * The spec of the sequential specifications that a check reads: the call
 * as a spec sees it, the default comparison and key of states, and the spec
 * of a subject, whose steps are those of the definition's reference
 * implementation.
 */

import { describe } from "vitest";
import {
  CallOperation,
  COST,
  type Costed,
  type Operation,
  sameState,
  specFrom,
  stateKey,
} from "../../src/history/spec.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

/** A class whose instances the library's equality compares by their fields. */
class Point {
  readonly x: number;

  constructor(x: number) {
    this.x = x;
  }
}

/** Returns a known call of operation with args and output. */
function known(name: string, args: readonly unknown[], output: unknown): Operation {
  return new CallOperation(name, args, true, output);
}

/** Returns a call of operation with args whose outcome is unknown. */
function unknown(name: string, args: readonly unknown[]): Operation {
  return new CallOperation(name, args, false);
}

/** The builds of the counter subject and the calls applied to them. */
interface Counted {
  built: number;
  applied: number;
}

/** Returns a factory of counters, whose add(n) adds n and outputs the new total, and the counts of its use. */
function counters(): [
  () => (op: string, args: readonly unknown[]) => unknown,
  Counted,
] {
  const counted: Counted = { built: 0, applied: 0 };
  const factory = () => {
    counted.built += 1;
    let total = 0;
    return (_op: string, args: readonly unknown[]) => {
      counted.applied += 1;
      total += args[0] as number;
      return total;
    };
  };
  return [factory, counted];
}

describe("spec", () => {
  describe("new CallOperation", () => {
    it("returns the operation of a call", ({ seat }) => {
      const op = new CallOperation("write", [1], true, null);

      check.equal(
        seat,
        [op.name, op.args, op.known, op.output],
        ["write", [1], true, null],
        "the fields",
      );
    });

    it("returns an operation without an output for a call that is not known", ({
      seat,
    }) => {
      check.isNil(seat, new CallOperation("read", [], false).output, "no output");
    });
  });

  describe("CallOperation.returned", () => {
    const tests: { name: string; give: [Operation, unknown]; want: boolean }[] = [
      {
        name: "a known call of the value",
        give: [known("read", [], 3), 3],
        want: true,
      },
      {
        name: "a known call of another value",
        give: [known("read", [], 3), 4],
        want: false,
      },
      {
        name: "a known call of an equal structure",
        give: [known("read", [], { a: [1] }), { a: [1] }],
        want: true,
      },
      {
        name: "a known call of NaN",
        give: [known("read", [], Number.NaN), Number.NaN],
        want: false,
      },
      { name: "a call that is not known", give: [unknown("read", []), 4], want: true },
    ];
    for (const tt of tests) {
      it(`returns ${tt.want} for ${tt.name}`, ({ seat }) => {
        const [op, value] = tt.give;

        check.equal(
          seat,
          op.returned(value),
          tt.want,
          "whether it may have returned the value",
        );
      });
    }
  });

  describe("stateKey", () => {
    const tests: { name: string; give: [unknown, unknown]; want: boolean }[] = [
      { name: "-0 and 0", give: [-0, 0], want: true },
      { name: "NaN and NaN", give: [Number.NaN, Number.NaN], want: true },
      {
        name: "two objects of one field in another order",
        give: [
          { a: 1, b: 2 },
          { b: 2, a: 1 },
        ],
        want: true,
      },
      {
        name: "two maps of one entries in another order",
        give: [
          new Map([
            [1, "a"],
            [2, "b"],
          ]),
          new Map([
            [2, "b"],
            [1, "a"],
          ]),
        ],
        want: true,
      },
      {
        name: "two sets of one value in another order",
        give: [new Set([1, 2]), new Set([2, 1])],
        want: true,
      },
      {
        name: "an instance of a class and a plain object of its fields",
        give: [new Point(1), { x: 1 }],
        want: true,
      },
      { name: "two functions", give: [() => 1, () => 2], want: true },
      { name: "two symbols", give: [Symbol("a"), Symbol("b")], want: true },
      { name: "two dates of one time", give: [new Date(5), new Date(5)], want: true },
      {
        name: "two typed arrays of one element",
        give: [Int16Array.of(7), Int16Array.of(7)],
        want: true,
      },
      {
        name: "two boxed numbers of one value",
        give: [Object(1), Object(1)],
        want: true,
      },
      {
        name: "two errors of one name and message",
        give: [new TypeError("x"), new TypeError("x")],
        want: true,
      },
      {
        name: "two regular expressions of one source",
        give: [/a+/g, /a+/g],
        want: true,
      },
      { name: "a number and a string", give: [1, "1"], want: false },
      { name: "a number and a bigint", give: [1, 1n], want: false },
      { name: "null and undefined", give: [null, undefined], want: false },
      { name: "two lists of other elements", give: [[1], [2]], want: false },
      { name: "true and false", give: [true, false], want: false },
      {
        name: "two typed arrays of other types",
        give: [Int8Array.of(1), Uint8Array.of(1)],
        want: false,
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.want ? "one key" : "two keys"} for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          stateKey(tt.give[0]) === stateKey(tt.give[1]),
          tt.want,
          "whether the keys are one",
        );
      });
    }

    it("returns one key for two values that differ only below a depth of 100", ({
      seat,
    }) => {
      const nested = (leaf: number): unknown => {
        let value: unknown = leaf;
        for (let i = 0; i < 101; i += 1) value = [value];
        return value;
      };

      check.equal(
        seat,
        stateKey(nested(1)),
        stateKey(nested(2)),
        "the walk stops at 100",
      );
    });

    it("returns a key of a state that contains itself", ({ seat }) => {
      const cyclic: unknown[] = [];
      cyclic.push(cyclic);

      check.equal(seat, stateKey(cyclic), "[cycle]", "the cycle ends the walk");
    });
  });

  describe("sameState", () => {
    const tests: { name: string; give: [unknown, unknown]; want: boolean }[] = [
      {
        name: "two equal structures",
        give: [{ a: [1, 2] }, { a: [1, 2] }],
        want: true,
      },
      {
        name: "two structures of other values",
        give: [{ a: [1] }, { a: [2] }],
        want: false,
      },
      { name: "NaN and NaN", give: [Number.NaN, Number.NaN], want: false },
      { name: "-0 and 0", give: [-0, 0], want: true },
    ];
    for (const tt of tests) {
      it(`returns ${tt.want} for ${tt.name}`, ({ seat }) => {
        check.equal(seat, sameState(...tt.give), tt.want, "the comparison");
      });
    }
  });

  describe("specFrom", () => {
    it("starts with no applied call", ({ seat }) => {
      const [factory] = counters();

      check.equal(seat, specFrom(factory).initial(), [], "no call");
    });

    it("steps a state by a replay of its calls on a fresh subject", ({ seat }) => {
      const [factory, counted] = counters();
      const spec = specFrom(factory);
      const state = [unknown("add", [1]), unknown("add", [2])];
      const next = spec.next(state, known("add", [4], 7));

      check.equal(
        seat,
        [next, counted],
        [[[...state, new CallOperation("add", [4], false)]], { built: 1, applied: 3 }],
        "one subject of three calls",
      );
    });

    it("rejects a call whose output the subject does not return", ({ seat }) => {
      const [factory] = counters();

      check.isEmpty(
        seat,
        specFrom(factory).next([], known("add", [1], 2)),
        "1 is not 2",
      );
    });

    it("accepts a call whose outcome is unknown", ({ seat }) => {
      const [factory, counted] = counters();
      const next = specFrom(factory).next([], unknown("add", [1]));

      check.equal(
        seat,
        [next, counted.applied],
        [[[new CallOperation("add", [1], false)]], 1],
        "the call is applied and listed",
      );
    });

    it("compares states by their operations and arguments in order", ({ seat }) => {
      const [factory] = counters();
      const spec = specFrom(factory);
      const a = unknown("add", [1]);
      const b = unknown("add", [2]);
      const equal = spec.equal as NonNullable<typeof spec.equal>;

      check.equal(
        seat,
        [
          equal([a, b], [unknown("add", [1]), b]),
          equal([a, b], [b, a]),
          equal([a], [a, b]),
          equal([a], [unknown("sub", [1])]),
        ],
        [true, false, false, false],
        "one order of equal calls",
      );
    });

    it("gives two equal states one key", ({ seat }) => {
      const [factory] = counters();
      const key = specFrom(factory).key as NonNullable<
        ReturnType<typeof specFrom>["key"]
      >;

      check.equal(
        seat,
        key([unknown("add", [1])]),
        key([unknown("add", [1])]),
        "one key",
      );
    });
  });

  describe("COST", () => {
    it("states the cost of a step of a spec from a subject as its depth plus one", ({
      seat,
    }) => {
      const [factory] = counters();
      const spec = specFrom(factory) as Costed<readonly Operation[]>;

      check.equal(
        seat,
        [spec[COST]([]), spec[COST]([unknown("add", [1]), unknown("add", [2])])],
        [1, 3],
        "one, then three",
      );
    });
  });
});
