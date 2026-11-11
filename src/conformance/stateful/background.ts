// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The machine subjects of the definition that spawn tasks of their own on a
 * scheduler of the case before the steps:
 *
 * - register-flushes-in-two-parts: a register of a buffer and a durable
 *   value, both initially null. write sets the buffer to its value and
 *   returns null. read returns the buffer when it is set, and the durable
 *   value otherwise. A flusher task waits until the buffer is set, takes the
 *   value and sets the buffer to null, yields, sets the durable value to the
 *   value that it took, and waits again. The actions are write, whose input
 *   is drawn under `v` from [0, 1000], and read. The spec is a register, and
 *   the clients of the concurrent section run on the scheduler of the
 *   flusher.
 * - register-flushes: the same machine over a flusher that sets the durable
 *   value and the buffer without a yield between.
 * - ticker-skips-its-first-tick: a ticker task that sleeps 4 ms on the clock
 *   of the scheduler and then adds one to its count, four times, and that
 *   skips the first addition. The actions are advance, which advances the
 *   scheduler by the milliseconds that the case draws under `ms` from
 *   [0, 10], and read, which returns the count. The spec counts the
 *   milliseconds of the advances.
 * - ticker: the same machine over a ticker that adds one at each tick.
 * - spins-until-a-flag: a machine whose action spin spawns a task that
 *   yields until a flag is set, and runs the scheduler. No action sets the
 *   flag, and the machine has no spec.
 */

import type { Spec } from "../../history/spec.js";
import type { Case } from "../../prop/case.js";
import { integer } from "../../prop/generators.js";
import { tasks } from "../../stateful/option.js";
import { maxReleases, Scheduler } from "../../stateful/scheduler.js";
import { steps } from "../../stateful/steps.js";
import type { Setup } from "./subjects.js";

/** The draw of the values of a write. */
const VALUES = integer(0, 1000);

/** The milliseconds that the ticker sleeps before each of its ticks, and its ticks. */
const PERIOD = 4;
const TICKS = 4;

/** The draw of the milliseconds of an advance. */
const MILLISECONDS = integer(0, 10);

/** The spec of a register, initially null: write leaves its value, and read returns the value. */
const REGISTER: Spec<unknown> = {
  initial: () => null,
  next: (state, op) => {
    if (op.name === "write") {
      return [op.args[0]];
    }
    return op.returned(state) ? [state] : [];
  },
};

/**
 * The spec of the ticker: the milliseconds that the advances add. read
 * returns the milliseconds divided by the period, rounded down and at most
 * the number of ticks.
 */
const TICKED: Spec<number> = {
  initial: () => 0,
  next: (state, op) => {
    if (op.name === "advance") {
      return [state + (op.args[0] as number)];
    }
    return op.returned(Math.min(TICKS, Math.floor(state / PERIOD))) ? [state] : [];
  },
};

/**
 * Returns a scheduler of c with the strategy and the most releases of
 * setup.
 *
 * @param c - The case whose choices decide the releases.
 * @param setup - The setup of the subject.
 * @returns The scheduler.
 */
export function schedulerOf(c: Case, setup: Setup): Scheduler {
  return new Scheduler(c, setup.strategy, maxReleases(setup.maxReleases));
}

/**
 * Runs the register machine on clients that run as tasks, over a buffer
 * that a flusher task moves into the durable value.
 *
 * @param c - The case.
 * @param setup - The setup of the subject.
 * @param inTwoParts - Whether the flusher yields between its two parts.
 * @returns A promise that settles when the steps have ended.
 */
export async function flushedRegister(
  c: Case,
  setup: Setup,
  inTwoParts: boolean,
): Promise<void> {
  const scheduler = schedulerOf(c, setup);
  let buffer: unknown = null;
  let durable: unknown = null;
  const filled = (): boolean => buffer !== null;
  scheduler.spawn(async () => {
    for (;;) {
      await scheduler.wait(filled);
      const taken = buffer;
      buffer = null;
      if (inTwoParts) {
        await scheduler.yield();
      }
      durable = taken;
    }
  });
  await steps(
    c,
    {
      spec: REGISTER,
      actions: [
        {
          name: "write",
          input: (step) => step.draw(VALUES, "v"),
          run: (step, client, value) => {
            const call = step.history().invoke(client, "write", [value]);
            buffer = value;
            call.ok(null);
          },
        },
        {
          name: "read",
          run: (step, client) => {
            const call = step.history().invoke(client, "read", []);
            call.ok(buffer === null ? durable : buffer);
          },
        },
      ],
    },
    ...setup.steps,
    ...setup.section,
    tasks(scheduler),
  );
}

/**
 * Runs the ticker machine, whose advance moves the clock of the scheduler
 * of the ticker task.
 *
 * @param c - The case.
 * @param setup - The setup of the subject.
 * @param skipsFirst - Whether the ticker skips the addition of its first tick.
 * @returns A promise that settles when the steps have ended.
 */
export async function ticker(
  c: Case,
  setup: Setup,
  skipsFirst: boolean,
): Promise<void> {
  const scheduler = schedulerOf(c, setup);
  let count = 0;
  scheduler.spawn(async () => {
    for (let tick = 0; tick < TICKS; tick += 1) {
      await scheduler.clock().sleep(PERIOD);
      if (tick > 0 || !skipsFirst) {
        count += 1;
      }
    }
  });
  await steps(
    c,
    {
      spec: TICKED,
      actions: [
        {
          name: "advance",
          input: (step) => step.draw(MILLISECONDS, "ms"),
          run: async (step, client, ms) => {
            const call = step.history().invoke(client, "advance", [ms]);
            await scheduler.advance(ms as number);
            call.ok(null);
          },
        },
        {
          name: "read",
          run: (step, client) => step.history().invoke(client, "read", []).ok(count),
        },
      ],
    },
    ...setup.steps,
  );
}

/**
 * Runs the machine whose one action spawns a task that yields without an
 * end, so the run of the scheduler reaches its most releases.
 *
 * @param c - The case.
 * @param setup - The setup of the subject.
 * @returns A promise that settles when the steps have ended.
 */
export async function spinner(c: Case, setup: Setup): Promise<void> {
  const scheduler = schedulerOf(c, setup);
  await steps(
    c,
    {
      actions: [
        {
          name: "spin",
          run: async () => {
            scheduler.spawn(async () => {
              // The spin is the behaviour of the subject: the task stays ready.
              for (;;) {
                await scheduler.yield();
              }
            });
            await scheduler.run();
          },
        },
      ],
    },
    ...setup.steps,
  );
}
