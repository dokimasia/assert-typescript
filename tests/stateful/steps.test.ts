/**
 * The spec of the steps of a machine: the swarm, the steps of each part, the
 * checks, traces and places. Each choice, each step and each refusal is that
 * of the definition's reference implementation on the same machine and
 * values.
 */

import { describe } from "vitest";
import {
  COST,
  type Costed,
  type Operation,
  type Spec,
} from "../../src/history/spec.js";
import { check } from "../../src/index.js";
import type { Case, Failing } from "../../src/prop/case.js";
import { Failed, Generating } from "../../src/prop/engine/case.js";
import { IntegerBounds } from "../../src/prop/engine/choice.js";
import { Integer } from "../../src/prop/engine/generator.js";
import { Source } from "../../src/prop/engine/source.js";
import { TraceError, Tracing } from "../../src/prop/engine/trace.js";
import type { Action, Machine } from "../../src/stateful/machine.js";
import {
  clients,
  concurrent,
  max,
  mean,
  type Option,
  swarm,
  tasks,
} from "../../src/stateful/option.js";
import { Scheduler } from "../../src/stateful/scheduler.js";
import { steps } from "../../src/stateful/steps.js";
import { uniform } from "../../src/stateful/strategy.js";
import { test as it } from "../../src/vitest.js";
import { bodyCase, replaying } from "../helpers.js";

/** The generator of the inputs that the actions draw. */
const DIGIT = new Integer(new IntegerBounds(0n, 9n));

/** The bounds of a choice between two values, and of a choice of one value. */
const BINARY = new IntegerBounds(0n, 1n);
const ONE = new IntegerBounds(0n, 0n);

/** What an action of a log may state besides its name. */
interface Shape {
  readonly weight?: number;
  readonly enabled?: (state: unknown) => boolean;
  readonly drain?: boolean;
  readonly draws?: boolean;
}

/** The inputs and the runs of the actions of a case, in order. */
class Log {
  readonly events: unknown[][] = [];

  /** Returns an action that records a call of its name, and logs its input and its run. */
  action(name: string, shape: Shape = {}): Action<unknown> {
    const enabled = shape.enabled;
    return {
      name,
      weight: shape.weight,
      drain: shape.drain,
      ...(enabled === undefined ? {} : { enabled }),
      input: (c, state) => {
        this.events.push(["input", name, state]);
        return shape.draws === true ? c.draw(DIGIT, "v") : undefined;
      },
      run: (c, client, value) => {
        c.history()
          .invoke(client, name, value === undefined ? [] : [value])
          .ok(null);
        this.events.push([name, client, value]);
      },
    };
  }

  /** Returns the runs of the action name, as their clients and inputs. */
  runs(name: string): unknown[][] {
    return this.events.filter((event) => event[0] === name);
  }
}

/** Returns a spec whose state counts the calls, or that steps as step does. */
function counting(step?: (state: number, op: Operation) => number[]): Spec<number> {
  return {
    initial: () => 0,
    next: (state, op) => (step === undefined ? [state + 1] : step(state, op)),
  };
}

/** A spec whose call leaves the count plus one, or the count. */
const LOSSY = counting((state) => [state + 1, state]);

/** Returns what promise rejects with, or undefined when it fulfils. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return undefined;
}

/** Returns the steps of a machine on a case that replays values, under options, and the case's record. */
async function replayed<S>(
  machine: Machine<S>,
  values: readonly number[],
  ...options: Option[]
) {
  const { c, engine } = bodyCase(replaying(...values));
  await steps(c, machine, ...options);
  return engine;
}

/** Returns the options of a concurrent section on two clients of c, without sequential steps and swarm. */
function section(c: Case, ...more: Option[]): Option[] {
  return [
    max(0),
    swarm(false),
    clients(2),
    tasks(new Scheduler(c, uniform())),
    ...more,
  ];
}

/**
 * Returns the steps that a mean of 3 takes on the coins of twin, up to most,
 * and the bounds of the flag that stops them: forced at the most, and free
 * before it.
 */
