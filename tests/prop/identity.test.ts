/** The spec of the identity of a property's failure. */

import { describe } from "vitest";
import { Failure } from "../../src/failure.js";
import { check } from "../../src/index.js";
import {
  entryOf,
  fromKey,
  type Identity,
  keyOf,
  ofError,
  ofRecord,
  textOf,
} from "../../src/prop/identity.js";
import { test as it } from "../../src/vitest.js";

/** A location of a failure. */
const WHERE = { file: "/work/tests/order.test.ts", line: 12 };

/** The location that a value without a stack takes. */
const FALLBACK = { file: "/work/tests/call.test.ts", line: 3 };

describe("identity", () => {
  describe("ofRecord", () => {
    it("identifies an assertion's record without its contract", ({ seat }) => {
      check.equal(
        seat,
        ofRecord(new Failure("equal", "the total", {}, WHERE)),
        { assertion: "equal", contract: undefined, where: WHERE },
        "the identity has no contract",
      );
    });

    it("identifies a record without a location by its contract", ({ seat }) => {
      check.equal(
        seat,
        ofRecord(new Failure("equal", "the total", {})),
        { assertion: "equal", contract: "the total", where: undefined },
        "the identity has the contract",
      );
    });

    it("returns the location alone of a message", ({ seat }) => {
      check.equal(
        seat,
        ofRecord(new Failure("", "it broke", {}, WHERE)),
        { assertion: undefined, contract: undefined, where: WHERE },
        "a message is no part of an identity",
      );
    });
  });

  describe("ofError", () => {
    it("identifies a raised error by its class at the frame of this file", ({
      seat,
    }) => {
      const identity = ofError(new TypeError("bad"), FALLBACK);

      check.equal(seat, identity.error, "TypeError", "the class of the error");
      check.hasSuffix(
        seat,
        identity.where?.file,
        "identity.test.ts",
        "the frame is this file's",
      );
    });

    it("returns the fallback for an error whose stack has no frame of the caller's code", ({
      seat,
    }) => {
      const err = new Error("bad");
      err.stack = "Error: bad\n    at node:internal/main:1:1";

      check.equal(
        seat,
        ofError(err, FALLBACK),
        { error: "Error", where: FALLBACK },
        "the fallback",
      );
    });

    const tests = [
      { name: "the kind of a primitive", give: "text" as unknown, want: "string" },
      { name: "null for null", give: null as unknown, want: "null" },
      {
        name: "Object for an object without a prototype",
        give: Object.create(null) as unknown,
        want: "Object",
      },
      {
        name: "Object for an instance of an anonymous class",
        give: new (class {})() as unknown,
        want: "Object",
      },
      { name: "Function for a function", give: (() => 1) as unknown, want: "Function" },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name} as the type of a raised value`, ({ seat }) => {
        check.equal(
          seat,
          ofError(tt.give, FALLBACK),
          { error: tt.want, where: FALLBACK },
          "the type",
        );
      });
    }
  });

  describe("keyOf", () => {
    it("returns one text for two equal identities", ({ seat }) => {
      const a: Identity = { assertion: "equal", where: { ...WHERE } };
      const b: Identity = { assertion: "equal", where: { ...WHERE } };

      check.equal(seat, keyOf(a), keyOf(b), "equal identities share a text");
    });

    it("returns two texts for identities of two lines", ({ seat }) => {
      const a: Identity = { assertion: "equal", where: WHERE };
      const b: Identity = { assertion: "equal", where: { ...WHERE, line: 13 } };

      check.notEqual(seat, keyOf(a), keyOf(b), "the line is part of the identity");
    });
  });

  describe("fromKey", () => {
    it("returns the identity of an error's text", ({ seat }) => {
      const identity: Identity = {
        assertion: undefined,
        contract: undefined,
        error: "TypeError",
        where: WHERE,
      };

      check.equal(seat, fromKey(keyOf(identity)), identity, "the identity comes back");
    });

    it("returns the identity of a record without a location", ({ seat }) => {
      const identity: Identity = {
        assertion: "equal",
        contract: "c",
        error: undefined,
        where: undefined,
      };

      check.equal(seat, fromKey(keyOf(identity)), identity, "the identity comes back");
    });
  });

  describe("textOf", () => {
    const tests = [
      {
        name: "a raised value",
        give: { error: "TypeError", where: WHERE },
        want: "a TypeError thrown at order.test.ts:12",
      },
      {
        name: "a message",
        give: { where: WHERE },
        want: "a message at order.test.ts:12",
      },
      {
        name: "an assertion's record",
        give: { assertion: "equal", where: WHERE },
        want: "equal at order.test.ts:12",
      },
      {
        name: "a record without a location",
        give: { assertion: "equal", contract: "c" },
        want: 'equal of "c"',
      },
      { name: "a message without a location", give: {}, want: "a message" },
    ];
    for (const tt of tests) {
      it(`returns the text of ${tt.name}`, ({ seat }) => {
        check.equal(seat, textOf(tt.give), tt.want, "the text");
      });
    }
  });

  describe("entryOf", () => {
    const tests = [
      {
        name: "an assertion's record",
        give: { assertion: "equal", where: WHERE },
        want: { assertion: "equal", file: "order.test.ts", line: 12 },
      },
      {
        name: "a record without a location",
        give: { assertion: "equal", contract: "c" },
        want: { assertion: "equal", contract: "c" },
      },
      {
        name: "a raised value",
        give: { error: "TypeError", where: WHERE },
        want: { error: "TypeError", file: "order.test.ts", line: 12 },
      },
      {
        name: "a message",
        give: { where: WHERE },
        want: { file: "order.test.ts", line: 12 },
      },
    ];
    for (const tt of tests) {
      it(`returns the entry's identity of ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          entryOf(tt.give),
          tt.want,
          "the base name of the file and the line",
        );
      });
    }
  });
});
