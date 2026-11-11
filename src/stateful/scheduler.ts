// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The task scheduler: which ready task runs next, decided by the choices of
 * a case, and the clock on which its tasks sleep.
 */

import type { Clock } from "../clock.js";
import type { Case } from "../prop/case.js";
import { Parked } from "./parked.js";
import { changePoints, pick, priorityOf, type Strategy } from "./strategy.js";

/** The nanoseconds of a millisecond. */
const MILLISECOND = 1_000_000n;

/** How a task's turn ended: at a yield, at a wait or a sleep, or when the task settled. */
type Ending = "yielded" | "parked" | "settled";

/** A spawned task. */
interface Task {
  /** The task's function. */
  readonly start: () => unknown;
  /** The task's priority under PCT. */
  readonly priority: bigint;
  /** 0 until a change point lowers the task, and each lowering gives it a level below every level before. */
  level: number;
  /** Whether a release has started the task. */
  started: boolean;
  /** Resumes the task where it awaits its yield, its wait or its sleep, and undefined until it awaits one. */
  resume: (() => void) | undefined;
}

/** Returns a duration of call in milliseconds as nanoseconds, rounded to a nanosecond. */
function nanoseconds(call: string, ms: number): bigint {
  if (!Number.isFinite(ms)) {
    throw new RangeError(`stateful: ${call}(${ms}) states no finite duration`);
  }
  return BigInt(Math.round(ms * Number(MILLISECOND)));
}

/** Returns a time in nanoseconds as milliseconds, exact to the nanosecond below 2^53 whole milliseconds. */
function millisecondsOf(ns: bigint): number {
  return Number(ns / MILLISECOND) + Number(ns % MILLISECOND) / Number(MILLISECOND);
}

/** The instant at which the clock of every scheduler starts, midnight UTC 2000-01-01, in nanoseconds since the Unix epoch. */
export const EPOCH = 946_684_800_000_000_000n;

/** The most tasks that one run or one advance releases by default. */
export const MAX_RELEASES = 1_000_000;

/** An option of a Scheduler, which maxReleases returns. */
export interface SchedulerOption {
  /** The most tasks that one run or one advance releases. */
  readonly maxReleases: number;
}

/**
 * Sets the most tasks that one run or one advance of a scheduler releases,
 * 1,000,000 by default. A run or an advance that has released n tasks while
 * a task is still ready ends every task, and fails the case with the
 * message "the task scheduler released n tasks in one run, and a task is
 * still ready". Under the uniform strategy each release is a choice of the
 * case, so a case passes the option maxChoices of prop first unless the run
 * raises it. The last maxReleases of a scheduler applies.
 *
 * @param n - The most releases, at least 1.
 * @returns The option for the Scheduler.
 * @throws RangeError for an n that is no integer of 1 or more.
 */
export function maxReleases(n: number): SchedulerOption {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`stateful: maxReleases(${n}) is no integer of 1 or more`);
  }
  return { maxReleases: n };
}

/**
 * Releases the tasks of one case, one at a time, in an order that the
 * case's choices decide, so a schedule replays and shrinks as the case's
 * values do.
 *
 * A task is an async function that spawn makes ready, and that runs only
 * while the scheduler releases it: until it awaits yield, wait or the sleep
 * of the scheduler's clock, or until it settles. A library cannot intercept
 * a native await, so a task states each point where another task may run
 * with `await scheduler.yield()`. A task that awaits wait or sleep is parked
 * and not ready. run makes the choice of each release, waits for the turn
 * of each released task to end, and returns once no task is ready, also
 * while a task is parked.
 *
 * The scheduler checks its parked tasks at the start of each run and each
 * advance, after each turn, and after each move of its clock. It makes
 * ready, after every ready task, each sleeping task whose deadline the clock
 * has passed, by deadline and then in the order of the sleeps, and then each
 * waiting task whose condition returns true, in the order of the waits. A
 * task that yields joins the ready tasks before the tasks that the end of
 * its turn wakes.
 *
 * A task must not await a promise that only another task of the scheduler
 * settles: the other task runs only after the awaiting task's turn ends, so
 * run waits until the test's timeout ends it. When its case ends, the
 * scheduler ends every task that has not settled, so a parked task does not
 * return from its wait or its sleep.
 */
export class Scheduler {
  readonly #case: Case;
  readonly #strategy: Strategy;
  /** The most releases of one run or one advance. */
  readonly #maxReleases: bigint;
  /** The ready tasks, in the order that they became ready. */
  readonly #ready: Task[] = [];
  /** The tasks that wait or sleep. */
  readonly #parked = new Parked<Task>();
  /** The time of the clock, in nanoseconds since the Unix epoch. */
  #now = EPOCH;
  /** The level of the task that the last change point lowered. */
  #lowest = 0;
  #running: boolean;
  /** The released task, and undefined while no task is released. */
  #current: Task | undefined;
  /** Ends the turn of the released task, and undefined once the turn has ended. */
  #end: ((ending: Ending) => void) | undefined;
  /** What a task threw, or the misuse of a task, and undefined while there is none. */
  #raised: { readonly error: unknown } | undefined;

