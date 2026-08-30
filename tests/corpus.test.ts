/**
 * The corpus, driven against both surfaces.
 *
 * Every case runs twice, once per surface. The two carrying the same
 * assertions means they produce the same outcome from the same case,
 * and running one and trusting the other would leave that untested.
 */

import { describe, expect, it } from "vitest";
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

for (const surface of Object.keys(SURFACES).sort()) {
  describe(surface, () => {
    for (const one of CASES) {
      const reason = skipReason(one);
      const run = reason === undefined ? it : it.skip;

      run(one.id, () => {
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
      });
    }
  });
}
