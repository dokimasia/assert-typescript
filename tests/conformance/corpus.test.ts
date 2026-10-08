/**
 * The spec of the corpus and of its verdicts. It drives every case of the
 * vendored corpus against both surfaces, and compares the failure and the
 * call record of each run with the case. It uses vitest's `expect` alone,
 * because mismatch decides the verdict of every case.
 */

import { describe, expect, it } from "vitest";
import * as check from "../../src/check.js";
import { Controlled } from "../../src/clock.js";
import {
  type Case,
  cases,
  memberFor,
  mismatch,
  optionsOf,
  SURFACES,
  skipReason,
} from "../../src/conformance/corpus.js";
import { runSubject } from "../../src/conformance/driver.js";
import { Failure } from "../../src/failure.js";
import { Mode } from "../../src/matcher/seat.js";
import { Running } from "../../src/matcher/verdict.js";
import { Recorder } from "../../src/seat.js";

const CASES = cases();

/** A failing case of equal, which states the detail want 2. */
const FAILING: Case = {
  id: "equal/x",
  assertion: "equal",
  args: [],
  options: [],
  expect: "fail",
  detail: { want: 2 },
  fields: ["want", "got"],
  skip: {},
};

/** A passing case of equal. */
const PASSING: Case = { ...FAILING, expect: "pass", detail: {} };

/** Returns the record of a failure of equal that matches the failing case. */
function matching(): Failure {
  return new Failure("equal", "equal/x", { want: 2, got: 1 });
}

/** Returns a recorder that received the record of one failure, sent to it directly. */
function reported(
  assertion: string,
  contract: string,
  detail: Record<string, unknown>,
) {
  const seat = new Recorder();
  seat.report(new Failure(assertion, contract, detail), true);
  return seat;
}

/**
 * Checks that each failure of a recorder names a call site in this spec.
 * A case cannot state a line, because the line is where the caller put the
 * call, but the site is never a frame of the library.
 */
function checkWhere(one: Case, recorder: Recorder): void {
  for (const held of recorder.failures) {
    expect(
      held.where,
      `${one.id}: ${held.assertion} reported no call site`,
    ).toBeDefined();
    expect(held.where?.line ?? 0, `${one.id}: the line is above 0`).toBeGreaterThan(0);
    expect(held.where?.file ?? "", `${one.id}: the site is this spec`).toContain(
      "corpus.test.ts",
    );
  }
}

/** Drives one case on one surface, and returns the recorder that it reported to. */
async function drive(surface: string, one: Case): Promise<Recorder> {
  const options = optionsOf(one);
  const seat = new Recorder().withClock(new Controlled(0));
  if (one.subject !== undefined) {
    const ran = await runSubject(
      surface,
      one.assertion,
      one.subject,
      seat,
      one.id,
      options,
    );
    expect(ran, `no subject named "${one.subject}" on ${surface}`).toBe(true);
    return seat;
  }
  const member = memberFor(one);
  const invoke = SURFACES[surface]?.[member as string];
  expect(invoke, `${surface} has no member for ${one.assertion}`).toBeTypeOf(
    "function",
  );
  await (invoke as (seat: Recorder, ...args: unknown[]) => unknown)(
    seat,
    ...one.args,
    one.id,
    ...options,
  );
  return seat;
}

