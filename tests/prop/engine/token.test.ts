/**
 * The spec of the replay token: its bytes, its round trip, and the tokens
 * that it refuses. The pinned bytes are the bytes of the definition's
 * reference implementation.
 */

import { describe } from "vitest";
import { check, prop } from "../../../src/index.js";
import {
  type Choice,
  INT64_MIN,
  sameChoice,
  UINT64_MAX,
} from "../../../src/prop/engine/choice.js";
import { bitsOf } from "../../../src/prop/engine/float.js";
import { decode, encode, PREFIX } from "../../../src/prop/engine/token.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** A choice of every kind, and the bytes of their token: per choice a tag, then LEB128 or the bits of a float. */
const CHOICES: Choice[] = [
  { kind: "integer", value: 0n },
  { kind: "integer", value: -1n },
  { kind: "integer", value: 127n },
  { kind: "integer", value: 128n },
  { kind: "integer", value: 300n },
  { kind: "float", value: 1.5 },
  { kind: "sequence", value: [1, 200] },
];
const BYTES =
  "0000" + "0101" + "007f" + "008001" + "00ac02" + "02000000000000f83f" + "030201c801";

/** The lowest finite float. Its bits are nearly all ones, so its token contains the base64url character of 63. */
const LOWEST: Choice = { kind: "float", value: -Number.MAX_VALUE };

/** Returns the token of the bytes that hex states. */
function token(hex: string): string {
  return PREFIX + Buffer.from(hex, "hex").toString("base64url");
}

/** Reports whether two choice sequences are equal. */
function same(a: readonly Choice[], b: readonly Choice[]): boolean {
  return (
    a.length === b.length && a.every((choice, i) => sameChoice(choice, b[i] as Choice))
  );
}

