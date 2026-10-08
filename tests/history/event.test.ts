/** The spec of the events of a history, and of their JSON form. */

import { describe } from "vitest";
import { type Event, eventJson } from "../../src/history/event.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

/** The fields of the events of call 0 by client 0 on process 0. */
const HEAD = { call: 0, client: 0, process: 0 } as const;

/** Returns the typed literal of an int. */
function int(value: number): Record<string, unknown> {
  return { type: "int", value };
}

/** A function whose text an opaque literal states. */
function probe(): void {}

describe("event", () => {
  describe("eventJson", () => {
    const tests: { name: string; give: Event; want: Record<string, unknown> }[] = [
      {
        name: "an invocation with its operation and the literals of its args and its keys",
        give: {
          ...HEAD,
          index: 0,
          kind: "invoke",
          operation: "write",
          args: [1],
          keys: ["x"],
        },
        want: {
          index: 0,
          kind: "invoke",
          ...HEAD,
          operation: "write",
          args: [int(1)],
          keys: [{ type: "string", value: "x" }],
        },
      },
      {
        name: "an ok completion with the literal of its output",
        give: { ...HEAD, index: 1, kind: "ok", output: 1, error: undefined },
        want: { index: 1, kind: "ok", ...HEAD, output: int(1) },
      },
      {
        name: "a fail completion with the message of its error",
        give: {
          ...HEAD,
          index: 1,
          kind: "fail",
          output: undefined,
          error: new Error("refused"),
        },
        want: { index: 1, kind: "fail", ...HEAD, error: "refused" },
      },
      {
        name: "an unknown completion with the text of its error",
        give: {
          ...HEAD,
          index: 1,
          kind: "unknown",
          output: undefined,
          error: "the reply was lost",
        },
        want: { index: 1, kind: "unknown", ...HEAD, error: "the reply was lost" },
      },
      {
        name: "an invocation with an opaque literal of an argument that no typed literal states",
        give: {
          ...HEAD,
          index: 0,
          kind: "invoke",
          operation: "call",
          args: [probe],
          keys: [],
        },
        want: {
          index: 0,
          kind: "invoke",
          ...HEAD,
          operation: "call",
          args: [{ type: "opaque", text: "[function probe]" }],
          keys: [],
        },
      },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, eventJson(tt.give), tt.want, "the JSON form");
      });
    }
  });
});
