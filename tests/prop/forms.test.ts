/** The spec of the property forms. Each form passes a true property and fails a false one. */

import { describe } from "vitest";
import { check, equateNans } from "../../src/index.js";
import type { Seat } from "../../src/matcher/seat.js";
import * as forms from "../../src/prop/forms.js";
import { integer } from "../../src/prop/generators.js";
import {
  type FormOption,
  hermetic,
  seed,
  store,
  using,
} from "../../src/prop/option.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";

/** The options of a reproducible run of the digits. */
const DIGITS: FormOption[] = [using(integer(0, 9)), hermetic(), seed(1n), store("")];

/** The sentinel error of the error forms. */
const SENTINEL = new Error("the sentinel");

/** The contract of every form of this spec. */
const MSG = "the property is true";

/** One form: its export, its id and its assertion's id, and a call that passes and one that fails. */
interface Row {
  readonly name: string;
  readonly assertion: string;
  readonly passing: (seat: Seat) => Promise<void>;
  readonly failing: (seat: Seat) => Promise<void>;
  /** A call that passes only under the relaxation that it passes, for a form that takes relaxations. */
  readonly relaxed?: (seat: Seat) => Promise<void>;
}

/** Returns a counter's state and its observation, which a call raises by one. */
function counter(): { raise: () => void; read: () => number } {
  let count = 0;
  return {
    raise: () => {
      count += 1;
    },
    read: () => count,
  };
}

