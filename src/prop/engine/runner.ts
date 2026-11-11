// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * A run: its phases, its counts and its outcome.
 *
 * The runner calls a body once per case, in four phases, and stops at the
 * first failing case:
 *
 * 1. Traces, examples and stored: each trace of a case whose draws and
 *    steps the caller states, then each example of a case whose values the
 *    caller states, in order, then each stored case. An example
 *    is a choice sequence, or the values of its draws when its generator has
 *    no inverse. These cases do not enter the case tree. A trace that the
 *    body cannot follow throws TraceError, which ends the run before any
 *    other case runs. A stored case runs its choices. When the case of the
 *    choices does not fail and does not decode to the counterexample of its
 *    entry, the run follows that counterexample as a trace. The case of the
 *    trace counts when it fails or takes every entry, and the case of the
 *    choices counts when the body refuses an entry of the trace or leaves
 *    one untaken. Such a refusal does not end the run.
 * 2. Simplest: one case whose every choice is its target.
 * 3. Random: case i of the seed, for i = 0, 1, 2, …, until `cases` valid
 *    cases have run, the domain is exhausted, or ten times `cases` random
 *    cases have been generated, repeats included. Each random case is
 *    followed by its prefix case, while at most min(⌊cases / 10⌋, 50) cases
 *    are valid and the random case made at least two choices, and by the
 *    next edge case, until all four have run. Edge cases left when the
 *    random cases stop run then.
 * 4. Coverage: when a requirement is undecided at a check, further random
 *    cases up to the next check, at 2, 4 and 8 times `cases`.
 *
 * A valid case is one that passed and repeated no earlier case. Every
 * earlier phase's valid cases count towards `cases`.
 *
 * Under the setting `confirm`, a run replays each valid case whose count is
 * a multiple of `confirm` right after the case, from its choices, as it
 * replays a failing case. A replay that requests other bounds, observes
 * another fingerprint or fails ends the run as flaky, with the valid case as
 * its failing case. A replay that is rejected or skips does not differ. The
 * replay counts as no case, and an example of values is not replayed.
 *
 * A failing case is replayed `replays` times, once by default, and then
 * shrunk and explained. The run ends as a counterexample when one or more
 * replays reproduce the failure, and as flaky with the difference of the
 * first replay when none does. Every replay runs, so the outcome states how
 * many of them reproduced the failure. A diverging body ends the run as
 * flaky. A shrink budget of 0 reports the first failing case as found,
 * without replay or explanation. A failing example of values has no
 * choices, so the run reports it as found, without replay, explanation or
 * token.
 *
 * A run that found no failing case fails anyway when it rejected more than
 * ten times as many cases as were valid, when no case requested an input,
 * or when a coverage requirement is refuted or unmet, checked in that order.
 *
 * A case that skips before the run finds a failing case ends the run as
 * skipped, in every phase. Once the run has found a failing case, a case
 * that skips counts as a case that does not fail: a replay that skips makes
 * the run flaky, a shrink candidate that skips is not accepted, and an
 * explain run that skips neither fails the way the failure fails nor passes.
 *
 * A campaign shares the counts, the known cases and the conclusion of a
 * failure with a run, and this module exports them for it.
 */

import { Replaying, Valuing } from "./case/providers.js";
import type { Choice } from "./choice.js";
import {
  type Body,
  type Divergence,
  type Execution,
  execute,
  identityOf,
  type Observer,
  unobserved,
} from "./execution.js";
import { checks, Phases } from "./phases.js";
import { knownCases, type Resolved, resolve, type Settings } from "./settings.js";
import { confirm, confirmValid } from "./shrink/confirm.js";
import { explain } from "./shrink/explain.js";
import { type Failure, Shrinker } from "./shrink.js";
import { runKnown, type StoredRun } from "./stored.js";
import { type Outcome, Tally } from "./tally.js";
import { encode } from "./token.js";
import type { Work } from "./work.js";

