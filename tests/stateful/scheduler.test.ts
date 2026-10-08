/**
 * The spec of the task scheduler: its releases, its yields, and the choices
 * of its two strategies. Each order and each choice is that of the
 * definition's reference implementation on the same tasks and values.
 */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { Generating } from "../../src/prop/engine/case.js";
import { IntegerBounds, UINT64_MAX } from "../../src/prop/engine/choice.js";
import { Source } from "../../src/prop/engine/source.js";
import { Scheduler } from "../../src/stateful/scheduler.js";
import { pct, type Strategy, uniform } from "../../src/stateful/strategy.js";
import { test as it } from "../../src/vitest.js";
import { bodyCase, replaying } from "../helpers.js";

/** Returns a scheduler of strategy over a case that replays integer values, its engine case, and an empty log. */
function started(strategy: Strategy, ...values: number[]) {
  const { c, engine } = bodyCase(replaying(...values));
  return { scheduler: new Scheduler(c, strategy), engine, log: [] as string[] };
}

/** Returns a task that logs name and its part, and yields between parts. */
function task(scheduler: Scheduler, log: string[], name: string, parts: number) {
  return async () => {
    for (let part = 1; part <= parts; part += 1) {
      log.push(`${name}${part}`);
      if (part < parts) await scheduler.yield();
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

      check.equal(seat, log, ["p1", "b1", "c1", "p2"], "c runs before p resumes");
    });

    it("requests a priority under PCT for each task", ({ seat }) => {
      const { scheduler, engine, log } = started(pct(3));
      scheduler.spawn(task(scheduler, log, "a", 1));
      scheduler.spawn(task(scheduler, log, "b", 1));

      check.equal(
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

      check.equal(
        seat,
        String(await rejection(scheduler.run())),
        "Error: stateful: a task called yield() again in one turn",
        "the misuse",
      );
    });
  });

  describe("Scheduler.run", () => {
    it("makes a task that yields wait behind the ready tasks", async ({ seat }) => {
      const { scheduler, log } = started(uniform());
      scheduler.spawn(task(scheduler, log, "a", 3));
      scheduler.spawn(task(scheduler, log, "b", 2));
      await scheduler.run();

      check.equal(seat, log, ["a1", "b1", "a2", "b2", "a3"], "a and b alternate");
    });

    it("releases the task at the index that each release chooses", async ({ seat }) => {
      const { scheduler, log } = started(uniform(), 1, 0, 0);
      scheduler.spawn(task(scheduler, log, "a", 2));
      scheduler.spawn(task(scheduler, log, "b", 2));
      await scheduler.run();

      check.equal(seat, log, ["b1", "a1", "b2", "a2"], "b first, then behind a");
    });

    it("records the uniform choice of a release with one ready task", async ({
      seat,
    }) => {
      const { scheduler, engine, log } = started(uniform());
      scheduler.spawn(task(scheduler, log, "a", 1));
      scheduler.spawn(task(scheduler, log, "b", 2));
      await scheduler.run();

      check.equal(
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
        for (const name of ["a", "b", "c"])
          scheduler.spawn(task(scheduler, [], name, 1));
        await scheduler.run();
        got.push(engine.choices.map((choice) => choice.value as bigint));
        want.push([twin.below(3n), twin.below(2n), 0n]);
      }

      check.equal(seat, got, want, "below(3), below(2), then no draw");
    });

    it("throws an Error for a task that calls run", async ({ seat }) => {
      const { scheduler } = started(uniform());
      scheduler.spawn(async () => {
        await scheduler.run();
      });

      check.equal(
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

      check.equal(
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

      check.equal(seat, await rejection(scheduler.run()), broken, "the error");
    });

    it("runs the tasks spawned after a run that a task ended", async ({ seat }) => {
      const { scheduler, log } = started(uniform());
      scheduler.spawn(async () => {
        throw new Error("broken");
      });
      await rejection(scheduler.run());
      scheduler.spawn(task(scheduler, log, "a", 1));
      await scheduler.run();

      check.equal(seat, log, ["a1"], "the second run");
    });

    it("rejects for a task that settles after a yield that it did not await", async ({
      seat,
    }) => {
      const { scheduler } = started(uniform());
      scheduler.spawn(async () => {
        void scheduler.yield();
      });

      check.equal(
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

      check.equal(
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

      check.equal(seat, log, ["b1", "b2", "b3", "a1", "a2"], "b has priority 5");
    });

    it("runs the earliest ready task first among equal PCT priorities", async ({
      seat,
    }) => {
      const { scheduler, log } = started(pct(1));
      scheduler.spawn(task(scheduler, log, "a", 2));
      scheduler.spawn(task(scheduler, log, "b", 2));
      await scheduler.run();

      check.equal(seat, log, ["a1", "b1", "a2", "b2"], "a and b alternate");
    });

    it("requests a presence and a count for each PCT change point", async ({
      seat,
    }) => {
      const { scheduler, engine, log } = started(pct(3), 0, 0, 1, 9, 0);
      scheduler.spawn(task(scheduler, log, "a", 1));
      scheduler.spawn(task(scheduler, log, "b", 1));
      await scheduler.run();
      const wide = new IntegerBounds(0n, UINT64_MAX);

      check.equal(
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

      check.equal(seat, log, ["a1", "b1", "b2", "a2"], "a falls at release 0");
    });

    it("drops the task of a later change point lower still", async ({ seat }) => {
      const { scheduler, log } = started(pct(3), 9, 8, 7, 1, 0, 1, 1);
      for (const name of ["a", "b", "c"])
        scheduler.spawn(task(scheduler, log, name, 2));
      await scheduler.run();

      check.equal(
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

      check.equal(seat, log, ["a1", "d1", "c1", "a2", "d2"], "d falls at release 1");
    });

    it("makes no choice for a PCT release", async ({ seat }) => {
      const { scheduler, engine, log } = started(pct(1));
      scheduler.spawn(task(scheduler, log, "a", 1));
      scheduler.spawn(task(scheduler, log, "b", 1));
      await scheduler.run();

      check.equal(
        seat,
        [engine.requests.length, log],
        [2, ["a1", "b1"]],
        "the two priorities alone",
      );
    });
  });
});
