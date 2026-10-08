/**
 * The spec of the runners of the history vectors. It uses vitest's `expect`
 * alone, because the runners decide the verdict of every history vector.
 */

import { describe, expect, it } from "vitest";
import { RUNNERS } from "../../../src/conformance/history/vectors.js";
import { vectors } from "../../../src/conformance/vector.js";
import { Fault } from "../../../src/matcher/fault.js";

/** The history vectors of the definition, by id. */
const VECTORS = new Map(
  vectors()
    .filter((v) => RUNNERS.has(v.kind))
    .map((v) => [v.id, v]),
);

/** A vector's JSON object. */
type Raw = Readonly<Record<string, unknown>>;

/** Returns the vector of an id. */
function vector(id: string): Raw {
  return (VECTORS.get(id) as { raw: Raw }).raw;
}

/** Returns the fault that the runner of kind throws for raw, as its place and its reason. */
function fault(kind: string, raw: Raw): [string, string] {
  try {
    (RUNNERS.get(kind) as (raw: Raw) => void)(raw);
  } catch (err) {
    if (err instanceof Fault) return [err.at, err.reason];
    throw err;
  }
  return ["", ""];
}

/** The typed literal of an int. */
function int(value: number): Raw {
  return { type: "int", value };
}

/** A script of a write of 1 to x by client 0. */
const WRITE = [
  {
    invoke: 0,
    client: 0,
    operation: "write",
    args: [int(1)],
    keys: [{ type: "string", value: "x" }],
  },
  { ok: 0, output: { type: "null" } },
];

/** The id of a passing linearizable vector over one partition. */
const PASSING = "linearizable/concurrent-writes-take-effect-in-the-order-a-read-needs";

/** The id of a failing linearizable vector. */
const FAILING = "linearizable/a-read-after-a-completed-write-misses-it";