/**
 * Runs the known cases of settings outside the case tree, counted by tally,
 * and returns the outcome that one of them ends the run with. stored
 * receives the run of each stored case. A known case runs outside the tree,
 * so it cannot diverge: the outcome is a counterexample, a skip, or the
 * flaky outcome of a replay under the setting confirm.
 */
function* tryKnown(
  body: Body,
  settings: Resolved,
  tally: Tally,
  observer: Observer,
  stored: StoredRun[],
): Work<Outcome | undefined> {
  for (const [phase, provider] of knownCases(settings)) {
    const { maxChoices } = settings;
    const execution = yield* runKnown(
      body,
      phase,
      provider,
      maxChoices,
      observer,
      stored,
    );
    const valued = provider instanceof Valuing;
    const outcome = tally.take(execution);
    if (outcome !== undefined) {
      return { ...outcome, valued: valued && outcome.failing !== undefined, stored };
    }
    if (!valued) {
      const flaky = yield* confirmValid(body, settings, tally, execution, observer);
      if (flaky !== undefined) {
        return { ...flaky, stored };
      }
    }
  }
  return undefined;
}

/** Runs the phases until the run ends, without concluding a counterexample. */
function* explore(body: Body, settings: Resolved, observer: Observer): Work<Outcome> {
  const tally = new Tally(settings.seed);
  const stored: StoredRun[] = [];
  const known = yield* tryKnown(body, settings, tally, observer, stored);
  if (known !== undefined) {
    return known;
  }
  const phases = new Phases(body, settings, tally, observer);
  const outcome =
    (yield* phases.attempt(new Replaying([]), "simplest")) ??
    (yield* checks(phases)) ??
    tally.outcome("passed");
  return { ...outcome, stored };
}

/**
 * Runs the one case that choices record, and reports it as found. The case
 * runs outside a case tree, so it cannot diverge: an outcome that it ends
 * the run with is a counterexample, a skip, or the flaky outcome of a
 * replay under the setting confirm.
 */
function* replayOnly(
  body: Body,
  settings: Resolved,
  choices: readonly Choice[],
  observer: Observer,
): Work<Outcome> {
  const tally = new Tally(settings.seed);
  const execution = yield* execute(body, new Replaying(choices), settings.maxChoices);
  observer("token", execution);
  const outcome =
    tally.take(execution) ??
    (yield* confirmValid(body, settings, tally, execution, observer));
  if (outcome === undefined) {
    return tally.failureWithoutCounterexample() ?? tally.outcome("passed");
  }
  return withToken(outcome);
}

/** Returns a counterexample with the replay token of its failing case, and any other outcome unchanged. */
function withToken(outcome: Outcome): Outcome {
  const { failing } = outcome;
  return outcome.kind !== "counterexample" || failing === undefined
    ? outcome
    : { ...outcome, token: encode(failing.case.choices) };
}

/**
 * Replays, shrinks and explains the failing case of a counterexample, and
 * returns the outcome with the minimal case, the other failures that the
 * shrink found and the replay token. A shrink budget of 0 adds the token
 * alone. The case replays as often as the setting replays states, and every
 * replay runs. The case shrinks when one or more replays reproduce the
 * failure. When none does, the outcome is flaky with the difference of the
 * first replay. The outcome states the replays and the reproductions. Any
 * other outcome, and a counterexample of values, which has no choices,
 * return unchanged.
 *
 * @param body - The body.
 * @param settings - The settings of the run.
 * @param outcome - The outcome that the run ended with.
 * @param observer - What sees every call of the body with its phase.
 * @returns The work, which returns the concluded outcome.
 */
