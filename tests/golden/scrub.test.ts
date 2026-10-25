// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the scrubbers of a golden comparison. */

import { describe } from "vitest";
import {
  scrub,
  scrubHashes,
  scrubJsonFields,
  scrubRunIds,
  scrubTimestamps,
} from "../../src/golden/scrub.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

describe("scrub", () => {
  describe("scrubTimestamps", () => {
    it("replaces an ISO 8601 timestamp with SCRUBBED_TIMESTAMP", ({ seat }) => {
      check.isEqualTo(
        seat,
        scrubTimestamps()("started at 2026-08-30T11:22:33Z"),
        "started at SCRUBBED_TIMESTAMP",
        "the timestamp is scrubbed",
      );
    });
  });

  describe("scrubHashes", () => {
    it("replaces a hex digest with SCRUBBED_HASH", ({ seat }) => {
      check.isEqualTo(
        seat,
        scrubHashes()(`digest ${"a1b2c3d4".repeat(8)}`),
        "digest SCRUBBED_HASH",
        "the digest is scrubbed",
      );
    });
  });

  describe("scrubRunIds", () => {
    it("replaces an identifier of a run with SCRUBBED_RUN_ID", ({ seat }) => {
      check.isEqualTo(
        seat,
        scrubRunIds()("run run_0123456789abcdef finished"),
        "run SCRUBBED_RUN_ID finished",
        "the run id is scrubbed",
      );
    });
  });

  describe("scrubJsonFields", () => {
    it("replaces the value of each field that it was given", ({ seat }) => {
      check.isEqualTo(
        seat,
        scrubJsonFields("id")('{"id": "01J8XY", "name": "kept"}'),
        '{"id": "SCRUBBED", "name": "kept"}',
        "the id is scrubbed and the name is kept",
      );
    });

    it("returns the text unchanged without a field", ({ seat }) => {
      check.isEqualTo(
        seat,
        scrubJsonFields()('{"id": "01J8XY"}'),
        '{"id": "01J8XY"}',
        "nothing is scrubbed",
      );
    });
  });

  describe("scrub", () => {
    it("applies the scrubbers in the order given", ({ seat }) => {
      const marked = (text: string) => `${text}!`;

      check.isEqualTo(
        seat,
        scrub("run_0123456789abcdef", [scrubRunIds(), marked]),
        "SCRUBBED_RUN_ID!",
        "the run id is scrubbed before the mark",
      );
    });

    it("returns the text unchanged without a scrubber", ({ seat }) => {
      check.isEqualTo(seat, scrub("kept", []), "kept", "nothing is scrubbed");
    });
  });
});
