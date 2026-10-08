/**
 * The spec of the switch that turns call records on.
 *
 * Under a value that the switch does not define, every assertion of the
 * library ends with the switch's fault, so each case restores the switch
 * before it asserts.
 */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { type Reading, reading, VARIABLE } from "../../src/record/switch.js";
import { test as it } from "../../src/vitest.js";
import { setRecording } from "../helpers.js";

/** Returns the reading of a process that has not read the switch, for the variable value. */
function readAt(value: string | undefined): Reading {
  const restore = setRecording(value);
  const read = reading();
  restore();
  return read;
}

describe("switch", () => {
  describe("VARIABLE", () => {
    it("contains the name DOKIMI_ASSERT_RECORD", ({ seat }) => {
      check.equal(seat, VARIABLE, "DOKIMI_ASSERT_RECORD", "the variable of the switch");
    });
  });

  describe("reading", () => {
    const tests = [
      {
        name: "returns off for an unset variable",
        give: undefined,
        want: { on: false },
      },
      { name: "returns off for an empty variable", give: "", want: { on: false } },
      { name: "returns off for 0", give: "0", want: { on: false } },
      { name: "returns on for 1", give: "1", want: { on: true } },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(
          seat,
          readAt(tt.give),
          tt.want as Reading,
          "the reading of the switch",
        );
      });
    }

    it("returns the fault of a value other than 0 or 1", ({ seat }) => {
      const read = readAt("yes");

      check.equal(
        seat,
        "fault" in read ? read.fault.message : "",
        `${VARIABLE}: "yes" is neither 0 nor 1`,
        "the fault names the variable",
      );
    });

    it("returns the first reading of the process after a change of the variable", ({
      seat,
    }) => {
      const restore = setRecording("1");
      const first = reading();
      process.env[VARIABLE] = "0";
      const second = reading();
      restore();

      check.equal(seat, [first, second], [{ on: true }, { on: true }], "one reading");
    });
  });
});
