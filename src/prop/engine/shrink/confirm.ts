// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The replay of a failing case before its shrink. A replay that requests
 * another choice, observes another fingerprint, or ends another way makes
 * the run flaky.
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
  unobserved,
} from "../execution.js";
import type { Work } from "../work.js";

/** Returns the bounds id of a request, or undefined past the last one. */
function boundsAt(
  requests: readonly Request[],
  index: number,
): Request["bounds"] | undefined {
  return requests[index]?.bounds;
}

/**
 * Replays a failing case once, and returns how the replay differed, if it
 * did. The comparison takes the requests' bounds first, then the observed
 * fingerprints, then the way the replay ended. A request or a fingerprint
 * that differs takes the label and the step of the replay's request or
 * fingerprint at its position.
 *
 * @param body - The body.
 * @param failing - The failing execution.
 * @param maxChoices - The most choices of a case.
 * @param observer - What sees the replay.
 * @returns The work, which returns the divergence or undefined.
 */
export function* confirm(
  body: Body,
  failing: Execution,
  maxChoices: number,
  observer: Observer = unobserved,
): Work<Divergence | undefined> {
  const replay = yield* execute(body, new Replaying(failing.case.choices), maxChoices);
  observer("replay", replay);
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