export function* conclude(
  body: Body,
  settings: Resolved,
  outcome: Outcome,
  observer: Observer,
): Work<Outcome> {
  const { failing } = outcome;
  if (outcome.kind !== "counterexample" || failing === undefined || outcome.valued) {
    return outcome;
  }
  if (settings.shrink === 0) {
    return { ...outcome, token: encode(failing.case.choices) };
  }
  const divergences: (Divergence | undefined)[] = [];
  for (let i = 0; i < settings.replays; i += 1) {
    divergences.push(yield* confirm(body, failing, settings.maxChoices, observer));
  }
  const reproduced = divergences.filter((one) => one === undefined).length;
  const replayed = { ...outcome, replays: settings.replays, reproduced };
  if (reproduced === 0) {
    return { ...replayed, kind: "flaky", divergence: divergences[0] };
  }
  const shrinker = new Shrinker(
    body,
    failing,
    settings.maxChoices,
    settings.shrink,
    observer,
    settings.shrinkTime,
  );
  yield* shrinker.shrinkAll();
  const identity = identityOf(failing) as string;
  const first = shrinker.failures.get(identity) as Failure;
  const others = [...shrinker.failures.values()]
    .filter((found) => found.identity !== identity)
    .map((found) => found.execution);
  const explanation = settings.explain
    ? yield* explain(shrinker, first, settings.seed)
    : [];
  return {
    ...replayed,
    failing: first.execution,
    others,
    explanation,
    token: encode(first.execution.case.choices),
    runs: shrinker.runs,
  };
}

/**
 * Runs the phases and returns the outcome. A run with replay set runs that
 * one case instead, and neither shrinks nor explains it.
 *
 * @param body - The body.
 * @param settings - What the run is asked to do.
 * @param observer - What sees every call of the body with its phase, in
 *   the order of the run.
 * @returns The work, which returns the outcome.
 * @throws RangeError for a run of fewer than one case.
 * @throws TraceError when a trace states an entry that the body cannot
 *   follow.
 */
export function* run(
  body: Body,
  settings: Settings,
  observer: Observer = unobserved,
): Work<Outcome> {
  const resolved = resolve(settings);
  if (resolved.replay !== undefined) {
    return yield* replayOnly(body, resolved, resolved.replay, observer);
  }
  const explored = yield* explore(body, resolved, observer);
  return yield* conclude(body, resolved, explored, observer);
}

/**
 * Runs the stored cases of settings, oldest first, as run runs them before
 * its other cases, and returns how they ended: a pass that counts them, or
 * the outcome of the first of them that does not pass. A failing stored
 * case is reported as found, with its token, and is neither shrunk nor
 * explained. A stored case that skips ends the run as skipped. The run
 * replays each valid case under the setting confirm as run replays it. The
 * outcome states the runs of the stored cases up to the one that ended it.
 * The settings' traces and examples do not run. A stored case runs outside a
 * case tree, so it cannot diverge.
 *
 * @param body - The body.
 * @param settings - What the run is asked to do.
 * @param observer - What sees every call of the body with its phase.
 * @returns The work, which returns the outcome.
 * @throws RangeError for a run of fewer than one case.
 */
export function* runStored(
  body: Body,
  settings: Settings,
  observer: Observer = unobserved,
): Work<Outcome> {
  const resolved = resolve({ ...settings, traces: [], examples: [] });
  const tally = new Tally(resolved.seed);
  const stored: StoredRun[] = [];
  const outcome = yield* tryKnown(body, resolved, tally, observer, stored);
  if (outcome === undefined) {
    return { ...tally.outcome("passed"), stored };
  }
  return withToken(outcome);
}

/**
 * Replays, shrinks and explains failing, a failed case that the body ran
 * outside a run, such as the case that the fuzz bridge decoded from a
 * fuzzer's input. It returns a counterexample that counts no valid case, or
 * a flaky outcome when the replay of failing differs from it.
 *
 * @param body - The body.
 * @param settings - What the run is asked to do.
 * @param failing - The failed execution.
 * @param observer - What sees every call of the body with its phase.
 * @returns The work, which returns the outcome.
 * @throws RangeError for a run of fewer than one case.
 */
export function* concludeCase(
  body: Body,
  settings: Settings,
  failing: Execution,
  observer: Observer = unobserved,
): Work<Outcome> {
  const resolved = resolve(settings);
  const found = new Tally(resolved.seed).outcome("counterexample", { failing });
  return yield* conclude(body, resolved, found, observer);
}
