/** The spec of the entry point `@dokimi/assert/conformance`. */

import { describe } from "vitest";
import * as conformance from "../../src/conformance/index.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

describe("index", () => {
  it("exports the names of the conformance entry point", ({ seat }) => {
    check.equal(
      seat,
      Object.keys(conformance).sort(),
      [
        "LANGUAGE",
        "Objects",
        "SURFACES",
        "assertions",
        "canonical",
        "cases",
        "checkVector",
        "declinesRelaxation",
        "declinesSurface",
        "decode",
        "diverges",
        "memberFor",
        "mismatch",
        "names",
        "optionsOf",
        "overlay",
        "relaxationNames",
        "sameJson",
        "skipReason",
        "surfaceNames",
        "vectors",
        "version",
      ],
      "the entry point exports these names",
    );
  });
});
