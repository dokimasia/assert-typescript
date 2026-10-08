/**
 * The spec of the runner of the machines vectors. It uses vitest's `expect`
 * alone, because the runner decides the verdict of every machines vector.
 */

import { describe, expect, it } from "vitest";
import { RUNNERS } from "../../../src/conformance/stateful/vectors.js";
import { vectors } from "../../../src/conformance/vector.js";
import { Fault } from "../../../src/matcher/fault.js";

/** A vector's JSON object. */
type Raw = Readonly<Record<string, unknown>>;

/** The machines vectors of the definition, by id. */
const VECTORS = new Map(
  vectors()
    .filter((v) => RUNNERS.has(v.kind))
    .map((v) => [v.id, v.raw]),
);

/** The runner of the machines vectors. */
const MACHINES = RUNNERS.get("machines") as (raw: Raw) => Promise<void>;

/** Returns the vector of an id. */
function vector(id: string): Raw {
  return VECTORS.get(id) as Raw;
}

/** Returns the fault that the runner throws for raw, as its place and its reason. */
async function fault(raw: Raw): Promise<[string, string]> {
  try {
    await MACHINES(raw);
  } catch (err) {
    if (err instanceof Fault) return [err.at, err.reason];
    throw err;
  }
  return ["", ""];
}

/** The id of a vector of a subject that passes under every schedule. */
const PASSING = "correct-counter/passes-with-two-clients";

/** The id of a vector whose trace the run refuses. */
const REFUSED = "store-loses-on-crash/a-flush-of-an-empty-buffer-is-refused";

describe("vectors", () => {
  describe("RUNNERS", () => {
    it("states the runner of the machines vectors", () => {
      expect([...RUNNERS.keys()]).toEqual(["machines"]);
    });

    it("runs the 14 machines vectors of the definition", () => {
      expect(VECTORS.size).toBe(14);
    });

    for (const id of VECTORS.keys()) {
      it(`agrees with the vector ${id}`, async () => {
        await expect(MACHINES(vector(id))).resolves.toBeUndefined();
      });
    }

    it("agrees with a vector of a setup of a PCT strategy", async () => {
      const raw = { ...vector(PASSING), setup: { strategy: { pct: 2 } } };

      await expect(MACHINES(raw)).resolves.toBeUndefined();
    });

    it("agrees with a vector of a setup of a mean and a most steps of a section", async () => {
      const raw = { ...vector(PASSING), setup: { mean: 5, concurrent: 4 } };

      await expect(MACHINES(raw)).resolves.toBeUndefined();
    });

    const tests: { name: string; give: Raw; want: [string, string] }[] = [
      {
        name: "a vector of no machine subject",
        give: { subject: "widget" },
        want: ["subject", '"widget" names no machine subject'],
      },
      {
        name: "a setup of no strategy",
        give: { ...vector(PASSING), setup: { strategy: "random" } },
        want: ["setup.strategy", '"random" is no strategy'],
      },
      {
        name: "a setting that the runner takes no",
        give: { ...vector(PASSING), settings: { seed: "1", shrink: 5 } },
        want: ["settings.shrink", "the runner takes no such setting"],
      },
      {
        name: "an error that the run does not end with",
        give: { ...vector(PASSING), error: vector(REFUSED)["error"] },
        want: ["error", 'the run ends with "", want a refusal of entry 1 of "flush"'],
      },
      {
        name: "a run that ends with a fault that the vector does not state",
        give: { ...vector(PASSING), trace: [{ step: "widget" }] },
        want: [
          "",
          'the run ends with "prop.forAll: draws[0].step: the machine cannot take the step \\"widget\\" there"',
        ],
      },
    ];
    for (const tt of tests) {
      it(`throws a fault for ${tt.name}`, async () => {
        expect(await fault(tt.give)).toEqual(tt.want);
      });
    }

    it("runs a vector without settings under the default seed of a run", async () => {
      const unset = Object.fromEntries(
        Object.entries(vector(PASSING)).filter(([name]) => name !== "settings"),
      );
      const [at, reason] = await fault(unset);
      const ours = reason.split(", want ")[0] as string;

      expect([
        at,
        ours.startsWith("the run's detail is"),
        ours.includes('"seed":"1"'),
      ]).toEqual(["detail", true, false]);
    });

    it("throws a fault for a detail that the run contradicts", async () => {
      const [at, reason] = await fault({
        ...vector(PASSING),
        settings: { seed: "1", cases: 10 },
      });

      expect([
        at,
        reason.startsWith('the run\'s detail is {"outcome":"passed","cases":10'),
      ]).toEqual(["detail", true]);
    });
  });
});