describe("vectors", () => {
  describe("RUNNERS", () => {
    it("states a runner of each kind of history vector", () => {
      expect([...RUNNERS.keys()].sort()).toEqual([
        "linearizable",
        "seam",
        "serializable",
        "snapshot-isolation",
      ]);
    });

    it("runs the 80 history vectors of the definition", () => {
      expect(VECTORS.size).toBe(80);
    });

    for (const [id, v] of VECTORS) {
      it(`agrees with the vector ${id}`, () => {
        expect(() => (RUNNERS.get(v.kind) as (raw: Raw) => void)(v.raw)).not.toThrow();
      });
    }

    const tests: { name: string; give: [string, Raw]; want: [string, string] }[] = [
      {
        name: "a seam vector with a script and intervals",
        give: ["seam", { script: [], intervals: [] }],
        want: ["", "the vector states a script or intervals"],
      },
      {
        name: "a seam vector whose script the seam refuses elsewhere",
        give: ["seam", { script: WRITE, events: [], refused: 1 }],
        want: ["refused", "the seam refuses no entry, want 1"],
      },
      {
        name: "a seam vector whose script the seam refuses where the vector states none",
        give: [
          "seam",
          {
            script: [
              WRITE[0],
              { invoke: 1, client: 0, operation: "read", args: [], keys: [] },
            ],
            events: [],
          },
        ],
        want: ["refused", "the seam refuses entry 1, want null"],
      },
      {
        name: "a seam vector of another event",
        give: ["seam", { script: WRITE, events: [{ index: 0 }, {}] }],
        want: [
          "events[0]",
          'the event is {"index":0,"kind":"invoke","call":0,"client":0,"process":0,"operation":"write","args":[{"type":"int","value":1}],"keys":[{"type":"string","value":"x"}]}, want {"index":0}',
        ],
      },
      {
        name: "a seam vector of fewer events",
        give: ["seam", { script: [WRITE[0]], events: [] }],
        want: ["events", "the number of events is 1, want 0"],
      },
      {
        name: "a seam vector without events",
        give: ["seam", { script: [WRITE[0]] }],
        want: ["events", "the events are no list"],
      },
      {
        name: "a script that is no list",
        give: ["seam", { script: 5 }],
        want: ["script", "the script is no list"],
      },
      {
        name: "a script entry that states no call of the seam",
        give: ["seam", { script: [{ client: 0 }] }],
        want: ["script[0]", "the entry states no call of the seam"],
      },
      {
        name: "a script entry that completes a call that it does not open",
        give: ["seam", { script: [{ ok: 3, output: int(1) }] }],
        want: [
          "script[0]",
          "the entry completes call 3, which the script does not open",
        ],
      },
      {
        name: "a script entry whose args are no list",
        give: [
          "seam",
          { script: [{ invoke: 0, client: 0, operation: "read", args: 1, keys: [] }] },
        ],
        want: ["script[0].args", "the member is no list"],
      },
      {
        name: "a script entry whose argument is no typed literal",
        give: [
          "seam",
          {
            script: [
              {
                invoke: 0,
                client: 0,
                operation: "read",
                args: [{ type: "widget" }],
                keys: [],
              },
            ],
          },
        ],
        want: ["script[0].args[0]", "the value is no typed literal"],
      },
      {
        name: "a script entry whose output is no typed literal",
        give: ["seam", { script: [WRITE[0], { ok: 0, output: { type: "widget" } }] }],
        want: ["script[1].output", "the value is no typed literal"],
      },
      {
        name: "intervals that are no list",
        give: ["seam", { intervals: {} }],
        want: ["intervals", "the intervals are no list"],
      },
      {
        name: "an interval with an end and no kind",
        give: [
          "seam",
          {
            intervals: [
              { client: 0, operation: "read", args: [], keys: [], start: 0, end: 1 },
            ],
          },
        ],
        want: [
          "intervals[0]",
          "the entry states a completion kind and an end, or neither",
        ],
      },
      {
        name: "an interval of a kind that completes no call",
        give: [
          "seam",
          {
            intervals: [
              {
                client: 0,
                operation: "read",
                args: [],
                keys: [],
                start: 0,
                end: 1,
                kind: "invoke",
              },
            ],
          },
        ],
        want: [
          "intervals[0]",
          "the entry states a completion kind and an end, or neither",
        ],
      },
      {
        name: "a linearizable vector of no named spec",
        give: ["linearizable", { ...vector(PASSING), spec: "stack" }],
        want: ["spec", '"stack" is no named spec'],
      },
      {
        name: "a linearizable vector whose history the seam refuses",
        give: [
          "linearizable",
          {
            ...vector(PASSING),
            history: [
              WRITE[0],
              { invoke: 1, client: 0, operation: "read", args: [], keys: [] },
            ],
          },
        ],
        want: ["history[1]", "the seam refuses the entry"],
      },
      {
        name: "a linearizable vector of a budget below 1",
        give: ["linearizable", { ...vector(PASSING), budget: 0 }],
        want: ["budget", "the budget is 0, no integer of 1 or more"],
      },
      {
        name: "a linearizable vector of workers that are no integer",
        give: ["linearizable", { ...vector(PASSING), workers: "4" }],
        want: ["workers", 'the workers is "4", no integer of 1 or more'],
      },
      {
        name: "a linearizable vector that expects neither pass nor fail",
        give: ["linearizable", { ...vector(PASSING), expect: "maybe" }],
        want: ["expect", 'the vector expects "maybe", neither pass nor fail'],
      },
      {
        name: "a linearizable vector that expects a failure of a passing check",
        give: ["linearizable", { ...vector(PASSING), expect: "fail" }],
        want: ["expect", "the check ends as pass, want fail"],
      },
      {
        name: "a linearizable vector that states another field of a failure",
        give: [
          "linearizable",
          {
            ...vector(FAILING),
            detail: { ...(vector(FAILING)["detail"] as Raw), steps: 7 },
          },
        ],
        want: ["detail.steps", "the field is 2, want 7"],
      },
      {
        name: "a linearizable vector that states a field that a failure lacks",
        give: ["linearizable", { ...vector(FAILING), detail: { extra: 1 } }],
        want: ["detail.extra", "the record states no such field, want 1"],
      },
      {
        name: "a passing linearizable vector of two partitions",
        give: [
          "linearizable",
          {
            ...vector(PASSING),
            detail: { ...(vector(PASSING)["detail"] as Raw), partitions: 2 },
          },
        ],
        want: [
          "detail",
          "the runner observes the steps of a pass over one partition in two steps or more, and the vector states the partitions 2 and the steps 6",
        ],
      },
      {
        name: "a passing linearizable vector of fewer steps than the check spends",
        give: [
          "linearizable",
          {
            ...vector(PASSING),
            detail: { ...(vector(PASSING)["detail"] as Raw), steps: 5 },
          },
        ],
        want: ["detail.steps", "the check ends as fail within 5 steps, want pass"],
      },
      {
        name: "a passing linearizable vector of more steps than the check spends",
        give: [
          "linearizable",
          {
            ...vector(PASSING),
            detail: { ...(vector(PASSING)["detail"] as Raw), steps: 7 },
          },
        ],
        want: [
          "detail.steps",
          'the check within 6 steps ends as pass with {}, want {"outcome":"undecided","partitions":1,"steps":6,"limit":"steps"}',
        ],
      },
      {
        name: "a serializable vector that expects a pass of a failing check",
        give: [
          "serializable",
          {
            ...vector(
              "serializable/a-read-returns-a-value-that-no-transaction-appended",
            ),
            expect: "pass",
          },
        ],
        want: ["expect", "the check ends as fail, want pass"],
      },
    ];
    for (const tt of tests) {
      it(`throws a fault for ${tt.name}`, () => {
        expect(fault(...tt.give)).toEqual(tt.want);
      });
    }
  });
});
