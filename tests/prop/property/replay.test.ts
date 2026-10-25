// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the options of a property that state a case to replay. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { Fault } from "../../../src/matcher/fault.js";
import { choiceOf, IntegerBounds } from "../../../src/prop/engine/choice.js";
import * as token from "../../../src/prop/engine/token.js";
import { type Entry, TraceError } from "../../../src/prop/engine/trace.js";
import { configure, hermetic, replay } from "../../../src/prop/option.js";
import { entriesOf, refusalOf, replayOf } from "../../../src/prop/property/replay.js";
import { test as it } from "../../../src/vitest.js";

/** Returns the location and the reason of the fault that fn throws. */
function faultOf(fn: () => unknown): [string, string] | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof Fault) {
      return [err.at, err.reason];
    }
    throw err;
  }
  return undefined;
}

/** The entries of a step and a draw. */
const ENTRIES: readonly Entry[] = [
  { action: "push", client: 1 },
  { label: "x", value: 1n },
];

describe("replay", () => {
  describe("entriesOf", () => {
    it("returns the step entries and the draw entries of the text", ({ seat }) => {
      check.isEqualTo(
        seat,
        entriesOf(
          '[{"step": "push", "client": 1, "drain": true}, {"label": "x", "value": {"type": "int", "value": 1}}]',
        ),
        [
          { action: "push", client: 1, drain: true },
          { label: "x", value: 1n },
        ],
        "a step entry and a draw entry",
      );
    });

    it("refuses text that is no JSON", ({ seat }) => {
      check.isEqualTo(
        seat,
        faultOf(() => entriesOf("[")),
        ["draws", "the entries are no JSON array of objects"],
        "the fault at draws",
      );
    });

    it("refuses an array of other values than objects", ({ seat }) => {
      check.isEqualTo(
        seat,
        faultOf(() => entriesOf("[1]")),
        ["draws", "the entries are no JSON array of objects"],
        "the fault at draws",
      );
    });

    it("refuses an entry without a step and without a label", ({ seat }) => {
      check.isEqualTo(
        seat,
        faultOf(() => entriesOf("[{}]")),
        ["draws[0]", "the entry states no step, and no label or no value"],
        "the fault at the entry",
      );
    });

    it("refuses a client that is no whole number of 0 or more", ({ seat }) => {
      check.isEqualTo(
        seat,
        faultOf(() => entriesOf('[{"step": "push", "client": -1}]')),
        ["draws[0].client", "the client -1 is no whole number of 0 or more"],
        "the fault at the client",
      );
    });

    it("refuses a value that is no typed literal", ({ seat }) => {
      check.isEqualTo(
        seat,
        faultOf(() => entriesOf('[{"label": "x", "value": 1}]')),
        ["draws[0].value", "the value is no typed literal"],
        "the fault at the value",
      );
    });
  });

  describe("replayOf", () => {
    it("returns undefined for a run that replays no token", ({ seat }) => {
      check.isNil(seat, replayOf(configure([hermetic()])), "no choices");
    });

    it("returns the choices of the token to replay", ({ seat }) => {
      const choices = [choiceOf(new IntegerBounds(0n, 9n), 4n)];

      check.isEqualTo(
        seat,
        replayOf(configure([hermetic(), replay(token.encode(choices))]))?.map(
          (choice) => choice.value,
        ),
        [4n],
        "the choice 4",
      );
    });

    it("refuses a token that no encoder writes", ({ seat }) => {
      check.isEqualTo(
        seat,
        faultOf(() => replayOf(configure([hermetic(), replay("not a token")]))),
        ["replay", "no encoder writes the token"],
        "the fault at the option",
      );
    });
  });

  describe("refusalOf", () => {
    it("states a step that the machine cannot take", ({ seat }) => {
      const fault = refusalOf(new TraceError(0, "push", "step"), ENTRIES);

      check.isEqualTo(
        seat,
        [fault.at, fault.reason],
        ["draws[0].step", 'the machine cannot take the step "push" there'],
        "the fault at the step",
      );
    });

    it("states a value that the generator does not produce", ({ seat }) => {
      const fault = refusalOf(new TraceError(1, "x", "value"), ENTRIES);

      check.isEqualTo(
        seat,
        fault.reason,
        'the generator of the draw labelled "x" does not produce the entry\'s value',
        "the fault at the value",
      );
    });

    it("states the entry that a draw of another label takes", ({ seat }) => {
      const fault = refusalOf(new TraceError(0, "y", "label"), ENTRIES);

      check.isEqualTo(
        seat,
        [fault.at, fault.reason],
        ["draws[0].label", 'the draw labelled "y" takes the step entry of "push"'],
        "the fault at the label",
      );
    });

    it("states the draw entry that a draw of another label takes", ({ seat }) => {
      const fault = refusalOf(new TraceError(1, "y", "label"), ENTRIES);

      check.isEqualTo(
        seat,
        fault.reason,
        'the draw labelled "y" takes the entry labelled "x"',
        "the fault at the label",
      );
    });
  });
});
