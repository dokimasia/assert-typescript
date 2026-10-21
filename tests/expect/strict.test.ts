/**
 * The spec of the table of strict mode. It uses vitest's `expect` alone,
 * because a refusal delivers its verdict to the runner.
 */

import { describe, expect, it } from "vitest";
import { NAMES } from "../../src/expect/matchers.js";
import { refusal, STRICT } from "../../src/expect/strict.js";

describe("strict", () => {
  describe("STRICT", () => {
    it("contains the names of assertions as the assertions to call", () => {
      const named = Object.values(STRICT).flatMap(({ use, not }) => [use, not ?? use]);

      expect(named.filter((name) => !NAMES.includes(name))).toEqual([]);
    });
  });

  describe("refusal", () => {
    it("fails a call with the assertion to call", () => {
      const outcome = refusal("toEqual").call({ isNot: false });

      expect([outcome.pass, outcome.message()]).toEqual([
        false,
        "toEqual is refused in strict mode. Call isEqualTo instead.",
      ]);
    });

    it("fails a call under .not with the negative to call", () => {
      const outcome = refusal("toThrow").call({ isNot: true });

      expect([outcome.pass, outcome.message()]).toEqual([
        true,
        "not.toThrow is refused in strict mode. Call doesNotThrow instead.",
      ]);
    });

    it("fails a call under .not of a matcher whose assertion has no negative", () => {
      expect(refusal("toHaveLength").call({ isNot: true }).message()).toBe(
        "not.toHaveLength is refused in strict mode, and the standard has no negative of hasLength.",
      );
    });

    it("fails a call whose state states no .not as a call outside .not", () => {
      expect(refusal("toMatch").call({}).message()).toBe(
        "toMatch is refused in strict mode. Call doesMatch instead.",
      );
    });
  });
});
