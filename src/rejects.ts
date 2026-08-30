/**
 * The assertion that an assertion can fail.
 *
 * This is what an assertion library has to be able to say about
 * itself, and what any check meant to refuse bad input needs: not that
 * it passes, but that it fails when it should.
 */

import { Mode, report, type Seat } from "./matcher/seat.js";
import { Recorder } from "./seat.js";

/**
 * Fail when the body does not fail.
 *
 * The body is handed a {@link Recorder}, so assertions inside it
 * record instead of ending the test. A body that passes is the
 * failure.
 *
 * @param seat Where the failure is reported.
 * @param msg The contract under test.
 * @param body Called with a recorder; expected to report a failure.
 * @returns The failure the body produced, so its text can be asserted on.
 * @example
 * check.rejects(seat, "an empty name is refused", (inner) => {
 *   check.isNil(inner, validate(""), "it passes");
 * });
 */
export function rejects(
  seat: Seat,
  msg: string,
  body: (inner: Recorder) => void,
): string {
  seat.helper();
  const recorder = new Recorder();
  body(recorder);

  if (!recorder.failed) {
    report(seat, Mode.Fatal, `${msg}: the body reported no failure`);
    return "";
  }
  return recorder.message;
}
