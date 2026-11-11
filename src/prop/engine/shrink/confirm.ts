// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The replay of a case: a failing case before its shrink, and a valid case
 * under the setting confirm. A replay that requests another choice,
 * observes another fingerprint, or ends another way makes the run flaky. A
 * replay of a valid case that is rejected or skips ends the same way as a
 * pass.
 */

import { Replaying, type Request } from "../case/providers.js";
import type { Where } from "../case/record.js";
import {
  type Body,
  type Divergence,
  type Execution,
  execute,
  identityOf,
  type Observer,
  type Phase,
  unobserved,
} from "../execution.js";
import type { Resolved } from "../settings.js";
import type { Outcome, Tally } from "../tally.js";
import type { Work } from "../work.js";

/** Returns the bounds id of a request, or undefined past the last one. */
function boundsAt(
  requests: readonly Request[],
  index: number,
): Request["bounds"] | undefined {
  return requests[index]?.bounds;
}

/**
 * Replays a case once, and returns how the replay differed, if it did. The
 * case is a failing case, or a valid case that the setting confirm
 * replays. The comparison takes the requests' bounds first, then the
 * observed fingerprints, then the way the replay ended. A request or a
 * fingerprint that differs takes the label and the step of the replay's
 * request or fingerprint at its position.
 *
 * @param body - The body.
 * @param failing - The execution to replay.
 * @param maxChoices - The most choices of a case.
 * @param observer - What sees the replay.
 * @param phase - The phase of the replay.
 * @returns The work, which returns the divergence or undefined.
 */
export function* confirm(
  body: Body,
  failing: Execution,
  maxChoices: number,
  observer: Observer = unobserved,
  phase: Phase = "replay",
): Work<Divergence | undefined> {
  const replay = yield* execute(body, new Replaying(failing.case.choices), maxChoices);
  observer(phase, replay);
  const recorded = failing.case.requests;
  const replayed = replay.case.requests;
  for (let i = 0; i < Math.max(recorded.length, replayed.length); i += 1) {
    const before = boundsAt(recorded, i);
    const after = boundsAt(replayed, i);
    if (before?.id !== after?.id) {
      const where: Where = replay.case.wheres[i] ?? {};
      return {
        what: "request",
        index: i,
        recorded: before,
        replayed: after,
        label: where.label,
        step: where.place,
      };
    }
  }
  const { fingerprints } = failing.case;
  const observed = replay.case.fingerprints;
  for (let i = 0; i < Math.max(fingerprints.length, observed.length); i += 1) {
    if (fingerprints[i] !== observed[i]) {
      const where: Where = replay.case.observed[i] ?? {};
      return {
        what: "fingerprint",
        index: i,
        recorded: fingerprints[i],
        replayed: observed[i],
        label: where.label,
        step: where.place,
      };
    }
  }
  if (identityOf(replay) !== identityOf(failing)) {
    return {
      what: "verdict",
      index: failing.case.choices.length,
      recorded: identityOf(failing),
      replayed: identityOf(replay),
    };
  }
  return undefined;
}

/**
 * Replays a valid case whose count is a multiple of the setting confirm,
 * right after the case that tally counted, under the phase confirm.
 *
 * @param body - The body.
 * @param settings - The settings of the run.
 * @param tally - The counts, which include the case.
 * @param execution - The case.
 * @param observer - What sees the replay.
 * @returns The work, which returns the flaky outcome of a replay that
 *   differs, or undefined.
 */
export function* confirmValid(
  body: Body,
  settings: Resolved,
  tally: Tally,
  execution: Execution,
  observer: Observer,
): Work<Outcome | undefined> {
  if (
    settings.confirm === 0 ||
    execution.status !== "passed" ||
    tally.valid % settings.confirm !== 0
  ) {
    return undefined;
  }
  const divergence = yield* confirm(
    body,
    execution,
    settings.maxChoices,
    observer,
    "confirm",
  );
  if (divergence === undefined) {
    return undefined;
  }
  return tally.outcome("flaky", { failing: execution, divergence });
}
