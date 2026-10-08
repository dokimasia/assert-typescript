/**
 * The random source behind every generated case.
 *
 * The source is the 64-bit three-rotate variant of Bob Jenkins's small
 * noncryptographic generator. It uses addition, subtraction, exclusive or
 * and rotation modulo 2^64, which `bigint` computes exactly.
 *
 * Case `i` of a run with seed `s` reads the stream of `s + i`. The draws
 * consume that stream in an order that the definition fixes, so the same
 * seed gives the same cases in every language.
 */

/** The bits of every value of the stream. */
const BITS = 64n;

/** The largest unsigned 64-bit integer. */
export const MASK = (1n << BITS) - 1n;

/** The constant that the initialisation puts in the first word. */
const FIRST_WORD = 0xf1ea5eedn;

/** The rounds that the initialisation discards, so that nearby seeds give unrelated streams. */
const WARMUP_ROUNDS = 20;

/** Returns value rotated left by count bits, modulo 2^64. */
function rotl(value: bigint, count: bigint): bigint {
  return ((value << count) | (value >> (BITS - count))) & MASK;
}

/**
 * Returns the number of bits of a non-negative integer below 2^64: 0 for
 * 0, and one more than the position of its highest set bit otherwise.
 *
 * @param value - The integer, from 0 to 2^64 − 1.
 * @returns Its bit length, from 0 to 64.
 */
export function bitLength(value: bigint): number {
  let bits = 0;
  let rest = value;
  if (rest >= 1n << 32n) {
    bits = 32;
    rest >>= 32n;
  }
  return bits + 32 - Math.clz32(Number(rest));
}

/** The stream of 64-bit values that one seed produces. Each case reads its own. */
export class Source {
  #a: bigint;
  #b: bigint;
  #c: bigint;
  #d: bigint;

  /**
   * Starts the stream of seed.
   *
   * @param seed - An unsigned 64-bit integer.
   * @throws RangeError for a seed outside [0, 2^64).
   */
  constructor(seed: bigint) {
    if (seed < 0n || seed > MASK) {
      throw new RangeError(`prop: seed ${seed} is no unsigned 64-bit integer`);
    }
    this.#a = FIRST_WORD;
    this.#b = seed;
    this.#c = seed;
    this.#d = seed;
    for (let round = 0; round < WARMUP_ROUNDS; round += 1) this.next();
  }

  /** Returns the next 64-bit value of the stream. */
  next(): bigint {
    const e = (this.#a - rotl(this.#b, 7n)) & MASK;
    this.#a = this.#b ^ rotl(this.#c, 13n);
    this.#b = (this.#c + rotl(this.#d, 37n)) & MASK;
    this.#c = (this.#d + e) & MASK;
    this.#d = (e + this.#a) & MASK;
    return this.#d;
  }

  /**
   * Returns a uniform value in [0, n). For n of 1 it consumes nothing.
   * Otherwise each attempt consumes one value and keeps its top
   * `bitLength(n − 1)` bits, and the draw repeats while the result is n or
   * more.
   *
   * @param n - The number of values, from 1 to 2^64.
   * @returns The value.
   * @throws RangeError for an n outside [1, 2^64].
   */
  below(n: bigint): bigint {
    if (n < 1n || n > MASK + 1n) {
      throw new RangeError(`prop: below(${n}) needs 1 <= n <= 2^64`);
    }
    if (n === 1n) return 0n;
    const shift = BITS - BigInt(bitLength(n - 1n));
    for (;;) {
      const value = this.next() >> shift;
      if (value < n) return value;
    }
  }

  /**
   * Returns true with probability num/den, from one `below(den)` draw.
   *
   * @param num - The numerator, from 0 to den.
   * @param den - The denominator, at least 1.
   * @returns Whether the coin came up.
   * @throws RangeError for a den below 1 or a num outside [0, den].
   */
  coin(num: bigint, den: bigint): boolean {
    if (den < 1n || num < 0n || num > den) {
      throw new RangeError(`prop: coin(${num}, ${den}) needs 0 <= num <= den`);
    }
    return this.below(den) < num;
  }
}

/**
 * Returns the source of case index in a run with seed: the stream of
 * seed + index, modulo 2^64.
 *
 * @param seed - The run's seed.
 * @param index - The case's index in the run.
 * @returns The case's source.
 */
export function caseSource(seed: bigint, index: bigint): Source {
  return new Source((seed + index) & MASK);
}

/**
 * Folds bytes into one 64-bit value with the random source alone. The
 * value starts at zero, and for each byte it becomes the first output of
 * the stream seeded with the value xor the byte. It derives the seed of a
 * contract and the name of a store entry without a hash function.
 *
 * @param data - The bytes.
 * @returns The value.
 */
export function mix(data: Uint8Array): bigint {
  let value = 0n;
  for (const byte of data) value = new Source(value ^ BigInt(byte)).next();
  return value;
}
