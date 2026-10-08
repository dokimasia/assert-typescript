/**
 * Driving a corpus case that names a behaviour rather than a value.
 *
 * The assertions taking a callable differ in shape: one takes a signal,
 * one takes nothing, one takes a projection and a body. Each says how
 * it is called here, so the corpus runner does not know all of them.
 */

import { check, soft } from "../index.js";
import type { Option } from "../matcher/option.js";
import type { Seat } from "../matcher/seat.js";
import { Recorder } from "../seat.js";
import { SUBJECTS, type Subject } from "./subject.js";

/** How long a retrying assertion is given, against a controlled clock. */
const RETRY_TIMEOUT = 3_600_000;

/** How long it waits between attempts on that clock. */
const RETRY_INTERVAL = 60_000;

/** One surface's assertions, as the corpus names them. */
type Surface = typeof check;

/** How one assertion is called with a built behaviour. */
type Driver = (
  surface: Surface,
  seat: Recorder,
  held: Subject,
  msg: string,
  options: Option[],
) => unknown;

/** A predicate that reads the subject's seated shape. */
function flips(held: Subject): () => boolean {
  return () => {
    const trial = new Recorder();
    (held.seated as (trial: Seat) => void)(trial);
    return !trial.failed;
  };
}

/** The call of the subject's operation with its input, whose outcome is left out. */
function callWithInput(held: Subject): () => unknown {
  return () => (held.call as (input: unknown) => unknown)(held.input);
}

/** The operands of the subject's operation. */
function operands(held: Subject): readonly [unknown, unknown, unknown] {
  return held.operands as readonly [unknown, unknown, unknown];
}

/** The shapes of a subject, typed as the assertions take them. */
const shapes = {
  signalled: (held: Subject) =>
    held.signalled as (signal?: AbortSignal) => Promise<unknown>,
  bare: (held: Subject) => held.bare as () => unknown,
  call: (held: Subject) => held.call as (input: unknown) => unknown,
  observe: (held: Subject) => held.observe as () => number,
  combine: (held: Subject) => held.combine as (a: unknown, b: unknown) => unknown,
  iterate: (held: Subject) => held.iterate as () => readonly unknown[],
};

/** How each subject-taking assertion is called, by canonical id. */
const DRIVERS: Record<string, Driver> = {
  throws: (s, seat, held, msg) => s.throws(seat, shapes.bare(held), msg),
  "not-throws": (s, seat, held, msg) => s.doesNotThrow(seat, shapes.bare(held), msg),
  "honours-cancellation": (s, seat, held, msg) =>
    s.honoursCancellation(seat, shapes.signalled(held), msg),
  "honours-deadline": (s, seat, held, msg) =>
    s.honoursDeadline(seat, shapes.signalled(held), msg),
  "nil-context-safe": (s, seat, held, msg) =>
    s.nullHandleSafe(seat, shapes.signalled(held), msg),
  pure: (s, seat, held, msg, options) =>
    s.isPure(seat, shapes.observe(held), callWithInput(held), msg, ...options),
  "not-pure": (s, seat, held, msg, options) =>
    s.isNotPure(seat, shapes.observe(held), callWithInput(held), msg, ...options),
  eventually: (s, seat, held, msg) =>
    s.eventually(
      seat,
      RETRY_TIMEOUT,
      RETRY_INTERVAL,
      held.seated as (trial: Seat) => void,
      msg,
    ),
  "eventually-true": (s, seat, held, msg) =>
    s.eventuallyTrue(seat, RETRY_TIMEOUT, flips(held), msg),
  idempotent: (s, seat, held, msg, options) =>
    s.isIdempotent(
      seat,
      shapes.call(held),
      held.input,
      shapes.observe(held),
      msg,
      ...options,
    ),
  accumulates: (s, seat, held, msg) =>
    s.accumulates(seat, shapes.call(held), held.input, shapes.observe(held), msg),
  deterministic: (s, seat, held, msg, options) =>
    s.isDeterministic(
      seat,
      held.compute as (input: unknown) => unknown,
      held.input,
      msg,
      ...options,
    ),
  commutative: (s, seat, held, msg, options) => {
    const [a, b] = operands(held);
    return s.isCommutative(seat, shapes.combine(held), a, b, msg, ...options);
  },
  associative: (s, seat, held, msg, options) => {
    const [a, b, c] = operands(held);
    return s.isAssociative(seat, shapes.combine(held), a, b, c, msg, ...options);
  },
  "round-trip": (s, seat, held, msg, options) =>
    s.roundTrip(
      seat,
      held.render as (input: unknown) => string,
      (text: string) => Number(text),
      held.input,
      msg,
      ...options,
    ),
  "stable-order": (s, seat, held, msg, options) =>
    s.hasStableOrder(seat, shapes.iterate(held), msg, ...options),
  "no-duplicates": (s, seat, held, msg, options) =>
    s.noDuplicates(seat, shapes.iterate(held), msg, ...options),
  monotonic: (s, seat, held, msg) =>
    s.isMonotonic(
      seat,
      shapes.observe(held),
      held.advance as () => void,
      held.steps as number,
      msg,
    ),
  total: (s, seat, held, msg) =>
    s.isTotal(seat, shapes.call(held), held.domain as readonly unknown[], msg),
  "after-close": (s, seat, held, msg) =>
    s.failsAfterClose(
      seat,
      held.close as () => void,
      held.use as () => unknown,
      held.sentinel,
      msg,
    ),
  poisoned: (s, seat, held, msg) =>
    s.isPoisoned(seat, held.induce as () => void, held.read as () => unknown, msg),
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
 * @param options The relaxations that the case names.
 * @returns True when the case ran, false when no such behaviour or
 *   assertion is known here.
 */
export async function runSubject(
  surface: string,
  assertion: string,
  kind: string,
  seat: Recorder,
  msg: string,
  options: Option[] = [],
): Promise<boolean> {
  const build = SUBJECTS[kind];
  const drive = DRIVERS[assertion];
  const held = SURFACES[surface];
  if (build === undefined || drive === undefined || held === undefined) return false;

  await drive(held, seat, build(), msg, options);
  return true;
}
