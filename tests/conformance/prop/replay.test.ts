// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the outputs of the token and store vectors. */

import { describe } from "vitest";
import {
  storedCaseOf,
  storeOf,
  tokenOf,
} from "../../../src/conformance/prop/replay.js";
import { vectors } from "../../../src/conformance/vector.js";
import { check } from "../../../src/index.js";
import { Fault } from "../../../src/matcher/fault.js";
import { test as it } from "../../../src/vitest.js";

/** The store vector of the definition that names an entry. */
const NAMED = vectors().find(
  (v) => v.id === "store/names-an-entry-by-its-contract-and-token",
)?.raw as Readonly<Record<string, unknown>>;

describe("replay", () => {
  describe("tokenOf", () => {
    it("returns the token of choices", ({ seat }) => {
      check.isEqualTo(
        seat,
        tokenOf({ choices: [1] }),
        { token: "prop1:AAE" },
        "the token",
      );
    });

    it("returns the choices that a token decodes to", ({ seat }) => {
      check.isEqualTo(
        seat,
        tokenOf({ token: "prop1:AAE" }),
        { decoded: [1], error: false },
        "the choices",
      );
    });

    it("returns the error of a token that does not decode", ({ seat }) => {
      check.isEqualTo(
        seat,
        tokenOf({ token: "prop1:A" }),
        { decoded: null, error: true },
        "the error",
      );
    });
  });

  describe("storeOf", () => {
    it("returns the verdict and the choices of a store file that a runner replays", ({
      seat,
    }) => {
      const raw = { contract: NAMED["contract"], text: JSON.stringify(NAMED["entry"]) };

      check.isEqualTo(
        seat,
        storeOf(raw),
        { verdict: "replay", choices: [1, 0, 1, -1, 0] },
        "a replay of the choices",
      );
    });

    it("returns the verdict of a store file that a runner does not replay", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        storeOf({ contract: "c", text: "{" }),
        { verdict: "damaged", choices: null },
        "a damaged file",
      );
    });

    it("returns the name and the entry that the store writes for a failure", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        storeOf(NAMED),
        { name: NAMED["name"], entry: NAMED["entry"] },
        "the vector's name and entry",
      );
    });

    it("throws a fault at the entry for an entry that does not read back", ({
      seat,
    }) => {
      const raw = {
        ...NAMED,
        identity: { assertion: "equal", file: "pkg/codec_test.go", line: 18 },
      };
      const err = check.doesThrow(seat, () => storeOf(raw), "the entry is refused");

      check.isEqualTo(
        seat,
        err instanceof Fault ? [err.at, err.reason] : err,
        ["entry", "the entry does not read back as a replay of its choices"],
        "the fault at the entry",
      );
    });
  });

  describe("storedCaseOf", () => {
    it("returns the choices and the counterexample of a stored case", ({ seat }) => {
      check.isEqualTo(
        seat,
        storedCaseOf({ choices: [3], counterexample: [{ label: "value" }] }, 0),
        {
          choices: [{ kind: "integer", value: 3n }],
          counterexample: [{ label: "value" }],
        },
        "the stored case",
      );
    });

    const refusals: { name: string; give: unknown }[] = [
      { name: "choices alone", give: [3] },
      { name: "an object without a counterexample", give: { choices: [3] } },
      {
        name: "a counterexample that is no list",
        give: { choices: [3], counterexample: {} },
      },
    ];
    for (const tt of refusals) {
      it(`throws a fault at the stored case for ${tt.name}`, ({ seat }) => {
        const err = check.doesThrow(seat, () => storedCaseOf(tt.give, 1), "a refusal");

        check.isEqualTo(
          seat,
          err instanceof Fault ? [err.at, err.reason] : err,
          [
            "settings.stored[1]",
            "the stored case is no object of its choices and its counterexample",
          ],
          "the fault at the stored case",
        );
      });
    }
  });
});
