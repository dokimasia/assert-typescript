/**
 * The behaviours a corpus case can name in place of a callable.
 *
 * A case states its arguments as typed literals, which cannot describe
 * a callable. The assertions taking one are handed a named behaviour
 * from a small fixed set instead, and this builds each one natively.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_LIMIT } from "../files/literal.js";
import type { Seat } from "../matcher/seat.js";

/** What a subject throws when it fails on its own terms. */
export class SubjectError extends Error {}

/** What a closed subject of failsAfterClose throws. */
const CLOSED = new SubjectError("the subject is closed");

/**
 * One built behaviour, as a function of each shape that an assertion
 * calls. A shape that the behaviour does not have is absent.
 */
export interface Subject {
  /** The call that takes a cancellation handle, as the cancellation assertions make it. */
  readonly signalled?: (signal?: AbortSignal) => Promise<unknown>;
  /** The call that throws or returns, as throws and doesNotThrow make it. */
  readonly bare?: () => unknown;
  /** The body that eventually runs. */
  readonly seated?: (trial: Seat) => void;
  /** The operation of an input: it changes the count that observe reads, or throws. */
  readonly call?: (input: unknown) => unknown;
  /** Reads the count that call and advance change. */
  readonly observe?: () => number;
  /** The input that an assertion passes to call, compute and render. */
  readonly input?: unknown;
  /** The computation that isDeterministic calls. */
  readonly compute?: (input: unknown) => unknown;
  /** The operation that isCommutative and isAssociative combine operands with. */
  readonly combine?: (a: unknown, b: unknown) => unknown;
  /** The operands a, b and c that an assertion passes to combine. */
  readonly operands?: readonly [unknown, unknown, unknown];
  /** Renders an input as decimal text, which roundTrip parses back. */
  readonly render?: (input: unknown) => string;
  /** Returns one iteration of the sequence that hasStableOrder and noDuplicates read. */
  readonly iterate?: () => readonly unknown[];
  /** Moves the count that isMonotonic reads through observe. */
  readonly advance?: () => void;
  /** How many times isMonotonic calls advance. */
  readonly steps?: number;
  /** The inputs that isTotal calls call with. */
  readonly domain?: readonly unknown[];
  /** Closes the subject of failsAfterClose. */
  readonly close?: () => void;
  /** The call that failsAfterClose makes once close has run. */
  readonly use?: () => unknown;
  /** What use throws once the subject is closed. */
  readonly sentinel?: unknown;
  /** Induces the failure that isPoisoned then reads through read. */
  readonly induce?: () => void;
  /** One reading of the subject of isPoisoned. */
  readonly read?: () => unknown;
  /** Reads or writes the files of the tree in a directory, as the callable of unchanged. */
  readonly files?: (dir: string) => void;
}

/** A subject that does the work and succeeds. Its input is 1, and its domain 1, 2 and 3. */
function returnsOk(): Subject {
  return {
    signalled: async () => "did the work",
    bare: () => undefined,
    call: () => undefined,
    input: 1,
    compute: (x) => x,
    domain: [1, 2, 3],
  };
}

/** A subject that throws the reason of an aborted handle. */
function readsHandle(): Subject {
  return {
    signalled: async (signal?: AbortSignal) => {
      signal?.throwIfAborted();
      return "did the work";
    },
  };
}

/** A subject that succeeds without reading the handle. */
function ignoresHandle(): Subject {
  return { signalled: async () => "did the work" };
}

/** A subject that throws rather than returning. */
function raises(): Subject {
  return {
    bare: () => {
      throw new SubjectError("the subject raised");
    },
  };
}

/** A subject that fails for a reason of its own. Its domain is 1, 2 and 3. */
function failsOtherwise(): Subject {
  const fails = () => {
    throw new SubjectError("the subject failed for its own reason");
  };
  return {
    signalled: async () => fails(),
    call: fails,
    domain: [1, 2, 3],
  };
}

/** A subject that reads a handle without checking it is there. */
function dereferencesHandle(): Subject {
  return {
    signalled: async (signal?: AbortSignal) => {
      // Reading a member of an absent handle is the behaviour under
      // test: the assertion asks whether a subject survives one.
      return (signal as AbortSignal).aborted;
    },
  };
}

/** A subject that fails on every attempt and every reading. Inducing changes nothing. */
function neverSettles(): Subject {
  return {
    seated: (trial: Seat) => trial.record("never settles"),
    induce: () => undefined,
    read: () => {
      throw new SubjectError("never settles");
    },
  };
}

/**
 * A subject that fails twice, then succeeds on its third attempt or
 * reading. Inducing changes nothing.
 */
function settlesAfter(): Subject {
  let attempts = 0;
  const settled = () => {
    attempts += 1;
    return attempts >= 3;
  };
  return {
    seated: (trial: Seat) => {
      if (!settled()) trial.record("not yet");
    },
    induce: () => undefined,
    read: () => {
      if (!settled()) throw new SubjectError("not yet");
    },
  };
}

/**
 * A subject whose count starts at 0 and rises by step on each call and
 * each advance, whatever the input. It advances 5 steps.
 */