describe("token", () => {
  describe("PREFIX", () => {
    it("starts every token of this version with prop1:", ({ seat }) => {
      check.equal(seat, PREFIX, "prop1:", "the prefix");
    });
  });

  describe("encode", () => {
    it("encodes each kind as a tag with its payload", ({ seat }) => {
      check.equal(seat, encode(CHOICES), token(BYTES), "the pinned bytes");
    });

    it("encodes no choice to the prefix alone", ({ seat }) => {
      check.equal(seat, encode([]), PREFIX, "the prefix");
    });

    it("encodes every NaN with the canonical bits", ({ seat }) => {
      const payload = -Number.NaN;

      check.equal(
        seat,
        encode([{ kind: "float", value: payload }]),
        token("02000000000000f87f"),
        "the canonical NaN",
      );
    });

    it("writes base64url without padding", ({ seat }) => {
      const text = encode([LOWEST]);

      check.equal(
        seat,
        [text.includes("_"), ["+", "/", "="].some((char) => text.includes(char))],
        [true, false],
        "an underscore, and no plus, slash or equals sign",
      );
    });
  });

  describe("decode", () => {
    it("decodes the pinned bytes to their choices", ({ seat }) => {
      check.isTrue(seat, same(decode(token(BYTES)), CHOICES), "the pinned choices");
    });

    it("decodes the token of every choice to that choice", ({ seat }) => {
      const choices: Choice[] = [
        { kind: "integer", value: INT64_MIN },
        { kind: "integer", value: UINT64_MAX },
        { kind: "float", value: -0 },
        { kind: "float", value: Number.POSITIVE_INFINITY },
        { kind: "float", value: Number.NaN },
        { kind: "float", value: Number.MIN_VALUE },
        LOWEST,
        { kind: "sequence", value: [] },
        { kind: "sequence", value: [0, 1_112_063] },
      ];

      check.isTrue(
        seat,
        same(decode(encode(choices)), choices),
        "the extremes of each kind",
      );
    });

    it("decodes the largest number from ten bytes", ({ seat }) => {
      check.equal(
        seat,
        decode(token("00ffffffffffffffffff01")),
        [{ kind: "integer", value: UINT64_MAX }],
        "2^64 − 1",
      );
    });

    it("decodes the most negative integer", ({ seat }) => {
      check.equal(
        seat,
        decode(token("0180808080808080808001")),
        [{ kind: "integer", value: INT64_MIN }],
        "−2^63",
      );
    });

    it("keeps the sign of negative zero", ({ seat }) => {
      const [zero] = decode(encode([{ kind: "float", value: -0 }]));

      check.equal(seat, bitsOf(zero?.value as number), bitsOf(-0), "the bits of -0");
    });

    it("reads an element at or above 2^32 as 2^32 − 1", ({ seat }) => {
      check.equal(
        seat,
        decode(token("03018080808010")),
        [{ kind: "sequence", value: [2 ** 32 - 1] }],
        "2^32 replays as 2^32 − 1",
      );
    });

    const tests = [
      {
        name: "another version",
        give: "prop2:AAA",
        want: 'prop: the token "prop2:AAA" does not start with prop1:',
      },
      {
        name: "no prefix",
        give: "AAA",
        want: 'prop: the token "AAA" does not start with prop1:',
      },
      {
        name: "padding",
        give: `${PREFIX}AAA=`,
        want: 'prop: the token "prop1:AAA=" is no unpadded base64url',
      },
      {
        name: "a lone character",
        give: `${PREFIX}A`,
        want: 'prop: the token "prop1:A" is no unpadded base64url',
      },
      {
        name: "a character outside base64url",
        give: `${PREFIX}AAA*`,
        want: 'prop: the token "prop1:AAA*" is no unpadded base64url',
      },
      {
        name: "a character outside ASCII",
        give: `${PREFIX}AAAé`,
        want: 'prop: the token "prop1:AAAé" is no unpadded base64url',
      },
      {
        name: "trailing bits",
        give: `${PREFIX}AAB`,
        want: 'prop: the token "prop1:AAB" is no unpadded base64url',
      },
      {
        name: "standard base64",
        give: encode([LOWEST]).replace("_", "/"),
        want: `prop: the token ${JSON.stringify(encode([LOWEST]).replace("_", "/"))} is no unpadded base64url`,
      },
      {
        name: "a superfluous LEB128 byte",
        give: token("008000"),
        want: "prop: a token states a number with a superfluous byte",
      },
      {
        name: "a negative zero",
        give: token("0100"),
        want: "prop: a token states the negative of 0",
      },
      {
        name: "a negative integer below −2^63",
        give: token("0181808080808080808001"),
        want: `prop: a token states the negative of ${2n ** 63n + 1n}`,
      },
      {
        name: "the number 2^64",
        give: token("0080808080808080808002"),
        want: "prop: a token states a number of 2^64 or more",
      },
      {
        name: "a number cut short",
        give: token("0080"),
        want: "prop: a token ends inside a choice",
      },
      {
        name: "a float cut short",
        give: token("020000"),
        want: "prop: a token ends inside a choice",
      },
      {
        name: "a sequence cut short",
        give: token("030201"),
        want: "prop: a token ends inside a choice",
      },
      {
        name: "a NaN without the canonical bits",
        give: token("02010000000000f87f"),
        want: "prop: a token states a NaN without the canonical bits",
      },
      { name: "an unknown tag", give: token("04"), want: "prop: a token states tag 4" },
    ];
    for (const tt of tests) {
      it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => decode(tt.give)),
          tt.want,
          "the refusal",
        );
      });
    }

    it("throws nothing but a RangeError for any text after the prefix", async ({
      seat,
    }) => {
      await prop.fuzz(seat, "decode throws nothing but a RangeError", (c) => {
        const text = c.draw(prop.bytes(), "text");
        try {
          decode(PREFIX + Buffer.from(text).toString("latin1"));
        } catch (err) {
          check.errorIs(c, err, RangeError, "the refusal is a RangeError");
        }
      });
    });
  });
});
