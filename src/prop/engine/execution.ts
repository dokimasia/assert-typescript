/**
 * One call of a body, and how it ended.
 *
 * The runner, the shrinker and the explain phase each call the body
 * through execute. A case that walks the case tree can end early as a
 * repeat or a divergence. A case outside the tree, such as a stored case or
 * a shrink candidate, cannot.
 *
 * Each call of a body has a phase, the part of the run that made it. An
 * observer of a run sees every call with its phase, in the order that a run
 * on one worker makes them.
 */

import {
  Case,
  Failed,
  Overrun,
  type Place,
  type Provider,
  Rejected,
  type Where,
} from "./case.js";
import type { Bounds } from "./choice.js";
import { Diverged, type Ending, Repeated, type Tree } from "./tree.js";
import type { Work } from "./work.js";

/**
 * A body: it receives the case, draws from it, and fails it or returns. A
 * body that waits on a promise returns work, and any other body returns
 * nothing.
 */
export type Body = (c: Case) => Work<void> | undefined;

/**
 * The part of a run that called the body: the kind of a property's case.
 * `example` is a case whose values the caller states, and `fuzz` is the
 * case that the fuzz bridge decodes from a fuzzer's input.
 */
export type Phase =
  | "example"
  | "stored"
  | "simplest"
  | "random"
  | "prefix"
  | "edge"
  | "coverage"
  | "replay"
  | "shrink"
  | "explain"
  | "token"
  | "fuzz";

/** How one case ended. */
export type Status = "passed" | "failed" | "rejected" | "repeated" | "diverged";

/**
 * The first difference between two runs of the same choices. what is the
 * kind of difference:
 *
 * - `request`: the bounds of a request differ. undefined means that the
 *   case ended before the request.
 * - `fingerprint`: an observed fingerprint differs. undefined means that the
 *   run observed no fingerprint there.
 * - `verdict`: a replay passed or failed another way. The two sides are the
 *   identities of the failures, and undefined means a pass.
 *
 * index is the position of the request or the fingerprint that differs.
 * For a verdict, it is the number of choices that the recorded case made.
 * label and step state where the replay made the request or observed the
 * fingerprint.
 */
export interface Divergence {
  /** The kind of difference. */
  readonly what: "request" | "fingerprint" | "verdict";
  /** The position. */
  readonly index: number;
  /** The recorded version. */
  readonly recorded: Bounds | bigint | string | undefined;
  /** The replayed version. */
  readonly replayed: Bounds | bigint | string | undefined;
  /** The label of the draw that was running, or undefined. */
  readonly label?: string | undefined;
  /** The part and step of a machine, or undefined. */
  readonly step?: Place | undefined;
}

/** One call of the body: its case and how it ended. */
export interface Execution {
  /** The case. */
  readonly case: Case;
  /** How it ended. */
  readonly status: Status;
  /** The failure of a failed case. */
  readonly failure?: Failed | undefined;
  /** The divergence of a diverged case. */
  readonly divergence?: Divergence | undefined;
}

/**
 * Returns the identity of an execution's failure, or undefined when the
 * case did not fail.
 *
 * @param execution - The execution.
 * @returns The identity.
 */
export function identityOf(execution: Execution): string | undefined {
  return execution.failure?.identity;
}

/** What sees the calls of a run's body: the phase of each call and how it ended. */
export type Observer = (phase: Phase, execution: Execution) => void;

/** Sees nothing, as a run that nobody records. */
export function unobserved(): void {}

/**
 * Returns the tree's divergence as a request divergence of c. A request that
 * diverged is the case's last recorded request, and the divergence takes
 * its label and step. A case that ended where an earlier case made a
 * request made no request there.
 */
function divergenceOf(diverged: Diverged, c: Case): Divergence {
  const where: Where =
    diverged.requested === undefined ? {} : (c.wheres[diverged.index] as Where);
  return {
    what: "request",
    index: diverged.index,
    recorded: diverged.recorded,
    replayed: diverged.requested,
    label: where.label,
    step: where.place,
  };
}

/**
 * Calls the body once on a case whose values come from provider. With a
 * tree, the case walks it, and a repeat or a divergence ends the case early.
 * A case that overruns its cap is rejected without a leaf.
 *
 * @param body - The body.
 * @param provider - Where the case's values come from.
 * @param maxChoices - The most choices that the case may make.
 * @param tree - The case tree, or undefined for a case outside it.
 * @returns The work of the call, which returns its execution.
 */
export function* execute(
  body: Body,
  provider: Provider,
  maxChoices: number,
  tree?: Tree,
): Work<Execution> {
  const walker = tree?.walker();
  const c = new Case(provider, maxChoices, walker);
  let ending: Ending;
  let failure: Failed | undefined;
  try {
    const work = body(c);
    if (work !== undefined) yield* work;
    ending = "passed";
  } catch (err) {
    if (err instanceof Repeated) return { case: c, status: "repeated" };
    if (err instanceof Diverged) {
      return { case: c, status: "diverged", divergence: divergenceOf(err, c) };
    }
    if (err instanceof Overrun) return { case: c, status: "rejected" };
    if (err instanceof Rejected) ending = "rejected";
    else if (err instanceof Failed) {
      ending = "failed";
      failure = err;
    } else {
      throw err;
    }
  }
  try {
    walker?.end(ending);
  } catch (err) {
    return {
      case: c,
      status: "diverged",
      divergence: divergenceOf(err as Diverged, c),
    };
  }
  return { case: c, status: ending, failure };
}
