// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the parts of a files vector. It uses vitest's `expect` alone,
 * as the spec of the runner of the files vectors does.
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  argsOf,
  argument,
  isString,
  pathAt,
  treeAt,
  valuesOf,
  within,
} from "../../../src/conformance/files/vector.js";
import { directory, text } from "../../../src/files/entry.js";
import { encode } from "../../../src/files/literal.js";
import { Fault } from "../../../src/matcher/fault.js";

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

describe("vector", () => {
  describe("within", () => {
    it("returns the tree below a directory of its own", () => {
      const tree = within("ws", new Map([["a.txt", text("x")]]));

      expect([...tree.keys()]).toEqual(["ws", "ws/a.txt"]);
    });
  });

  describe("treeAt", () => {
    it("returns the tree that a tree literal states", () => {
      const literal = encode(new Map([["d", directory()]]), Number.POSITIVE_INFINITY);

      expect([...treeAt(literal, "workspace").keys()]).toEqual(["d"]);
    });

    it("refuses a literal that states no tree at the member", () => {
      expect(faultOf(() => treeAt({ type: "list" }, "workspace"))?.[0]).toMatch(
        /^workspace/u,
      );
    });
  });

  describe("argsOf", () => {
    it("returns the arguments of a vector", () => {
      expect(argsOf({ args: [1, 2] }, 2)).toEqual([1, 2]);
    });

    it("refuses another number of arguments", () => {
      expect(faultOf(() => argsOf({}, 1))).toEqual([
        "args",
        "the number of arguments is 0, want 1",
      ]);
    });
  });

  describe("valuesOf", () => {
    it("returns the values of the typed literals of the arguments", () => {
      expect(valuesOf({ args: [{ type: "string", value: "a" }] }, 1)).toEqual(["a"]);
    });

    it("refuses an argument that is no typed literal at its position", () => {
      expect(faultOf(() => valuesOf({ args: [5] }, 1))?.[0]).toMatch(/^args\[0\]/u);
    });
  });

  describe("argument", () => {
    it("returns the argument that the check accepts", () => {
      expect(argument<string>(["a"], 0, "string", isString)).toBe("a");
    });

    it("refuses an argument that the check refuses", () => {
      expect(faultOf(() => argument([1], 0, "string", isString))).toEqual([
        "args[0]",
        "the argument is no string",
      ]);
    });
  });

  describe("isString", () => {
    it("reports whether a value is a string", () => {
      expect([isString("a"), isString(1)]).toEqual([true, false]);
    });
  });

  describe("pathAt", () => {
    it("returns the path of the system below the workspace", () => {
      expect(pathAt(["a/b.txt"], 0, "/ws")).toBe(join("/ws", "a", "b.txt"));
    });
  });
});