/** The forms of the spec, by export. */
const ROWS: readonly Row[] = [
  {
    name: "equal",
    assertion: "equal",
    passing: (s) =>
      forms.equal(
        s,
        (x: number) => x,
        (x) => x,
        MSG,
        ...DIGITS,
      ),
    failing: (s) =>
      forms.equal(
        s,
        (x: number) => x,
        () => 0,
        MSG,
        ...DIGITS,
      ),
    relaxed: (s) =>
      forms.equal(
        s,
        () => Number.NaN,
        () => Number.NaN,
        MSG,
        equateNans(),
        ...DIGITS,
      ),
  },
  {
    name: "notEqual",
    assertion: "not-equal",
    passing: (s) =>
      forms.notEqual(
        s,
        (x: number) => x,
        (x) => x + 1,
        MSG,
        ...DIGITS,
      ),
    failing: (s) =>
      forms.notEqual(
        s,
        (x: number) => x,
        (x) => x,
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "isTrue",
    assertion: "true",
    passing: (s) => forms.isTrue(s, (x: number) => x >= 0, MSG, ...DIGITS),
    failing: (s) => forms.isTrue(s, (x: number) => x < 5, MSG, ...DIGITS),
  },
  {
    name: "isFalse",
    assertion: "false",
    passing: (s) => forms.isFalse(s, (x: number) => x < 0, MSG, ...DIGITS),
    failing: (s) => forms.isFalse(s, (x: number) => x >= 5, MSG, ...DIGITS),
  },
  {
    name: "isNil",
    assertion: "nil",
    passing: (s) => forms.isNil(s, () => null, MSG, ...DIGITS),
    failing: (s) => forms.isNil(s, (x: number) => x, MSG, ...DIGITS),
  },
  {
    name: "isNotNil",
    assertion: "not-nil",
    passing: (s) => forms.isNotNil(s, (x: number) => x, MSG, ...DIGITS),
    failing: (s) => forms.isNotNil(s, () => undefined, MSG, ...DIGITS),
  },
  {
    name: "length",
    assertion: "length",
    passing: (s) => forms.length(s, (x: number) => [x], 1, MSG, ...DIGITS),
    failing: (s) => forms.length(s, (x: number) => [x], 2, MSG, ...DIGITS),
  },
  {
    name: "isEmpty",
    assertion: "empty",
    passing: (s) => forms.isEmpty(s, () => [], MSG, ...DIGITS),
    failing: (s) => forms.isEmpty(s, (x: number) => [x], MSG, ...DIGITS),
  },
  {
    name: "isNotEmpty",
    assertion: "not-empty",
    passing: (s) => forms.isNotEmpty(s, (x: number) => [x], MSG, ...DIGITS),
    failing: (s) => forms.isNotEmpty(s, () => "", MSG, ...DIGITS),
  },
  {
    name: "contains",
    assertion: "contains",
    passing: (s) => forms.contains(s, (x: number) => [x, 0], 0, MSG, ...DIGITS),
    failing: (s) => forms.contains(s, (x: number) => [x], 10, MSG, ...DIGITS),
  },
  {
    name: "notContains",
    assertion: "not-contains",
    passing: (s) => forms.notContains(s, (x: number) => [x], 10, MSG, ...DIGITS),
    failing: (s) => forms.notContains(s, (x: number) => [x], 0, MSG, ...DIGITS),
  },
  {
    name: "containsInOrder",
    assertion: "contains-in-order",
    passing: (s) =>
      forms.containsInOrder(s, (x: number) => `a${x}b`, ["a", "b"], MSG, ...DIGITS),
    failing: (s) =>
      forms.containsInOrder(s, (x: number) => `${x}`, ["a"], MSG, ...DIGITS),
  },
  {
    name: "isPermutation",
    assertion: "permutation",
    passing: (s) =>
      forms.isPermutation(
        s,
        (x: number) => [x, 1],
        (x) => [1, x],
        MSG,
        ...DIGITS,
      ),
    failing: (s) =>
      forms.isPermutation(
        s,
        (x: number) => [x],
        () => [10],
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "hasPrefix",
    assertion: "has-prefix",
    passing: (s) => forms.hasPrefix(s, (x: number) => `a${x}`, "a", MSG, ...DIGITS),
    failing: (s) => forms.hasPrefix(s, (x: number) => `${x}`, "a", MSG, ...DIGITS),
  },
  {
    name: "hasSuffix",
    assertion: "has-suffix",
    passing: (s) => forms.hasSuffix(s, (x: number) => `${x}b`, "b", MSG, ...DIGITS),
    failing: (s) => forms.hasSuffix(s, (x: number) => `${x}`, "b", MSG, ...DIGITS),
  },
  {
    name: "matches",
    assertion: "matches",
    passing: (s) => forms.matches(s, (x: number) => `${x}`, "^[0-9]$", MSG, ...DIGITS),
    failing: (s) => forms.matches(s, (x: number) => `${x}`, "^a", MSG, ...DIGITS),
  },
  {
    name: "closeTo",
    assertion: "close-to",
    passing: (s) => forms.closeTo(s, (x: number) => x, 5, 5, MSG, ...DIGITS),
    failing: (s) => forms.closeTo(s, (x: number) => x, 0, 0.5, MSG, ...DIGITS),
  },
  {
    name: "inRange",
    assertion: "in-range",
    passing: (s) => forms.inRange(s, (x: number) => x, 0, 9, MSG, ...DIGITS),
    failing: (s) => forms.inRange(s, (x: number) => x, 0, 4, MSG, ...DIGITS),
  },
  {
    name: "pairwise",
    assertion: "pairwise",
    passing: (s) =>
      forms.pairwise(
        s,
        (x: number) => [x, x + 1],
        (a, b) => a < b,
        MSG,
        ...DIGITS,
      ),
    failing: (s) =>
      forms.pairwise(
        s,
        (x: number) => [x, x],
        (a, b) => a < b,
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "noError",
    assertion: "err-absent",
    passing: (s) => forms.noError(s, () => null, MSG, ...DIGITS),
    failing: (s) =>
      forms.noError(
        s,
        (x: number) => (x >= 5 ? new Error("big") : null),
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "hasError",
    assertion: "err-present",
    passing: (s) => forms.hasError(s, () => new Error("e"), MSG, ...DIGITS),
    failing: (s) => forms.hasError(s, () => null, MSG, ...DIGITS),
  },
  {
    name: "errorIs",
    assertion: "err-is",
    passing: (s) => forms.errorIs(s, () => SENTINEL, SENTINEL, MSG, ...DIGITS),
    failing: (s) => forms.errorIs(s, () => null, SENTINEL, MSG, ...DIGITS),
  },
  {
    name: "errorIsNot",
    assertion: "err-is-not",
    passing: (s) => forms.errorIsNot(s, () => null, SENTINEL, MSG, ...DIGITS),
    failing: (s) => forms.errorIsNot(s, () => SENTINEL, SENTINEL, MSG, ...DIGITS),
  },
  {
    name: "errorAs",
    assertion: "err-as",
    passing: (s) =>
      forms.errorAs(s, () => new TypeError("t"), TypeError, MSG, ...DIGITS),
    failing: (s) => forms.errorAs(s, () => new Error("e"), TypeError, MSG, ...DIGITS),
  },
  {
    name: "throws",
    assertion: "throws",
    passing: (s) =>
      forms.throws(
        s,
        () => {
          throw new Error("e");
        },
        MSG,
        ...DIGITS,
      ),
    failing: (s) => forms.throws(s, () => 1, MSG, ...DIGITS),
  },
  {
    name: "doesNotThrow",
    assertion: "not-throws",
    passing: (s) => forms.doesNotThrow(s, () => 1, MSG, ...DIGITS),
    failing: (s) =>
      forms.doesNotThrow(
        s,
        (x: number) => {
          if (x >= 5) throw new Error("big");
        },
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "isPure",
    assertion: "pure",
    passing: (s) =>
      forms.isPure(
        s,
        () => 0,
        () => undefined,
        MSG,
        ...DIGITS,
      ),
    failing: (s) => {
      const state = counter();
      return forms.isPure(s, state.read, state.raise, MSG, ...DIGITS);
    },
  },
  {
    name: "isNotPure",
    assertion: "not-pure",
    passing: (s) => {
      const state = counter();
      return forms.isNotPure(s, state.read, state.raise, MSG, ...DIGITS);
    },
    failing: (s) =>
      forms.isNotPure(
        s,
        () => 0,
        () => undefined,
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "nullHandleSafe",
    assertion: "nil-context-safe",
    passing: (s) => forms.nullHandleSafe(s, (_signal, x: number) => x, MSG, ...DIGITS),
    failing: (s) =>
      forms.nullHandleSafe(
        s,
        (signal) => (signal as AbortSignal).aborted,
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "honoursCancellation",
    assertion: "honours-cancellation",
    passing: (s) =>
      forms.honoursCancellation(
        s,
        async (signal) => {
          signal.throwIfAborted();
        },
        MSG,
        ...DIGITS,
      ),
    failing: (s) => forms.honoursCancellation(s, async () => "done", MSG, ...DIGITS),
  },
  {
    name: "honoursDeadline",
    assertion: "honours-deadline",
    passing: (s) =>
      forms.honoursDeadline(
        s,
        async (signal) => {
          signal.throwIfAborted();
        },
        MSG,
        ...DIGITS,
      ),
    failing: (s) => forms.honoursDeadline(s, async () => "done", MSG, ...DIGITS),
  },
  {
    name: "isIdempotent",
    assertion: "idempotent",
    passing: (s) => {
      let cell = 0;
      return forms.isIdempotent(
        s,
        (x: number) => {
          cell = x;
        },
        () => cell,
        MSG,
        ...DIGITS,
      );
    },
    failing: (s) => {
      const state = counter();
      return forms.isIdempotent(s, state.raise, state.read, MSG, ...DIGITS);
    },
  },
  {
    name: "accumulates",
    assertion: "accumulates",
    passing: (s) => {
      const state = counter();
      return forms.accumulates(s, state.raise, state.read, MSG, ...DIGITS);
    },
    failing: (s) =>
      forms.accumulates(
        s,
        () => undefined,
        () => 0,
        MSG,
        ...DIGITS,
      ),
  },
  {
    name: "isDeterministic",
    assertion: "deterministic",
    passing: (s) => forms.isDeterministic(s, (x: number) => x, MSG, ...DIGITS),
    failing: (s) => {
      const state = counter();
      return forms.isDeterministic(
        s,
        () => {
          state.raise();
          return state.read();
        },
        MSG,
        ...DIGITS,
      );
    },
  },
  {
    name: "isCommutative",
    assertion: "commutative",
    passing: (s) =>
      forms.isCommutative(s, (a: number, b: number) => a + b, MSG, ...DIGITS),
    failing: (s) =>
      forms.isCommutative(s, (a: number, b: number) => a - b, MSG, ...DIGITS),
  },
  {
    name: "isAssociative",
    assertion: "associative",
    passing: (s) =>
      forms.isAssociative(s, (a: number, b: number) => a + b, MSG, ...DIGITS),
    failing: (s) =>
      forms.isAssociative(s, (a: number, b: number) => a - b, MSG, ...DIGITS),
  },
  {
    name: "roundTrip",
    assertion: "round-trip",
    passing: (s) =>
      forms.roundTrip(
        s,
        (x: number) => String(x),
        (text) => Number(text),
        MSG,
        ...DIGITS,
      ),
    failing: (s) =>
      forms.roundTrip(
        s,
        (x: number) => String(x),
        () => 0,
        MSG,
        ...DIGITS,
      ),
  },
];

describe("forms", () => {
  describe("FORM_IDS", () => {
    it("lists the id of every form that the module exports", ({ seat }) => {
      check.equal(
        seat,
        forms.FORM_IDS,
        ROWS.map((row) => `prop-${row.assertion}`),
        "the 37 ids",
      );
    });
  });

  for (const row of ROWS) {
    describe(row.name, () => {
      it("passes a property that is true for every input", async ({ seat }) => {
        const recorder = new Recorder();
        await row.passing(recorder);

        check.isEmpty(seat, recorder.failures, "no failure");
      });

      it(`fails with a record of prop-${row.assertion} whose case failed ${row.assertion}`, async ({
        seat,
      }) => {
        const recorder = new Recorder();
        await row.failing(recorder);
        const [failure] = recorder.failures;

        check.equal(
          seat,
          [failure?.assertion, failure?.contract, failure?.caseFailure?.assertion],
          [`prop-${row.assertion}`, MSG, row.assertion],
          "the form's record",
        );
      });

      const relaxed = row.relaxed;
      if (relaxed !== undefined) {
        it("passes the relaxations to the assertion", async ({ seat }) => {
          const recorder = new Recorder();
          await relaxed(recorder);

          check.isEmpty(seat, recorder.failures, "the relaxation applies");
        });
      }
    });
  }
});
