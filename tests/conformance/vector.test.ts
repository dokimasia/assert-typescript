/**
 * The spec of the vectors and of their runner. It runs every vector that
 * this library runs, each in a directory of its own. It uses vitest's
 * `expect` alone, because checkVector decides the verdict of every vector.
 */

import { describe, expect, it } from "vitest";
import {
  checkVector,
  skipOf,
  type Vector,
  vectors,
} from "../../src/conformance/vector.js";
import { enter, temporary, WINDOWS } from "../helpers.js";

const VECTORS = vectors();

/** The kinds of the files vectors, one per assertion that reads files. */
const FILE_KINDS = [
  "golden-match-tree",
  "has-content",
  "has-mode",
  "is-dir",
  "is-file",
  "links-to",
  "path-absent",
  "tree-contains",
  "tree-equal",
  "tree-unchanged",
];

/** The kinds of the history vectors. */
const HISTORY_KINDS = ["linearizable", "seam", "serializable", "snapshot-isolation"];

/** The kinds of the machines vectors. */
const STATEFUL_KINDS = ["machines"];

/** The kinds of the property vectors. */
const PROP_KINDS = [
  "behaviour",
  "bridge",
  "coverage",
  "decoding",
  "draws",
  "fixtures",
  "forms",
  "generation",
  "inverse",
  "recording",
  "shapes",
  "shrinking",
  "store",
  "token",
];

/**
 * Reports whether this platform skips v: a file system that records no
 * permission bits skips each vector that states a mode or an executable
 * file, and each vector of has-mode, as the definition states.
 */
function skipped(v: Vector): boolean {
  const modes =
    v.kind === "has-mode" || /"(?:mode|executable)":/.test(JSON.stringify(v.raw));
  return (WINDOWS && modes) || skipOf(v) !== undefined;
}

describe("vector", () => {
  describe("vectors", () => {
    it("returns the vectors of every family that this library runs", () => {
      expect([...new Set(VECTORS.map((v) => v.kind))].sort()).toEqual(
        [...FILE_KINDS, ...HISTORY_KINDS, ...PROP_KINDS, ...STATEFUL_KINDS].sort(),
      );
    });

    it("returns the 57 files vectors of the definition", () => {
      expect(VECTORS.filter((v) => FILE_KINDS.includes(v.kind))).toHaveLength(57);
    });

    it("returns the 80 history vectors of the definition", () => {
      expect(VECTORS.filter((v) => HISTORY_KINDS.includes(v.kind))).toHaveLength(80);
    });

    it("returns the 430 property vectors of the definition", () => {
      expect(VECTORS.filter((v) => PROP_KINDS.includes(v.kind))).toHaveLength(430);
    });

    it("returns the 14 machines vectors of the definition", () => {
      expect(VECTORS.filter((v) => STATEFUL_KINDS.includes(v.kind))).toHaveLength(14);
    });

    it("returns files vectors whose ids name their kinds first", () => {
      const named = VECTORS.filter((v) => FILE_KINDS.includes(v.kind));

      expect(named.filter((v) => !v.id.startsWith(`${v.kind}/`))).toEqual([]);
    });

    it("returns forms vectors whose ids name their forms first", () => {
      const forms = VECTORS.filter((v) => v.kind === "forms");

      expect(
        forms.filter((v) => !v.id.startsWith(`${String(v.raw["form"])}/`)),
      ).toEqual([]);
    });
  });

  describe("checkVector", () => {
    it("returns the fault of a vector of no kind", async () => {
      const v: Vector = { kind: "widget", id: "widget/x", raw: {} };

      expect(await checkVector(v, temporary())).toBe(
        'widget/x: "widget" is no vector kind',
      );
    });

    it("returns the fault at the part of a vector that the run contradicts", async () => {
      const [first] = VECTORS.filter((v) => v.kind === "path-absent");
      const v = {
        ...(first as Vector),
        raw: { ...(first as Vector).raw, expect: "fail" },
      };

      expect(await checkVector(v, temporary())).toBe(
        `${v.id}.expect: the check ends as pass, want fail`,
      );
    });

    for (const v of VECTORS) {
      it.skipIf(skipped(v))(`returns undefined for the vector ${v.id}`, async () => {
        const dir = temporary();
        if (v.kind === "golden-match-tree") enter(dir);

        expect(await checkVector(v, dir)).toBeUndefined();
      });
    }
  });
});
