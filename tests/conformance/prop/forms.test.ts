/** The spec of the runner of the forms vectors. */

import { describe } from "vitest";
import { formsOf } from "../../../src/conformance/prop/forms.js";
import { vectors } from "../../../src/conformance/vector.js";
import { check } from "../../../src/index.js";
import { Fault } from "../../../src/matcher/fault.js";
import { test as it } from "../../../src/vitest.js";

/** The forms vectors of the definition, by id. */
const FORMS = new Map(
  vectors()
    .filter((v) => v.kind === "forms")
    .map((v) => [v.id, v.raw]),
);

/** Returns the forms vector of an id. */
function vector(id: string): Readonly<Record<string, unknown>> {
  return FORMS.get(id) as Readonly<Record<string, unknown>>;
}

/** Returns the fault that formsOf rejects with for raw, as its place and its reason. */
async function fault(
  raw: Readonly<Record<string, unknown>>,
): Promise<[string, string]> {
  try {
    await formsOf(raw);
  } catch (err) {
    if (err instanceof Fault) return [err.at, err.reason];
    throw err;
  }
  return ["", ""];
}

describe("forms", () => {
  describe("formsOf", () => {
    for (const id of FORMS.keys()) {
      it(`returns the detail that the vector ${id} states`, async ({ seat }) => {
        const raw = vector(id);

        check.equal(
          seat,
          (await formsOf(raw))["detail"],
          raw["detail"],
          "the detail of the form's call record",
        );
      });
    }

    it("returns a detail that differs from a vector that states another", async ({
      seat,
    }) => {
      const raw = vector("prop-true/fails-for-a-negative-input");
      const passing = { ...raw, subjects: ["returns-null"] };

      check.notEqual(
        seat,
        (await formsOf(passing))["detail"],
        raw["detail"],
        "the detail of another run",
      );
    });

    const tests: {
      name: string;
      give: Readonly<Record<string, unknown>>;
      want: [string, string];
    }[] = [
      {
        name: "a form that no vector runs",
        give: { form: "prop-widget" },
        want: ["form", '"prop-widget" is no form that a vector runs'],
      },
      {
        name: "a vector without a shape or a generator",
        give: { form: "prop-true", subjects: ["is-non-negative"], seed: "1" },
        want: ["", "the vector states neither a shape nor a generator, or both"],
      },
      {
        name: "a vector with a generator beside its shape",
        give: {
          form: "prop-true",
          shape: { shape: "bool" },
          generator: { gen: "boolean" },
          seed: "1",
        },
        want: ["", "the vector states neither a shape nor a generator, or both"],
      },
      {
        name: "a function subject that no table states",
        give: {
          ...vector("prop-true/fails-for-a-negative-input"),
          subjects: ["triples"],
        },
        want: ["subjects[0]", '"triples" is no subject that the form takes'],
      },
      {
        name: "a predicate subject that no table states",
        give: {
          ...vector("prop-pairwise/fails-for-a-list-out-of-order"),
          subjects: ["identity", "descending"],
        },
        want: ["subjects[1]", '"descending" is no subject that the form takes'],
      },
      {
        name: "a subject kind that lacks a member of the form",
        give: {
          ...vector("prop-pure/fails-when-the-call-changes-the-state"),
          subjects: ["adds"],
        },
        want: ["subjects[0]", '"adds" is no subject that the form takes'],
      },
      {
        name: "a subject kind that names no subject",
        give: {
          ...vector("prop-pure/fails-when-the-call-changes-the-state"),
          subjects: [5],
        },
        want: ["subjects[0]", "5 is no subject that the form takes"],
      },
    ];
    for (const tt of tests) {
      it(`rejects with a fault for ${tt.name}`, async ({ seat }) => {
        check.equal(seat, await fault(tt.give), tt.want, "the fault");
      });
    }

    it("rejects with a fault for a function subject that is no string", async ({
      seat,
    }) => {
      const raw = { ...vector("prop-true/fails-for-a-negative-input"), subjects: [5] };

      check.equal(
        seat,
        await fault(raw),
        ["subjects[0]", "5 is no subject that the form takes"],
        "the fault",
      );
    });

    it("rejects with a fault for a vector that states no subjects", async ({
      seat,
    }) => {
      const { subjects: _, ...raw } = vector("prop-true/fails-for-a-negative-input");

      check.equal(
        seat,
        await fault(raw),
        ["subjects[0]", "undefined is no subject that the form takes"],
        "the fault",
      );
    });

    it("returns the assertion of the failure alone for a vector whose failure states no detail", async ({
      seat,
    }) => {
      const raw = vector("prop-true/fails-for-a-negative-input");
      const detail = {
        ...(raw["detail"] as Record<string, unknown>),
        failure: { assertion: "true" },
      };
      const got = (await formsOf({ ...raw, detail }))["detail"] as Record<
        string,
        unknown
      >;

      check.equal(
        seat,
        got["failure"],
        { assertion: "true", detail: {} },
        "no field of the detail",
      );
    });

    it("keeps the record's typed literal where the vector states one that does not decode", async ({
      seat,
    }) => {
      const raw = vector("prop-true/fails-for-a-negative-input");
      const stated = raw["detail"] as Record<string, unknown>;
      const [draw] = stated["counterexample"] as Record<string, unknown>[];
      const detail = {
        ...stated,
        counterexample: [{ ...draw, value: { type: "widget" } }],
      };
      const got = (await formsOf({ ...raw, detail }))["detail"] as Record<
        string,
        unknown
      >;

      check.equal(
        seat,
        (got["counterexample"] as Record<string, unknown>[])[0]?.["value"],
        { type: "int", value: -1 },
        "the record's literal",
      );
    });

    it("returns the integers of a subject as bigints for an int of 64 bits", async ({
      seat,
    }) => {
      const raw = vector("prop-round-trip/passes-for-a-decimal-rendering");
      const shape = { ...(raw["shape"] as Record<string, unknown>), width: 64 };
      const got = (await formsOf({ ...raw, shape }))["detail"] as Record<
        string,
        unknown
      >;

      check.equal(
        seat,
        got["outcome"],
        "passed",
        "the rendering runs back to a bigint",
      );
    });
  });
});
