// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the task scheduler: its releases, its yields, and the choices
 * of its two strategies. Each order and each choice is that of the
 * definition's reference implementation on the same tasks and values.
 */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { Generating } from "../../src/prop/engine/case/providers.js";
import { IntegerBounds, UINT64_MAX } from "../../src/prop/engine/choice.js";
import { Source } from "../../src/prop/engine/source.js";
import {
  EPOCH,
  MAX_RELEASES,
  maxReleases,
  Scheduler,
} from "../../src/stateful/scheduler.js";
import { pct, type Strategy, uniform } from "../../src/stateful/strategy.js";
import { test as it } from "../../src/vitest.js";
import { bodyCase, ending, failingOf, replaying, thrown } from "../helpers.js";

/** Returns a scheduler of strategy over a case that replays integer values, the case, its engine case, and an empty log. */
function started(strategy: Strategy, ...values: number[]) {
  const { c, engine } = bodyCase(replaying(...values));
  return { c, scheduler: new Scheduler(c, strategy), engine, log: [] as string[] };
}

/** Returns a uniform scheduler of at most n releases over a case that replays no value, the case, its engine case, and an empty log. */
function limited(n: number) {
  const { c, engine } = bodyCase(replaying());
  return {
    c,
    scheduler: new Scheduler(c, uniform(), maxReleases(n)),
    engine,
    log: [] as string[],
  };
}

/** The instant at which the clock of a scheduler starts, in milliseconds since the Unix epoch. */
const MIDNIGHT = Date.UTC(2000, 0, 1);

/** Returns the milliseconds that the clock of scheduler has advanced. */
function elapsed(scheduler: Scheduler): number {
  return scheduler.clock().now() - MIDNIGHT;
}

/** Returns a task that logs name and 1, waits until ready returns true, and logs name and 2. */
function waiting(
  scheduler: Scheduler,
  log: string[],
  name: string,
  ready: () => boolean,
) {
  return async () => {
    log.push(`${name}1`);
    await scheduler.wait(ready);
    log.push(`${name}2`);
  };
}

/** Returns a task that sleeps each period of periods in milliseconds in turn, and logs the time of each wake. */
function ticking(
  scheduler: Scheduler,
  log: string[],
  name: string,
  periods: readonly number[],
) {
  return async () => {
    for (const period of periods) {
      await scheduler.clock().sleep(period);
      log.push(`${name}@${elapsed(scheduler)}`);
    }
  };
}

/** Returns a task that logs name and 1, sets flag, yields, and logs name and 2. */
function setting(
  scheduler: Scheduler,
  log: string[],
  name: string,
  flag: { set: boolean },
) {
  return async () => {
    log.push(`${name}1`);
    flag.set = true;
    await scheduler.yield();
    log.push(`${name}2`);
  };
}

/** Returns a task that logs name and its part, and yields between parts. */
function task(scheduler: Scheduler, log: string[], name: string, parts: number) {
  return async () => {
    for (let part = 1; part <= parts; part += 1) {
      log.push(`${name}${part}`);
      if (part < parts) {
        await scheduler.yield();
      }
    }
  };
}

/** Returns what promise rejects with, or undefined when it fulfils. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return undefined;
}

/** The bounds of a choice between two values. */
const BINARY = new IntegerBounds(0n, 1n);

/** The bounds of a choice of one value. */
const ONE = new IntegerBounds(0n, 0n);

