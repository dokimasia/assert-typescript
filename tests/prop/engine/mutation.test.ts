// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the mutation of a member of a campaign's pool. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import type { Request } from "../../../src/prop/engine/case/providers.js";
import type { Span } from "../../../src/prop/engine/case/record.js";
import { IntegerBounds } from "../../../src/prop/engine/choice.js";
import { type Member, Mutating, mutation } from "../../../src/prop/engine/mutation.js";
import { Source } from "../../../src/prop/engine/source.js";
import { test as it } from "../../../src/vitest.js";
import { integers } from "../../helpers.js";

const DIGITS = new IntegerBounds(0n, 9n);

/** Returns a span of label from start to end at the top. */
function span(label: string, start: number, end: number): Span {
  return { label, start, end, depth: 0, parent: undefined };
}

/** A member of three digits in two spans of one label. */
const MEMBER: Member = {
  choices: integers(1n, 2n, 3n),
  bounds: [DIGITS, DIGITS, DIGITS],
  spans: [span("pair", 0, 2), span("pair", 2, 3)],
};

/** Returns the values of choices. */
function valuesOf(choices: readonly { readonly value: unknown }[]): unknown[] {
  return choices.map((choice) => choice.value);
}

describe("mutation", () => {
  describe("mutation", () => {
    it("returns no choice for a member without choices", ({ seat }) => {
      const empty: Member = { choices: [], bounds: [], spans: [] };

      check.isEqualTo(seat, mutation([empty], new Source(1n)), [], "nothing to mutate");
    });

    it("draws one choice again for a member without spans", ({ seat }) => {
      const flat: Member = { ...MEMBER, spans: [] };
      const mutated = valuesOf(mutation([flat], new Source(1n))) as bigint[];
      const changed = mutated.filter((value, i) => value !== MEMBER.choices[i]?.value);

      check.isEqualTo(
        seat,
        [mutated.length, changed.length <= 1, mutated.every((v) => v >= 0n && v <= 9n)],
        [3, true, true],
        "three digits, one drawn again",
      );
    });

    it("deletes, repeats or replaces a span, or draws a choice again", ({ seat }) => {
      const forms = new Set(
        [
          [3n],
          [1n, 2n],
          [1n, 2n, 1n, 2n, 3n],
          [1n, 2n, 3n, 3n],
          [3n, 3n],
          [1n, 2n, 1n, 2n],
        ].map((values) => JSON.stringify(values.map(String))),
      );
      const kinds = new Set<string>();
      for (let seed = 0n; seed < 64n; seed += 1n) {
        const mutated = valuesOf(mutation([MEMBER], new Source(seed))) as bigint[];
        const text = JSON.stringify(mutated.map(String));
        kinds.add(forms.has(text) ? "span" : `redraw ${mutated.length}`);
      }

      check.isEqualTo(
        seat,
        [...kinds].sort(),
        ["redraw 3", "span"],
        "a change of a span, or one choice drawn again",
      );
    });
  });

  describe("Mutating.value", () => {
    it("replays a choice fitted to its request, and draws past the choices", ({
      seat,
    }) => {
      const provider = new Mutating(integers(12n), new Source(1n));
      const request: Request = { bounds: DIGITS, draw: () => 7n };

      check.isEqualTo(
        seat,
        [provider.value(request, 0), provider.value(request, 1)],
        [DIGITS.coerce({ kind: "integer", value: 12n }), 7n],
        "the fitted choice, then a drawn one",
      );
    });
  });
});