function counter(step: number): Subject {
  let count = 0;
  const rise = () => {
    count += step;
  };
  return { call: rise, advance: rise, steps: 5, observe: () => count };
}

/** A cell that starts at 0, which a call sets to its input. The input is 7. */
function setsValue(): Subject {
  let cell = 0;
  return {
    call: (x) => {
      cell = x as number;
    },
    input: 7,
    observe: () => cell,
  };
}

/** A computation that returns how many times it has been called, from 1. The input is 1. */
function countsCalls(): Subject {
  let calls = 0;
  return {
    compute: () => {
      calls += 1;
      return calls;
    },
    input: 1,
  };
}

/** A subject that combines two integers with op. Its operands are 2, 3 and 5. */
function combines(op: (a: number, b: number) => number): Subject {
  return {
    combine: (a, b) => op(a as number, b as number),
    operands: [2, 3, 5],
  };
}

/** A subject that renders an integer as decimal text, or its absolute value. The input is -42. */
function renders(dropSign: boolean): Subject {
  return {
    input: -42,
    render: (x) => String(dropSign ? Math.abs(x as number) : x),
  };
}

/** A subject that yields items on every iteration. */
function yields(...items: readonly unknown[]): Subject {
  return { iterate: () => [...items] };
}

/** A subject that yields 1 to 5, rotated one place further on each iteration. */
function rotates(): Subject {
  let items = [1, 2, 3, 4, 5];
  return {
    iterate: () => {
      const out = items;
      items = [...items.slice(1), ...items.slice(0, 1)];
      return out;
    },
  };
}

/** A count that starts at 0, rises by one per advance and returns to 0 after 3. It advances 5 steps. */
function wrapsAround(): Subject {
  let count = 0;
  return {
    observe: () => count,
    advance: () => {
      count = (count + 1) % 4;
    },
    steps: 5,
  };
}

/**
 * A subject whose calls succeed until it closes. After it closes, one that
 * refuses throws its sentinel on every call, and one that does not still
 * succeeds.
 */
function closes(refuses: boolean): Subject {
  let closed = false;
  return {
    close: () => {
      closed = true;
    },
    use: () => {
      if (closed && refuses) throw CLOSED;
    },
    sentinel: CLOSED,
  };
}

/** A subject that yields one object twice, an object whose value is 1. */
function oneObjectTwice(): Subject {
  const object = Object(1);
  return yields(object, object);
}

/** The mode that a subject creates a file with. */
const NEW_FILE_MODE = 0o644;

/** Calls fn with the path of each file of the tree in dir. It follows no link. */
function eachFile(dir: string, fn: (path: string) => void): void {
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) fn(join(entry.parentPath, entry.name));
  }
}

/** A subject that reads every file of the tree in a directory, and writes nothing. */
function leavesFilesAlone(): Subject {
  return { files: (dir) => eachFile(dir, (path) => readFileSync(path)) };
}

/** A subject that writes every file of the tree in a directory again, with the bytes that the file has. */
function rewritesFiles(): Subject {
  // A file that exists keeps its mode.
  return {
    files: (dir) => eachFile(dir, (path) => writeFileSync(path, readFileSync(path))),
  };
}

/** A subject that writes a file of content at name, at the root of the tree in a directory. */
function writesFile(name: string, content: string): Subject {
  return {
    files: (dir) => writeFileSync(join(dir, name), content, { mode: NEW_FILE_MODE }),
  };
}

/**
 * How each named behaviour is built. A kind absent here is one this
 * language cannot make, and the case is skipped.
 */
export const SUBJECTS: Record<string, () => Subject> = {
  "returns-ok": returnsOk,
  "reads-handle": readsHandle,
  "ignores-handle": ignoresHandle,
  raises: raises,
  "fails-otherwise": failsOtherwise,
  "dereferences-handle": dereferencesHandle,
  "never-settles": neverSettles,
  "settles-after": settlesAfter,
  accumulates: () => counter(1),
  "leaves-state-alone": () => counter(0),
  "sets-value": setsValue,
  "counts-calls": countsCalls,
  adds: () => combines((a, b) => a + b),
  subtracts: () => combines((a, b) => a - b),
  "renders-decimal": () => renders(false),
  "drops-the-sign": () => renders(true),
  "yields-in-order": () => yields(1, 2, 3, 4, 5),
  rotates: rotates,
  "repeats-an-element": () => yields(1, 2, 2, 3),
  "wraps-around": wrapsAround,
  "refuses-after-close": () => closes(true),
  "serves-after-close": () => closes(false),
  "yields-one-object-twice": oneObjectTwice,
  "yields-two-equal-objects": () => yields(Object(1), Object(1)),
  "leaves-files-alone": leavesFilesAlone,
  "rewrites-files": rewritesFiles,
  "writes-a-file": () => writesFile("new.txt", "new"),
  // One byte of the letter a more than a record states in full.
  "writes-a-large-file": () => writesFile("large.bin", "a".repeat(CONTENT_LIMIT + 1)),
};