describe("scheduler", () => {
  describe("new Scheduler", () => {
    it("returns a scheduler without a ready task", async ({ seat }) => {
      const { scheduler, engine } = started(uniform());
      await scheduler.run();

      check.isEmpty(seat, engine.requests, "no release");
    });

    it("releases at most a million tasks in one run by default", ({ seat }) => {
      check.isEqualTo(seat, MAX_RELEASES, 1_000_000, "the default of the definition");
    });

    it("applies the last maxReleases of its options", async ({ seat }) => {
      const { c } = bodyCase(replaying());
      const scheduler = new Scheduler(c, uniform(), maxReleases(1), maxReleases(3));
      const log: string[] = [];
      scheduler.spawn(task(scheduler, log, "a", 3));
      await scheduler.run();

      check.isEqualTo(seat, log, ["a1", "a2", "a3"], "three releases pass");
    });

    it("ends a parked task when its case ends", async ({ seat }) => {
      const { c, scheduler, log } = started(uniform());
      const flag = { set: false };
      await ending(c, async () => {
        scheduler.spawn(waiting(scheduler, log, "a", () => flag.set));
        await scheduler.run();
      });
      flag.set = true;
      await scheduler.run();

      check.isEqualTo(seat, log, ["a1"], "the task does not return from its wait");
    });
  });

  describe("Scheduler.spawn", () => {
    it("makes a task that a task spawns ready behind the ready tasks", async ({
      seat,
    }) => {
      const { scheduler, log } = started(uniform());
      scheduler.spawn(async () => {
        log.push("p1");
        scheduler.spawn(task(scheduler, log, "c", 1));
        await scheduler.yield();
        log.push("p2");
      });
      scheduler.spawn(task(scheduler, log, "b", 1));
      await scheduler.run();

      check.isEqualTo(seat, log, ["p1", "b1", "c1", "p2"], "c runs before p resumes");
    });

    it("requests a priority under PCT for each task", ({ seat }) => {
      const { scheduler, engine, log } = started(pct(3));
      scheduler.spawn(task(scheduler, log, "a", 1));
      scheduler.spawn(task(scheduler, log, "b", 1));

      check.isEqualTo(
        seat,
        engine.requests.map((request) => [request.bounds, request.edge]),
        [
          [new IntegerBounds(0n, UINT64_MAX), undefined],
          [new IntegerBounds(0n, UINT64_MAX), undefined],
        ],
        "two priorities",
      );
    });
  });

  describe("Scheduler.yield", () => {
    it("returns a settled promise outside a task", async ({ seat }) => {
      const { scheduler, engine } = started(uniform());
      await scheduler.yield();

      check.isEmpty(seat, engine.requests, "no release");
    });

    it("throws an Error for a second call in one turn", async ({ seat }) => {
      const { scheduler } = started(uniform());
      scheduler.spawn(async () => {
        void scheduler.yield();
        await scheduler.yield();
      });

      check.isEqualTo(
        seat,
        String(await rejection(scheduler.run())),
        "Error: stateful: a task called yield() again in one turn",
        "the misuse",
      );
    });
  });

  describe("Scheduler.wait", () => {
    it("makes a waiting task ready once another task makes its condition true", async ({
      seat,
    }) => {
      const { scheduler, log } = started(uniform());
      const flag = { set: false };
      scheduler.spawn(waiting(scheduler, log, "a", () => flag.set));
      scheduler.spawn(setting(scheduler, log, "b", flag));
      await scheduler.run();

      check.isEqualTo(
        seat,
        log,
        ["a1", "b1", "b2", "a2"],
        "a runs once b set the flag",
      );
    });

    it("returns from run while a task waits", async ({ seat }) => {
      const { scheduler, log } = started(uniform());
      const flag = { set: false };
      scheduler.spawn(waiting(scheduler, log, "a", () => flag.set));
      await scheduler.run();
      const parked = [...log];
      flag.set = true;
      await scheduler.run();

      check.isEqualTo(
        seat,
        [parked, log],
        [["a1"], ["a1", "a2"]],
        "the next run wakes the task",
      );
    });

    it("continues the turn of a wait whose condition is true", async ({ seat }) => {
      const { scheduler, engine, log } = started(uniform());
      scheduler.spawn(waiting(scheduler, log, "a", () => true));
      await scheduler.run();

      check.isEqualTo(
        seat,
        [log, engine.requests.length],
        [["a1", "a2"], 1],
        "one release",
      );
    });

    it("makes woken tasks ready after the ready tasks in the order of their waits", async ({
      seat,
    }) => {
      const { scheduler, log } = started(uniform());
      const flag = { set: false };
      scheduler.spawn(waiting(scheduler, log, "w", () => flag.set));
      scheduler.spawn(waiting(scheduler, log, "v", () => flag.set));
      scheduler.spawn(setting(scheduler, log, "s", flag));
      await scheduler.run();

      check.isEqualTo(
        seat,
        log,
        ["w1", "v1", "s1", "s2", "w2", "v2"],
        "s yields before the wake, and w waited before v",
      );
    });

    it("rejects with what a condition throws between two turns", async ({ seat }) => {
      const { scheduler, log } = started(uniform());
      const broken = new Error("broken");
      let calls = 0;
      scheduler.spawn(
        waiting(scheduler, log, "w", () => {
          calls += 1;
          if (calls > 1) {
            throw broken;
          }
          return false;
        }),
      );
      scheduler.spawn(task(scheduler, log, "a", 1));

      check.isEqualTo(
        seat,
        [await rejection(scheduler.run()), log],
        [broken, ["w1"]],
        "the run ends before a",
      );
    });

    it("returns a settled promise outside a task for a condition that is true", async ({
      seat,
    }) => {
      const { scheduler, engine } = started(uniform());
      await scheduler.wait(() => true);

      check.isEmpty(seat, engine.requests, "no release");
    });

    it("throws an Error outside a task for a condition that is false", ({ seat }) => {
      const { scheduler } = started(uniform());

      check.isEqualTo(
        seat,
        thrown(() => scheduler.wait(() => false)),
        "stateful: a wait outside a task waits for a condition that is false",
        "the body cannot park",
      );
    });

    it("throws an Error for a wait in a turn that a yield ended", async ({ seat }) => {
      const { scheduler } = started(uniform());
      scheduler.spawn(async () => {
        void scheduler.yield();
        await scheduler.wait(() => false);
      });

      check.isEqualTo(
        seat,
        String(await rejection(scheduler.run())),
        "Error: stateful: a task called wait() again in one turn",
        "the misuse",
      );
    });
  });

  describe("Scheduler.clock", () => {
    it("starts the clock at midnight UTC 2000-01-01", ({ seat }) => {
      const { scheduler } = started(uniform());

      check.isEqualTo(
        seat,
        [scheduler.clock().now(), EPOCH],
        [MIDNIGHT, BigInt(MIDNIGHT) * 1_000_000n],
        "the instant in milliseconds and in nanoseconds",
      );
    });

    it("stays at its time through a run", async ({ seat }) => {
      const { scheduler, log } = started(uniform());
      scheduler.spawn(ticking(scheduler, log, "t", [4]));
      await scheduler.run();

      check.isEqualTo(
        seat,
        [log, elapsed(scheduler)],
        [[], 0],
        "the task still sleeps",
      );
    });

    it("continues the turn of a sleep of no time", async ({ seat }) => {
      const { scheduler, engine, log } = started(uniform());
      scheduler.spawn(ticking(scheduler, log, "t", [0, 0]));
      await scheduler.run();

      check.isEqualTo(
        seat,
        [log, engine.requests.length],
        [["t@0", "t@0"], 1],
        "one release",
      );
    });

    it("wakes a sleep of a fraction of a millisecond at its nanosecond", async ({
      seat,
    }) => {
      const { scheduler, log } = started(uniform());
      scheduler.spawn(ticking(scheduler, log, "t", [0.25]));
      await scheduler.advance(1);

      check.isEqualTo(seat, log, ["t@0.25"], "the task wakes at 0.25 ms");
    });

    it("returns a settled promise outside a task for a sleep of no time", async ({
      seat,
    }) => {
      const { scheduler, engine } = started(uniform());
      await scheduler.clock().sleep(0);

      check.isEmpty(seat, engine.requests, "no release");
    });

    it("throws an Error outside a task for a sleep of a positive duration", ({
      seat,
    }) => {
      const { scheduler } = started(uniform());

      check.isEqualTo(
        seat,
        thrown(() => scheduler.clock().sleep(1)),
        "stateful: a sleep outside a task waits for a clock that only the body moves",
        "the body cannot park",
      );
    });

    it("throws a RangeError for a sleep of no finite duration", ({ seat }) => {
      const { scheduler } = started(uniform());

      check.isEqualTo(
        seat,
        thrown(() => scheduler.clock().sleep(Number.NaN)),
        "stateful: sleep(NaN) states no finite duration",
        "the refusal",
      );
    });
  });

  describe("Scheduler.advance", () => {
    it("runs each tick at its own deadline", async ({ seat }) => {
      const { scheduler, log } = started(uniform());
      scheduler.spawn(ticking(scheduler, log, "t", [4, 4, 4]));
      await scheduler.advance(10);
      const first = [[...log], elapsed(scheduler)];
      await scheduler.advance(2);

      check.isEqualTo(
        seat,
        [first, [log, elapsed(scheduler)]],
        [
          [["t@4", "t@8"], 10],
          [["t@4", "t@8", "t@12"], 12],
        ],
        "ticks at 4 and 8 within 10 ms, and at 12 in 2 ms more",
      );
    });

    it("ends a sleep whose deadline is the end time within the advance", async ({
      seat,
    }) => {
      const { scheduler, log } = started(uniform());
      scheduler.spawn(ticking(scheduler, log, "t", [4]));
      await scheduler.advance(4);

      check.isEqualTo(seat, log, ["t@4"], "a sleep of 4 ms ends within 4 ms");
    });

    it("wakes tasks in the order of their deadlines and then of their sleeps", async ({
      seat,
    }) => {
      const { scheduler, log } = started(uniform());
      scheduler.spawn(ticking(scheduler, log, "c", [6]));
      scheduler.spawn(ticking(scheduler, log, "a", [2]));
      scheduler.spawn(ticking(scheduler, log, "b", [6]));
      await scheduler.advance(6);

      check.isEqualTo(
        seat,
        log,
        ["a@2", "c@6", "b@6"],
        "c and b share a deadline, and c slept first",
      );
    });

    it("releases the ready tasks without a move of the clock for no time", async ({
      seat,
    }) => {
      const { scheduler, log } = started(uniform());
      scheduler.spawn(task(scheduler, log, "a", 2));
      await scheduler.advance(0);

      check.isEqualTo(
        seat,
        [log, elapsed(scheduler)],
        [["a1", "a2"], 0],
        "as a run releases them",
      );
    });

    it("moves the clock by nothing for a negative duration", async ({ seat }) => {
      const { scheduler } = started(uniform());
      await scheduler.advance(-5);

      check.isEqualTo(seat, elapsed(scheduler), 0, "the clock stays at its start");
    });

    it("throws an Error for a task that calls advance", async ({ seat }) => {
      const { scheduler } = started(uniform());
      scheduler.spawn(async () => {
        await scheduler.advance(1);
      });

      check.isEqualTo(
        seat,
        String(await rejection(scheduler.run())),
        "Error: stateful: a task called advance() of its own scheduler",
        "the nested advance",
      );
    });

    it("makes the change points of one run over its deadlines", async ({ seat }) => {
      const { scheduler, engine, log } = started(pct(2));
      scheduler.spawn(ticking(scheduler, log, "t", [4, 4]));
      await scheduler.advance(10);

      check.isEqualTo(
        seat,
        [log, engine.requests.map((request) => request.bounds)],
        [
          ["t@4", "t@8"],
          [new IntegerBounds(0n, UINT64_MAX), BINARY],
        ],
        "one priority, then one presence for the depth of 2",
      );
    });

    it("rejects with a RangeError for a duration that is no finite number", async ({
      seat,
    }) => {
      const { scheduler } = started(uniform());

      check.isEqualTo(
        seat,
        String(await rejection(scheduler.advance(Number.POSITIVE_INFINITY))),
        "RangeError: stateful: advance(Infinity) states no finite duration",
        "the refusal",
      );
    });
  });

  describe("Scheduler.run", () => {
    it("makes a task that yields wait behind the ready tasks", async ({ seat }) => {
      const { scheduler, log } = started(uniform());
      scheduler.spawn(task(scheduler, log, "a", 3));
      scheduler.spawn(task(scheduler, log, "b", 2));
      await scheduler.run();

      check.isEqualTo(seat, log, ["a1", "b1", "a2", "b2", "a3"], "a and b alternate");
    });

    it("releases the task at the index that each release chooses", async ({ seat }) => {
      const { scheduler, log } = started(uniform(), 1, 0, 0);
      scheduler.spawn(task(scheduler, log, "a", 2));
      scheduler.spawn(task(scheduler, log, "b", 2));
      await scheduler.run();

      check.isEqualTo(seat, log, ["b1", "a1", "b2", "a2"], "b first, then behind a");
    });

    it("records the uniform choice of a release with one ready task", async ({
      seat,
    }) => {
      const { scheduler, engine, log } = started(uniform());
      scheduler.spawn(task(scheduler, log, "a", 1));
      scheduler.spawn(task(scheduler, log, "b", 2));
      await scheduler.run();

      check.isEqualTo(
        seat,
        engine.requests.map((request) => [request.bounds, request.edge]),
        [
          [BINARY, 0n],
          [ONE, 0n],
          [ONE, 0n],
        ],
        "a choice for each of three releases",
      );
    });

    it("draws a uniform release below the number of ready tasks", async ({ seat }) => {
      const got: bigint[][] = [];
      const want: bigint[][] = [];
      for (let seed = 0n; seed < 20n; seed += 1n) {
        const { c, engine } = bodyCase(new Generating(new Source(seed)));
        const twin = new Source(seed);
        const scheduler = new Scheduler(c, uniform());
        for (const name of ["a", "b", "c"]) {
          scheduler.spawn(task(scheduler, [], name, 1));
        }
        await scheduler.run();
        got.push(engine.choices.map((choice) => choice.value as bigint));
        want.push([twin.below(3n), twin.below(2n), 0n]);
      }

      check.isEqualTo(seat, got, want, "below(3), below(2), then no draw");
    });

    it("throws an Error for a task that calls run", async ({ seat }) => {
      const { scheduler } = started(uniform());
      scheduler.spawn(async () => {
        await scheduler.run();
      });

      check.isEqualTo(
        seat,
        String(await rejection(scheduler.run())),
        "Error: stateful: a task called run() of its own scheduler",
        "the nested run",
      );
    });

    it("rejects with what a task throws", async ({ seat }) => {
      const { scheduler, log } = started(uniform());
      const broken = new Error("broken");
      scheduler.spawn(async () => {
        throw broken;
      });
      scheduler.spawn(task(scheduler, log, "b", 1));

      check.isEqualTo(
        seat,
        [await rejection(scheduler.run()), log],
        [broken, []],
        "the run ends before b",
      );
    });

    it("rejects with what a task throws as it starts", async ({ seat }) => {
      const { scheduler } = started(uniform());
      const broken = new Error("broken");
      scheduler.spawn(() => {
        throw broken;
      });

      check.isEqualTo(seat, await rejection(scheduler.run()), broken, "the error");
    });

    it("runs the tasks spawned after a run that a task ended", async ({ seat }) => {
      const { scheduler, log } = started(uniform());
      scheduler.spawn(async () => {
        throw new Error("broken");
      });
      await rejection(scheduler.run());
      scheduler.spawn(task(scheduler, log, "a", 1));
      await scheduler.run();

      check.isEqualTo(seat, log, ["a1"], "the second run");
    });

    it("rejects for a task that settles after a yield that it did not await", async ({
      seat,
    }) => {
      const { scheduler } = started(uniform());
      scheduler.spawn(async () => {
        void scheduler.yield();
      });

      check.isEqualTo(
        seat,
        String(await rejection(scheduler.run())),
        "Error: stateful: a task settled after a yield() that it did not await",
        "the misuse",
      );
    });

    it("rejects for a task that settles in the turn of another task", async ({
      seat,
    }) => {
      const { scheduler } = started(uniform());
      const { promise: gate, resolve: open } = Promise.withResolvers<void>();
      scheduler.spawn(async () => {
        void scheduler.yield();
        await gate;
      });
      scheduler.spawn(async () => {
        open();
        await Promise.resolve();
        await Promise.resolve();
      });

      check.isEqualTo(
        seat,
        String(await rejection(scheduler.run())),
        "Error: stateful: a task settled after a yield() that it did not await",
        "the first task settles while the second runs",
      );
    });

    it("runs the task of the highest PCT priority through its yields", async ({
      seat,
    }) => {
      const { scheduler, log } = started(pct(1), 1, 5);
      scheduler.spawn(task(scheduler, log, "a", 2));
      scheduler.spawn(task(scheduler, log, "b", 3));
      await scheduler.run();

      check.isEqualTo(seat, log, ["b1", "b2", "b3", "a1", "a2"], "b has priority 5");
    });

    it("runs the earliest ready task first among equal PCT priorities", async ({
      seat,
    }) => {
      const { scheduler, log } = started(pct(1));
      scheduler.spawn(task(scheduler, log, "a", 2));
      scheduler.spawn(task(scheduler, log, "b", 2));
      await scheduler.run();

      check.isEqualTo(seat, log, ["a1", "b1", "a2", "b2"], "a and b alternate");
    });

    it("requests a presence and a count for each PCT change point", async ({
      seat,
    }) => {
      const { scheduler, engine, log } = started(pct(3), 0, 0, 1, 9, 0);
      scheduler.spawn(task(scheduler, log, "a", 1));
      scheduler.spawn(task(scheduler, log, "b", 1));
      await scheduler.run();
      const wide = new IntegerBounds(0n, UINT64_MAX);

      check.isEqualTo(
        seat,
        engine.requests.map((request) => [request.bounds, request.edge]),
        [
          [wide, undefined],
          [wide, undefined],
          [BINARY, 1n],
          [wide, undefined],
          [BINARY, 1n],
        ],
        "two priorities, then a present and an absent change point",
      );
    });

    it("drops the task that a change point releases below every other task", async ({
      seat,
    }) => {
      const { scheduler, log } = started(pct(2), 5, 1, 1, 0);
      scheduler.spawn(task(scheduler, log, "a", 2));
      scheduler.spawn(task(scheduler, log, "b", 2));
      await scheduler.run();

      check.isEqualTo(seat, log, ["a1", "b1", "b2", "a2"], "a falls at release 0");
    });

    it("drops the task of a later change point lower still", async ({ seat }) => {
      const { scheduler, log } = started(pct(3), 9, 8, 7, 1, 0, 1, 1);
      for (const name of ["a", "b", "c"]) {
        scheduler.spawn(task(scheduler, log, name, 2));
      }
      await scheduler.run();

      check.isEqualTo(
        seat,
        log,
        ["a1", "b1", "c1", "c2", "a2", "b2"],
        "a falls at release 0 and b at release 1",
      );
    });

    it("drops a spawned task of a higher priority below the task before it", async ({
      seat,
    }) => {
      const { scheduler, log } = started(pct(3), 5, 1, 1, 0, 1, 1, 9);
      scheduler.spawn(async () => {
        log.push("a1");
        scheduler.spawn(task(scheduler, log, "d", 2));
        await scheduler.yield();
        log.push("a2");
      });
      scheduler.spawn(task(scheduler, log, "c", 1));
      await scheduler.run();

      check.isEqualTo(
        seat,
        log,
        ["a1", "d1", "c1", "a2", "d2"],
        "d falls at release 1",
      );
    });

    it("makes no choice for a PCT release", async ({ seat }) => {
      const { scheduler, engine, log } = started(pct(1));
      scheduler.spawn(task(scheduler, log, "a", 1));
      scheduler.spawn(task(scheduler, log, "b", 1));
      await scheduler.run();

      check.isEqualTo(
        seat,
        [engine.requests.length, log],
        [2, ["a1", "b1"]],
        "the two priorities alone",
      );
    });

    it("keeps the PCT priority of a task through a wait", async ({ seat }) => {
      const { scheduler, log } = started(pct(1), 9, 1, 1);
      const flag = { set: false };
      scheduler.spawn(waiting(scheduler, log, "a", () => flag.set));
      scheduler.spawn(setting(scheduler, log, "b", flag));
      scheduler.spawn(task(scheduler, log, "c", 1));
      await scheduler.run();

      check.isEqualTo(
        seat,
        log,
        ["a1", "b1", "a2", "c1", "b2"],
        "a has priority 9, and c became ready before b yielded",
      );
    });

    it("fails the case once it has released the most tasks while a task is still ready", async ({
      seat,
    }) => {
      const { c, scheduler, engine } = limited(5);
      const signal = await ending(c, async () => {
        scheduler.spawn(async () => {
          for (;;) {
            await scheduler.yield();
          }
        });
        await scheduler.run();
      });

      check.isEqualTo(
        seat,
        [failingOf(signal).failure.contract, engine.requests.length],
        [
          "the task scheduler released 5 tasks in one run, and a task is still ready",
          5,
        ],
        "a task that yields without an end fails the case after five releases",
      );
    });

    it("counts the releases of each run on its own", async ({ seat }) => {
      const { scheduler, log } = limited(3);
      scheduler.spawn(task(scheduler, log, "a", 3));
      await scheduler.run();
      scheduler.spawn(task(scheduler, log, "b", 3));
      await scheduler.run();

      check.isEqualTo(
        seat,
        log,
        ["a1", "a2", "a3", "b1", "b2", "b3"],
        "two runs of three releases",
      );
    });

    it("counts the releases of an advance over its deadlines", async ({ seat }) => {
      const { c, scheduler, log } = limited(2);
      const signal = await ending(c, async () => {
        scheduler.spawn(ticking(scheduler, log, "t", [1, 1, 1]));
        await scheduler.advance(5);
      });

      check.isEqualTo(
        seat,
        [failingOf(signal).failure.contract, log],
        [
          "the task scheduler released 2 tasks in one run, and a task is still ready",
          ["t@1"],
        ],
        "the third release is past the limit",
      );
    });
  });

  describe("maxReleases", () => {
    it("returns the option of the most releases", ({ seat }) => {
      check.isEqualTo(seat, maxReleases(5), { maxReleases: 5 }, "five releases");
    });

    const refusals = [
      { name: "throws a RangeError for no release", give: 0 },
      { name: "throws a RangeError for a count that is no integer", give: 2.5 },
    ];
    for (const tt of refusals) {
      it(tt.name, ({ seat }) => {
        check.isEqualTo(
          seat,
          thrown(() => maxReleases(tt.give)),
          `stateful: maxReleases(${tt.give}) is no integer of 1 or more`,
          "maxReleases refuses the count",
        );
      });
    }
  });
});
