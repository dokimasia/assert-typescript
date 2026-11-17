// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the entries of the search of one partition. */

import { describe } from "vitest";
import { Entries } from "../../src/history/entries.js";
import { History, recorded } from "../../src/history/history.js";
import { type Checked, callsOf } from "../../src/history/partition.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

/** Returns whether each entry of the scan is an invocation, with the position of its call. */
function scan(entries: Entries): [boolean, number][] {
  const out: [boolean, number][] = [];
  for (let entry = entries.first; entries.next(entry) !== entry; ) {
    out.push([entries.invokes(entry), entries.position(entry)]);
    entry = entries.next(entry);
  }
  return out;
}

/** Returns the calls of a write of 1 and a read of 1 that complete in order. */
function writeThenRead(): Checked[] {
  const history = new History();
  history.invoke(0, "write", [1], "x").ok(null);
  history.invoke(1, "read", [], "x").ok(1);
  const { events, ids } = recorded(history);
  return callsOf(events, ids);
}

describe("entries", () => {
  describe("new Entries", () => {
    it("has no entry in the scan", ({ seat }) => {
      const entries = new Entries();

      check.isEqualTo(
        seat,
        [entries.open, entries.optional, scan(entries)],
        [0, 0n, []],
        "an empty scan",
      );
    });
  });

  describe("Entries.add", () => {
    it("lays out the invocations and the completions in event order", ({ seat }) => {
      const history = new History();
      const write = history.invoke(0, "write", [1], "x");
      const read = history.invoke(1, "read", [], "x");
      write.ok(null);
      read.ok(1);
      const { events, ids } = recorded(history);
      const entries = new Entries();
      entries.add(callsOf(events, ids), 0);

      check.isEqualTo(
        seat,
        [scan(entries), entries.open],
        [
          [
            [true, 0],
            [true, 1],
            [false, 0],
            [false, 1],
          ],
          2,
        ],
        "both invocations come before both completions",
      );
    });

    it("lays out no completion of a call whose outcome is unknown", ({ seat }) => {
      const history = new History();
      history.invoke(0, "write", [1], "x").ok(null);
      history.invoke(1, "write", [2], "x").unknown("timed out");
      const { events, ids } = recorded(history);
      const entries = new Entries();
      entries.add(callsOf(events, ids), 0);

      check.isEqualTo(
        seat,
        [scan(entries), entries.open, entries.optional],
        [
          [
            [true, 0],
            [false, 0],
            [true, 1],
          ],
          1,
          0b10n,
        ],
        "the lost write has an invocation alone",
      );
    });

    it("appends the entries of new calls after the entries before them", ({ seat }) => {
      const [write, read] = writeThenRead() as [Checked, Checked];
      const entries = new Entries();
      entries.add([write], 0);
      entries.add([read], 1);

      check.isEqualTo(
        seat,
        scan(entries),
        [
          [true, 0],
          [false, 0],
          [true, 1],
          [false, 1],
        ],
        "the read follows the write",
      );
    });

    it("puts a call that is out of the scan back before the new entries", ({
      seat,
    }) => {
      const [write, read] = writeThenRead() as [Checked, Checked];
      const entries = new Entries();
      entries.add([write], 0);
      entries.lift(0);
      entries.add([read], 1);
      entries.unlift(0);

      check.isEqualTo(
        seat,
        scan(entries),
        [
          [true, 0],
          [false, 0],
          [true, 1],
          [false, 1],
        ],
        "the write comes back before the read",
      );
    });

    it("leaves the scan as it is for no call", ({ seat }) => {
      const [write] = writeThenRead() as [Checked, Checked];
      const entries = new Entries();
      entries.add([write], 0);
      entries.lift(0);
      entries.add([], 1);
      entries.unlift(0);

      check.isEqualTo(
        seat,
        scan(entries),
        [
          [true, 0],
          [false, 0],
        ],
        "the write comes back alone",
      );
    });
  });

  describe("Entries.lift", () => {
    it("takes the entries of a call out of the scan", ({ seat }) => {
      const entries = new Entries();
      entries.add(writeThenRead(), 0);
      entries.lift(0);

      check.isEqualTo(
        seat,
        [scan(entries), entries.open],
        [
          [
            [true, 1],
            [false, 1],
          ],
          1,
        ],
        "the read is left",
      );
    });
  });

  describe("Entries.unlift", () => {
    it("puts the entries of a call back where they were", ({ seat }) => {
      const entries = new Entries();
      entries.add(writeThenRead(), 0);
      entries.lift(0);
      entries.unlift(0);

      check.isEqualTo(
        seat,
        [scan(entries), entries.open],
        [
          [
            [true, 0],
            [false, 0],
            [true, 1],
            [false, 1],
          ],
          2,
        ],
        "both calls are back",
      );
    });
  });

  describe("Entries.afterInvocation", () => {
    it("returns the entry after the invocation of a call", ({ seat }) => {
      const entries = new Entries();
      entries.add(writeThenRead(), 0);
      const after = entries.afterInvocation(1);

      check.isEqualTo(
        seat,
        [entries.invokes(after), entries.position(after)],
        [false, 1],
        "the completion of the read",
      );
    });
  });
});
