/**
 * The behaviours a corpus case can name in place of a callable.
 *
 * A case states its arguments as typed literals, which cannot describe
 * a callable. The assertions taking one are handed a named behaviour
 * from a small fixed set instead, and this builds each one natively.
 */

import type { Seat } from "../matcher/seat.js";

/** What a subject answers when it fails on its own terms. */
export class SubjectError extends Error {}

/** One built behaviour, in every shape an assertion asks for. */
export interface Subject {
  /** The shape the cancellation assertions take. */
  readonly signalled: (signal?: AbortSignal) => Promise<unknown>;
  /** The shape throws, doesNotThrow and isPure take. */
  readonly bare: () => unknown;
  /** The shape eventually takes. */
  readonly seated: (trial: Seat) => void;
  /** What isPure compares across the call. */
  readonly observe: () => unknown;
}

/** A subject that does the work and answers success. */
function returnsOk(): Subject {
  return {
    signalled: async () => "did the work",
    bare: () => undefined,
    seated: () => undefined,
    observe: () => [1, 2],
  };
}

/** A subject that answers whatever the signal says. */
function readsHandle(): Subject {
  return {
    ...returnsOk(),
    signalled: async (signal?: AbortSignal) => {
      signal?.throwIfAborted();
      return "did the work";
    },
  };
}

/** A subject that throws rather than answering. */
function raises(): Subject {
  return {
    ...returnsOk(),
    bare: () => {
      throw new SubjectError("the subject raised");
    },
    signalled: async () => {
      throw new SubjectError("the subject raised");
    },
  };
}

/** A subject that fails for a reason of its own. */
function failsOtherwise(): Subject {
  return {
    ...returnsOk(),
    signalled: async () => {
      throw new SubjectError("the subject failed for its own reason");
    },
  };
}

/** A subject that reads a handle without checking it is there. */
function dereferencesHandle(): Subject {
  return {
    ...returnsOk(),
    signalled: async (signal?: AbortSignal) => {
      // Reading a member of an absent handle is the behaviour under
      // test: the assertion asks whether a subject survives one.
      return (signal as AbortSignal).aborted;
    },
  };
}

/** A subject that reports a failure on every attempt. */
function neverSettles(): Subject {
  return {
    ...returnsOk(),
    seated: (trial: Seat) => trial.record("never settles"),
  };
}

/** A subject that reports a failure twice, then succeeds. */
function settlesAfter(): Subject {
  let attempts = 0;
  return {
    ...returnsOk(),
    seated: (trial: Seat) => {
      attempts += 1;
      if (attempts < 3) trial.record("not yet");
    },
  };
}

/** A subject with state something outside it can read. */
function observed(changes: boolean): Subject {
  const held: number[] = [1, 2];
  return {
    ...returnsOk(),
    bare: () => {
      if (changes) held.push(held.length);
      return undefined;
    },
    // A copy, so the projection does not share memory with the subject
    // and read the same value twice.
    observe: () => [...held],
  };
}

/**
 * How each named behaviour is built. A kind absent here is one this
 * language cannot make, and the case is skipped.
 */
export const SUBJECTS: Record<string, () => Subject> = {
  "returns-ok": returnsOk,
  "reads-handle": readsHandle,
  "ignores-handle": returnsOk,
  raises: raises,
  "fails-otherwise": failsOtherwise,
  "dereferences-handle": dereferencesHandle,
  "never-settles": neverSettles,
  "settles-after": settlesAfter,
  accumulates: () => observed(true),
  "leaves-state-alone": () => observed(false),
};
