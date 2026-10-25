// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the steps of a machine in a case that follows a trace. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import type { Case as Engine } from "../../src/prop/engine/case.js";
import { IntegerBounds } from "../../src/prop/engine/choice.js";
import { type Entry, TraceError, Tracing } from "../../src/prop/engine/trace.js";
import {
  followConcurrent,
  followDrain,
  followSequential,
  refuseConcurrent,
} from "../../src/stateful/follow.js";
import type { Action } from "../../src/stateful/machine.js";
import { test as it } from "../../src/vitest.js";
import { bodyCase } from "../helpers.js";

/** The actions push and pop, which do nothing. */
const ACTIONS: readonly Action<unknown>[] = [
  { name: "push", run: () => undefined },
  { name: "pop", run: () => undefined },
];

/** The limits of a concurrent section of two clients and at most three steps. */
const LIMITS = { concurrent: 3, clients: 2 };

/** Returns a case that follows the trace of entries, with the trace and the engine's case. */
function following(
  ...entries: Entry[]
): [ReturnType<typeof bodyCase>["c"], Tracing, Engine] {
  const trace = new Tracing(entries);
  const { c, engine } = bodyCase(trace);
  return [c, trace, engine];
}

/** Returns the next count values that the engine's case requests, each of 0 to 9. */
function served(engine: Engine, count: number): bigint[] {
  return Array.from({ length: count }, () => engine.integer(new IntegerBounds(0n, 9n)));
}

/** Returns the reason of the TraceError that fn throws, or undefined when it returns. */
function refusal(fn: () => void): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof TraceError) {
      return err.reason;
    }
    throw err;
  }
  return undefined;
}

describe("follow", () => {
  describe("followSequential", () => {
    it("serves the flag and the index of a sequential step entry", ({ seat }) => {
      const [c, trace, engine] = following({ action: "pop" });
      followSequential(c, trace, ACTIONS, 0, 10);

      check.isEqualTo(
        seat,
        [served(engine, 2), trace.nextStep()],
        [[1n, 1n], undefined],
        "the flag 1, the index of pop, and the entry taken",
      );
    });

    it("leaves a concurrent step entry to the concurrent section", ({ seat }) => {
      const [c, trace] = following({ action: "pop", client: 1 });
      followSequential(c, trace, ACTIONS, 0, 10);

      check.isEqualTo(
        seat,
        trace.nextStep(),
        { action: "pop", client: 1 },
        "the entry",
      );
    });

    it("refuses an entry past the most steps", ({ seat }) => {
      const [c, trace] = following({ action: "pop" });

      check.isEqualTo(
        seat,
        refusal(() => followSequential(c, trace, ACTIONS, 10, 10)),
        "step",
        "the refusal of the step",
      );
    });

    it("refuses an action that the step may not take", ({ seat }) => {
      const [c, trace] = following({ action: "peek" });

      check.isEqualTo(
        seat,
        refusal(() => followSequential(c, trace, ACTIONS, 0, 10)),
        "step",
        "the refusal of the step",
      );
    });
  });

  describe("refuseConcurrent", () => {
    it("refuses a concurrent step entry", ({ seat }) => {
      const [c, trace] = following({ action: "pop", client: 1 });

      check.isEqualTo(
        seat,
        refusal(() => refuseConcurrent(c, trace)),
        "step",
        "the refusal of the step",
      );
    });

    it("leaves a drain step entry alone", ({ seat }) => {
      const [c, trace] = following({ action: "pop", client: 0, drain: true });

      check.isNil(
        seat,
        refusal(() => refuseConcurrent(c, trace)),
        "no refusal",
      );
    });
  });

  describe("followConcurrent", () => {
    it("serves the flag, the client and the index of a concurrent step entry", ({
      seat,
    }) => {
      const [c, trace, engine] = following({ action: "push", client: 2 });
      followConcurrent(c, trace, ACTIONS, 0, LIMITS);

      check.isEqualTo(
        seat,
        served(engine, 3),
        [1n, 2n, 0n],
        "the flag, the client and the index",
      );
    });

    it("refuses a client outside the clients", ({ seat }) => {
      const [c, trace] = following({ action: "push", client: 3 });

      check.isEqualTo(
        seat,
        refusal(() => followConcurrent(c, trace, ACTIONS, 0, LIMITS)),
        "step",
        "the refusal of the step",
      );
    });

    it("leaves a sequential step entry alone", ({ seat }) => {
      const [c, trace] = following({ action: "push" });
      followConcurrent(c, trace, ACTIONS, 0, LIMITS);

      check.isEqualTo(seat, trace.nextStep(), { action: "push" }, "the entry");
    });
  });

  describe("followDrain", () => {
    it("serves the index of a drain step entry", ({ seat }) => {
      const [c, trace, engine] = following({ action: "pop", drain: true });
      followDrain(c, trace, ACTIONS);

      check.isEqualTo(seat, served(engine, 1), [1n], "the index of pop");
    });

    it("refuses a drain step entry once no drain action is available", ({ seat }) => {
      const [c, trace] = following({ action: "pop", drain: true });

      check.isEqualTo(
        seat,
        refusal(() => followDrain(c, trace, [])),
        "step",
        "the refusal of the step",
      );
    });
  });
});
