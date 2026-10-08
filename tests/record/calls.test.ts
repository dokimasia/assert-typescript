/** The spec of the call records of a test, of a recorder and of a run of a body. */

import { describe } from "vitest";
import { byIdentity, check } from "../../src/index.js";
import type { Call } from "../../src/record/call.js";
import {
  add,
  Calls,
  callsOf,
  cut,
  keep,
  lines,
  own,
  run,
  Slot,
  write,
} from "../../src/record/calls.js";
import { test as it } from "../../src/vitest.js";

/** Returns the record of a passing call of assertion. */
function call(assertion: string): Call {
  return { assertion, contract: "c", verdict: "pass", aborting: true };
}

/** Returns the lines of calls, parsed. */
function parsed(calls: Calls): Record<string, unknown>[] {
  return lines(calls).map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Returns a seat whose calls keep their records. */
function keeping(): object {
  const seat = {};
  keep(own(seat));
  return seat;
}

describe("calls", () => {
  describe("own", () => {
    it("returns the same calls for one seat", ({ seat }) => {
      const subject = {};
      const first = own(subject);

      check.equal(
        seat,
        own(subject),
        first,
        "a seat has one set of calls",
        byIdentity(),
      );
    });

    it("returns calls that record nothing for a new seat", ({ seat }) => {
      const calls = own({});
      add(calls, call("true"));

      check.equal(seat, lines(calls), [], "new calls keep no record");
    });
  });

  describe("callsOf", () => {
    it("returns undefined for a seat without calls", ({ seat }) => {
      check.equal(seat, callsOf({}), undefined, "an unknown seat has no calls");
    });

    it("returns undefined for a seat whose calls record nothing", ({ seat }) => {
      const subject = {};
      own(subject);

      check.equal(
        seat,
        callsOf(subject),
        undefined,
        "calls that are off record nothing",
      );
    });

    it("returns the calls of a seat that keeps its records", ({ seat }) => {
      const subject = keeping();

      check.isTrue(seat, callsOf(subject) === own(subject), "the calls of the seat");
    });
  });

  describe("keep", () => {
    it("numbers the calls from 1", ({ seat }) => {
      const calls = new Calls();
      keep(calls);
      add(calls, call("true"));
      add(calls, call("false"));

      check.equal(
        seat,
        parsed(calls).map((r) => r["seq"]),
        [1, 2],
        "the numbers",
      );
    });

    it("drops the records that the calls kept before", ({ seat }) => {
      const calls = new Calls();
      keep(calls);
      add(calls, call("true"));
      keep(calls);

      check.equal(seat, lines(calls), [], "keep starts over");
    });
  });

  describe("write", () => {
    it("writes each record through the sink with its number", ({ seat }) => {
      const written: [number, string][] = [];
      const calls = new Calls();
      write(calls, (seq, line) => written.push([seq, line]));
      add(calls, call("true"));

      check.equal(
        seat,
        written.map(([seq, line]) => [seq, JSON.parse(line).assertion]),
        [[1, "true"]],
        "the sink receives the record",
      );
    });
  });

  describe("lines", () => {
    it("returns no line for a call that still runs a body", ({ seat }) => {
      const subject = keeping();
      Slot.begin(subject);

      check.equal(seat, lines(own(subject)), [], "a running call has no line yet");
    });
  });

  describe("add", () => {
    it("keeps the call of a run without a number", ({ seat }) => {
      const subject = keeping();
      const body = new Calls();
      run(body, Slot.begin(subject));
      add(body, call("true"));

      check.equal(
        seat,
        [body.entries.length, body.entries[0]?.seq],
        [1, 0],
        "the call waits for its slot",
      );
    });
  });

  describe("run", () => {
    it("makes calls record nothing for a call that is not recorded", ({ seat }) => {
      const body = new Calls();
      run(body, undefined);
      add(body, call("true"));

      check.equal(seat, body.entries, [], "the run records nothing");
    });
  });

  describe("cut", () => {
    it("drops the calls of a run made at the step or after it", ({ seat }) => {
      const subject = keeping();
      const slot = Slot.begin(subject) as Slot;
      let steps = 0;
      const body = new Calls();
      run(body, slot, () => steps);
      add(body, call("first"));
      steps = 3;
      add(body, call("second"));
      cut(body, 3);
      slot.take(body);

      check.equal(
        seat,
        parsed(own(subject)).map((r) => r["assertion"]),
        ["first"],
        "the call at step 3 is dropped",
      );
    });
  });

  describe("Slot.begin", () => {
    it("numbers its call before the calls of its body", ({ seat }) => {
      const subject = keeping();
      const slot = Slot.begin(subject) as Slot;
      const body = new Calls();
      run(body, slot);
      add(body, call("true"));
      slot.take(body);
      slot.write(call("eventually"));

      check.equal(
        seat,
        parsed(own(subject)).map((r) => [
          r["seq"],
          r["parent"],
          r["run"],
          r["assertion"],
        ]),
        [
          [1, undefined, undefined, "eventually"],
          [2, 1, 1, "true"],
        ],
        "the outer call takes 1",
      );
    });

    it("returns undefined for a seat whose calls record nothing", ({ seat }) => {
      check.equal(seat, Slot.begin({}), undefined, "an unrecorded call has no slot");
    });
  });

  describe("Slot.take", () => {
    it("counts a run without calls among the runs of the body", ({ seat }) => {
      const subject = keeping();
      const slot = Slot.begin(subject) as Slot;
      const first = new Calls();
      run(first, slot);
      slot.take(first, "simplest");
      const second = new Calls();
      run(second, slot);
      add(second, call("true"));
      slot.take(second, "random");
      slot.write(call("prop-for-all"));

      check.equal(
        seat,
        parsed(own(subject)).map((r) => [r["seq"], r["run"], r["phase"]]),
        [
          [1, undefined, undefined],
          [2, 2, "random"],
        ],
        "the second run is run 2",
      );
    });

    it("keeps the parent of a call of a nested body", ({ seat }) => {
      const subject = keeping();
      const outer = Slot.begin(subject) as Slot;
      const second = {};
      run(own(second), outer);
      const nested = Slot.begin(second) as Slot;
      const nestedBody = new Calls();
      run(nestedBody, nested);
      add(nestedBody, call("true"));
      nested.take(nestedBody);
      nested.write(call("eventually"));
      outer.take(own(second), "random");
      outer.write(call("prop-for-all"));

      check.equal(
        seat,
        parsed(own(subject)).map((r) => [
          r["seq"],
          r["parent"],
          r["run"],
          r["assertion"],
        ]),
        [
          [1, undefined, undefined, "prop-for-all"],
          [2, 1, 1, "eventually"],
          [3, 2, 1, "true"],
        ],
        "the nested call keeps its own parent",
      );
    });
  });

  describe("Slot.write", () => {
    it("writes the record under the number that its call took", ({ seat }) => {
      const subject = keeping();
      const slot = Slot.begin(subject) as Slot;
      add(own(subject), call("later"));
      slot.write(call("eventually"));

      check.equal(
        seat,
        parsed(own(subject)).map((r) => [r["seq"], r["assertion"]]),
        [
          [1, "eventually"],
          [2, "later"],
        ],
        "the slot's call keeps number 1",
      );
    });
  });
});