function meanSteps(twin: Source, most: number): [number, IntegerBounds] {
  let taken = 0;
  while (taken < most && twin.coin(3n, 4n)) taken += 1;
  return [taken, taken === most ? ONE : BINARY];
}

/** Returns a machine whose a adds a pending message, and whose drain action d delivers one, with an invariant that logs the count. */
function draining(log: Log, pending: { n: number }): Machine<number> {
  return {
    spec: counting(),
    actions: [
      {
        name: "a",
        run: (c, client) => {
          c.history().invoke(client, "a", []).ok(null);
          pending.n += 1;
        },
      },
      {
        name: "d",
        drain: true,
        enabled: () => pending.n > 0,
        run: (c, client) => {
          c.history().invoke(client, "d", []).ok(null);
          pending.n -= 1;
        },
      },
    ],
    invariant: (_c, state) => log.events.push(["invariant", state]),
  };
}

describe("steps", () => {
  describe("steps", () => {
    it("makes one swarm choice per action in order with edge 1", async ({ seat }) => {
      const log = new Log();
      const engine = await replayed(
        { actions: ["a", "b", "c"].map((name) => log.action(name)) },
        [1, 1, 1],
        max(0),
      );

      check.equal(
        seat,
        engine.requests.slice(0, 3).map((request) => [request.bounds, request.edge]),
        [
          [BINARY, 1n],
          [BINARY, 1n],
          [BINARY, 1n],
        ],
        "three choices",
      );
    });

    it("draws the swarm choices of two actions from a random source", async ({
      seat,
    }) => {
      const got: unknown[] = [];
      for (let seed = 0n; seed < 20n; seed += 1n) {
        const { c, engine } = bodyCase(new Generating(new Source(seed)));
        const log = new Log();
        await steps(c, { actions: [log.action("a"), log.action("b")] }, max(0));
        got.push(engine.choices.map((choice) => Number(choice.value)));
      }

      check.equal(
        seat,
        got,
        [
          [1, 1, 0],
          [1, 1, 0],
          [1, 1, 0],
          [0, 1, 0],
          [1, 0, 0],
          [0, 1, 0],
          [1, 1, 0],
          [1, 0, 0],
          [1, 1, 0],
          [0, 1, 0],
          [1, 0, 0],
          [1, 1, 0],
          [1, 0, 0],
          [1, 1, 0],
          [1, 1, 0],
          [0, 1, 0],
          [1, 1, 0],
          [1, 1, 0],
          [1, 0, 0],
          [1, 1, 0],
        ],
        "the choices of seeds 0 to 19",
      );
    });

    it("keeps the last action when the swarm kept no earlier one", async ({ seat }) => {
      const log = new Log();
      const engine = await replayed(
        { actions: ["a", "b", "c"].map((name) => log.action(name)) },
        [0, 0, 0, 1, 0],
        max(1),
      );

      check.equal(
        seat,
        [engine.requests[2]?.bounds, engine.steps],
        [new IntegerBounds(1n, 1n), [[0, { action: "c" }]]],
        "c takes the step",
      );
    });

    it("takes no sequential step of an action that the swarm disabled", async ({
      seat,
    }) => {
      const log = new Log();
      const engine = await replayed(
        { actions: [log.action("a"), log.action("b")] },
        [1, 0, 1, 0, 0],
      );

      check.equal(
        seat,
        [engine.requests[3]?.bounds, engine.steps.map(([, step]) => step.action)],
        [ONE, ["a"]],
        "the list contains a alone",
      );
    });

    it("keeps every action without a choice when swarm is off", async ({ seat }) => {
      const log = new Log();
      const engine = await replayed(
        { actions: [log.action("a"), log.action("b")] },
        [1, 1, 0],
        swarm(false),
      );

      check.equal(
        seat,
        [
          engine.requests[0]?.edge,
          engine.requests[1]?.bounds,
          engine.steps.map(([, step]) => step.action),
        ],
        [1n, BINARY, ["b"]],
        "the first request is a flag",
      );
    });

    it("drains a drain action that the swarm disabled", async ({ seat }) => {
      const log = new Log();
      const pending = { n: 1 };
      const deliver = log.action("d", { enabled: () => pending.n > 0, drain: true });
      const engine = await replayed(
        {
          actions: [
            log.action("a"),
            {
              ...deliver,
              run: (c, client, value) => {
                deliver.run(c, client, value);
                pending.n = 0;
              },
            },
          ],
        },
        [1, 0, 0],
      );

      check.equal(seat, engine.steps, [[0, { action: "d", drain: true }]], "one drain");
    });

    it("records a sequential step as a flag and an index in a span of its action", async ({
      seat,
    }) => {
      const log = new Log();
      const engine = await replayed(
        { actions: [log.action("a"), log.action("b", { draws: true })] },
        [1, 1, 7, 0],
        swarm(false),
      );

      check.equal(
        seat,
        [engine.spans, engine.steps, log.events, engine.requests[1]?.edge],
        [
          [
            { label: "b", start: 0, end: 3, depth: 0, parent: undefined },
            { label: "integer", start: 2, end: 3, depth: 1, parent: 0 },
          ],
          [[0, { action: "b" }]],
          [
            ["input", "b", undefined],
            ["b", 0, 7n],
          ],
          0n,
        ],
        "the step of b covers its flag, its index and its draw",
      );
    });

    it("lists the actions that are enabled in every state", async ({ seat }) => {
      const seen: unknown[] = [];
      const log = new Log();
      const zero = (state: unknown) => {
        seen.push(state);
        return state === 0;
      };
      const engine = await replayed(
        { spec: LOSSY, actions: [log.action("a"), log.action("b", { enabled: zero })] },
        [1, 0, 1, 0],
        swarm(false),
        max(2),
      );

      check.equal(
        seat,
        [engine.requests.map((request) => request.bounds), seen],
        [
          [BINARY, BINARY, BINARY, ONE, ONE],
          [0, 1, 0, 2, 1, 0],
        ],
        "enabled runs once per state",
      );
    });

    it("ends the sequential steps without a flag when no action is enabled", async ({
      seat,
    }) => {
      const log = new Log();
      const engine = await replayed(
        { actions: [log.action("a", { enabled: () => false })] },
        [],
        swarm(false),
      );

      check.isEmpty(seat, engine.requests, "no request");
    });

    it("continues by the mean up to the most steps", async ({ seat }) => {
      const most = 5;
      const got: unknown[] = [];
      const want: unknown[] = [];
      for (let seed = 0n; seed < 40n; seed += 1n) {
        const { c, engine } = bodyCase(new Generating(new Source(seed)));
        const twin = new Source(seed);
        await steps(
          c,
          { actions: [new Log().action("a")] },
          mean(3),
          max(most),
          swarm(false),
        );
        got.push([engine.steps.length, engine.requests.at(-1)?.bounds]);
        want.push(meanSteps(twin, most));
      }

      check.equal(seat, got, want, "a coin of 3 in 4 for each step");
    });

    it("chooses the action of a step by weight", async ({ seat }) => {
      const most = 20;
      const got: unknown[] = [];
      const want: unknown[] = [];
      for (let seed = 0n; seed < 20n; seed += 1n) {
        const { c, engine } = bodyCase(new Generating(new Source(seed)));
        const twin = new Source(seed);
        const log = new Log();
        await steps(
          c,
          { actions: [log.action("a"), log.action("b", { weight: 3 })] },
          mean(1000),
          max(most),
          swarm(false),
        );
        const names: string[] = [];
        while (names.length < most && twin.coin(1000n, 1001n)) {
          names.push(twin.below(4n) < 1n ? "a" : "b");
        }
        got.push(engine.steps.map(([, step]) => step.action));
        want.push(names);
      }

      check.equal(seat, got, want, "weights 1 and 3 split below(4)");
    });

    it("fails the case with the record of linearizable for a violated check", async ({
      seat,
    }) => {
      const { c } = bodyCase(replaying(1, 0));
      const err = await rejection(
        steps(
          c,
          { spec: counting(() => []), actions: [new Log().action("a")] },
          swarm(false),
        ),
      );
      const { failure } = (err as Failed).record as Failing;

      check.equal(
        seat,
        [err instanceof Failed, failure.assertion, failure.detail["outcome"]],
        [true, "linearizable", "violated"],
        "the record of the check",
      );
    });

    it("fails the case for an undecided check", async ({ seat }) => {
      const costly: Costed<number> = {
        initial: () => 0,
        next: () => [0],
        [COST]: () => 10 ** 8,
      };
      const { c } = bodyCase(replaying(1, 0));
      const err = await rejection(
        steps(c, { spec: costly, actions: [new Log().action("a")] }, swarm(false)),
      );
      const { failure } = (err as Failed).record as Failing;

      check.equal(
        seat,
        [failure.detail["outcome"], failure.detail["limit"]],
        ["undecided", "steps"],
        "the search stops at its budget",
      );
    });

    it("gives input the first state after the order that the check found", async ({
      seat,
    }) => {
      const log = new Log();
      await replayed(
        { spec: LOSSY, actions: [log.action("a")] },
        [1, 0, 1, 0, 0],
        swarm(false),
      );

      check.equal(
        seat,
        log.events,
        [
          ["input", "a", 0],
          ["a", 0, undefined],
          ["input", "a", 1],
          ["a", 0, undefined],
        ],
        "the states 1 and 0 after one call",
      );
    });

    it("runs the invariant after setup, after each step and after settle", async ({
      seat,
    }) => {
      const seen: unknown[][] = [];
      await replayed(
        {
          spec: counting(),
          actions: [new Log().action("a")],
          invariant: (_c, state) => seen.push(["invariant", state]),
          settle: (_c, state) => {
            seen.push(["settle", state]);
          },
        },
        [1, 0, 1, 0, 0],
        swarm(false),
      );

      check.equal(
        seat,
        seen,
        [
          ["invariant", 0],
          ["invariant", 1],
          ["invariant", 2],
          ["settle", 2],
          ["invariant", 2],
        ],
        "two steps",
      );
    });

    it("gives the functions of a machine without a spec the state undefined", async ({
      seat,
    }) => {
      const seen: unknown[] = [];
      const log = new Log();
      await replayed(
        {
          actions: [
            log.action("a", {
              enabled: (state) => {
                seen.push(state);
                return true;
              },
            }),
          ],
          invariant: (_c, state) => seen.push(state),
          settle: (_c, state) => {
            seen.push(state);
          },
        },
        [1, 0],
        swarm(false),
      );

      check.equal(
        seat,
        [seen, log.events[0]],
        [Array.from({ length: 6 }, () => undefined), ["input", "a", undefined]],
        "six calls of undefined",
      );
    });

    it("awaits the run of a step before the next step", async ({ seat }) => {
      const events: string[] = [];
      const { c } = bodyCase(replaying(1, 0, 1, 0, 0));
      const scheduler = new Scheduler(c, uniform());
      await steps(
        c,
        {
          actions: [
            {
              name: "a",
              run: async (_c, client) => {
                events.push(`start ${client}`);
                await scheduler.yield();
                events.push("end");
              },
            },
          ],
        },
        swarm(false),
      );

      check.equal(seat, events, ["start 0", "end", "start 0", "end"], "two steps");
    });

    it("lists a concurrent step as a flag, a client and an index", async ({ seat }) => {
      const log = new Log();
      const { c, engine } = bodyCase(replaying(0, 1, 2, 1, 0));
      await steps(c, { actions: [log.action("a"), log.action("b")] }, ...section(c));

      check.equal(
        seat,
        [
          engine.requests.slice(1, 4).map((request) => [request.bounds, request.edge]),
          engine.steps,
          engine.spans[0],
        ],
        [
          [
            [BINARY, 1n],
            [new IntegerBounds(0n, 2n), 0n],
            [BINARY, 0n],
          ],
          [[0, { action: "b", client: 2 }]],
          { label: "b", start: 1, end: 4, depth: 0, parent: undefined },
        ],
        "a step of b on client 2",
      );
    });

    it("requests every input of a section before any step runs", async ({ seat }) => {
      const log = new Log();
      const { c } = bodyCase(replaying(0, 1, 2, 0, 1, 1, 0, 0));
      await steps(c, { spec: counting(), actions: [log.action("a")] }, ...section(c));

      check.equal(
        seat,
        log.events,
        [
          ["input", "a", 0],
          ["input", "a", 0],
          ["a", 1, undefined],
          ["a", 2, undefined],
        ],
        "both inputs come from the state after the sequential steps",
      );
    });

    it("runs the steps of client 0 before the other clients start", async ({
      seat,
    }) => {
      const log = new Log();
      const { c } = bodyCase(replaying(0, 1, 1, 0, 1, 0, 0, 0));
      await steps(c, { actions: [log.action("a")] }, ...section(c));

      check.equal(
        seat,
        log.runs("a"),
        [
          ["a", 0, undefined],
          ["a", 1, undefined],
        ],
        "the step of client 1 is listed first and runs last",
      );
    });

    it("runs each other client as a task spawned in client order", async ({ seat }) => {
      const log = new Log();
      const { c } = bodyCase(replaying(0, 1, 1, 0, 1, 2, 0, 0, 1));
      await steps(c, { actions: [log.action("a")] }, ...section(c));

      check.equal(
        seat,
        log.runs("a"),
        [
          ["a", 2, undefined],
          ["a", 1, undefined],
        ],
        "release index 1 runs client 2 first",
      );
    });

    it("lets only the actions without enabled join a section", async ({ seat }) => {
      const log = new Log();
      const { c, engine } = bodyCase(replaying(0, 1, 1, 0, 0));
      await steps(
        c,
        { actions: [log.action("a"), log.action("b", { enabled: () => true })] },
        ...section(c),
      );

      check.equal(seat, engine.requests[3]?.bounds, ONE, "the index over a alone");
    });

    it("records no flag of a section without an eligible action", async ({ seat }) => {
      const log = new Log();
      const { c, engine } = bodyCase(replaying(0));
      await steps(
        c,
        { actions: [log.action("a", { enabled: () => true })] },
        ...section(c),
      );

      check.length(seat, engine.requests, 1, "the sequential flag alone");
    });

    it("chooses the client of a concurrent step uniformly", async ({ seat }) => {
      const got: unknown[] = [];
      const want: unknown[] = [];
      for (let seed = 0n; seed < 20n; seed += 1n) {
        const { c, engine } = bodyCase(new Generating(new Source(seed)));
        const twin = new Source(seed);
        await steps(c, { actions: [new Log().action("a")] }, ...section(c));
        const listed: bigint[] = [];
        while (listed.length < 16 && twin.coin(5n, 6n)) listed.push(twin.below(3n));
        got.push(engine.steps.map(([, step]) => step.client));
        want.push(listed.map(Number));
      }

      check.equal(seat, got, want, "below(3) after a coin of 5 in 6");
    });

    it("checks the history once every task of a section ends", async ({ seat }) => {
      const seen: unknown[] = [];
      const { c } = bodyCase(replaying(0, 1, 1, 0, 1, 2, 0, 1, 0, 0));
      await steps(
        c,
        {
          spec: counting(),
          actions: [new Log().action("a")],
          settle: (_c, state) => {
            seen.push(state);
          },
        },
        ...section(c),
      );

      check.equal(seat, seen, [3], "the count of every call of the section");
    });

    it("starts the drain from the state after the section", async ({ seat }) => {
      const log = new Log();
      const { c, engine } = bodyCase(replaying(0, 1, 1, 0, 1, 2, 0, 0, 0, 0));
      await steps(
        c,
        {
          spec: counting(),
          actions: [
            log.action("a"),
            log.action("d", { enabled: (state) => state === 2, drain: true }),
          ],
        },
        ...section(c, max(1)),
      );

      check.equal(
        seat,
        engine.steps.at(-1),
        [0, { action: "d", drain: true }],
        "d is enabled once the two calls are counted",
      );
    });

    it("ends a section that fails its check before the drain", async ({ seat }) => {
      const log = new Log();
      const { c } = bodyCase(replaying(0, 1, 1, 0, 1, 2, 0, 0, 0, 0));
      const err = await rejection(
        steps(
          c,
          {
            spec: counting((state) => (state === 1 ? [] : [state + 1])),
            actions: [
              log.action("a"),
              log.action("d", { enabled: () => true, drain: true }),
            ],
          },
          ...section(c),
        ),
      );

      check.equal(
        seat,
        [err instanceof Failed, log.runs("d")],
        [true, []],
        "the drain never runs",
      );
    });

    it("throws an Error for clients of 2 or more without tasks", async ({ seat }) => {
      const { c } = bodyCase(replaying());

      check.equal(
        seat,
        String(
          await rejection(steps(c, { actions: [new Log().action("a")] }, clients(2))),
        ),
        "Error: stateful: steps with clients(2) runs its clients as tasks, and no option states tasks(scheduler)",
        "the missing option",
      );
    });

    it("throws a RangeError for an action of a negative weight", async ({ seat }) => {
      const { c } = bodyCase(replaying());
      const err = await rejection(
        steps(c, { actions: [{ name: "a", weight: -1, run: () => undefined }] }),
      );

      check.errorIs(seat, err, RangeError, "a RangeError");
    });

    it("takes drain steps until no drain action is enabled", async ({ seat }) => {
      const engine = await replayed(
        draining(new Log(), { n: 0 }),
        [1, 0, 1, 0, 0],
        swarm(false),
      );

      check.equal(
        seat,
        [
          engine.steps.map(([, step]) => step),
          engine.requests.length,
          engine.requests.at(-1)?.bounds,
          engine.spans.at(-1),
        ],
        [
          [
            { action: "a" },
            { action: "a" },
            { action: "d", drain: true },
            { action: "d", drain: true },
          ],
          7,
          ONE,
          { label: "d", start: 6, end: 7, depth: 0, parent: undefined },
        ],
        "two sends, then two deliveries without a flag",
      );
    });

    it("runs the check and the invariant after each drain step", async ({ seat }) => {
      const log = new Log();
      await replayed(draining(log, { n: 0 }), [1, 0, 1, 0, 0], swarm(false));

      check.equal(
        seat,
        log.events.filter((event) => event[0] === "invariant").map((event) => event[1]),
        [0, 1, 2, 3, 4, 4],
        "the invariant counts every call",
      );
    });

    it("stops the drain after the most steps", async ({ seat }) => {
      const engine = await replayed(
        { actions: [new Log().action("d", { drain: true })] },
        [0],
        swarm(false),
        max(3),
      );

      check.equal(
        seat,
        engine.steps,
        Array.from({ length: 3 }, () => [0, { action: "d", drain: true }]),
        "three drain steps",
      );
    });

    it("keeps the actions that the step entries of a trace name", async ({ seat }) => {
      const log = new Log();
      const { c, engine } = bodyCase(new Tracing([{ action: "b" }]));
      await steps(c, { actions: ["a", "b", "c"].map((name) => log.action(name)) });

      check.equal(
        seat,
        [engine.choices.map((choice) => choice.value), engine.steps],
        [[0n, 1n, 0n, 1n, 0n, 0n], [[0, { action: "b" }]]],
        "the swarm disables a and c",
      );
    });

    it("decodes the draws of each step from a trace", async ({ seat }) => {
      const log = new Log();
      const { c } = bodyCase(
        new Tracing([
          { action: "a" },
          { label: "v", value: 4n },
          { action: "a" },
          { label: "v", value: 6n },
        ]),
      );
      await steps(c, { actions: [log.action("a", { draws: true })] });

      check.equal(
        seat,
        log.runs("a").map((event) => event[2]),
        [4n, 6n],
        "the inputs of the entries",
      );
    });

    it("throws a TraceError for a step entry whose action is not enabled", async ({
      seat,
    }) => {
      const { c } = bodyCase(new Tracing([{ action: "a" }]));
      const err = (await rejection(
        steps(c, { actions: [new Log().action("a", { enabled: () => false })] }),
      )) as TraceError;

      check.equal(
        seat,
        [err instanceof TraceError, err.entry, err.what, err.reason],
        [true, 0, "a", "step"],
        "the refusal",
      );
    });

    it("throws a TraceError for a step entry past the most steps", async ({ seat }) => {
      const { c } = bodyCase(new Tracing([{ action: "a" }, { action: "a" }]));
      const err = await rejection(
        steps(c, { actions: [new Log().action("a")] }, max(1)),
      );

      check.equal(seat, (err as TraceError).entry, 1, "the second entry");
    });

    it("takes the client of a concurrent step entry", async ({ seat }) => {
      const log = new Log();
      const { c, engine } = bodyCase(
        new Tracing([
          { action: "a", client: 2 },
          { action: "a", client: 1 },
        ]),
      );
      await steps(
        c,
        { actions: [log.action("a")] },
        clients(2),
        tasks(new Scheduler(c, uniform())),
      );

      check.equal(
        seat,
        [engine.steps, log.runs("a").map((event) => event[1])],
        [
          [
            [0, { action: "a", client: 2 }],
            [0, { action: "a", client: 1 }],
          ],
          [1, 2],
        ],
        "client 2 is listed first, and client 1 runs first",
      );
    });

    const tests: { name: string; give: number; want: [boolean, number, string] }[] = [
      { name: "a client outside the clients", give: 3, want: [true, 0, "step"] },
      { name: "a client below 0", give: -1, want: [true, 0, "step"] },
    ];
    for (const tt of tests) {
      it(`throws a TraceError for a concurrent step entry of ${tt.name}`, async ({
        seat,
      }) => {
        const { c } = bodyCase(new Tracing([{ action: "a", client: tt.give }]));
        const err = (await rejection(
          steps(
            c,
            { actions: [new Log().action("a")] },
            clients(2),
            tasks(new Scheduler(c, uniform())),
          ),
        )) as TraceError;

        check.equal(
          seat,
          [err instanceof TraceError, err.entry, err.reason],
          tt.want,
          "the refusal",
        );
      });
    }

    it("throws a TraceError for a concurrent step entry past the most steps", async ({
      seat,
    }) => {
      const { c } = bodyCase(
        new Tracing([
          { action: "a", client: 1 },
          { action: "a", client: 1 },
        ]),
      );
      const err = await rejection(
        steps(
          c,
          { actions: [new Log().action("a")] },
          clients(2),
          concurrent(1),
          tasks(new Scheduler(c, uniform())),
        ),
      );

      check.equal(seat, (err as TraceError).entry, 1, "the second entry");
    });

    it("throws a TraceError for a concurrent step entry where no section runs", async ({
      seat,
    }) => {
      const { c } = bodyCase(new Tracing([{ action: "a", client: 1 }]));
      const err = await rejection(steps(c, { actions: [new Log().action("a")] }));

      check.errorIs(seat, err, TraceError, "a TraceError");
    });

    it("chooses the action of a drain step entry among the drain actions", async ({
      seat,
    }) => {
      const delivered: string[] = [];
      let pending = 0;
      const deliver = (name: string): Action<unknown> => ({
        name,
        drain: true,
        enabled: () => pending > 0,
        run: () => {
          delivered.push(name);
          pending -= 1;
        },
      });
      const { c } = bodyCase(
        new Tracing([
          { action: "a" },
          { action: "e", drain: true },
          { action: "d", drain: true },
        ]),
      );
      await steps(c, {
        actions: [
          {
            name: "a",
            run: () => {
              pending += 2;
            },
          },
          deliver("d"),
          deliver("e"),
        ],
      });

      check.equal(seat, delivered, ["e", "d"], "e, then d");
    });

    it("throws a TraceError for a drain step entry after the drain", async ({
      seat,
    }) => {
      let pending = 0;
      const { c } = bodyCase(
        new Tracing([
          { action: "a" },
          { action: "d", drain: true },
          { action: "d", drain: true },
        ]),
      );
      const err = (await rejection(
        steps(c, {
          actions: [
            {
              name: "a",
              run: () => {
                pending += 1;
              },
            },
            {
              name: "d",
              drain: true,
              enabled: () => pending > 0,
              run: () => {
                pending -= 1;
              },
            },
          ],
        }),
      )) as TraceError;

      check.equal(seat, [err.entry, err.what], [2, "d"], "the second drain entry");
    });

    it("states the position and the action of each swarm choice", async ({ seat }) => {
      const log = new Log();
      const engine = await replayed(
        { actions: [log.action("a"), log.action("b")] },
        [1, 1],
        max(0),
      );

      check.equal(
        seat,
        engine.wheres.slice(0, 2).map((where) => where.place),
        [
          { part: "swarm", position: 0, action: "a" },
          { part: "swarm", position: 1, action: "b" },
        ],
        "each choice at its action",
      );
    });

    it("states the position of a sequential step and then its action", async ({
      seat,
    }) => {
      const log = new Log();
      const engine = await replayed(
        {
          actions: [log.action("a", { draws: true }), log.action("b", { draws: true })],
        },
        [1, 1, 7, 1, 0, 3, 0],
        swarm(false),
      );
      const first = { part: "sequential", position: 0 };
      const second = { part: "sequential", position: 1 };

      check.equal(
        seat,
        engine.wheres,
        [
          { label: undefined, place: first },
          { label: undefined, place: first },
          { label: "v", place: { part: "sequential", position: 0, action: "b" } },
          { label: undefined, place: second },
          { label: undefined, place: second },
          { label: "v", place: { part: "sequential", position: 1, action: "a" } },
          { label: undefined, place: { part: "sequential", position: 2 } },
        ],
        "the flag and the index state the step, and the input its action too",
      );
    });

    it("states the position of a drain step and then its action", async ({ seat }) => {
      let pending = 1;
      const engine = await replayed(
        {
          actions: [
            {
              name: "d",
              drain: true,
              enabled: () => pending > 0,
              run: (c) => {
                c.draw(DIGIT, "w");
                pending = 0;
              },
            },
          ],
        },
        [0, 0, 4],
        swarm(false),
      );

      check.equal(
        seat,
        engine.wheres,
        [
          { label: undefined, place: { part: "sequential", position: 0 } },
          { label: undefined, place: { part: "drain", position: 0 } },
          { label: "w", place: { part: "drain", position: 0, action: "d" } },
        ],
        "the index states the step, and the draw its action too",
      );
    });

    it("states the position of a concurrent step and none while the steps run", async ({
      seat,
    }) => {
      const { c, engine } = bodyCase(replaying(0, 1, 1, 0, 0, 0));
      await steps(
        c,
        { actions: [{ name: "a", run: (c) => c.observe(9n) }] },
        ...section(c),
      );
      const listed = { label: undefined, place: { part: "concurrent", position: 0 } };

      check.equal(
        seat,
        [engine.wheres, engine.observed],
        [
          [
            { label: undefined, place: { part: "sequential", position: 0 } },
            listed,
            listed,
            listed,
            { label: undefined, place: { part: "concurrent", position: 1 } },
            { label: undefined, place: { part: "concurrent" } },
          ],
          [{ label: undefined, place: { part: "concurrent" } }],
        ],
        "the release has no position",
      );
    });

    it("states the parts of setup and settle", async ({ seat }) => {
      const engine = await replayed(
        {
          actions: [new Log().action("a")],
          invariant: (c) => c.observe(0n),
          settle: (c) => c.observe(1n),
        },
        [0],
        swarm(false),
      );

      check.equal(
        seat,
        engine.observed.map((where) => where.place),
        [{ part: "setup" }, { part: "settle" }, { part: "settle" }],
        "the invariant in setup, then settle and the invariant in settle",
      );
    });

    it("restores the place of the case when the steps end", async ({ seat }) => {
      const { c, engine } = bodyCase(replaying(0));
      engine.place = { part: "outer" };
      await steps(c, { actions: [new Log().action("a")] }, swarm(false));

      check.equal(seat, engine.place, { part: "outer" }, "the place before the steps");
    });
  });
});
