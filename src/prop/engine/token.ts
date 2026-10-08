/**
 * The replay token: the choice values of one case as one printable string.
 *
 * A token is `prop1:` followed by the unpadded base64url encoding of the
 * choice values in order. Each value is a tag byte and then its payload:
 *
 * - 0: a non-negative integer, in unsigned LEB128.
 * - 1: a negative integer, its magnitude in unsigned LEB128.
 * - 2: a float, its binary64 bits in eight bytes, little-endian. Every NaN
 *   has the canonical bits.
 * - 3: a sequence, its length and then each element, each in unsigned
 *   LEB128.
 *
 * The token records no bounds, because the generators state them again
 * when the case replays. A choice sequence has exactly one token, so the
 * name of a store entry, which derives from the token, is the same in every
 * language.
 */

import type { Choice } from "./choice.js";
import { bitsOf, fromBits, NAN_BITS } from "./float.js";

/** The text that every token of this version starts with. */
export const PREFIX = "prop1:";

/** The tag byte before each choice value. */
const TAG_NON_NEGATIVE = 0;
const TAG_NEGATIVE = 1;
const TAG_FLOAT = 2;
const TAG_SEQUENCE = 3;

/** The bytes of a float's payload. */
const FLOAT_BYTES = 8;

/** Every number that a token encodes is below 2^64, and a negative integer's magnitude is at most 2^63. */
const NUMBER_LIMIT = 1n << 64n;
const NEGATIVE_LIMIT = 1n << 63n;

/** The largest element that a sequence of this engine states; a larger one replays as it. */
const ELEMENT_LIMIT = 2 ** 32 - 1;

/** Appends number, at least 0, in unsigned LEB128. */
function appendNumber(data: number[], number: bigint): void {
  let rest = number;
  while (rest > 0x7fn) {
    data.push(Number(rest & 0x7fn) | 0x80);
    rest >>= 7n;
  }
  data.push(Number(rest));
}

/** Appends a float's tag and its binary64 bits, little-endian, with the canonical bits for NaN. */
function appendFloat(data: number[], value: number): void {
  let bits = Number.isNaN(value) ? NAN_BITS : bitsOf(value);
  data.push(TAG_FLOAT);
  for (let i = 0; i < FLOAT_BYTES; i += 1) {
    data.push(Number(bits & 0xffn));
    bits >>= 8n;
  }
}

/** Appends one choice's tag and payload. */
function appendChoice(data: number[], choice: Choice): void {
  switch (choice.kind) {
    case "integer": {
      const value = choice.value;
      data.push(value < 0n ? TAG_NEGATIVE : TAG_NON_NEGATIVE);
      appendNumber(data, value < 0n ? -value : value);
      return;
    }
    case "float":
      appendFloat(data, choice.value);
      return;
    default:
      data.push(TAG_SEQUENCE);
      appendNumber(data, BigInt(choice.value.length));
      for (const element of choice.value) appendNumber(data, BigInt(element));
  }
}

/**
 * Returns the token of a choice sequence.
 *
 * @param choices - The choices.
 * @returns The token.
 */
export function encode(choices: readonly Choice[]): string {
  const data: number[] = [];
  for (const choice of choices) appendChoice(data, choice);
  return PREFIX + Buffer.from(data).toString("base64url");
}

/** The bytes of a token, read once from the start. */
class Reader {
  readonly #data: Uint8Array;
  #at = 0;

  constructor(data: Uint8Array) {
    this.#data = data;
  }

  /** Reports whether every byte has been read. */
  done(): boolean {
    return this.#at === this.#data.length;
  }

  /** Returns the next byte, or throws when none is left. */
  #byte(): number {
    const byte = this.#data[this.#at];
    if (byte === undefined) throw new RangeError("prop: a token ends inside a choice");
    this.#at += 1;
    return byte;
  }

  /** Returns the next unsigned LEB128 number, which states no superfluous byte. */
  number(): bigint {
    let number = 0n;
    let shift = 0n;
    for (;;) {
      const byte = this.#byte();
      number |= BigInt(byte & 0x7f) << shift;
      if (number >= NUMBER_LIMIT) {
        throw new RangeError("prop: a token states a number of 2^64 or more");
      }
      if (byte < 0x80) {
        if (byte === 0 && shift > 0n) {
          throw new RangeError("prop: a token states a number with a superfluous byte");
        }
        return number;
      }
      shift += 7n;
    }
  }

  /** Returns the next choice. */
  choice(): Choice {
    const tag = this.#byte();
    switch (tag) {
      case TAG_NON_NEGATIVE:
        return { kind: "integer", value: this.number() };
      case TAG_NEGATIVE: {
        const magnitude = this.number();
        if (magnitude === 0n || magnitude > NEGATIVE_LIMIT) {
          throw new RangeError(`prop: a token states the negative of ${magnitude}`);
        }
        return { kind: "integer", value: -magnitude };
      }
      case TAG_FLOAT: {
        let bits = 0n;
        for (let i = 0n; i < BigInt(FLOAT_BYTES); i += 1n) {
          bits |= BigInt(this.#byte()) << (8n * i);
        }
        const value = fromBits(bits);
        if (Number.isNaN(value) && bits !== NAN_BITS) {
          throw new RangeError("prop: a token states a NaN without the canonical bits");
        }
        return { kind: "float", value };
      }
      case TAG_SEQUENCE: {
        const length = this.number();
        const elements: number[] = [];
        for (let i = 0n; i < length; i += 1n) {
          const element = this.number();
          elements.push(
            element > BigInt(ELEMENT_LIMIT) ? ELEMENT_LIMIT : Number(element),
          );
        }
        return { kind: "sequence", value: elements };
      }
      default:
        throw new RangeError(`prop: a token states tag ${tag}`);
    }
  }
}

/**
 * Returns the choice sequence that a token records. A token is valid only in
 * the form that encode returns: base64url without padding, no LEB128 number
 * with a superfluous byte, no negative zero, and every NaN with the
 * canonical bits. An element at or above 2^32 reads as 2^32 − 1, which
 * replays as the element does.
 *
 * @param token - The token.
 * @returns The choices.
 * @throws RangeError for a token in no form that encode returns, and for
 *   an unknown tag, a payload cut short, a number of 2^64 or more, and a
 *   negative integer below −2^63.
 */
export function decode(token: string): Choice[] {
  if (!token.startsWith(PREFIX)) {
    throw new RangeError(
      `prop: the token ${JSON.stringify(token)} does not start with ${PREFIX}`,
    );
  }
  const text = token.slice(PREFIX.length);
  const data = Buffer.from(text, "base64url");
  if (data.toString("base64url") !== text) {
    throw new RangeError(
      `prop: the token ${JSON.stringify(token)} is no unpadded base64url`,
    );
  }
  const reader = new Reader(data);
  const choices: Choice[] = [];
  while (!reader.done()) choices.push(reader.choice());
  return choices;
}
