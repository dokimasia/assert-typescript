// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the call of a golden-match-tree vector. It uses vitest's
 * `expect` alone, as the spec of the runner of the files vectors does.
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { goldenCall } from "../../../src/conformance/files/golden.js";
import { directory, text } from "../../../src/files/entry.js";
import { encode } from "../../../src/files/literal.js";
import { create } from "../../../src/files/writer.js";
import { Fault } from "../../../src/matcher/fault.js";
import { Recorder } from "../../../src/seat.js";
import { enter, records, temporary } from "../../helpers.js";

/** The arguments of a call of golden.matchTree of the name tree with update. */
const UPDATE = [
  { type: "string", value: "tree" },
  { type: "bool", value: true },
];

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

describe("golden", () => {
  describe("goldenCall", () => {
    it("refuses a directory of the vector other than the working directory", () => {
      const dir = temporary();

      expect(
        faultOf(() => goldenCall({ args: UPDATE, golden: null }, dir, dir)),
      ).toEqual([
        "",
        "the directory of the vector is not the working directory, which golden.matchTree resolves a name against",
      ]);
    });

    it("refuses a name that is no string", () => {
      expect(
        faultOf(() =>
          goldenCall({ args: [UPDATE[1], UPDATE[1]], golden: null }, ".", "."),
        ),
      ).toEqual(["args[0]", "the argument is no string"]);
    });

    it("writes the workspace as the golden tree under update, as after states it", async () => {
      const dir = temporary();
      enter(dir);
      create(
        dir,
        new Map([
          ["ws", directory()],
          ["ws/a.txt", text("x")],
        ]),
      );
      const after = encode(new Map([["a.txt", text("x")]]), Number.POSITIVE_INFINITY);
      const seat = new Recorder();
      await goldenCall(
        { args: UPDATE, golden: null, after },
        dir,
        join(dir, "ws"),
      )(seat);

      expect(records(seat)[0]?.["verdict"]).toBe("pass");
    });

    it("refuses a golden tree after the call that differs from after", async () => {
      const dir = temporary();
      enter(dir);
      create(
        dir,
        new Map([
          ["ws", directory()],
          ["ws/a.txt", text("x")],
        ]),
      );
      const after = encode(new Map([["b.txt", text("y")]]), Number.POSITIVE_INFINITY);
      const call = goldenCall(
        { args: UPDATE, golden: null, after },
        dir,
        join(dir, "ws"),
      );
      let refused: unknown;
      try {
        await call(new Recorder());
      } catch (err) {
        refused = err;
      }

      expect((refused as Fault).at).toBe("after");
    });
  });
});
