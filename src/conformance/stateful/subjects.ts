/**
 * The machine subjects of the definition, which a machines vector names.
 *
 * Every subject records each call of a client in the case's history, without
 * keys, and completes it as ok with its output:
 *
 * - queue-loses-on-wrap: a bounded queue of a capacity drawn under
 *   `capacity` from [1, 8]. put writes its value at the write index and
 *   returns true, or returns false when the queue is full. get returns the
 *   oldest value, or null when the queue is empty. When the write index is
 *   at the last slot, put writes the value into the first slot instead, and
 *   the index wraps to the first slot. The actions are put, whose input is
 *   drawn under `v` from [0, 1000], and get. The spec is a bounded queue of
 *   the capacity.
 * - correct-queue: the same machine over a queue that writes every value at
 *   its write index.
 * - counter-overflows: a counter whose increment adds one and returns the
 *   count, and whose reset sets it to 0 and returns null. When an increment
 *   takes the count to 3, the counter sets it to 0 and returns 0. The
 *   actions are increment and reset, and the spec is a counter.
 * - store-loses-on-crash: a store that puts a value under a key into a
 *   buffer, moves the buffer into its durable map on flush, and empties the
 *   buffer on crash. The actions are put, whose input is a key drawn under
 *   `key` from [0, 3] and the next value of a count from 1, flush, a drain
 *   action enabled while the buffer is not empty, and crash. The machine has
 *   no spec. The drain empties the buffer, and settle then reads the durable
 *   value of every key that a put returned for. It fails with the record of
 *   lost-write when the value is not the last one put.
 * - racy-counter: a counter whose increment reads the count, yields to the
 *   task scheduler, writes the count plus one and returns it. The action is
 *   increment, the spec a counter, and the clients run as tasks of a
 *   scheduler.
 * - correct-counter: the same machine over an increment that adds one and
 *   returns the count without yielding.
 * - counter-refuses-every-third: a counter that refuses every third
 *   increment, counted over every case of the run. A refused increment
 *   completes as failed with the error `refused`, and leaves the count. Any
 *   other increment adds one and returns the count, and read returns the
 *   count. The actions are increment, enabled while the spec's count is
 *   below 3, and read. The spec is a counter.
 *
 * Each subject is built anew for every run, so a subject that counts over
 * the cases of a run starts each run at 0.
 */

import { Failure } from "../../failure.js";
import type { Operation, Spec } from "../../history/spec.js";
import type { Case } from "../../prop/case.js";
import { integer } from "../../prop/generators.js";
import { type Option, tasks } from "../../stateful/option.js";
import { Scheduler } from "../../stateful/scheduler.js";
import { steps } from "../../stateful/steps.js";
import type { Strategy } from "../../stateful/strategy.js";

/** The options of a subject's steps, those of a concurrent section, and the strategy of a subject's scheduler. */
export interface Setup {
  /** The options that every subject takes: mean, max and swarm. */
  readonly steps: readonly Option[];
  /** The options of a concurrent section: clients and concurrent. */
  readonly section: readonly Option[];
  /** The strategy of the scheduler that a subject with a concurrent section makes in each case. */
  readonly strategy: Strategy;
}

/** A subject: it builds its subject and runs its machine in a case. */
export type Subject = (c: Case, setup: Setup) => Promise<void>;

/** The draws of the subjects. */
const CAPACITIES = integer(1, 8);
const VALUES = integer(0, 1000);
const KEYS = integer(0, 3);

/** The count at which counter-overflows sets its count to 0. */
const OVERFLOW = 3;

/** The interval of the increments that counter-refuses-every-third refuses, counted over a run, and their error. */
const REFUSAL = 3;
const REFUSED = "refused";

/** The count of the spec below which counter-refuses-every-third enables its increment. */
const LIMIT = 3;

/** The assertion and the contract of the record of store-loses-on-crash's settle. */
const LOST = "lost-write";
const DURABLE = "the store keeps every acknowledged put";

/** A bounded queue in a ring of slots. A ring that loses on wrap writes the value of a put at the last slot into the first slot. */
class Ring {
  readonly #slots: (number | null)[];
  readonly #losesOnWrap: boolean;
  #head = 0;
  #tail = 0;
  #size = 0;

  constructor(capacity: number, losesOnWrap: boolean) {
    this.#slots = new Array<number | null>(capacity).fill(null);
    this.#losesOnWrap = losesOnWrap;
  }

