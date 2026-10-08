/**
 * The spec of the named specs of the history vectors. Each step is the one
 * that the definition's reference implementation takes from the same state.
 */

import { describe } from "vitest";
import { SPECS } from "../../../src/conformance/history/specs.js";
import { CallOperation, type Operation, type Spec } from "../../../src/history/spec.js";
import { check } from "../../../src/index.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** Returns the named spec of a name. */
function spec(name: string): Spec<unknown> {
  return SPECS.get(name) as Spec<unknown>;
}

/** Returns a call of operation with args that completed with ok and output. */
function known(
  name: string,
  args: readonly unknown[],
  output: unknown = null,
): Operation {
  return new CallOperation(name, args, true, output);
}

/** Returns a call of operation with args whose outcome is unknown. */
function unknown(name: string, args: readonly unknown[]): Operation {
  return new CallOperation(name, args, false);
}

/** One step of a named spec: the state, the call, and the states that follow. */
interface Step {
  readonly name: string;
  readonly give: readonly [state: unknown, op: Operation];
  readonly want: readonly unknown[];
}

/** The steps that each named spec takes, by name. */
const STEPS: Readonly<Record<string, readonly Step[]>> = {
  register: [
    {
      name: "stores a write whatever it output",
      give: [null, known("write", [3], "ignored")],
      want: [3],
    },
    { name: "accepts a read of the state", give: [3, known("read", [], 3)], want: [3] },
    {
      name: "rejects a read of another value",
      give: [3, known("read", [], 4)],
      want: [],
    },
    {
      name: "rejects a read of 0 from null",
      give: [null, known("read", [], 0)],
      want: [],
    },
    {
      name: "accepts a read whose outcome is unknown",
      give: [3, unknown("read", [])],
      want: [3],
    },
  ],
  "cas-register": [
    {
      name: "stores the value of a cas that matches",
      give: [1, known("cas", [1, 2], true)],
      want: [2],
    },
    {
      name: "rejects a matching cas that outputs false",
      give: [1, known("cas", [1, 2], false)],
      want: [],
    },
    {
      name: "leaves the state of a refused cas",
      give: [3, known("cas", [1, 2], false)],
      want: [3],
    },
    {
      name: "rejects a refused cas that outputs true",
      give: [3, known("cas", [1, 2], true)],
      want: [],
    },
    {
      name: "leaves null for a refused cas",
      give: [null, known("cas", [1, 2], false)],
      want: [null],
    },
    {
      name: "rejects an output that is no bool",
      give: [1, known("cas", [1, 2], 1)],
      want: [],
    },
    {
      name: "takes effect for an unknown cas that matches",
      give: [1, unknown("cas", [1, 2])],
      want: [2],
    },
    {
      name: "leaves the state for an unknown cas that does not match",
      give: [3, unknown("cas", [1, 2])],
      want: [3],
    },
    { name: "stores a write", give: [null, known("write", [5])], want: [5] },
    { name: "accepts a read of the state", give: [5, known("read", [], 5)], want: [5] },
  ],
  "lossy-register": [
    {
      name: "leaves the new value before the old one for a write",
      give: [1, known("write", [2])],
      want: [2, 1],
    },
    { name: "accepts a read of the state", give: [1, known("read", [], 1)], want: [1] },
  ],
  "key-value": [
    {
      name: "reads an unwritten key as empty",
      give: [new Map(), known("get", ["k"], "")],
      want: [new Map()],
    },
    {
      name: "rejects a value of an unwritten key",
      give: [new Map(), known("get", ["k"], "v")],
      want: [],
    },
    {
      name: "replaces the value of a put in its place",
      give: [
        new Map([
          ["a", "1"],
          ["b", "2"],
        ]),
        known("put", ["a", "9"]),
      ],
      want: [
        new Map([
          ["a", "9"],
          ["b", "2"],
        ]),
      ],
    },
    {
      name: "stores an append to a new key last",
      give: [
        new Map([
          ["a", "1"],
          ["b", "2"],
        ]),
        known("append", ["c", "3"]),
      ],
      want: [
        new Map([
          ["a", "1"],
          ["b", "2"],
          ["c", "3"],
        ]),
      ],
    },
    {
      name: "extends the value of an append",
      give: [
        new Map([
          ["a", "1"],
          ["b", "2"],
        ]),
        known("append", ["b", "x"]),
      ],
      want: [
        new Map([
          ["a", "1"],
          ["b", "2x"],
        ]),
      ],
    },
    {
      name: "removes a key of a put of the empty value",
      give: [new Map([["a", "1"]]), known("put", ["a", ""])],
      want: [new Map()],
    },
    {
      name: "stores no key of an append of the empty value",
      give: [new Map(), known("append", ["a", ""])],
      want: [new Map()],
    },
    {
      name: "accepts a get whose outcome is unknown",
      give: [new Map([["a", "1"]]), unknown("get", ["a"])],
      want: [new Map([["a", "1"]])],
    },
  ],
  queue: [
    {
      name: "enqueues at the tail",
      give: [[1], known("enqueue", [2])],
      want: [[1, 2]],
    },
    { name: "dequeues the head", give: [[1, 2], known("dequeue", [], 1)], want: [[2]] },
    {
      name: "rejects a dequeue of another value",
      give: [[1, 2], known("dequeue", [], 2)],
      want: [],
    },
    {
      name: "outputs null for an empty queue",
      give: [[], known("dequeue", [], null)],
      want: [[]],
    },
    {
      name: "rejects a value of an empty queue",
      give: [[], known("dequeue", [], 1)],
      want: [],
    },
    {
      name: "removes the head of an unknown dequeue",
      give: [[1, 2], unknown("dequeue", [])],
      want: [[2]],
    },
    {
      name: "leaves an empty queue for an unknown dequeue",
      give: [[], unknown("dequeue", [])],
      want: [[]],
    },
  ],
  set: [
    { name: "adds a value once", give: [[1], known("add", [2])], want: [[1, 2]] },
    {
      name: "leaves a set that contains the value of an add",
      give: [[1], known("add", [1])],
      want: [[1]],
    },
    {
      name: "accepts a true contains of a present value",
      give: [[1], known("contains", [1], true)],
      want: [[1]],
    },
    {
      name: "rejects a true contains of an absent value",
      give: [[1], known("contains", [2], true)],
      want: [],
    },
    {
      name: "accepts a contains whose outcome is unknown",
      give: [[1], unknown("contains", [2])],
      want: [[1]],
    },
    {
      name: "removes the value of a true remove",
      give: [[1, 2], known("remove", [1], true)],
      want: [[2]],
    },
    {
      name: "leaves a set without the value of a false remove",
      give: [[2], known("remove", [1], false)],
      want: [[2]],
    },
    {
      name: "rejects a true remove of an absent value",
      give: [[2], known("remove", [1], true)],
      want: [],
    },
    {
      name: "rejects a false remove of a present value",
      give: [[1], known("remove", [1], false)],
      want: [],
    },
    {
      name: "removes a present value of an unknown remove",
      give: [[1, 2], unknown("remove", [1])],
      want: [[2]],
    },
    {
      name: "leaves the set of an unknown remove of an absent value",
      give: [[2], unknown("remove", [1])],
      want: [[2]],
    },
  ],
};

