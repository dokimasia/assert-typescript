// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the assertions about text. It uses vitest's `expect`
 * alone, because the surfaces call these assertions.
 */

import { describe } from "vitest";
import { Mode } from "../../src/matcher/seat.js";
import * as text from "../../src/matcher/text.js";
import { verdictCases as cases, VERDICT_CONTRACT as MSG } from "../helpers.js";

describe("text", () => {
  describe("containsInOrder", () => {
    cases(
      "contains-in-order",
      (seat, [got, needles]) =>
        text.containsInOrder(seat, Mode.Fatal, got, needles as string[], MSG),
      [
        {
          name: "passes text with every needle in order",
          give: ["open, close", ["open", "close"]],
        },
        {
          name: "reports the first needle that the text lacks after the needle before it",
          give: ["ab", ["b", "a"]],
          want: { haystack: "ab", needle: "a", index: 1 },
        },
        {
          name: "reports index 0 for a value that is no text",
          give: [42, ["4"]],
          want: { haystack: 42, needle: "", index: 0 },
        },
      ],
    );
  });

  describe("hasPrefix", () => {
    cases(
      "has-prefix",
      (seat, [got, prefix]) =>
        text.hasPrefix(seat, Mode.Fatal, got, prefix as string, MSG),
      [
        { name: "passes text that starts with the prefix", give: ["GET /", "GET "] },
        {
          name: "reports a value that is no text",
          give: [42, "4"],
          want: { got: 42, prefix: "4" },
        },
      ],
    );
  });

  describe("hasSuffix", () => {
    cases(
      "has-suffix",
      (seat, [got, suffix]) =>
        text.hasSuffix(seat, Mode.Fatal, got, suffix as string, MSG),
      [
        { name: "passes text that ends with the suffix", give: ["a.json", ".json"] },
        {
          name: "reports a value that is no text",
          give: [42, "2"],
          want: { got: 42, suffix: "2" },
        },
      ],
    );
  });

  describe("matches", () => {
    cases(
      "matches",
      (seat, [got, pattern]) =>
        text.matches(seat, Mode.Fatal, got, pattern as string, MSG),
      [
        {
          name: "passes text that the pattern matches",
          give: ["id=deadbeef", "[0-9a-f]{8}"],
        },
        {
          name: "reports reason null for a pattern of the subset that does not match",
          give: ["abc", "^x"],
          want: { got: "abc", pattern: "^x", reason: null },
        },
        {
          name: "reports the refusal of the parser for a pattern outside the subset",
          give: ["anything", "([unclosed"],
          want: {
            got: "anything",
            pattern: "([unclosed",
            reason: 'pattern "([unclosed" at 10: a class is not closed',
          },
        },
        {
          name: "reports a value that is no text",
          give: [42, "\\d"],
          want: { got: 42, pattern: "\\d", reason: null },
        },
      ],
    );
  });
});
