/**
 * The spec of the runners of the property vectors. It uses vitest's `expect`
 * alone, because checkProp decides the verdict of every property vector.
 */

import { describe, expect, it } from "vitest";
import { checkProp, KINDS, settingsOf } from "../../../src/conformance/prop/vectors.js";
import { vectors } from "../../../src/conformance/vector.js";
import { Fault } from "../../../src/matcher/fault.js";

/** The property vectors of the definition, by id. */
const VECTORS = new Map(vectors().map((v) => [v.id, v.raw]));

/** Returns the vector of an id. */
function vector(id: string): Readonly<Record<string, unknown>> {
  return VECTORS.get(id) as Readonly<Record<string, unknown>>;
}

/** Returns the outputs that the runner of kind computes for raw. */
function outputs(
  kind: string,
  raw: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  return (
    KINDS.get(kind) as (
      raw: Readonly<Record<string, unknown>>,
    ) => Promise<Record<string, unknown>>
  )(raw);
}

/** Returns the fault that checkProp rejects with, as its place and its reason. */
async function fault(
  kind: string,
  raw: Readonly<Record<string, unknown>>,
): Promise<[string, string]> {
  try {
    await checkProp(kind, raw);
  } catch (err) {
    if (err instanceof Fault) return [err.at, err.reason];
    throw err;
  }
  return ["", ""];
}

const DIGIT = { gen: "integer", min: 0, max: 9 };

