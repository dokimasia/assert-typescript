/**
 * The spec of the random source. The stream must equal the C code that Bob
 * Jenkins published, bit for bit: testdata/smallprng.json contains the
 * outputs of that code for five seeds.
 */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  bitLength,
  caseSource,
  MASK,
  mix,
  Source,
} from "../../../src/prop/engine/source.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";
import oracle from "./testdata/smallprng.json" with { type: "json" };

/** The seed of the contract "decoding undoes encoding", pinned so that a change to the mixing fails here. */
const CONTRACT_SEED = 14_330_315_428_228_886_101n;

describe("source", () => {
  describe("bitLength", () => {
    const tests = [
      { name: "0 for 0", give: 0n, want: 0 },
      { name: "1 for 1", give: 1n, want: 1 },
      { name: "8 for 255", give: 255n, want: 8 },
      { name: "32 for 2^32 − 1", give: (1n << 32n) - 1n, want: 32 },
      { name: "33 for 2^32", give: 1n << 32n, want: 33 },
      { name: "64 for 2^64 − 1", give: MASK, want: 64 },
    ];
    for (const tt of tests) {
      it(`returns ${tt.name}`, ({ seat }) => {
        check.equal(seat, bitLength(tt.give), tt.want, "the bit length");
      });
    }
  });

  describe("new Source", () => {
    const tests = [
      { name: "a negative seed", give: -1n },
      { name: "a seed of 2^64", give: MASK + 1n },
    ];
    for (const tt of tests) {
      it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => new Source(tt.give)),
          `prop: seed ${tt.give} is no unsigned 64-bit integer`,
          "the refusal",
        );
      });
    }
  });

  describe("Source.next", () => {
    it("returns the outputs of the published C code for five seeds", ({ seat }) => {
      const outputs = Object.entries(oracle.outputs);
      const got = outputs.map(([seed, expected]) => {
        const source = new Source(BigInt(seed));
        return expected.map(() => String(source.next()));
      });

      check.equal(
        seat,
        got,
        outputs.map(([, expected]) => expected),
        "the 32 outputs of each seed",
      );
    });
  });

  describe("Source.below", () => {
    it("returns 0 for one value without consuming the stream", ({ seat }) => {
      const source = new Source(7n);
      const twin = new Source(7n);

      check.equal(
        seat,
        [source.below(1n), source.next()],
        [0n, twin.next()],
        "the stream is untouched",
      );
    });

    it("draws below n from the top bits of each output by rejection", ({ seat }) => {
      const ns = [2n, 3n, 10n, 1000n, (1n << 63n) + 5n];
      const got = ns.map((n) => {
        const source = new Source(n);
        return Array.from({ length: 200 }, () => source.below(n));
      });
      const want = ns.map((n) => {
        const twin = new Source(n);
        const shift = 64n - BigInt((n - 1n).toString(2).length);
        return Array.from({ length: 200 }, () => {
          let value = twin.next() >> shift;
          while (value >= n) value = twin.next() >> shift;
          return value;
        });
      });

      check.equal(seat, got, want, "200 draws for each n");
    });

    it("returns whole outputs for 2^64 values", ({ seat }) => {
      const source = new Source(3n);
      const twin = new Source(3n);

      check.equal(
        seat,
        Array.from({ length: 10 }, () => source.below(MASK + 1n)),
        Array.from({ length: 10 }, () => twin.next()),
        "the outputs themselves",
      );
    });

    const tests = [
      { name: "no value", give: 0n },
      { name: "more than 2^64 values", give: MASK + 2n },
    ];
    for (const tt of tests) {
      it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => new Source(1n).below(tt.give)),
          `prop: below(${tt.give}) needs 1 <= n <= 2^64`,
          "the refusal",
        );
      });
    }
  });

  describe("Source.coin", () => {
    it("compares one draw of below(den) with num", ({ seat }) => {
      const source = new Source(9n);
      const twin = new Source(9n);

      check.equal(
        seat,
        Array.from({ length: 100 }, () => source.coin(3n, 8n)),
        Array.from({ length: 100 }, () => twin.below(8n) < 3n),
        "100 coins of 3 in 8",
      );
    });

    const tests = [
      { name: "a denominator of 0", give: [1n, 0n] as const },
      { name: "a negative numerator", give: [-1n, 2n] as const },
      { name: "a numerator above the denominator", give: [3n, 2n] as const },
    ];
    for (const tt of tests) {
      it(`throws a RangeError for ${tt.name}`, ({ seat }) => {
        const [num, den] = tt.give;

        check.equal(
          seat,
          thrown(() => new Source(1n).coin(num, den)),
          `prop: coin(${num}, ${den}) needs 0 <= num <= den`,
          "the refusal",
        );
      });
    }
  });

  describe("caseSource", () => {
    it("returns the stream of the seed plus the index", ({ seat }) => {
      check.equal(
        seat,
        caseSource(40n, 2n).next(),
        new Source(42n).next(),
        "case 2 of seed 40 is seed 42",
      );
    });

    it("wraps the seed of a case at 2^64", ({ seat }) => {
      check.equal(
        seat,
        caseSource(MASK, 1n).next(),
        new Source(0n).next(),
        "case 1 of the last seed is seed 0",
      );
    });
  });

  describe("mix", () => {
    it("returns 0 for no bytes", ({ seat }) => {
      check.equal(seat, mix(new Uint8Array()), 0n, "the fold starts at 0");
    });

    it("folds each byte through the first output of a stream", ({ seat }) => {
      const first = new Source(BigInt("a".charCodeAt(0))).next();

      check.equal(
        seat,
        mix(new TextEncoder().encode("ab")),
        new Source(first ^ BigInt("b".charCodeAt(0))).next(),
        "two folds",
      );
    });

    it("returns the pinned seed of a contract", ({ seat }) => {
      check.equal(
        seat,
        mix(new TextEncoder().encode("decoding undoes encoding")),
        CONTRACT_SEED,
        "the seed",
      );
    });
  });
});
