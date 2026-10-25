// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the anomalies of a history of transactions. */

import { describe } from "vitest";
import { ANOMALIES } from "../../src/history/anomaly.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

describe("anomaly", () => {
  describe("ANOMALIES", () => {
    it("lists the eleven kinds in report order", ({ seat }) => {
      check.isEqualTo(
        seat,
        ANOMALIES,
        [
          "garbage-read",
          "duplicate-append",
          "internal-inconsistency",
          "incompatible-order",
          "aborted-read",
          "intermediate-read",
          "G0",
          "G1c",
          "G-single",
          "G-nonadjacent",
          "G2",
        ],
        "the kinds",
      );
    });
  });
});
