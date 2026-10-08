/**
 * forAll: the assertion that a body passes for every case that a run
 * generates.
 */

import { callSite } from "../failure.js";
import { track } from "../matcher/pending.js";
import type { Seat } from "../matcher/seat.js";
import { Running } from "../matcher/verdict.js";
import type { Case } from "./case.js";
import { FOR_ALL } from "./detail.js";
import { configure, type Option } from "./option.js";
import { type Call, Property } from "./property.js";

/** Starts the property of call on seat, and runs body, or ends the call with the fault of its options. */
async function start(
  seat: Seat,
  running: Running,
  call: Call,
  options: readonly Option[],
  body: (c: Case) => unknown,
): Promise<void> {
  let property: Property;
  try {
    property = Property.of(seat, call, configure(options));
  } catch (err) {
    Property.fault(running, call, err);
    return;
  }
  await property.run(seat, running, body);
}

/**
 * Runs body against generated cases, and fails the test on seat with one
 * record of prop-for-all when the run does not pass. The record's contract
 * is contract, and its location is the call of forAll. Await the call.
 *
 * A run tries the case of the draws option, then replays the property's
 * stored cases oldest first, then the case whose every choice is its
 * target, then random cases of the seed with a prefix case and an edge case
 * after each, until the cases option's number of valid cases ran, the run
 * tested every input of the domain, or ten times as many cases were
 * generated. A failing case is replayed, shrunk to the smallest case that
 * fails the same way, and explained.
 *
 * A run that found no failing case fails when it rejected more than ten
 * cases for every valid one, when no case requested an input, or when it
 * refuted or left unmet a coverage requirement, checked in that order.
 *
 * Under the campaign profile, which DOKIMI_ASSERT_PROP_PROFILE=campaign
 * names, forAll runs a campaign for as long as DOKIMI_ASSERT_PROP_BUDGET
 * states in whole seconds, on the platform clock. It explores the cases
 * near those that counted a new label, recorded a new fingerprint or a
 * better score, and shrinks, explains and stores each failure of an
 * identity of its own as it finds it. A hermetic run and a run in a process
 * of a mutation run run no campaign.
 *
 * The record's detail states the ten fields of prop-for-all: outcome,
 * cases, rejected, seed, counterexample, failure, choices, others,
 * divergence and coverage. A field that the outcome does not use is null.
 * A seat that takes records receives the record, and any other seat its
 * sentence, which states the failing case's notes. The call's record states
 * the detail of the run on a pass as well, and the calls of each case are
 * recorded under it, with the phase of the case.
 *
 * forAll ends the call with a fault, without a run, for a profile other than
 * default, ci and campaign, a seed variable that is no decimal number below
 * 2^64, a campaign's budget that is no whole number of seconds above 0, a
 * token to replay that no encoder writes, entries of the draws option that
 * are no array of draw entries and step entries, a store that cannot be
 * read or has a damaged file, and a second property of the test with the
 * same contract and store. It ends the call with a fault before any other
 * case for an entry of the draws option that the body cannot follow. It
 * writes an entry of each failure of a counterexample to the store, unless a
 * file of the entry's name exists or the process is one of a mutation run,
 * and notes a store that cannot keep it through console.warn.
 *
 * @param seat - Where the failure is reported.
 * @param contract - The property, as the record's contract states it.
 * @param body - The body, which draws its inputs from its case and may
 *   return a promise.
 * @param options - The settings of the run.
 * @returns A promise of the verdict.
 * @example
 * await prop.forAll(seat, "a sorted list is ordered", (c) => {
 *   const xs = c.draw(prop.list(prop.integer(-100, 100)), "xs");
 *   check.isTrue(c, isSorted(sort(xs)), "sort orders the list");
 * });
 */
export function forAll(
  seat: Seat,
  contract: string,
  body: (c: Case) => void | Promise<void>,
  ...options: Option[]
): Promise<void> {
  seat.helper();
  const where = callSite();
  const running = Running.begin(seat, where);
  const call: Call = { op: "prop.forAll", assertion: FOR_ALL, contract, where };
  return track(seat, contract, start(seat, running, call, options, body));
}
