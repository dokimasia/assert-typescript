/** The spec of whether a run checks allocation ceilings. */

import { describe } from "vitest";
import { allocsChecked } from "../src/allocs.js";
import { check } from "../src/index.js";
import { test as it } from "../src/vitest.js";

describe("allocs", () => {
  describe("allocsChecked", () => {
    it("returns false with the reason that V8 does not expose an allocation count", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        allocsChecked(),
        { checked: false, reason: "V8 does not expose an allocation count" },
        "no run checks an allocation ceiling",
      );
    });
  });
});
