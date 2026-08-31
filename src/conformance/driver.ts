/**
 * Driving a corpus case that names a behaviour rather than a value.
 *
 * The assertions taking a callable differ in shape: one takes a signal,
 * one takes nothing, one takes a projection and a body. Each says how
 * it is called here, so the corpus runner does not know all of them.
 */

import { check, soft } from "../index.js";
import { Recorder } from "../seat.js";
import { SUBJECTS, type Subject } from "./subject.js";

/** How long a retrying assertion is given, against a controlled clock. */
const RETRY_TIMEOUT = 3_600_000;

/** How long it waits between attempts on that clock. */
const RETRY_INTERVAL = 60_000;

/** One surface's assertions, as the corpus names them. */
type Surface = typeof check;

/** How one assertion is called with a built behaviour. */
type Driver = (surface: Surface, seat: Recorder, held: Subject, msg: string) => unknown;

/** A predicate that reads the subject's seated shape. */
function flips(held: Subject): () => boolean {
  return () => {
    const trial = new Recorder();
    held.seated(trial);
    return !trial.failed;
  };
}

/** How each subject-taking assertion is called, by canonical id. */
const DRIVERS: Record<string, Driver> = {
  throws: (s, seat, held, msg) => s.throws(seat, held.bare, msg),
  "not-throws": (s, seat, held, msg) => s.doesNotThrow(seat, held.bare, msg),
  "honours-cancellation": (s, seat, held, msg) =>
    s.honoursCancellation(seat, held.signalled, msg),
  "honours-deadline": (s, seat, held, msg) =>
    s.honoursDeadline(seat, held.signalled, msg),
  "nil-context-safe": (s, seat, held, msg) =>
    s.nullHandleSafe(seat, held.signalled, msg),
  pure: (s, seat, held, msg) => s.isPure(seat, held.observe, held.bare, msg),
  eventually: (s, seat, held, msg) =>
    s.eventually(seat, RETRY_TIMEOUT, RETRY_INTERVAL, held.seated, msg),
  "eventually-true": (s, seat, held, msg) =>
    s.eventuallyTrue(seat, RETRY_TIMEOUT, flips(held), msg),
};

/** Both surfaces a subject case is driven through. */
const SURFACES: Record<string, Surface> = { check, soft: soft as unknown as Surface };

/**
 * Drive one subject case, answering whether this language could.
 *
 * @param surface Which surface to drive it through.
 * @param assertion The canonical id under test.
 * @param kind The behaviour the case names.
 * @param seat Where the assertion reports.
 * @param msg The contract under test.
 * @returns True when the case ran, false when no such behaviour or
 *   assertion is known here and the case is skipped.
 */
export async function runSubject(
  surface: string,
  assertion: string,
  kind: string,
  seat: Recorder,
  msg: string,
): Promise<boolean> {
  const build = SUBJECTS[kind];
  const drive = DRIVERS[assertion];
  const held = SURFACES[surface];
  if (build === undefined || drive === undefined || held === undefined) return false;

  await drive(held, seat, build(), msg);
  return true;
}
