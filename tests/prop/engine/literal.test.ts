/** The spec of typed literals: what each decodes to, and the one literal of each value. */

import { describe } from "vitest";
import { check, prop } from "../../../src/index.js";
import {
  decode,
  encode,
  integer,
  type Literal,
  LiteralError,
  number,
  plain,
} from "../../../src/prop/engine/literal.js";
import { canonical, Fields, Pairs, Variant } from "../../../src/prop/engine/value.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** The largest integer that a JSON number states exactly in every language. */
const SAFE = 2 ** 53 - 1;

describe("literal", () => {
  describe("new LiteralError", () => {
    it("returns the error of a literal", ({ seat }) => {
      const err = new LiteralError("prop: 1 is no typed literal");

      check.equal(
        seat,
        [err.name, err.message],
        ["LiteralError", "prop: 1 is no typed literal"],
        "the name and the message",
      );
    });
  });

  describe("integer", () => {
    it("returns a safe JSON integer as a bigint", ({ seat }) => {
      check.equal(seat, integer(-3), -3n, "-3");
    });

    it("returns an integer beyond 2^53 − 1 stated as a decimal string", ({ seat }) => {
      check.equal(
        seat,
        [integer(String(SAFE + 1)), integer(`-${SAFE + 1}`)],
        [BigInt(SAFE) + 1n, -BigInt(SAFE) - 1n],
        "both signs",
      );
    });

    const tests = [
      {
        name: "an unsafe JSON number",
        give: (SAFE + 1) as unknown,
        want: `prop: ${SAFE + 1} is beyond 2^53 - 1; state it as a string`,
      },
      {
        name: "a safe integer stated as a string",
        give: "3",
        want: 'prop: "3" is no canonical large integer',
      },
      {
        name: "a large integer with a leading zero",
        give: "09007199254740993",
        want: 'prop: "09007199254740993" is no canonical large integer',
      },
      { name: "a boolean", give: true, want: "prop: true is no integer" },
    ];
    for (const tt of tests) {
      it(`throws a LiteralError for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => integer(tt.give)),
          tt.want,
          "the refusal",
        );
      });
    }
  });

  describe("number", () => {
    it("returns the float of a JSON number or a named float", ({ seat }) => {
      const named = [number(1.5), number("Inf"), number("-Inf")];

      check.isTrue(
        seat,
        named[0] === 1.5 &&
          named[1] === Number.POSITIVE_INFINITY &&
          named[2] === Number.NEGATIVE_INFINITY &&
          Number.isNaN(number("NaN")),
        "1.5, Inf, -Inf and NaN",
      );
    });

    it("throws a LiteralError for a name that the encoding does not define", ({
      seat,
    }) => {
      check.equal(
        seat,
        thrown(() => number("Infinity")),
        'prop: "Infinity" is no float',
        "the refusal",
      );
    });

    it("throws a LiteralError for a value that is neither a number nor a name", ({
      seat,
    }) => {
      check.equal(
        seat,
        thrown(() => number(true)),
        "prop: true is no float",
        "the refusal",
      );
    });
  });

  describe("plain", () => {
    const tests = [
      { name: "a finite float as itself", give: 1.5 as unknown, want: 1.5 as unknown },
      { name: "NaN by its name", give: Number.NaN, want: "NaN" },
      {
        name: "positive infinity by its name",
        give: Number.POSITIVE_INFINITY,
        want: "Inf",
      },
      {
        name: "negative infinity by its name",
        give: Number.NEGATIVE_INFINITY,
        want: "-Inf",
      },
      { name: "a safe bigint as a number", give: 7n, want: 7 },
      {
        name: "an unsafe bigint as a decimal string",
        give: -(2n ** 60n),
        want: String(-(2n ** 60n)),
      },
      { name: "a string as itself", give: "x", want: "x" },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, plain(tt.give), tt.want, "the JSON form");
      });
    }
  });

  describe("decode", () => {
    const tests = [
      { name: "null to undefined", give: { type: "null" }, want: undefined as unknown },
      { name: "a bool", give: { type: "bool", value: true }, want: true },
      { name: "an int to a bigint", give: { type: "int", value: -3 }, want: -3n },
      { name: "a float", give: { type: "float", value: 1 }, want: 1 },
      {
        name: "a named float",
        give: { type: "float", value: "-Inf" },
        want: Number.NEGATIVE_INFINITY,
      },
      { name: "a string", give: { type: "string", value: "x" }, want: "x" },
      {
        name: "bytes from lowercase hexadecimal",
        give: { type: "bytes", value: "00ff" },
        want: Uint8Array.of(0, 255),
      },
      { name: "no bytes", give: { type: "bytes", value: "" }, want: Uint8Array.of() },
      {
        name: "a list of one scalar type",
        give: { type: "list", of: "int", value: [1, 2] },
        want: [1n, 2n],
      },
      {
        name: "a list of items",
        give: { type: "list", items: [{ type: "int", value: 1 }, { type: "null" }] },
        want: [1n, undefined],
      },
      {
        name: "a map of entries",
        give: {
          type: "map",
          entries: [
            [
              { type: "int", value: 2 },
              { type: "bool", value: true },
            ],
          ],
        },
        want: new Pairs([[2n, true]]),
      },
      {
        name: "a map of string keys",
        give: { type: "map", key: "string", of: "int", value: { a: 1 } },
        want: new Pairs([["a", 1n]]),
      },
      {
        name: "a record with its fields in order",
        give: {
          type: "record",
          fields: [
            ["id", { type: "int", value: 7 }],
            ["note", { type: "null" }],
          ],
        },
        want: new Fields([
          ["id", 7n],
          ["note", undefined],
        ]),
      },
      {
        name: "an absent list of a stated type to undefined",
        give: { type: "list", of: "int", value: null },
        want: undefined,
      },
      {
        name: "an absent map of a stated type to undefined",
        give: { type: "map", key: "string", of: "int", value: null },
        want: undefined,
      },
      {
        name: "a reference to the value that it refers to",
        give: { type: "reference", id: "a", value: { type: "int", value: 1 } },
        want: 1n,
      },
    ];
    for (const tt of tests) {
      it(`decodes ${tt.name}`, ({ seat }) => {
        check.equal(seat, canonical(decode(tt.give)), canonical(tt.want), "the value");
      });
    }

    it("decodes NaN by its name", ({ seat }) => {
      check.isTrue(seat, Number.isNaN(decode({ type: "float", value: "NaN" })), "NaN");
    });

    it("decodes a variant without a payload apart from one with a null payload", ({
      seat,
    }) => {
      const bare = decode({ type: "variant", name: "pending" }) as Variant;
      const absent = decode({
        type: "variant",
        name: "note",
        payload: { type: "null" },
      }) as Variant;

      check.equal(
        seat,
        [bare.name, bare.hasPayload, absent.name, absent.hasPayload, absent.payload],
        ["pending", false, "note", true, undefined],
        "two variants",
      );
    });

    const refusals = [
      {
        name: "an absent list of an unknown type",
        give: { type: "list", of: "widget", value: null } as unknown,
      },
      { name: "an absent list without a type", give: { type: "list", value: null } },
      {
        name: "an absent map with integer keys",
        give: { type: "map", key: "int", of: "int", value: null },
      },
      {
        name: "an absent map of an unknown type",
        give: { type: "map", key: "string", of: "widget", value: null },
      },
      { name: "a JSON array", give: [1] },
      { name: "null", give: null },
      { name: "an int stated as a short string", give: { type: "int", value: "3" } },
      { name: "an int stated as a boolean", give: { type: "int", value: true } },
      {
        name: "an unsafe int stated as a number",
        give: { type: "int", value: SAFE + 1 },
      },
      {
        name: "a large int with a leading zero",
        give: { type: "int", value: "09007199254740993" },
      },
      { name: "a float named Infinity", give: { type: "float", value: "Infinity" } },
      { name: "a bool stated as a number", give: { type: "bool", value: 1 } },
      { name: "a string stated as a number", give: { type: "string", value: 1 } },
      {
        name: "bytes with a character outside hexadecimal",
        give: { type: "bytes", value: "0G" },
      },
      { name: "bytes in uppercase", give: { type: "bytes", value: "FF" } },
      {
        name: "a list with a value of another type",
        give: { type: "list", of: "int", value: [1, "2"] },
      },
      {
        name: "a list whose value is no list",
        give: { type: "list", of: "int", value: 1 },
      },
      { name: "a list whose items are no list", give: { type: "list", items: 1 } },
      {
        name: "a map of integer keys stated as an object",
        give: { type: "map", key: "int", of: "int", value: {} },
      },
      {
        name: "a map of string keys whose value is a list",
        give: { type: "map", key: "string", of: "int", value: [] },
      },
      {
        name: "a map whose entry is no pair",
        give: { type: "map", entries: [[{ type: "null" }]] },
      },
      { name: "a map whose entries are no list", give: { type: "map", entries: 1 } },
      {
        name: "a set that the encoding does not define",
        give: { type: "set", value: [] },
      },
      {
        name: "a record whose fields are an object",
        give: { type: "record", fields: { id: { type: "int", value: 1 } } },
      },
      {
        name: "a record field without a value",
        give: { type: "record", fields: [["id"]] },
      },
      {
        name: "a record field without a name",
        give: { type: "record", fields: [["", { type: "null" }]] },
      },
      {
        name: "a record field whose name is no string",
        give: { type: "record", fields: [[1, { type: "null" }]] },
      },
      {
        name: "a record that names a field twice",
        give: {
          type: "record",
          fields: [
            ["id", { type: "null" }],
            ["id", { type: "null" }],
          ],
        },
      },
      {
        name: "a record field whose literal lacks its value",
        give: { type: "record", fields: [["id", { type: "int" }]] },
      },
      { name: "a variant without a name", give: { type: "variant" } },
      { name: "a variant with an empty name", give: { type: "variant", name: "" } },
      {
        name: "a variant whose payload is no literal",
        give: { type: "variant", name: "x", payload: 1 },
      },
      {
        name: "a reference without an id",
        give: { type: "reference", value: { type: "int", value: 1 } },
      },
      {
        name: "a reference with an empty id",
        give: { type: "reference", id: "", value: { type: "int", value: 1 } },
      },
      {
        name: "a reference whose id is no string",
        give: { type: "reference", id: 1, value: { type: "int", value: 1 } },
      },
      {
        name: "a reference to null",
        give: { type: "reference", id: "a", value: { type: "null" } },
      },
      {
        name: "a reference whose value is no literal",
        give: { type: "reference", id: "a", value: 1 },
      },
    ];
    for (const tt of refusals) {
      it(`throws a LiteralError for ${tt.name}`, ({ seat }) => {
        const err = check.throws(seat, () => decode(tt.give), "the literal is refused");

        check.errorIs(seat, err, LiteralError, "the error is a LiteralError");
      });
    }

    it("throws nothing but a LiteralError for any JSON value", async ({ seat }) => {
      await prop.fuzz(seat, "decode throws nothing but a LiteralError", (c) => {
        const text = Buffer.from(c.draw(prop.bytes(), "text")).toString("latin1");
        let value: unknown;
        try {
          value = JSON.parse(text);
        } catch {
          return;
        }
        try {
          decode(value);
        } catch (err) {
          check.errorIs(c, err, LiteralError, "the refusal is a LiteralError");
        }
      });
    });
  });

  describe("encode", () => {
    const tests: { name: string; give: unknown; want: Literal }[] = [
      {
        name: "the of form for a list of one scalar type",
        give: [7n, 3n],
        want: { type: "list", of: "int", value: [7, 3] },
      },
      { name: "items for an empty list", give: [], want: { type: "list", items: [] } },
      {
        name: "items for a list of mixed types",
        give: [1n, [2n]],
        want: {
          type: "list",
          items: [
            { type: "int", value: 1 },
            { type: "list", of: "int", value: [2] },
          ],
        },
      },
      {
        name: "items for a list of booleans and integers",
        give: [true, 1n],
        want: {
          type: "list",
          items: [
            { type: "bool", value: true },
            { type: "int", value: 1 },
          ],
        },
      },
      {
        name: "NaN by its name",
        give: Number.NaN,
        want: { type: "float", value: "NaN" },
      },
      {
        name: "negative infinity by its name",
        give: Number.NEGATIVE_INFINITY,
        want: { type: "float", value: "-Inf" },
      },
      {
        name: "an unsafe int as a decimal string",
        give: BigInt(SAFE) + 1n,
        want: { type: "int", value: String(SAFE + 1) },
      },
      {
        name: "a list of unsafe ints as decimal strings",
        give: [BigInt(SAFE) + 1n],
        want: { type: "list", of: "int", value: [String(SAFE + 1)] },
      },
      {
        name: "lowercase hexadecimal for bytes",
        give: Uint8Array.of(1, 0xab),
        want: { type: "bytes", value: "01ab" },
      },
      {
        name: "entries in order for a map",
        give: new Pairs([[1n, "a"]]),
        want: {
          type: "map",
          entries: [
            [
              { type: "int", value: 1 },
              { type: "string", value: "a" },
            ],
          ],
        },
      },
      {
        name: "fields in order for a record",
        give: new Fields([["id", 1n]]),
        want: { type: "record", fields: [["id", { type: "int", value: 1 }]] },
      },
      {
        name: "no payload for a variant without one",
        give: new Variant("pending"),
        want: { type: "variant", name: "pending" },
      },
      {
        name: "a null payload for a variant with an absent one",
        give: new Variant("note", undefined),
        want: { type: "variant", name: "note", payload: { type: "null" } },
      },
      { name: "null for null", give: null, want: { type: "null" } },
    ];
    for (const tt of tests) {
      it(`encodes ${tt.name}`, ({ seat }) => {
        check.equal(seat, encode(tt.give), tt.want, "the literal");
      });
    }

    it("encodes every value to a literal that decodes to it", ({ seat }) => {
      const values: unknown[] = [
        undefined,
        false,
        -0,
        Number.NaN,
        2n ** 64n - 1n,
        "",
        Uint8Array.of(),
        [],
        [[], [1.5]],
        new Pairs([[undefined, [Uint8Array.of(120)]]]),
        new Fields([
          ["a", [new Fields([])]],
          ["b", new Variant("v", new Variant("w"))],
        ]),
        [new Variant("x"), new Variant("x", undefined)],
      ];

      check.equal(
        seat,
        values.map((value) => canonical(decode(encode(value)))),
        values.map(canonical),
        "every value comes back",
      );
    });

    it("throws a TypeError for a value that no generator decodes", ({ seat }) => {
      check.errorIs(
        seat,
        check.throws(seat, () => encode(Symbol("s")), "a symbol"),
        TypeError,
        "a symbol has no literal",
      );
    });
  });
});
