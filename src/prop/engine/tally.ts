// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The counts of a run and the outcome that ends it: how a run ended, the
 * valid and the rejected cases, the labels that the valid cases counted,
 * and the requirement that a run refuted or left unmet.
 */

import * as coverage from "./coverage.js";
import type { Divergence, Execution } from "./execution.js";
import type { Explained } from "./shrink/explain.js";

/** A run that rejects more than this many cases for every valid one ends as rejected. */
const MAX_REJECTIONS = 10;

/**
 * How a run ended. passed passes the test, skipped skips it where the seat
 * can skip a running test, and every other kind fails it.
 */
export type Kind =
  | "passed"
  | "counterexample"
  | "flaky"
  | "rejected"
  | "coverage-unmet"
  | "vacuous"
  | "skipped";

/** A label that must count at least share of the valid cases. */
export interface Requirement {
  readonly label: string;
  readonly share: number;
}

/** A requirement that a run refuted or left unmet, with its counts. */
export interface Shortfall {
  readonly requirement: Requirement;
  readonly counted: number;
  readonly valid: number;
  readonly verdict: coverage.Verdict;
}

/**
 * The end of a run. cases counts the valid cases. failing is the minimal
 * failing execution of a counterexample, or the case that a flaky replay
 * contradicted; token is its replay token. others are the minimal
 * executions of the other failures, in the order they were found.
 * divergence is the difference that made a run flaky, and shortfall the
 * requirement that a coverage-unmet run missed. runs counts the runs that
 * shrinking and explaining spent. valued is set for a counterexample that
 * an example of values found, which has no token. stored are the runs of
 * the stored cases, in order, up to the one that ended the run. reason is
 * the reason of the case that skipped a skipped run.
 */
export interface Outcome {
  readonly kind: Kind;
  readonly cases: number;
  readonly rejected: number;
  readonly seed: bigint;
  readonly failing?: Execution | undefined;
  readonly divergence?: Divergence | undefined;
  readonly shortfall?: Shortfall | undefined;
  readonly reason?: string | undefined;
  readonly others: readonly Execution[];
  readonly explanation: readonly Explained[];
  readonly token?: string | undefined;
  readonly runs: number;
  readonly valued: boolean;
  readonly stored: readonly Execution[];
}

/** The counts of a run so far, from which every outcome takes its counts. */
export class Tally {
  /** The seed of the run. */
  readonly seed: bigint;
  /** The valid cases. */
  valid = 0;
  /** The rejected cases. */
  rejected = 0;
  /** Whether any case requested an input. */
  requested: boolean;
  /** The valid cases that counted each label. */
  readonly labels = new Map<string, number>();

  /**
   * Returns the counts of a run of seed that has run no case.
   *
   * @param seed - The run's seed.
   */
  constructor(seed: bigint) {
    this.seed = seed;
    this.requested = false;
  }

  /**
   * Counts one execution, and returns the outcome when it ends the run: a
   * counterexample for a failed case, flaky for a diverged one, and skipped
   * with its reason for a skipped one. A case that repeated an earlier one
   * counts nowhere.
   *
   * @param execution - The execution.
   * @returns The outcome, or undefined for a case that does not end the run.
   */
  take(execution: Execution): Outcome | undefined {
    const c = execution.case;
    this.requested = this.requested || c.draws.length > 0 || c.choices.length > 0;
    if (execution.status === "failed") {
      return this.outcome("counterexample", { failing: execution });
    }
    if (execution.status === "diverged") {
      return this.outcome("flaky", { divergence: execution.divergence });
    }
    if (execution.status === "skipped") {
      return this.outcome("skipped", { reason: execution.reason });
    }
    if (execution.status === "rejected") {
      this.rejected += 1;
    } else if (execution.status === "passed") {
      this.valid += 1;
      for (const label of c.labels) {
        this.labels.set(label, (this.labels.get(label) ?? 0) + 1);
      }
    }
    return undefined;
  }

  /**
   * Returns an outcome of kind with the counts so far.
   *
   * @param kind - How the run ended.
   * @param parts - The failing case, the divergence, the shortfall or the
   *   reason of a skip.
   * @returns The outcome, with no other failure, explanation or stored run.
   */
  outcome(
    kind: Kind,
    parts: Pick<Outcome, "failing" | "divergence" | "shortfall" | "reason"> = {},
  ): Outcome {
    return {
      kind,
      cases: this.valid,
      rejected: this.rejected,
      seed: this.seed,
      ...parts,
      others: [],
      explanation: [],
      runs: 0,
      valued: false,
      stored: [],
    };
  }

  /**
   * Returns the outcome of too many rejections or of no input, if either:
   * more than ten rejected cases for every valid one, then no case that
   * requested an input.
   *
   * @returns The outcome, or undefined when neither ends the run.
   */
  failureWithoutCounterexample(): Outcome | undefined {
    if (this.rejected > MAX_REJECTIONS * this.valid) {
      return this.outcome("rejected");
    }
    if (!this.requested) {
      return this.outcome("vacuous");
    }
    return undefined;
  }
}

/**
 * Returns the first requirement that the counts refute or leave unmet, and
 * whether the counts meet every requirement.
 *
 * @param tally - The counts.
 * @param requirements - The requirements, in order.
 * @param last - Whether the check is the last, which decides every requirement.
 * @param exact - Whether the run tested every input of the domain.
 * @returns The shortfall, or undefined, and whether all are met.
 */
export function shortfallOf(
  tally: Tally,
  requirements: readonly Requirement[],
  last: boolean,
  exact: boolean,
): readonly [Shortfall | undefined, boolean] {
  let met = true;
  for (const requirement of requirements) {
    const counted = tally.labels.get(requirement.label) ?? 0;
    const verdict = coverage.verdict(
      counted,
      tally.valid,
      requirement.share,
      last,
      exact,
    );
    if (verdict === "refuted" || verdict === "unmet") {
      return [{ requirement, counted, valid: tally.valid, verdict }, false];
    }
    met = met && verdict === "met";
  }
  return [undefined, met];
}
