// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the canonical typed literal of each decoded value. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { encode, plain } from "../../../src/prop/engine/encoding.js";
import { decode, type Literal } from "../../../src/prop/engine/literal.js";
import { canonical, Fields, Pairs, Variant } from "../../../src/prop/engine/value.js";
import { test as it } from "../../../src/vitest.js";

/** The largest integer that a JSON number states exactly in every language. */
const SAFE = 2 ** 53 - 1;

describe("encoding", () => {
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
        check.isEqualTo(seat, plain(tt.give), tt.want, "the JSON form");
      });
    }
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
        check.isEqualTo(seat, encode(tt.give), tt.want, "the literal");
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

      check.isEqualTo(
        seat,
        values.map((value) => canonical(decode(encode(value)))),
        values.map(canonical),
        "every value comes back",
      );
    });

    it("throws a TypeError for a value that no generator decodes", ({ seat }) => {
      check.errorIs(
        seat,
        check.doesThrow(seat, () => encode(Symbol("s")), "a symbol"),
        TypeError,
        "a symbol has no literal",
      );
    });
  });
});
