/**
 * The spec of a history: its events in one recording order, its processes,
 * its calls and the usage errors. The orders and the processes are those of
 * the definition's reference implementation.
 */

import { describe } from "vitest";
import { Call, History, identityOf, recorded } from "../../src/history/history.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

describe("history", () => {
  describe("identityOf", () => {
    it("returns one identity for two maps of equal entries in another order", ({
      seat,
    }) => {
      const a = new Map<string, unknown>([
        [
          "x",
          new Map([
            [1, "one"],
            [2, "two"],
          ]),
        ],
        ["y", 2],
      ]);
      const b = new Map<string, unknown>([
        ["y", 2],
        [
          "x",
          new Map([
            [2, "two"],
            [1, "one"],
          ]),
        ],
      ]);

      check.equal(seat, identityOf([a]), identityOf([b]), "one identity");
    });

    it("returns the identity of a map whose two keys have one literal", ({ seat }) => {
      const map = new Map<unknown, string>([
        [1n, "a"],
        [1, "a"],
      ]);

      check.equal(
        seat,
        identityOf(map),
        '{"type":"map","entries":[[{"type":"int","value":1},{"type":"string","value":"a"}],[{"type":"int","value":1},{"type":"string","value":"a"}]]}',
        "two entries of the int 1",
      );
    });

    it("returns another identity for a record with its fields in another order", ({
      seat,
    }) => {
      check.notEqual(
        seat,
        identityOf({ a: 1, b: 2 }),
        identityOf({ b: 2, a: 1 }),
        "two identities",
      );
    });

    it("returns another identity for -0 than for 0", ({ seat }) => {
      check.notEqual(seat, identityOf(-0), identityOf(0), "a float and an int");
    });

    it("returns undefined for a value that no typed literal states", ({ seat }) => {
      check.isNil(
        seat,
        identityOf(() => 1),
        "a function has no literal",
      );
    });
  });

  describe("new History", () => {
    it("returns a history without events", ({ seat }) => {
      check.isEmpty(seat, new History().events(), "no event");
    });
  });

  describe("History.invoke", () => {
    it("numbers the processes in the order of their first invocation", ({ seat }) => {
      const history = new History();
      const first = history.invoke(7, "read", []);
      const second = history.invoke(3, "read", []);
      second.ok(null);
      first.unknown("lost");
      history.invoke(3, "read", []).ok(null);
      history.invoke(7, "read", []);

      check.equal(
        seat,
        history.events().map((event) => [event.client, event.process]),
        [
          [7, 0],
          [3, 1],
          [3, 1],
          [7, 0],
          [3, 1],
          [3, 1],
          [7, 2],
        ],
        "client 7 moves to process 2 after its unknown call",
      );
    });

    it("records the operation, the args and the keys of the invocation", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x", "y");

      check.equal(
        seat,
        history.events(),
        [
          {
            index: 0,
            kind: "invoke",
            call: 0,
            client: 0,
            process: 0,
            operation: "write",
            args: [1],
            keys: ["x", "y"],
          },
        ],
        "one invocation",
      );
    });

    it("throws an Error for a second open call of one client", ({ seat }) => {
      const history = new History();
      history.invoke(0, "read", []);

      check.equal(
        seat,
        thrown(() => history.invoke(0, "read", [])),
        'history: invoke(0, "read") while call 0 of client 0 is open',
        "the refusal",
      );
    });

    it("throws a TypeError for a key that no typed literal states", ({ seat }) => {
      const err = check.throws(
        seat,
        () => new History().invoke(0, "read", [], Symbol("k")),
        "the key is refused",
      );

      check.errorIs(seat, err, TypeError, "a TypeError");
    });
  });

  describe("History.events", () => {
    it("names the call of each event by the index of its invocation", ({ seat }) => {
      const history = new History();
      const a = history.invoke(0, "write", [1], "x");
      const b = history.invoke(1, "write", [2], "x");
      b.ok(null);
      a.ok(null);

      check.equal(
        seat,
        history.events().map((event) => event.call),
        [0, 1, 1, 0],
        "the completions point at their invocations",
      );
    });

    it("returns a copy that a later event leaves as it is", ({ seat }) => {
      const history = new History();
      const events = history.events();
      history.invoke(0, "read", []);

      check.isEmpty(seat, events, "the earlier copy");
    });
  });

  describe("new Call", () => {
    it("returns a call whose completions run the function", ({ seat }) => {
      const completed: unknown[] = [];
      const call = new Call((kind, value) => completed.push([kind, value]));
      call.ok(1);
      call.fail("e");
      call.unknown("u");

      check.equal(
        seat,
        completed,
        [
          ["ok", 1],
          ["fail", "e"],
          ["unknown", "u"],
        ],
        "three completions",
      );
    });
  });

  describe("Call.ok", () => {
    it("records the output of the call", ({ seat }) => {
      const history = new History();
      history.invoke(0, "read", []).ok(5);

      check.equal(
        seat,
        history.events()[1],
        {
          index: 1,
          kind: "ok",
          call: 0,
          client: 0,
          process: 0,
          output: 5,
          error: undefined,
        },
        "the completion",
      );
    });

    it("throws an Error for a call that has completed already", ({ seat }) => {
      const history = new History();
      const call = history.invoke(0, "read", []);
      call.ok(1);
      history.invoke(0, "read", []);

      check.equal(
        seat,
        thrown(() => call.ok(1)),
        "history: call 0 completes a second time",
        "the refusal",
      );
    });
  });

  describe("Call.fail", () => {
    it("records the error of the call on the same process", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1]).fail("refused");
      history.invoke(0, "read", []);

      check.equal(
        seat,
        history.events().map((event) => [event.kind, event.process]),
        [
          ["invoke", 0],
          ["fail", 0],
          ["invoke", 0],
        ],
        "the client continues on process 0",
      );
    });

    it("throws an Error for a call that has completed already", ({ seat }) => {
      const history = new History();
      const call = history.invoke(0, "read", []);
      call.unknown("lost");

      check.equal(
        seat,
        thrown(() => call.fail("e")),
        "history: call 0 completes a second time",
        "the refusal",
      );
    });
  });

  describe("Call.unknown", () => {
    it("records the error of the call", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1]).unknown("timed out");

      check.equal(
        seat,
        history.events()[1],
        {
          index: 1,
          kind: "unknown",
          call: 0,
          client: 0,
          process: 0,
          output: undefined,
          error: "timed out",
        },
        "the completion",
      );
    });

    it("throws an Error for a call that has completed already", ({ seat }) => {
      const history = new History();
      const call = history.invoke(0, "read", []);
      call.fail("refused");

      check.equal(
        seat,
        thrown(() => call.unknown("e")),
        "history: call 0 completes a second time",
        "the refusal",
      );
    });
  });

  describe("recorded", () => {
    it("returns the events and the identities of the keys of each", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x").ok(null);

      check.equal(
        seat,
        recorded(history).ids,
        [['{"type":"string","value":"x"}'], []],
        "a key of the invocation and none of the completion",
      );
    });
  });
});