describe("vectors", () => {
  describe("KINDS", () => {
    it("states a runner of each kind of property vector", () => {
      expect([...KINDS.keys()].sort()).toEqual([
        "behaviour",
        "bridge",
        "coverage",
        "decoding",
        "draws",
        "forms",
        "generation",
        "inverse",
        "recording",
        "shapes",
        "shrinking",
        "store",
        "token",
      ]);
    });

    it("computes the recorded choices of a decode that rejects its case", async () => {
      const raw = {
        generator: { gen: "filter", of: DIGIT, keep: { kind: "never" } },
        choices: [1],
      };

      expect(await outputs("decoding", raw)).toEqual({
        recorded: [1],
        value: null,
        rejected: true,
      });
    });

    it("computes the values of the draws that the entries leave out as their targets", async () => {
      const raw = {
        draws: [
          { label: "a", generator: DIGIT },
          { label: "b", generator: DIGIT },
        ],
        entries: [{ label: "a", value: { type: "int", value: 4 } }],
      };

      expect(await outputs("draws", raw)).toEqual({
        choices: [4],
        values: [
          { label: "a", value: { type: "int", value: 4 } },
          { label: "b", value: { type: "int", value: 0 } },
        ],
        error: null,
      });
    });

    it("computes the error of an entry under another label", async () => {
      const raw = {
        draws: [{ label: "a", generator: DIGIT }],
        entries: [{ label: "b", value: { type: "int", value: 4 } }],
      };

      expect(await outputs("draws", raw)).toEqual({
        choices: null,
        values: null,
        error: { label: "a", reason: "label" },
      });
    });

    it("computes the error of an entry whose value the generator cannot produce", async () => {
      const raw = {
        draws: [{ label: "a", generator: DIGIT }],
        entries: [{ label: "a", value: { type: "int", value: 40 } }],
      };

      expect(await outputs("draws", raw)).toEqual({
        choices: null,
        values: null,
        error: { label: "a", reason: "value" },
      });
    });

    it("computes the outcome of a shrinking vector whose body never fails", async () => {
      const raw = { generator: DIGIT, "fails-when": { kind: "never" }, seed: "7" };

      expect(await outputs("shrinking", raw)).toEqual({
        outcome: "passed",
        cases: 10,
        value: null,
        choices: null,
        token: null,
        runs: 0,
      });
    });

    it("computes the verdict and the choices of a store file that a runner replays", async () => {
      const written = vector("store/names-an-entry-by-its-contract-and-token");
      const raw = {
        contract: written["contract"],
        text: JSON.stringify(written["entry"]),
      };

      expect(await outputs("store", raw)).toEqual({
        verdict: "replay",
        choices: [1, 0, 1, -1, 0],
      });
    });

    it("computes the verdict of a store file that a runner does not replay", async () => {
      expect(await outputs("store", { contract: "c", text: "{" })).toEqual({
        verdict: "damaged",
        choices: null,
      });
    });

    it("computes the calls of a recording vector whose body rejects every case", async () => {
      const raw = {
        body: { draw: DIGIT, "rejects-when": { kind: "always" } },
        settings: { seed: "7", cases: 1 },
      };

      expect(await outputs("recording", raw)).toEqual({ verdict: "fail", calls: [] });
    });

    it("computes the token of choices", async () => {
      expect(await outputs("token", { choices: [1] })).toEqual({ token: "prop1:AAE" });
    });

    it("computes the error of a token that does not decode", async () => {
      expect(await outputs("token", { token: "prop1:A" })).toEqual({
        decoded: null,
        error: true,
      });
    });

    it("computes the inverse of a shape", async () => {
      expect(
        await outputs("inverse", {
          shape: { shape: "bool" },
          value: { type: "bool", value: true },
        }),
      ).toEqual({ choices: [1], error: false });
    });
  });

  describe("settingsOf", () => {
    it("returns the defaults of a run for settings that state only a seed", () => {
      expect(settingsOf({ seed: "7" })).toEqual({
        seed: 7n,
        cases: 100,
        maxChoices: 8192,
        requirements: [],
        examples: [],
        stored: [],
        shrink: 2000,
        replay: undefined,
      });
    });

    it("returns the stated settings", () => {
      expect(
        settingsOf({
          seed: "1",
          cases: 5,
          "max-choices": 10,
          requirements: [{ label: "even", share: 0.5 }],
          examples: [[1]],
          stored: [[{ sequence: [2] }]],
          shrink: 0,
          replay: "prop1:AAc",
        }),
      ).toEqual({
        seed: 1n,
        cases: 5,
        maxChoices: 10,
        requirements: [{ label: "even", share: 0.5 }],
        examples: [[{ kind: "integer", value: 1n }]],
        stored: [[{ kind: "sequence", value: [2] }]],
        shrink: 0,
        replay: [{ kind: "integer", value: 7n }],
      });
    });
  });

  describe("checkProp", () => {
    const ids = [
      ["decoding", "integer/decodes-a-choice-inside-its-bounds"],
      ["generation", "integer/draws-from-a-signed-range"],
      ["shapes", "bool/one-coin-each"],
      ["inverse", "integer/a-value-is-its-own-choice"],
      ["inverse", "map/has-no-inverse"],
      ["draws", "draws/every-draw-matches-its-entry"],
      ["shrinking", "integer/shrinks-to-the-lower-boundary-of-the-failing-range"],
      ["coverage", "coverage/met-at-27-of-100-for-a-tenth"],
      ["bridge", "bridge/reads-the-fewest-bytes-that-cover-an-integer-range"],
      ["token", "token/encodes-no-choices"],
      ["behaviour", "behaviour/passes-a-body-that-never-fails"],
      ["store", "store/names-an-entry-by-its-contract-and-token"],
      ["recording", "recording/records-every-case-of-a-passing-run"],
      ["recording", "recording/records-the-one-case-of-a-replay-token"],
      ["forms", "prop-equal/passes-when-both-functions-return-the-input"],
    ] as const;
    for (const [kind, id] of ids) {
      it(`resolves for the vector ${id}`, async () => {
        await expect(checkProp(kind, vector(id))).resolves.toBeUndefined();
      });
    }

    it("rejects with a fault at the output that the engine computes otherwise", async () => {
      const raw = {
        ...vector("integer/decodes-a-choice-inside-its-bounds"),
        value: { type: "int", value: -18 },
      };

      expect(await fault("decoding", raw)).toEqual([
        "value",
        'the engine computes {"type":"int","value":-17}, want {"type":"int","value":-18}',
      ]);
    });

    it("rejects with a fault at the first output that differs", async () => {
      const raw = {
        ...vector("integer/decodes-a-choice-inside-its-bounds"),
        recorded: [-18],
        rejected: true,
      };

      expect((await fault("decoding", raw))[0]).toBe("recorded");
    });

    it("rejects with the fault of a vector that its runner cannot take", async () => {
      const raw = {
        shape: { shape: "bool" },
        generator: { gen: "boolean" },
        value: { type: "bool", value: true },
      };

      expect(await fault("inverse", raw)).toEqual([
        "",
        "the vector states neither a shape nor a generator, or both",
      ]);
    });

    it("rejects with a fault for a vector that does not run", async () => {
      const raw = {
        generator: { gen: "map", of: DIGIT, subject: "drops-the-first" },
        choices: [1],
      };

      expect(await fault("decoding", raw)).toEqual(["", "the vector does not run"]);
    });

    it("rejects with a fault for a recording vector without settings", async () => {
      const { settings: _, ...raw } = vector(
        "recording/records-every-case-of-a-passing-run",
      );

      expect(await fault("recording", raw)).toEqual(["", "the vector does not run"]);
    });

    it("rejects with a fault for a behaviour vector without settings", async () => {
      const { settings: _, ...raw } = vector(
        "behaviour/passes-a-body-that-never-fails",
      );

      expect(await fault("behaviour", raw)).toEqual(["", "the vector does not run"]);
    });

    it("rejects with a fault for a store entry that does not read back", async () => {
      const raw = {
        ...vector("store/names-an-entry-by-its-contract-and-token"),
        identity: { assertion: "equal", file: "pkg/codec_test.go", line: 18 },
      };

      expect(await fault("store", raw)).toEqual([
        "entry",
        "the entry does not read back as a replay of its choices",
      ]);
    });
  });
});
