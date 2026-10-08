/**
 * The task scheduler: which ready task runs next, decided by the choices of
 * a case.
 */

import { type Case, onEngine } from "../prop/case.js";
import { IntegerBounds, UINT64_MAX } from "../prop/engine/choice.js";
import type { Strategy } from "./strategy.js";

/** The bounds of a task's priority under PCT, and of the count of a change point. */
const UNSIGNED = new IntegerBounds(0n, UINT64_MAX);

/** The bounds of the presence choice of a change point. */
const PRESENCE = new IntegerBounds(0n, 1n);

/** How a task's turn ended: at a yield, or when the task settled. */
type Ending = "yielded" | "settled";

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
  /** Resumes the task where it awaits its yield, and undefined until it yields. */
  resume: (() => void) | undefined;
}

/**
 * Releases the tasks of one case, one at a time, in an order that the
 * case's choices decide, so a schedule replays and shrinks as the case's
 * values do.
 *
 * A task is an async function that spawn makes ready, and that runs only
 * while the scheduler releases it: until it awaits yield, or until it
 * settles. A library cannot intercept a native await, so a task states each
 * point where another task may run with `await scheduler.yield()`. run makes
 * the choice of each release, and waits for the turn of each released task
 * to end.
 *
 * A task must not await a promise that only another task of the scheduler
 * settles: the other task runs only after the awaiting task's turn ends, so
 * run waits until the test's timeout ends it.
 */
export class Scheduler {
  readonly #case: Case;
  readonly #strategy: Strategy;
  /** The ready tasks, in the order that they became ready. */
  readonly #ready: Task[] = [];
  /** The level of the task that the last change point lowered. */
  #lowest = 0;
  #running = false;
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
   */
  constructor(c: Case, strategy: Strategy) {
    this.#case = c;
    this.#strategy = strategy;
  }

  /**
   * Makes task ready after every ready task. Under PCT, the task first
   * receives its priority, a choice of the case. The task does not run until
   * a release starts it.
   *
   * @param task - The task, an async function.
   */
  spawn(task: () => Promise<void>): void {
    const priority =
      this.#strategy.depth > 0 ? onEngine(this.#case, (e) => e.integer(UNSIGNED)) : 0n;
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
    const task = this.#current;
    if (task === undefined) return Promise.resolve();
    const end = this.#end;
    if (end === undefined) {
      throw new Error("stateful: a task called yield() again in one turn");
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    task.resume = resolve;
    end("yielded");
    return promise;
  }

  /**
   * Makes the change points of PCT, and then releases one ready task at a
   * time until none is ready. A task may spawn others while it runs. A task
   * that throws or rejects ends the run: run drops the other tasks and
   * rejects with what the task threw.
   *
   * @returns A promise that settles when no task is ready.
   * @throws Error for a call by a task of the scheduler while run releases
   *   it, and for a task that settled after a yield that it did not await.
   */
  async run(): Promise<void> {
    if (this.#running) {
      throw new Error("stateful: a task called run() of its own scheduler");
    }
    this.#running = true;
    try {
      const points = this.#changePoints();
      for (let release = 0n; this.#ready.length > 0; release += 1n) {
        const task = this.#next();
        for (const point of points) {
          if (point !== release) continue;
          this.#lowest -= 1;
          task.level = this.#lowest;
        }
        if ((await this.#release(task)) === "yielded") this.#ready.push(task);
        const raised = this.#raised;
        if (raised !== undefined) {
          this.#raised = undefined;
          this.#ready.length = 0;
          throw raised.error;
        }
      }
    } finally {
      this.#running = false;
    }
  }

  /** Returns the counts of the change points of a run: up to depth − 1 under PCT, and none under the uniform strategy. */
  #changePoints(): bigint[] {
    return onEngine(this.#case, (e) => {
      const points: bigint[] = [];
      for (let i = 1; i < this.#strategy.depth; i += 1) {
        if (e.integer(PRESENCE, 1n) === 1n) points.push(e.integer(UNSIGNED));
      }
      return points;
    });
  }

  /**
   * Removes the task to release from the ready tasks and returns it: under
   * PCT the task of the highest level and then the highest priority, the
   * earliest ready among equals, and otherwise the case's choice among the
   * ready tasks.
   */
  #next(): Task {
    const index = this.#strategy.depth > 0 ? this.#highest() : this.#uniform();
    return this.#ready.splice(index, 1)[0] as Task;
  }

  /** Returns the case's choice of an index into the ready tasks, uniform with target 0. */
  #uniform(): number {
    const count = BigInt(this.#ready.length);
    const bounds = new IntegerBounds(0n, count - 1n);
    const index = onEngine(this.#case, (e) =>
      e.choose({ bounds, draw: (source) => source.below(count), edge: 0n }),
    );
    return Number(index);
  }

  /** Returns the index of the ready task of the highest level and then the highest priority, the earliest ready among equals. */
  #highest(): number {
    let best = 0;
    this.#ready.forEach((task, i) => {
      const top = this.#ready[best] as Task;
      if (
        task.level > top.level ||
        (task.level === top.level && task.priority > top.priority)
      ) {
        best = i;
      }
    });
    return best;
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
      // A started task is ready again only after it yielded.
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
