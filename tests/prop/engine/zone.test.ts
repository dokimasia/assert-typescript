/** The spec of the zone list and the offset changes of its zones. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { ZONES } from "../../../src/prop/engine/zone.js";
import { test as it } from "../../../src/vitest.js";

describe("zone", () => {
  describe("ZONES", () => {
    it("lists the sixteen zones of the definition with UTC first", ({ seat }) => {
      check.equal(
        seat,
        ZONES.map((zone) => zone.name),
        [
          "UTC",
          "Europe/Amsterdam",
          "America/New_York",
          "Australia/Sydney",
          "Australia/Lord_Howe",
          "Pacific/Chatham",
          "Asia/Kolkata",
          "Asia/Kathmandu",
          "America/St_Johns",
          "Asia/Tehran",
          "America/Sao_Paulo",
          "Pacific/Kiritimati",
          "Pacific/Apia",
          "Europe/Dublin",
          "Africa/Casablanca",
          "Antarctica/Troll",
        ],
        "the zone names in order",
      );
    });

    it("lists no change of UTC", ({ seat }) => {
      check.isEmpty(seat, ZONES[0]?.changes, "UTC has no offset change");
    });

    it("converts each change to bigint seconds", ({ seat }) => {
      check.equal(
        seat,
        ZONES[1]?.changes[0],
        { at: -1_740_355_200n, before: 0n, after: 3600n },
        "the first change of Europe/Amsterdam",
      );
    });

    it("lists the changes of each zone in time order with each offset after a change before the next", ({
      seat,
    }) => {
      const broken = ZONES.filter((zone) =>
        zone.changes.some((change, i) => {
          const next = zone.changes[i + 1];
          return (
            next !== undefined && (next.at <= change.at || next.before !== change.after)
          );
        }),
      );

      check.isEmpty(
        seat,
        broken.map((zone) => zone.name),
        "no zone breaks the order",
      );
    });
  });
});
