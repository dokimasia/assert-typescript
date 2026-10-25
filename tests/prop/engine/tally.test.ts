// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the counts of a run and of the requirements that they leave unmet. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { Replaying } from "../../../src/prop/engine/case/providers.js";
import { MAX_CHOICES } from "../../../src/prop/engine/case.js";
import { IntegerBounds } from "../../../src/prop/engine/choice.js";
import { Sizes } from "../../../src/prop/engine/collection.js";
import { execute } from "../../../src/prop/engine/execution.js";
import { Integer, List } from "../../../src/prop/engine/generator.js";
import {
  type Requirement,
  shortfallOf,
  Tally,
} from "../../../src/prop/engine/tally.js";
import { drive } from "../../../src/prop/engine/work.js";
import { test as it } from "../../../src/vitest.js";
import { body } from "../../helpers.js";

const SEED = 7n;
const DIGIT = new Integer(new IntegerBounds(0n, 9n));
const DIGITS = new List(DIGIT, new Sizes(0, 8));

const passes = body((c) => {
  c.draw(DIGITS, "digits");
});

describe("tally", () => {
  describe("new Tally", () => {
    it("counts no case of its seed", ({ seat }) => {
      const tally = new Tally(SEED);

      check.isEqualTo(
        seat,
        [tally.seed, tally.valid, tally.rejected, tally.requested, tally.labels.size],
        [SEED, 0, 0, false, 0],
        "nothing counted",
      );
    });
  });

  describe("Tally.failureWithoutCounterexample", () => {
    it("returns rejected for more than ten rejections per valid case", async ({
      seat,
    }) => {
      const tally = new Tally(SEED);
      const rejects = body((c) => {
        c.draw(DIGIT, "n");
        c.assume(false);
      });
      tally.take(await drive(execute(passes, new Replaying([]), MAX_CHOICES)));
      for (let i = 0; i < 10; i += 1) {
        tally.take(await drive(execute(rejects, new Replaying([]), MAX_CHOICES)));
      }
      const atLimit = tally.failureWithoutCounterexample();
      tally.take(await drive(execute(rejects, new Replaying([]), MAX_CHOICES)));

      check.isEqualTo(
        seat,
        [atLimit, tally.failureWithoutCounterexample()?.kind],
        [undefined, "rejected"],
        "ten per valid case, then eleven",
      );
    });

    it("returns vacuous for a run whose cases requested no input", async ({ seat }) => {
      const tally = new Tally(SEED);
      tally.take(
        await drive(
          execute(
            body(() => undefined),
            new Replaying([]),
            MAX_CHOICES,
          ),
        ),
      );

      check.isEqualTo(
        seat,
        tally.failureWithoutCounterexample()?.kind,
        "vacuous",
        "nothing drawn",
      );
    });
  });

  describe("shortfallOf", () => {
    it("returns the first requirement that the counts leave unmet", ({ seat }) => {
      const tally = new Tally(SEED);
      tally.valid = 10;
      tally.labels.set("seven", 1);
      const requirements: Requirement[] = [
        { label: "seven", share: 0.1 },
        { label: "never", share: 0.5 },
      ];

      check.isEqualTo(
        seat,
        shortfallOf(tally, requirements, true, true),
        [
          {
            requirement: { label: "never", share: 0.5 },
            counted: 0,
            valid: 10,
            verdict: "unmet",
          },
          false,
        ],
        "the second requirement",
      );
    });

    it("reports that the counts meet every requirement", ({ seat }) => {
      const tally = new Tally(SEED);
      tally.valid = 10;
      tally.labels.set("seven", 1);

      check.isEqualTo(
        seat,
        shortfallOf(tally, [{ label: "seven", share: 0.1 }], true, true),
        [undefined, true],
        "all met",
      );
    });
  });
});
