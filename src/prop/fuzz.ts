/**
 * fuzz: a property whose cases a fuzzer decodes from its byte inputs.
 *
 * vitest has no fuzzer, so under vitest fuzz replays the property's stored
 * cases and the test's seed files, and returns the target that a fuzzer runs
 * on its byte inputs, such as Jazzer.js. The library depends on no fuzzer: a
 * suite that fuzzes exports the target to the fuzzer that it installs.
 */

import { callSite } from "../failure.js";
import { ofOperation } from "../matcher/fault.js";
import { track } from "../matcher/pending.js";
import type { Seat } from "../matcher/seat.js";
import { Running } from "../matcher/verdict.js";
import { Standard } from "../seat.js";
import type { Case } from "./case.js";
import { FOR_ALL } from "./detail.js";
import { seeds, seedsOf } from "./directory.js";
import { configure, type Option } from "./option.js";
import { type Call, Property } from "./property.js";

/** The target of a fuzzer: it runs the case of one byte input. */
export type Target = (data: Uint8Array) => Promise<void>;

/** Returns the target of a property whose call ended with err, which throws err's fault for every input. */
function refused(call: Call, err: unknown): Target {
  return () => Promise.reject(ofOperation(call.op, err));
}

/** Starts the property of call on seat, replays its stored cases and seed files, and returns its target. */
async function prepare(
  seat: Seat,
  running: Running,
  call: Call,
  options: readonly Option[],
  body: (c: Case) => unknown,
): Promise<Target> {
  let property: Property;
  let inputs: (readonly [string, Uint8Array])[];
  try {
    property = Property.of(seat, call, configure(options));
    inputs = seeds(seedsOf(seat));
  } catch (err) {
    Property.fault(running, call, err);
    return refused(call, err);
  }
  await property.replayStored(seat, running, body);
  for (const [, data] of inputs) {
    await property.input(seat, Running.begin(seat, call.where), body, data);
  }
  return (data) => {
    const target = new Standard();
    return property.input(target, Running.begin(target, call.where), body, data);
  };
}

/**
 * Replays the property's stored cases and the test's seed files on seat,
 * and returns the target that a fuzzer runs on its byte inputs. Await the
 * call.
 *
 * fuzz first replays the stored cases, oldest first, as forAll replays
 * them, and fails the test on seat with the record of prop-for-all of the
 * first that fails, as found. The record counts the stored cases that ran,
 * and states the calls of each under the phase stored. It notes each stored
 * case that decodes to other values than its entry records. fuzz runs no
 * campaign, also under the campaign profile, and no random case: forAll
 * checks the property under vitest, with the same body and contract.
 *
 * Then each seed file of the test, a file in
 * `testdata/fuzz/<file>/<describe titles>/<title>`, runs as one input, in the
 * order of the file names. Each input's bytes decode into the choices of one
 * case by the definition's bridge rules, so every input is a valid case: a
 * body that draws one byte string without a maximum size reads its length
 * from the first two bytes, little-endian, and the string from the bytes
 * after them. A seed file states the bytes of a case's choices, not a
 * value.
 *
 * The target runs each input as a call of its own on a Standard seat, whose
 * record states the calls of the input's case under the phase fuzz. A
 * failing input's case is replayed, shrunk and explained as forAll does
 * with a failing case, its failures are written to the store, and the
 * target rejects with an AssertionFailed whose message is the record's
 * sentence, with its replay token. The record of a passing input counts one
 * valid or one rejected case.
 *
 * fuzz ends the call with a fault for each fault for which forAll ends its
 * call without a run, and for seed files that cannot be read. The target of
 * such a call rejects every input with the fault.
 *
 * @param seat - Where the failure is reported.
 * @param contract - The property, as the record's contract states it.
 * @param body - The body, which draws its inputs from its case and may
 *   return a promise.
 * @param options - The settings of the run. replay, the variable
 *   DOKIMI_ASSERT_PROP_REPLAY, draws, cases and require apply to forAll and
 *   the property forms alone.
 * @returns A promise of the target.
 * @example
 * test("parse never throws", async ({ seat }) => {
 *   const target = await prop.fuzz(seat, "parse never throws", (c) => {
 *     parse(c.draw(prop.bytes(), "input"));
 *   });
 *   exportTarget(target);
 * });
 */
export function fuzz(
  seat: Seat,
  contract: string,
  body: (c: Case) => void | Promise<void>,
  ...options: Option[]
): Promise<Target> {
  seat.helper();
  const where = callSite();
  const running = Running.begin(seat, where);
  const call: Call = { op: "prop.fuzz", assertion: FOR_ALL, contract, where };
  return track(seat, contract, prepare(seat, running, call, options, body));
}
