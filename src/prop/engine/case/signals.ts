// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The signals that end a case: a rejection, an overrun of the cap on
 * choices, a failure and a skip. A body must let them pass.
 */

/** The signal that ends a case without a verdict. A rejected case is not counted and not shrunk. */
export class Rejected extends Error {
  /** Returns the signal. */
  constructor() {
    super("prop: the case is rejected");
    this.name = "Rejected";
  }
}

/** The signal of a case that asked for more choices than its cap allows. */
export class Overrun extends Rejected {}

/**
 * A body's failure, with the identity that the shrinker keeps it by. Two
 * failures are the same failure when their identities are equal.
 */
export class Failed extends Error {
  /** The identity of the failure. */
  readonly identity: string;
  /** What the case failed with, such as a failure record, for the run's report. */
  readonly record: unknown;

  /**
   * Returns the failure of identity.
   *
   * @param identity - The identity.
   * @param record - What the case failed with, or undefined.
   */
  constructor(identity: string, record?: unknown) {
    super(`prop: the case fails as ${identity}`);
    this.name = "Failed";
    this.identity = identity;
    this.record = record;
  }
}

/**
 * The signal of a case that skips the run of its property. Before the run
 * finds a failing case, the run ends as skipped with the reason. After it,
 * the case counts as a case that does not fail.
 */
export class Skipped extends Error {
  /** Why the case skips. */
  readonly reason: string;

  /**
   * Returns the skip of reason.
   *
   * @param reason - Why the case skips.
   */
  constructor(reason: string) {
    super(`prop: the case skips the run: ${reason}`);
    this.name = "Skipped";
    this.reason = reason;
  }
}