  /** Adds value, and reports whether the ring had room for it. */
  put(value: number): boolean {
    const capacity = this.#slots.length;
    if (this.#size === capacity) return false;
    const last = this.#tail === capacity - 1;
    this.#slots[last && this.#losesOnWrap ? 0 : this.#tail] = value;
    this.#tail = last ? 0 : this.#tail + 1;
    this.#size += 1;
    return true;
  }

  /** Removes and returns the oldest value, or null for an empty ring. */
  get(): number | null {
    if (this.#size === 0) return null;
    const value = this.#slots[this.#head] as number | null;
    this.#head = (this.#head + 1) % this.#slots.length;
    this.#size -= 1;
    return value;
  }
}

/** A state of the spec of a bounded queue: its values, the oldest first. */
type Queued = readonly number[];

/**
 * Returns the spec of a queue of at most capacity values: put appends its
 * value while the queue has room, and get returns the oldest value and
 * removes it, and leaves an empty queue empty. It specifies the calls of the
 * queue subjects, whose put reports the room that the spec counts, and whose
 * get of an empty queue returns null.
 */
function boundedQueue(capacity: number): Spec<Queued> {
  const put = (state: Queued, op: Operation): Queued[] => [
    state.length === capacity ? state : [...state, op.args[0] as number],
  ];
  const get = (state: Queued, op: Operation): Queued[] => {
    if (state.length === 0) return [state];
    return op.returned(state[0]) ? [state.slice(1)] : [];
  };
  return {
    initial: () => [],
    next: (state, op) => (op.name === "put" ? put(state, op) : get(state, op)),
  };
}

/**
 * The spec of a counter: increment returns the new count, reset sets the
 * count to 0, and read returns the count.
 */
const COUNTER: Spec<number> = {
  initial: () => 0,
  next: (state, op) => {
    if (op.name === "reset") return [0];
    const after = op.name === "read" ? state : state + 1;
    return op.returned(after) ? [after] : [];
  },
};

/** Runs the queue machine over a ring of a drawn capacity. */
async function queue(c: Case, setup: Setup, losesOnWrap: boolean): Promise<void> {
  const capacity = c.draw(CAPACITIES, "capacity");
  const ring = new Ring(capacity, losesOnWrap);
  await steps(
    c,
    {
      spec: boundedQueue(capacity),
      actions: [
        {
          name: "put",
          input: (c) => c.draw(VALUES, "v"),
          run: (c, client, value) => {
            const call = c.history().invoke(client, "put", [value]);
            call.ok(ring.put(value as number));
          },
        },
        {
          name: "get",
          run: (c, client) => {
            const call = c.history().invoke(client, "get", []);
            call.ok(ring.get());
          },
        },
      ],
    },
    ...setup.steps,
  );
}

/** Runs the counter machine over a counter that overflows at OVERFLOW. */
async function counterOverflows(c: Case, setup: Setup): Promise<void> {
  let count = 0;
  await steps(
    c,
    {
      spec: COUNTER,
      actions: [
        {
          name: "increment",
          run: (c, client) => {
            const call = c.history().invoke(client, "increment", []);
            count = (count + 1) % OVERFLOW;
            call.ok(count);
          },
        },
        {
          name: "reset",
          run: (c, client) => {
            const call = c.history().invoke(client, "reset", []);
            count = 0;
            call.ok(null);
          },
        },
      ],
    },
    ...setup.steps,
  );
}

/** Runs the store machine, whose settle reads every acknowledged put. */
async function storeLosesOnCrash(c: Case, setup: Setup): Promise<void> {
  const durable = new Map<number, number>();
  const buffer = new Map<number, number>();
  const acknowledged = new Map<number, number>();
  let written = 0;
  await steps(
    c,
    {
      actions: [
        {
          name: "put",
          input: (c) => {
            const key = c.draw(KEYS, "key");
            written += 1;
            return [key, written];
          },
          run: (c, client, input) => {
            const [key, stored] = input as [number, number];
            const call = c.history().invoke(client, "put", [key, stored]);
            buffer.set(key, stored);
            call.ok(null);
            acknowledged.set(key, stored);
          },
        },
        {
          name: "flush",
          enabled: () => buffer.size > 0,
          drain: true,
          run: () => {
            for (const [key, stored] of buffer) durable.set(key, stored);
            buffer.clear();
          },
        },
        { name: "crash", run: () => buffer.clear() },
      ],
      settle: (c) => {
        for (const [key, stored] of acknowledged) {
          if (durable.get(key) !== stored) {
            c.report(new Failure(LOST, DURABLE, { key, lost: stored }), true);
          }
        }
      },
    },
    ...setup.steps,
  );
}

/** Runs the counter machine on clients that run as tasks, over an increment that may yield between its read and its write. */
async function sharedCounter(c: Case, setup: Setup, racy: boolean): Promise<void> {
  const scheduler = new Scheduler(c, setup.strategy);
  let count = 0;
  await steps(
    c,
    {
      spec: COUNTER,
      actions: [
        {
          name: "increment",
          run: async (c, client) => {
            const call = c.history().invoke(client, "increment", []);
            const read = count;
            if (racy) await scheduler.yield();
            count = read + 1;
            call.ok(count);
          },
        },
      ],
    },
    ...setup.steps,
    ...setup.section,
    tasks(scheduler),
  );
}

/** Returns counter-refuses-every-third, with no increment counted yet. */
function refusingCounter(): Subject {
  let increments = 0;
  return async (c, setup) => {
    let count = 0;
    await steps(
      c,
      {
        spec: COUNTER,
        actions: [
          {
            name: "increment",
            enabled: (state) => state < LIMIT,
            run: (c, client) => {
              const call = c.history().invoke(client, "increment", []);
              increments += 1;
              if (increments % REFUSAL === 0) {
                call.fail(REFUSED);
                return;
              }
              count += 1;
              call.ok(count);
            },
          },
          {
            name: "read",
            run: (c, client) => c.history().invoke(client, "read", []).ok(count),
          },
        ],
      },
      ...setup.steps,
    );
  };
}

/** The subjects of the definition, by name. Each entry returns a subject for one run. */
export const SUBJECTS: ReadonlyMap<string, () => Subject> = new Map<
  string,
  () => Subject
>([
  ["queue-loses-on-wrap", () => (c, setup) => queue(c, setup, true)],
  ["correct-queue", () => (c, setup) => queue(c, setup, false)],
  ["counter-overflows", () => counterOverflows],
  ["store-loses-on-crash", () => storeLosesOnCrash],
  ["racy-counter", () => (c, setup) => sharedCounter(c, setup, true)],
  ["correct-counter", () => (c, setup) => sharedCounter(c, setup, false)],
  ["counter-refuses-every-third", refusingCounter],
]);
