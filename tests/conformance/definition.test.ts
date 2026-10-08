/** The spec of the reader of the vendored definition that this library implements. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import {
  assertions,
  declinesRelaxation,
  declinesSurface,
  diverges,
  LANGUAGE,
  names,
  overlay,
  relaxationNames,
  surfaceNames,
  version,
} from "../../src/conformance/definition.js";
import { check, soft } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

describe("definition", () => {
  describe("LANGUAGE", () => {
    it("contains the column typescript of the naming table", ({ seat }) => {
      check.equal(seat, LANGUAGE, "typescript", "the language");
    });
  });

  describe("assertions", () => {
    it("returns the 110 assertions of the vendored definition", ({ seat }) => {
      check.length(seat, assertions(), 110, "the definition states 110 assertions");
    });
  });

  describe("names", () => {
    it("returns a TypeScript name for every assertion", ({ seat }) => {
      const named = names();

      check.equal(
        seat,
        Object.keys(assertions()).filter((id) => typeof named[id] !== "string"),
        [],
        "no assertion lacks a name",
      );
    });
  });

  describe("version", () => {
    it("returns the version of the vendored VERSION file", ({ seat }) => {
      const vendored = readFileSync(
        join(import.meta.dirname, "../../src/conformance/spec/VERSION"),
        "utf8",
      );

      check.equal(seat, version(), vendored.trim(), "the version");
    });
  });

  describe("overlay", () => {
    it("returns an overlay that extends the vendored version", ({ seat }) => {
      check.equal(
        seat,
        overlay().extends,
        `spec://assertions@${version()}`,
        "the base",
      );
    });

    it("returns the overlay of TypeScript", ({ seat }) => {
      check.equal(seat, overlay().language, LANGUAGE, "the language of the overlay");
    });

    it("returns a stance with a reason for each divergence", ({ seat }) => {
      for (const d of overlay().diverge) {
        soft.isTrue(seat, d.stance.trim() !== "", `${d.id} states a stance`);
        soft.isTrue(seat, d.why.trim() !== "", `${d.id} states a reason`);
      }
    });

    it("returns divergences of assertions of the definition alone", ({ seat }) => {
      const stated = assertions();
      for (const d of overlay().diverge) {
        soft.isTrue(seat, d.id in stated, `${d.id} is an assertion of the definition`);
      }
    });
  });

  describe("relaxationNames", () => {
    it("returns the TypeScript name of each relaxation of the definition", ({
      seat,
    }) => {
      check.equal(
        seat,
        relaxationNames(),
        {
          "by-identity": "byIdentity",
          "equate-empty": "equateEmpty",
          "equate-nans": "equateNans",
        },
        "the names of the relaxations",
      );
    });
  });

  describe("surfaceNames", () => {
    it("returns the TypeScript name of a surface id", ({ seat }) => {
      check.equal(
        seat,
        surfaceNames()["recorder-seat"],
        "Recorder",
        "the name of the recorder",
      );
    });

    it("returns the empty string for a surface id that TypeScript does not name", ({
      seat,
    }) => {
      check.equal(
        seat,
        surfaceNames()["steps.repeat"],
        "",
        "repeat has no TypeScript name",
      );
    });
  });

  describe("declinesSurface", () => {
    it("returns true for a surface id that the overlay declines", ({ seat }) => {
      check.isTrue(
        seat,
        declinesSurface("steps.repeat"),
        "the overlay declines repeat",
      );
    });

    it("returns false for a surface id that the overlay offers", ({ seat }) => {
      check.isFalse(
        seat,
        declinesSurface("recorder-seat"),
        "the overlay offers the recorder",
      );
    });
  });

  describe("declinesRelaxation", () => {
    it("returns false for a relaxation that the overlay offers", ({ seat }) => {
      check.isFalse(seat, declinesRelaxation("equate-empty"), "the overlay offers it");
    });
  });

  describe("diverges", () => {
    it("returns true for an assertion that the overlay declines", ({ seat }) => {
      check.isTrue(seat, diverges("max-allocs"), "the overlay declines max-allocs");
    });

    it("returns false for an assertion that the library implements", ({ seat }) => {
      check.isFalse(seat, diverges("equal"), "the library implements equal");
    });
  });
});
