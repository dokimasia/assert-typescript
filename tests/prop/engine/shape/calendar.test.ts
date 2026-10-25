// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the calendar of the date and time shapes. */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import {
  dayOf,
  divmod,
  FIRST_DAY,
  FIRST_SECOND,
  floorDiv,
  LAST_DAY,
  LAST_SECOND,
  SECONDS_PER_DAY,
  timeOf,
} from "../../../../src/prop/engine/shape/calendar.js";
import { test as it } from "../../../../src/vitest.js";
import { thrown } from "../../../helpers.js";

describe("calendar", () => {
  describe("SECONDS_PER_DAY", () => {
    it("equals the seconds in a day", ({ seat }) => {
      check.isEqualTo(seat, SECONDS_PER_DAY, 86_400n, "24 hours");
    });
  });

  describe("FIRST_SECOND", () => {
    it("equals the seconds since 1970-01-01 of 0001-01-01T00:00:00Z", ({ seat }) => {
      check.isEqualTo(seat, FIRST_SECOND, -62_135_596_800n, "the year 1");
    });
  });

  describe("LAST_SECOND", () => {
    it("equals the seconds since 1970-01-01 of 9999-12-31T23:59:59Z", ({ seat }) => {
      check.isEqualTo(seat, LAST_SECOND, 253_402_300_799n, "the year 9999");
    });
  });

  describe("FIRST_DAY", () => {
    it("equals the days since 1970-01-01 of 0001-01-01", ({ seat }) => {
      check.isEqualTo(seat, FIRST_DAY, -719_162n, "the year 1");
    });
  });

  describe("LAST_DAY", () => {
    it("equals the days since 1970-01-01 of 9999-12-31", ({ seat }) => {
      check.isEqualTo(seat, LAST_DAY, 2_932_896n, "the year 9999");
    });
  });

  describe("floorDiv", () => {
    it("rounds a quotient towards negative infinity", ({ seat }) => {
      check.isEqualTo(
        seat,
        [floorDiv(7n, 2n), floorDiv(-7n, 2n), floorDiv(-6n, 2n)],
        [3n, -4n, -3n],
        "three quotients",
      );
    });
  });

  describe("divmod", () => {
    it("returns the floor of a quotient and a remainder of the divisor's sign", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        [divmod(7n, 2n), divmod(-7n, 2n)],
        [
          [3n, 1n],
          [-4n, 1n],
        ],
        "two divisions",
      );
    });
  });

  describe("dayOf", () => {
    it("returns the days since 1970-01-01 of a date", ({ seat }) => {
      check.isEqualTo(
        seat,
        [
          dayOf("1970", "01", "01", "shape"),
          dayOf("2000", "02", "29", "shape"),
          dayOf("0001", "01", "01", "shape"),
          dayOf("9999", "12", "31", "shape"),
        ],
        [0n, 11_016n, -719_162n, 2_932_896n],
        "the epoch, a leap day and the two ends",
      );
    });

    const tests = [
      {
        name: "February 29 of a year that is no leap year",
        give: ["2023", "02", "29"],
      },
      { name: "the year 0", give: ["0000", "01", "01"] },
      { name: "the month 13", give: ["2020", "13", "01"] },
      { name: "the day 0", give: ["2020", "01", "00"] },
    ] as const;
    for (const tt of tests) {
      it(`refuses ${tt.name}`, ({ seat }) => {
        const [year, month, day] = tt.give;

        check.isEqualTo(
          seat,
          thrown(() => dayOf(year, month, day, "shape")),
          `prop: shape states ${year}-${month}-${day}, which is no date`,
          "the refusal",
        );
      });
    }
  });

  describe("timeOf", () => {
    it("returns the seconds since midnight of a time of day", ({ seat }) => {
      check.isEqualTo(
        seat,
        [timeOf("00", "00", "00", "shape"), timeOf("23", "59", "59", "shape")],
        [0n, 86_399n],
        "midnight and the last second",
      );
    });

    it("refuses the hour 24", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => timeOf("24", "00", "00", "shape")),
        "prop: shape states 24:00:00, which is no time",
        "the refusal",
      );
    });
  });
});
