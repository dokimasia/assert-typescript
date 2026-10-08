/**
 * Machines: the sequential specification of a subject, and the actions that
 * the steps of a case take on it.
 */

import type { Spec } from "../history/spec.js";
import type { Case } from "../prop/case.js";

/**
 * The sequential specification of a subject and the actions that the steps
 * of a case take on it. S is the type of the spec's state.
 *
 * The functions of a machine and of its actions receive a state of the spec:
 * the first of the states that the last check of the history left. A
 * machine without a spec receives undefined.
 *
 * Those states follow what the subject returned, and a replay of a case
 * requests the same choices only when its steps list the same actions and
 * its requests state the same bounds. When a subject can return other
 * results on a replay, as one that refuses a call for room does, enabled and
 * input read a state of the machine's own in place of the spec's: one that
 * only the inputs of its steps change. Otherwise a replay can take other
 * steps than the case took, and the run ends as flaky.
 */
export interface Machine<S> {
  /**
   * The sequential specification that the history of the steps is checked
   * against after every step, with every call in one partition. A machine
   * without a spec checks nothing.
   */
  readonly spec?: Spec<S> | undefined;
  /** The actions, in order, the simpler first. No two of them have one name. */
  readonly actions: readonly Action<S>[];
  /** Runs after setup, after every sequential and drain step, and after settle. */
  invariant?(c: Case, state: S): void;
  /**
   * Runs once after the drain. It checks what must be true once the subject
   * has recovered, such as that every accepted write is readable. A settle
   * that returns a promise is awaited.
   */
  settle?(c: Case, state: S): void | Promise<void>;
}

/** One named action of a machine. */
export interface Action<S> {
  /** The action's name in a counterexample and in the step entries of a trace. */
  readonly name: string;
  /**
   * How often a random step takes the action, relative to the other actions
   * that the step lists. A weight of 0 counts as 1, and so does an action
   * without a weight.
   */
  readonly weight?: number | undefined;
  /** Whether the action takes the steps of the drain, whether the swarm kept it or not. */
  readonly drain?: boolean | undefined;
  /**
   * Reports whether a sequential or a drain step may take the action in
   * state. An action without enabled is enabled in every state, and only
   * such an action takes the steps of a concurrent section. What enabled
   * reports must not depend on results that the subject can return
   * differently on a replay of the case.
   */
  enabled?(state: S): boolean;
  /**
   * Requests the input of a step from the case, such as a draw. A step of an
   * action without input has the input undefined. The bounds of its requests
   * must not depend on results that the subject can return differently on a
   * replay of the case.
   */
  input?(c: Case, state: S): unknown;
  /**
   * Calls the subject on client with input, and records each call in the
   * case's history. A run that returns a promise is awaited.
   */
  run(c: Case, client: number, input: unknown): void | Promise<void>;
}

/**
 * Throws for a machine that states no machine: an action whose weight is no
 * integer of 0 or more, an action without run, and two actions with one
 * name.
 *
 * @param machine - The machine.
 * @throws RangeError for a weight that is no integer of 0 or more.
 * @throws TypeError for an action without run.
 * @throws Error for two actions with one name.
 */
export function validate<S>(machine: Machine<S>): void {
  const names = new Set<string>();
  for (const action of machine.actions) {
    const name = JSON.stringify(action.name);
    const weight = action.weight ?? 0;
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new RangeError(
        `stateful: steps of a machine whose action ${name} has the weight ${weight}`,
      );
    }
    if (typeof action.run !== "function") {
      throw new TypeError(
        `stateful: steps of a machine whose action ${name} has no run`,
      );
    }
    if (names.has(action.name)) {
      throw new Error(`stateful: steps of a machine whose actions name ${name} twice`);
    }
    names.add(action.name);
  }
}
