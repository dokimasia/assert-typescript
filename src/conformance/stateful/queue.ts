// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The machine of the queue subjects queue-loses-on-wrap and correct-queue:
 * a bounded queue in a ring of slots, and the spec of a bounded queue.
 */

import type { Operation, Spec } from "../../history/spec.js";
import type { Case } from "../../prop/case.js";
import { integer } from "../../prop/generators.js";
import { steps } from "../../stateful/steps.js";
import type { Setup } from "./subjects.js";

/** The largest capacity of a queue, and the largest value that its put writes. */
const MAX_CAPACITY = 8;
const MAX_VALUE = 1000;

/** The draws of the queue machine. */
const CAPACITIES = integer(1, MAX_CAPACITY);
const VALUES = integer(0, MAX_VALUE);

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
    if (this.#size === capacity) {
      return false;
    }
    const last = this.#tail === capacity - 1;
    this.#slots[last && this.#losesOnWrap ? 0 : this.#tail] = value;
    this.#tail = last ? 0 : this.#tail + 1;
    this.#size += 1;
    return true;
  }

  /** Removes and returns the oldest value, or null for an empty ring. */
  get(): number | null {
    if (this.#size === 0) {
      return null;
    }
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
    if (state.length === 0) {
      return [state];
    }
    return op.returned(state[0]) ? [state.slice(1)] : [];
  };
  return {
    initial: () => [],
    next: (state, op) => (op.name === "put" ? put(state, op) : get(state, op)),
  };
}

/** Runs the queue machine over a ring of a drawn capacity. */
export async function queue(
  c: Case,
  setup: Setup,
  losesOnWrap: boolean,
): Promise<void> {
  const capacity = c.draw(CAPACITIES, "capacity");
  const ring = new Ring(capacity, losesOnWrap);
  await steps(
    c,
    {
      spec: boundedQueue(capacity),
      actions: [
        {
          name: "put",
          input: (step) => step.draw(VALUES, "v"),
          run: (step, client, value) => {
            const call = step.history().invoke(client, "put", [value]);
            call.ok(ring.put(value as number));
          },
        },
        {
          name: "get",
          run: (step, client) => {
            const call = step.history().invoke(client, "get", []);
            call.ok(ring.get());
          },
        },
      ],
    },
    ...setup.steps,
  );
}