/** The initial state of each named spec, and an operation that it does not define. */
const NAMES: readonly { name: string; initial: unknown; undefined: Operation }[] = [
  { name: "register", initial: null, undefined: known("cas", [1, 2], true) },
  { name: "cas-register", initial: null, undefined: known("pop", []) },
  { name: "lossy-register", initial: null, undefined: known("cas", [1, 2]) },
  { name: "key-value", initial: new Map(), undefined: known("delete", ["a"]) },
  { name: "queue", initial: [], undefined: known("peek", []) },
  { name: "set", initial: [], undefined: known("clear", [1]) },
];

describe("specs", () => {
  describe("SPECS", () => {
    it("states the six named specs of the definition", ({ seat }) => {
      check.equal(
        seat,
        [...SPECS.keys()].sort(),
        ["cas-register", "key-value", "lossy-register", "queue", "register", "set"],
        "the names",
      );
    });

    for (const { name, initial, undefined: op } of NAMES) {
      it(`starts the ${name} spec at its initial state`, ({ seat }) => {
        check.equal(seat, spec(name).initial(), initial, "the initial state");
      });

      it(`throws for an operation that the ${name} spec does not define`, ({
        seat,
      }) => {
        check.equal(
          seat,
          thrown(() => spec(name).next(initial, op)),
          `conformance: the ${name} spec has no operation ${JSON.stringify(op.name)}`,
          "the refusal",
        );
      });

      for (const tt of STEPS[name] ?? []) {
        it(`${tt.name} in the ${name} spec`, ({ seat }) => {
          check.equal(
            seat,
            spec(name).next(...tt.give),
            tt.want,
            "the following states",
          );
        });
      }
    }

    it("compares two states of the set in any order", ({ seat }) => {
      const set = spec("set");
      const equal = set.equal as NonNullable<typeof set.equal>;
      const key = set.key as NonNullable<typeof set.key>;

      check.equal(
        seat,
        [
          equal([1, 2], [2, 1]),
          key([1, 2]) === key([2, 1]),
          equal([1, 2], [1, 3]),
          equal([1], [1, 2]),
        ],
        [true, true, false, false],
        "one set in two orders",
      );
    });

    it("compares two states of the key-value map in any order", ({ seat }) => {
      const kv = spec("key-value");
      const equal = kv.equal as NonNullable<typeof kv.equal>;

      check.isTrue(
        seat,
        equal(
          new Map([
            ["a", "1"],
            ["b", "2"],
          ]),
          new Map([
            ["b", "2"],
            ["a", "1"],
          ]),
        ),
        "one map in two orders",
      );
    });
  });
});