describe("corpus", () => {
  describe("cases", () => {
    it("returns the cases of the vendored corpus", () => {
      expect(CASES.length).toBeGreaterThan(0);
    });

    it("sets the fields of a case to the detail fields of its assertion", () => {
      expect(CASES.find((one) => one.assertion === "equal")?.fields).toEqual([
        "want",
        "got",
      ]);
    });
  });

  describe("SURFACES", () => {
    it("contains the two surfaces", () => {
      expect(Object.keys(SURFACES).sort()).toEqual(["check", "soft"]);
    });
  });

  describe("skipReason", () => {
    it("returns the reason of a skip of TypeScript", () => {
      expect(skipReason({ ...PASSING, skip: { typescript: "one number type" } })).toBe(
        "one number type",
      );
    });

    it("returns undefined for a skip of another language", () => {
      expect(skipReason({ ...PASSING, skip: { go: "a reason" } })).toBeUndefined();
    });
  });

  describe("memberFor", () => {
    it("returns the TypeScript name of the assertion of the case", () => {
      expect(memberFor({ ...PASSING, assertion: "not-equal" })).toBe("notEqual");
    });

    it("returns undefined for an assertion without a name", () => {
      expect(memberFor({ ...PASSING, assertion: "no-such-assertion" })).toBeUndefined();
    });
  });

  describe("optionsOf", () => {
    it("returns the option of each relaxation that the case names", () => {
      expect(optionsOf({ ...PASSING, options: ["equate-empty"] })).toEqual([
        { kind: "equate-empty" },
      ]);
    });

    it("throws for a relaxation without a TypeScript name", () => {
      expect(() => optionsOf({ ...PASSING, options: ["no-such-relaxation"] })).toThrow(
        "equal/x: no option names no-such-relaxation",
      );
    });
  });

  describe("mismatch", () => {
    it("returns the failure of a case that expects a pass", () => {
      const failed = new Recorder();
      failed.fail("it broke");

      expect(mismatch(PASSING, failed, true)).toBe("expected a pass, got: it broke");
    });

    it("returns the pass of a case that expects a failure", () => {
      expect(mismatch(FAILING, new Recorder(), true)).toBe(
        "expected a failure, got a pass",
      );
    });

    it("returns a failure without a record", () => {
      const failed = new Recorder();
      failed.fail("it broke");

      expect(mismatch(FAILING, failed, true)).toBe(
        "reported no record; the assertion did not report one",
      );
    });

    it("returns a record of another assertion", () => {
      expect(mismatch(FAILING, reported("not-equal", "equal/x", {}), true)).toBe(
        "the record is of not-equal, want equal",
      );
    });

    it("returns a record of another contract", () => {
      expect(mismatch(FAILING, reported("equal", "x", { want: 1, got: 2 }), true)).toBe(
        'the record states the contract "x", want "equal/x"',
      );
    });

    it("returns a record of other fields", () => {
      expect(mismatch(FAILING, reported("equal", "equal/x", { want: 1 }), true)).toBe(
        'the record states the fields ["want"], want ["got","want"]',
      );
    });

    it("returns a field of a record whose value differs from the case", () => {
      expect(
        mismatch(FAILING, reported("equal", "equal/x", { want: 1, got: 2 }), true),
      ).toBe('detail "want" is number:1, want number:2');
    });

    it("returns a recorder that keeps no call record", () => {
      expect(
        mismatch(
          { ...FAILING, detail: {} },
          reported("equal", "equal/x", { want: 1, got: 2 }),
          true,
        ),
      ).toBe("the recorder keeps 0 call records, want 1");
    });

    it("returns a call record of the other surface", () => {
      const seat = new Recorder();
      check.equal(seat, 1, 2, "equal/x");

      expect(mismatch(FAILING, seat, false)).toContain("the call record is ");
    });

    it("returns a field of the failure of a call whose value differs from the case", () => {
      const seat = new Recorder();
      check.equal(seat, 1, 2, "equal/x");

      expect(mismatch({ ...FAILING, detail: { want: 3 } }, seat, true)).toBe(
        'detail "want" is number:2, want number:3',
      );
    });

    it("returns undefined for a failure that matches the case", () => {
      const seat = new Recorder();
      check.equal(seat, 1, 2, "equal/x");

      expect(mismatch(FAILING, seat, true)).toBeUndefined();
    });

    it("returns undefined for a pass that matches the case", () => {
      const seat = new Recorder();
      check.equal(seat, 1, 1, "equal/x");

      expect(mismatch(PASSING, seat, true)).toBeUndefined();
    });

    it("returns the detail of a passing call record", () => {
      const seat = new Recorder();
      Running.of(seat).passRun(Mode.Fatal, "equal", "equal/x", undefined, { x: 1 });

      expect(mismatch(PASSING, seat, true)).toBe(
        'a passing call record states the detail {"x":1}',
      );
    });

    it("returns the fields of a call record that differ from the case", () => {
      const seat = new Recorder();
      Running.of(seat).failRun(Mode.Fatal, matching(), { x: 1 });

      expect(mismatch(FAILING, seat, true)).toBe(
        'the call record states the fields ["x"], want ["got","want"]',
      );
    });

    it("returns a field of a call record that is no typed literal", () => {
      const seat = new Recorder();
      Running.of(seat).failRun(Mode.Fatal, matching(), {
        want: { type: "decimal" },
        got: { type: "int", value: 1 },
      });

      expect(mismatch(FAILING, seat, true)).toBe(
        "the call record's want is no typed literal: unknown literal type: decimal",
      );
    });

    it("returns a field of a call record whose value differs from the case", () => {
      const seat = new Recorder();
      Running.of(seat).failRun(Mode.Fatal, matching(), {
        want: { type: "int", value: 3 },
        got: { type: "int", value: 1 },
      });

      expect(mismatch(FAILING, seat, true)).toBe(
        'the call record\'s want is {"type":"int","value":3}, want number:2',
      );
    });

    for (const surface of Object.keys(SURFACES).sort()) {
      for (const one of CASES) {
        const run = skipReason(one) === undefined ? it : it.skip;
        run(`returns undefined for case ${one.id} on ${surface}`, async () => {
          const seat = await drive(surface, one);

          expect(mismatch(one, seat, surface === "check")).toBeUndefined();
          checkWhere(one, seat);
        });
      }
    }
  });
});