  /**
   * Returns a scheduler that releases the tasks of c by strategy.
   *
   * @param c - The case whose choices decide the releases.
   * @param strategy - How the scheduler chooses the task to release.
   * @param options - The options of the scheduler, such as maxReleases.
   */
  constructor(c: Case, strategy: Strategy, ...options: SchedulerOption[]) {
    this.#case = c;
    this.#strategy = strategy;
    this.#maxReleases = BigInt(options.at(-1)?.maxReleases ?? MAX_RELEASES);
    this.#running = false;
    c.cleanup(() => this.#drop());
  }

  /**
   * Makes task ready after every ready task. Under PCT, the task first
   * receives its priority, a choice of the case. The task does not run until
   * a release starts it.
   *
   * @param task - The task, an async function.
   */
  spawn(task: () => Promise<void>): void {
    const priority = priorityOf(this.#case, this.#strategy);
    this.#ready.push({
      start: task,
      priority,
      level: 0,
      started: false,
      resume: undefined,
    });
  }

  /**
   * Ends the turn of the released task, which becomes ready again after
   * every ready task and continues at its next release. Outside a task, such
   * as on client 0 of a machine's steps, it returns a settled promise, so the
   * caller continues at once.
   *
   * @returns A promise that settles when the task's next turn starts.
   * @throws Error for a second call in one turn, of a task that did not
   *   await the first.
   */
  yield(): Promise<void> {
    if (this.#current === undefined) {
      return Promise.resolve();
    }
    return this.#suspend("yield()", "yielded", () => undefined);
  }

