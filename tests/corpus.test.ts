/**
 * The corpus, driven against both surfaces.
 *
 * Every case runs twice, once per surface. The two carrying the same
 * assertions means they produce the same outcome from the same case,
 * and running one and trusting the other would leave that untested.
 */

import { describe, expect, it } from "vitest";
import { Controlled } from "../src/clock.js";
import { runSubject } from "../src/conformance/driver.js";
import {
  type Case,
  cases,
  memberFor,
  mismatch,
  SURFACES,
  skipReason,
} from "../src/conformance/index.js";
import { Recorder } from "../src/seat.js";

const CASES = cases();

it("the vendored corpus states cases", () => {
  expect(CASES.length).toBeGreaterThan(0);
});

it("both surfaces are driven", () => {
  expect(Object.keys(SURFACES).sort()).toEqual(["check", "soft"]);
});

/**
 * Hold every record to naming a real call site outside the library.
 *
 * A case cannot state a line: the line is wherever the caller put the
 * call. What every case can state is that the record points somewhere a
 * reader can open, and never at the machinery that built it. Both
 * call-site bugs this standard has found were of that shape.
 *
 * @param one The case that was driven, for the failure message.
 * @param recorder The seat the assertion reported to.
 */
function checkWhere(one: Case, recorder: Recorder): void {
  for (const held of recorder.failures) {
    // A location is optional by the standard, and an assertion that
    // awaits has no caller frame left on the stack to read. What is
    // never allowed is a location that points somewhere useless.
    if (held.where === undefined) continue;
    expect(
      held.where?.line ?? 0,
      `${one.id}: ${held.assertion} reported line zero`,
    ).toBeGreaterThan(0);
    expect(
      held.where?.file ?? "",
      `${one.id}: ${held.assertion} reports the library's own frame`,
    ).not.toContain("/matcher/");
  }
}

for (const surface of Object.keys(SURFACES).sort()) {
  describe(surface, () => {
    for (const one of CASES) {
      // A case naming a behaviour is skipped until this language builds
      // subjects, which is what the standard states for a kind an
      // implementation cannot make.
      const reason = skipReason(one);
      const run = reason === undefined ? it : it.skip;

      run(one.id, async () => {
        if (one.subject !== undefined) {
          const seat = new Recorder().withClock(new Controlled(0));
          const ran = await runSubject(
            surface,
            one.assertion,
            one.subject,
            seat,
            one.id,
          );
          // A kind this language cannot build is a skip, which is what
          // the standard states for one an implementation cannot make.
          expect(ran, `no subject named "${one.subject}" on ${surface}`).toBe(true);
          expect(mismatch(one as Case, seat)).toBeUndefined();
          checkWhere(one as Case, seat);
          return;
        }

        const member = memberFor(one);
        expect(member, `no ${surface} name for ${one.assertion}`).toBeDefined();

        const invoke = SURFACES[surface]?.[member as string];
        expect(invoke, `${surface} has no ${member}`).toBeTypeOf("function");

        const recorder = new Recorder();
        (invoke as (seat: Recorder, ...args: unknown[]) => unknown)(
          recorder,
          ...one.args,
          one.id,
        );

        expect(mismatch(one as Case, recorder)).toBeUndefined();
        checkWhere(one as Case, recorder);
      });
    }
  });
}