  /**
   * Parks the released task until condition returns true. A wait whose
   * condition returns true at the call returns a settled promise, so the
   * task continues its turn. The scheduler calls condition between two
   * turns, and a condition reads the state of the subject without a change
   * to it. A condition that throws ends the run with what it threw. Outside
   * a task, the body cannot park, so a wait returns a settled promise for a
   * condition that returns true.
   *
   * @param condition - The condition that ends the wait.
   * @returns A promise that settles when the task's next turn starts.
   * @throws Error outside a task for a condition that returns false, and
   *   for a second call in one turn.
   */
  wait(condition: () => boolean): Promise<void> {
    if (condition()) {
      return Promise.resolve();
    }
    if (this.#current === undefined) {
      throw new Error(
        "stateful: a wait outside a task waits for a condition that is false",
      );
    }
    return this.#suspend("wait()", "parked", (task) =>
      this.#parked.wait(task, condition),
    );
  }

  /**
   * Returns the clock of the scheduler. The clock reads milliseconds since
   * the Unix epoch, midnight UTC 2000-01-01 until advance moves it, and only
   * advance moves it. Its sleep parks the released task until the clock has
   * passed the duration, rounded to a nanosecond. A sleep of zero or less
   * returns a settled promise. A sleep of a positive duration outside a task
   * throws an Error, because only the body can advance the clock that it
   * waits for. A duration that is no finite number throws a RangeError.
   *
   * @returns The clock.
   */
  clock(): Clock {
    return {
      now: () => millisecondsOf(this.#now),
      sleep: (duration) => this.#sleep(duration),
    };
  }

  /**
   * Makes the change points of PCT, and then releases one ready task at a
   * time until none is ready. A task may spawn others while it runs. A task
   * that throws or rejects ends the run: run ends every task and rejects
   * with what the task threw. The run does not move the clock, so a task
   * that sleeps stays parked until an advance.
   *
   * @returns A promise that settles when no task is ready.
   * @throws Error for a call by a task of the scheduler while run releases
   *   it, and for a task that settled after a yield that it did not await.
   */
  async run(): Promise<void> {
    await this.#releasing("run", async () => {
      this.#wake();
      await this.#releaseAll(changePoints(this.#case, this.#strategy), 0n);
    });
  }

  /**
   * Releases tasks as run does, and moves the clock by duration, deadline by
   * deadline. Once no task is ready, the advance moves the clock to the
   * earliest deadline of a sleeping task, or to its end time when no
   * deadline is due before it. The tasks of that deadline then run at its
   * time, so a task that sleeps again measures its next deadline from there.
   * The advance returns when the clock reads its end time and no task is
   * ready. A duration of zero or less moves the clock by nothing. Under PCT,
   * the change points count the releases of the whole advance from 0.
   *
   * @param duration - The milliseconds by which the clock moves.
   * @returns A promise that settles when the clock reads the end time and no
   *   task is ready.
   * @throws Error as run throws, and for a call by a task of the scheduler.
   * @throws RangeError for a duration that is no finite number.
   */
  async advance(duration: number): Promise<void> {
    const moved = nanoseconds("advance", duration);
    await this.#releasing("advance", async () => {
      const end = this.#now + (moved > 0n ? moved : 0n);
      this.#wake();
      const points = changePoints(this.#case, this.#strategy);
      let release = 0n;
      do {
        release = await this.#releaseAll(points, release);
        this.#now = this.#parked.earliest(end);
        this.#wake();
      } while (this.#ready.length > 0 || this.#now !== end);
    });
  }

  /** Parks the released task until the clock has passed duration, and returns at once for a duration of zero or less. */
  #sleep(duration: number): Promise<void> {
    const slept = nanoseconds("sleep", duration);
    if (slept <= 0n) {
      return Promise.resolve();
    }
    if (this.#current === undefined) {
      throw new Error(
        "stateful: a sleep outside a task waits for a clock that only the body moves",
      );
    }
    return this.#suspend("sleep()", "parked", (task) =>
      this.#parked.sleep(task, this.#now + slept),
    );
  }

  /**
   * Ends the turn of the released task with ending, keeps the task with
   * keep, and returns a promise that settles when its next turn starts.
   */
  #suspend(member: string, ending: Ending, keep: (task: Task) => void): Promise<void> {
    const task = this.#current as Task;
    const end = this.#end;
    if (end === undefined) {
      throw new Error(`stateful: a task called ${member} again in one turn`);
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    task.resume = resolve;
    keep(task);
    end(ending);
    return promise;
  }

  /** Runs release as the call of a run or an advance, and ends every task when it throws. */
  async #releasing(call: string, release: () => Promise<void>): Promise<void> {
    if (this.#running) {
      throw new Error(`stateful: a task called ${call}() of its own scheduler`);
    }
    this.#running = true;
    try {
      await release();
    } catch (err) {
      this.#drop();
      throw err;
    } finally {
      this.#running = false;
    }
  }

  /**
   * Releases one ready task at a time until none is ready, counting the
   * releases from release, and returns the count after the last one. A run
   * that has released the most releases while a task is still ready fails
   * the case.
   */
  async #releaseAll(points: readonly bigint[], release: bigint): Promise<bigint> {
    let released = release;
    while (this.#ready.length > 0) {
      if (released === this.#maxReleases) {
        this.#case.fail(
          `the task scheduler released ${released} tasks in one run, and a task is still ready`,
        );
      }
      const index = pick(this.#case, this.#strategy, this.#ready);
      const task = this.#ready.splice(index, 1)[0] as Task;
      for (const point of points) {
        if (point === released) {
          this.#lowest -= 1;
          task.level = this.#lowest;
        }
      }
      released += 1n;
      if ((await this.#release(task)) === "yielded") {
        this.#ready.push(task);
      }
      const raised = this.#raised;
      if (raised !== undefined) {
        this.#raised = undefined;
        throw raised.error;
      }
      this.#wake();
    }
    return released;
  }

  /** Makes ready, after every ready task, each parked task that the clock or its condition wakes. */
  #wake(): void {
    this.#ready.push(...this.#parked.wake(this.#now));
  }

  /** Ends every task that has not settled: none of them runs again. */
  #drop(): void {
    this.#ready.length = 0;
    this.#parked.clear();
  }

  /** Releases task, and returns how its turn ended. */
  async #release(task: Task): Promise<Ending> {
    const { promise, resolve } = Promise.withResolvers<Ending>();
    this.#current = task;
    this.#end = (ending) => {
      this.#end = undefined;
      resolve(ending);
    };
    if (task.started) {
      // A started task is ready again only after it yielded or parked.
      (task.resume as () => void)();
    } else {
      task.started = true;
      this.#start(task);
    }
    try {
      return await promise;
    } finally {
      this.#current = undefined;
    }
  }

  /** Starts task, and ends its turn when it settles. */
  #start(task: Task): void {
    let settled: Promise<unknown>;
    try {
      settled = Promise.resolve(task.start());
    } catch (err) {
      settled = Promise.reject(err);
    }
    settled.then(
      () => this.#settle(task, undefined),
      (error: unknown) => this.#settle(task, { error }),
    );
  }

  /**
   * Ends the turn of task, which settled, and keeps what it threw. A task
   * that settles outside its turn did not await a yield, and the run ends
   * with that misuse.
   */
  #settle(task: Task, threw: { readonly error: unknown } | undefined): void {
    const ended = this.#current === task ? this.#end : undefined;
    const misuse =
      ended === undefined
        ? {
            error: new Error(
              "stateful: a task settled after a yield() that it did not await",
            ),
          }
        : undefined;
    this.#raised ??= threw ?? misuse;
    ended?.("settled");
  }
}
