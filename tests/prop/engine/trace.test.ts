// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of traces: the entries of a case, and the provider that serves a trace's values. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { Replaying } from "../../../src/prop/engine/case/providers.js";
import { Case } from "../../../src/prop/engine/case.js";
import { IntegerBounds } from "../../../src/prop/engine/choice.js";
import { Sizes } from "../../../src/prop/engine/collection.js";
import { Composite } from "../../../src/prop/engine/generator/collections.js";
import {
  Dict,
  Filter,
  type Generator,
  Integer,
  List,
  Mapped,
  OneOf,
  Optional,
} from "../../../src/prop/engine/generator.js";
import {
  type Entry,
  entries,
  isStep,
  TraceError,
  Tracing,
  UNSTATED,
} from "../../../src/prop/engine/trace.js";
import { Pairs } from "../../../src/prop/engine/value.js";
import { test as it } from "../../../src/vitest.js";

/** The generator that most draws use. */
const DIGIT = new Integer(new IntegerBounds(0n, 9n));

/** A composite of two digits drawn under a and b, whose value is their list. */
const PAIR = new Composite((c) => [c.draw(DIGIT, "a"), c.draw(DIGIT, "b")]);

/** Returns the fields of the TraceError that fn throws. */
function refusal(
  seat: Parameters<typeof check.doesThrow>[0],
  fn: () => unknown,
): unknown[] {
  const err = check.doesThrow(seat, fn, "the trace is refused") as TraceError;
  check.errorIs(seat, err, TraceError, "the error is a TraceError");
  return [err.entry, err.what, err.reason];
}

describe("trace", () => {
  describe("isStep", () => {
    it("returns true only for a step entry", ({ seat }) => {
      check.isEqualTo(
        seat,
        [isStep({ action: "put" }), isStep({ label: "v", value: 1n })],
        [true, false],
        "the two kinds",
      );
    });
  });

  describe("new TraceError", () => {
    it("returns the error of an entry at its position", ({ seat }) => {
      const err = new TraceError(1, "get", "step");

      check.isEqualTo(
        seat,
        [err.name, err.message, err.entry, err.what, err.reason],
        ["TraceError", "prop: trace entry 1 (get): step", 1, "get", "step"],
        "the fields",
      );
    });
  });

  describe("entries", () => {
    it("lists each step before the draws recorded after it", ({ seat }) => {
      const c = new Case(
        new Replaying([
          { kind: "integer", value: 3n },
          { kind: "integer", value: 4n },
        ]),
      );
      c.step({ action: "put" });
      c.draw(DIGIT, "v");
      c.step({ action: "get", client: 1 });
      c.step({ action: "put", drain: true });
      c.draw(DIGIT, "w");
      c.step({ action: "get" });

      check.isEqualTo(
        seat,
        entries(c),
        [
          { action: "put" },
          { label: "v", value: 3n },
          { action: "get", client: 1 },
          { action: "put", drain: true },
          { label: "w", value: 4n },
          { action: "get" },
        ],
        "the steps and the draws in request order",
      );
    });
  });

  describe("Tracing.drawing", () => {
    it("prepares the choices of the entry's value for its draw", ({ seat }) => {
      const c = new Case(
        new Tracing([
          { label: "x", value: 7n },
          { label: "y", value: undefined },
        ]),
      );

      check.isEqualTo(
        seat,
        [c.draw(DIGIT, "x"), c.draw(new Optional(DIGIT), "y"), c.choices],
        [
          7n,
          undefined,
          [
            { kind: "integer", value: 7n },
            { kind: "integer", value: 0n },
          ],
        ],
        "the decoded values and their choices",
      );
    });

    it("prepares nothing for a draw past the last entry", ({ seat }) => {
      const c = new Case(new Tracing([{ label: "x", value: 7n }]));
      c.draw(DIGIT, "x");

      check.isEqualTo(
        seat,
        c.draw(new Integer(new IntegerBounds(3n, 9n)), "y"),
        3n,
        "the target",
      );
    });

    it("throws a TraceError for a draw with another label than its entry", ({
      seat,
    }) => {
      const c = new Case(new Tracing([{ label: "y", value: 7n }]));

      check.isEqualTo(
        seat,
        refusal(seat, () => c.draw(DIGIT, "x")),
        [0, "x", "label"],
        "the entry, the label and the reason",
      );
    });

    it("throws a TraceError for a draw where a step entry is next", ({ seat }) => {
      const c = new Case(new Tracing([{ action: "put" }]));

      check.isEqualTo(
        seat,
        refusal(seat, () => c.draw(DIGIT, "v")),
        [0, "v", "label"],
        "a step entry has no label",
      );
    });

    it("throws a TraceError for a value that the generator cannot produce", ({
      seat,
    }) => {
      const c = new Case(
        new Tracing([
          { label: "x", value: 7n },
          { label: "x", value: 12n },
        ]),
      );
      c.draw(DIGIT, "x");

      check.isEqualTo(
        seat,
        refusal(seat, () => c.draw(DIGIT, "x")),
        [1, "x", "value"],
        "12 is no digit",
      );
    });

    it("throws a TraceError for an entry that records no value", ({ seat }) => {
      const c = new Case(new Tracing([{ label: "x", value: UNSTATED }]));

      check.isEqualTo(
        seat,
        refusal(seat, () => c.draw(DIGIT, "x")),
        [0, "x", "value"],
        "the entry has no typed literal",
      );
    });

    it("throws an error of the generator that is no refusal", ({ seat }) => {
      const broken = new Mapped(
        DIGIT,
        (): bigint => {
          throw new TypeError("the map broke");
        },
        (value: bigint) => value,
      );
      const c = new Case(new Tracing([{ label: "x", value: 1n }]));

      check.errorIs(
        seat,
        check.doesThrow(seat, () => c.draw(broken, "x"), "the map throws"),
        TypeError,
        "the map's error",
      );
    });

    const refusals: {
      name: string;
      give: Entry[];
      generator: Generator<unknown>;
      want: unknown[];
    }[] = [
      {
        name: "an entry of a draw through a composite after a step entry",
        give: [
          { label: "a", value: 7n },
          { label: "b", value: 3n },
          { action: "put" },
          { label: "pair", value: [7n, 3n] },
        ],
        generator: new OneOf<unknown>([DIGIT, PAIR]),
        want: [0, "pair", "label"],
      },
      {
        name: "a draw through a composite without an entry of its label",
        give: [
          { label: "a", value: 7n },
          { label: "b", value: 3n },
        ],
        generator: new OneOf<unknown>([DIGIT, PAIR]),
        want: [0, "pair", "label"],
      },
      {
        name: "a later entry whose value has no composite",
        give: [
          { label: "a", value: 7n },
          { label: "pair", value: 5n },
        ],
        generator: new OneOf<unknown>([DIGIT, PAIR]),
        want: [0, "pair", "label"],
      },
      {
        name: "an entry of a draw through a composite that records no value",
        give: [
          { label: "a", value: 7n },
          { label: "b", value: 3n },
          { label: "pair", value: UNSTATED },
        ],
        generator: new OneOf<unknown>([DIGIT, PAIR]),
        want: [2, "pair", "value"],
      },
      {
        name: "the entry of a dict through a composite",
        give: [
          { label: "a", value: 1n },
          { label: "b", value: 2n },
          { label: "pair", value: new Pairs([[5n, [1n, 2n]]]) },
        ],
        generator: new Dict(DIGIT, PAIR, new Sizes(0, 2)),
        want: [2, "pair", "value"],
      },
    ];
    for (const tt of refusals) {
      it(`throws a TraceError for ${tt.name}`, ({ seat }) => {
        const c = new Case(new Tracing(tt.give));

        check.isEqualTo(
          seat,
          refusal(seat, () => c.draw(tt.generator, "pair")),
          tt.want,
          "the entry, the label and the reason",
        );
      });
    }
  });

  describe("Tracing.drawn", () => {
    it("takes the entry of a composite after the entries of its draws", ({ seat }) => {
      const trace = new Tracing([
        { label: "a", value: 7n },
        { label: "b", value: 3n },
        { label: "pair", value: UNSTATED },
      ]);
      const c = new Case(trace);

      check.isEqualTo(
        seat,
        [c.draw(PAIR, "pair"), trace.taken, c.choices.map((choice) => choice.value)],
        [[7n, 3n], 3, [7n, 3n]],
        "the pair takes the three entries",
      );
    });

    it("takes the entry of an inner composite before the outer one", ({ seat }) => {
      const outer = new Composite((c) => [c.draw(PAIR, "pair"), c.draw(DIGIT, "c")]);
      const trace = new Tracing([
        { label: "a", value: 1n },
        { label: "b", value: 2n },
        { label: "pair", value: [1n, 2n] },
        { label: "c", value: 5n },
        { label: "outer", value: UNSTATED },
      ]);

      check.isEqualTo(
        seat,
        [new Case(trace).draw(outer, "outer"), trace.taken],
        [[[1n, 2n], 5n], 5],
        "the composites take every entry",
      );
    });

    it("takes no entry for a composite past the last entry", ({ seat }) => {
      const trace = new Tracing([{ label: "a", value: 7n }]);

      check.isEqualTo(
        seat,
        [new Case(trace).draw(PAIR, "pair"), trace.taken],
        [[7n, 0n], 1],
        "the second draw of the pair takes its target",
      );
    });

    it("takes no entry after a draw that is no composite", ({ seat }) => {
      const trace = new Tracing([
        { label: "x", value: 7n },
        { label: "y", value: 1n },
      ]);
      new Case(trace).draw(DIGIT, "x");

      check.isEqualTo(seat, trace.taken, 1, "the digit takes one entry");
    });

    const ends: { name: string; give: Entry }[] = [
      {
        name: "an entry of another label after the draws",
        give: { label: "other", value: [7n, 3n] },
      },
      { name: "a step entry after the draws", give: { action: "put" } },
    ];
    for (const tt of ends) {
      it(`throws a TraceError for ${tt.name} of a composite`, ({ seat }) => {
        const c = new Case(
          new Tracing([{ label: "a", value: 7n }, { label: "b", value: 3n }, tt.give]),
        );

        check.isEqualTo(
          seat,
          refusal(seat, () => c.draw(PAIR, "pair")),
          [2, "pair", "label"],
          "the error is at entry 2 for the label",
        );
      });
    }

    it("takes the entry of a one-of through a composite after its draws", ({
      seat,
    }) => {
      const trace = new Tracing([
        { label: "a", value: 7n },
        { label: "b", value: 3n },
        { label: "pair", value: [7n, 3n] },
      ]);
      const c = new Case(trace);

      check.isEqualTo(
        seat,
        [
          c.draw(new OneOf<unknown>([DIGIT, PAIR]), "pair"),
          trace.taken,
          c.choices.map((choice) => choice.value),
        ],
        [[7n, 3n], 3, [1n, 7n, 3n]],
        "the one-of takes the three entries",
      );
    });

    it("takes the entry of an alternative without a composite at once", ({ seat }) => {
      const c = new Case(
        new Tracing([
          { label: "pair", value: 7n },
          { label: "x", value: 5n },
        ]),
      );

      check.isEqualTo(
        seat,
        [
          c.draw(new OneOf<unknown>([PAIR, DIGIT]), "pair"),
          c.draw(DIGIT, "x"),
          c.choices.map((choice) => choice.value),
        ],
        [7n, 5n, [1n, 7n, 5n]],
        "the one-of takes its entry before the draw of x",
      );
    });

    it("serves the flags of a list of composites around their draws", ({ seat }) => {
      const trace = new Tracing([
        { label: "a", value: 1n },
        { label: "b", value: 2n },
        { label: "a", value: 7n },
        { label: "b", value: 3n },
        {
          label: "pairs",
          value: [
            [1n, 2n],
            [7n, 3n],
          ],
        },
      ]);
      const c = new Case(trace);

      check.isEqualTo(
        seat,
        [
          c.draw(new List(PAIR, new Sizes(0, 3)), "pairs"),
          trace.taken,
          c.choices.map((choice) => choice.value),
        ],
        [
          [
            [1n, 2n],
            [7n, 3n],
          ],
          5,
          [1n, 1n, 2n, 1n, 7n, 3n, 0n],
        ],
        "the list takes the five entries",
      );
    });

    const optionals: { name: string; give: Entry[]; want: bigint[] | undefined }[] = [
      {
        name: "takes the entry of a present composite after its draws",
        give: [
          { label: "a", value: 7n },
          { label: "b", value: 3n },
          { label: "maybe", value: [7n, 3n] },
        ],
        want: [7n, 3n],
      },
      {
        name: "takes the entry of an absent composite at once",
        give: [{ label: "maybe", value: undefined }],
        want: undefined,
      },
    ];
    for (const tt of optionals) {
      it(`${tt.name} of an optional`, ({ seat }) => {
        const trace = new Tracing(tt.give);

        check.isEqualTo(
          seat,
          [new Case(trace).draw(new Optional(PAIR), "maybe"), trace.taken],
          [tt.want, tt.give.length],
          "the optional takes every entry",
        );
      });
    }

    const throughs: {
      name: string;
      generator: Generator<unknown>;
      recorded: unknown;
      want: unknown;
    }[] = [
      {
        name: "does not test the recorded value of a filter of a composite",
        generator: new Filter(PAIR, (value: bigint[]) => value.length >= 2),
        recorded: [7n],
        want: [7n, 3n],
      },
      {
        name: "takes the entry of a map with an inverse after the draws of its composite",
        generator: new Mapped(
          PAIR,
          (value: bigint[]) => value.join(" "),
          (text: string) => text.split(" ").map(BigInt),
        ),
        recorded: "7 3",
        want: "7 3",
      },
    ];
    for (const tt of throughs) {
      it(tt.name, ({ seat }) => {
        const trace = new Tracing([
          { label: "a", value: 7n },
          { label: "b", value: 3n },
          { label: "pair", value: tt.recorded },
        ]);

        check.isEqualTo(
          seat,
          [new Case(trace).draw(tt.generator, "pair"), trace.taken],
          [tt.want, 3],
          "the draw takes the three entries",
        );
      });
    }

    it("throws a TraceError for an entry that a draw through a composite leaves", ({
      seat,
    }) => {
      const c = new Case(
        new Tracing([
          { label: "a", value: 7n },
          { label: "b", value: 3n },
          { label: "b", value: 4n },
          { label: "pair", value: [7n, 3n] },
        ]),
      );

      check.isEqualTo(
        seat,
        refusal(seat, () => c.draw(new OneOf<unknown>([DIGIT, PAIR]), "pair")),
        [2, "pair", "label"],
        "the error is at entry 2 for the label",
      );
    });

    it("throws a TraceError at the entry of a draw that a draw inside takes", ({
      seat,
    }) => {
      const inner = new Composite((drawing) => [drawing.draw(DIGIT, "pair")]);
      const c = new Case(
        new Tracing([
          { label: "pair", value: 5n },
          { label: "pair", value: [5n] },
        ]),
      );

      check.isEqualTo(
        seat,
        refusal(seat, () => c.draw(new OneOf<unknown>([inner]), "pair")),
        [0, "pair", "label"],
        "the error is at entry 0 for the label",
      );
    });
  });

  describe("Tracing.value", () => {
    it("returns the target of a request outside a draw", ({ seat }) => {
      const c = new Case(new Tracing([{ label: "x", value: 7n }]));

      check.isEqualTo(
        seat,
        c.integer(new IntegerBounds(2n, 5n)),
        2n,
        "nothing is prepared",
      );
    });
  });

  describe("Tracing.prepare", () => {
    it("serves a prepared value fitted to its request", ({ seat }) => {
      const trace = new Tracing([]);
      const c = new Case(trace);
      trace.prepare(0n);

      check.isEqualTo(
        seat,
        c.integer(new IntegerBounds(1n, 1n)),
        1n,
        "0 is outside [1, 1]",
      );
    });
  });

  describe("Tracing.taken", () => {
    it("counts the entries that the draws and the steps took", ({ seat }) => {
      const trace = new Tracing([
        { label: "v", value: 1n },
        { action: "get" },
        { label: "w", value: 2n },
      ]);
      const c = new Case(trace);
      const before = trace.taken;
      c.draw(DIGIT, "v");
      const drawn = trace.taken;
      trace.take();

      check.isEqualTo(
        seat,
        [before, drawn, trace.taken],
        [0, 1, 2],
        "the draw and the step each take one entry",
      );
    });
  });

  describe("Tracing.nextStep", () => {
    it("returns the next entry when it is a step entry", ({ seat }) => {
      check.isEqualTo(
        seat,
        new Tracing([{ action: "put" }]).nextStep(),
        { action: "put" },
        "the step",
      );
    });

    it("returns undefined when the next entry is a draw entry", ({ seat }) => {
      check.isNil(
        seat,
        new Tracing([{ label: "v", value: 1n }]).nextStep(),
        "a draw is next",
      );
    });

    it("returns undefined past the last entry", ({ seat }) => {
      check.isNil(seat, new Tracing([]).nextStep(), "no entry");
    });
  });

  describe("Tracing.take", () => {
    it("serves the choices of a step entry before the next entry", ({ seat }) => {
      const trace = new Tracing([
        { action: "put" },
        { action: "get", client: 1 },
        { label: "v", value: 2n },
      ]);
      const c = new Case(trace);
      const before = [trace.nextStep(), [...trace.actions()]];
      trace.take(1n, 4n);
      const after = [trace.nextStep(), [...trace.actions()]];
      const bounds = new IntegerBounds(0n, 9n);
      const values = [c.integer(bounds), c.integer(bounds), c.integer(bounds)];
      trace.take();

      check.isEqualTo(
        seat,
        [before, after, values, trace.nextStep()],
        [
          [{ action: "put" }, ["put", "get"]],
          [{ action: "get", client: 1 }, ["get"]],
          [1n, 4n, 0n],
          undefined,
        ],
        "the steps, the actions and the served values",
      );
    });
  });

  describe("Tracing.actions", () => {
    it("returns the actions of the step entries from the next one on", ({ seat }) => {
      const trace = new Tracing([
        { action: "put" },
        { label: "v", value: 1n },
        { action: "get" },
        { action: "put" },
      ]);

      check.isEqualTo(seat, [...trace.actions()], ["put", "get"], "each action once");
    });
  });

  describe("Tracing.refuse", () => {
    it("throws a TraceError that names the next step entry", ({ seat }) => {
      const trace = new Tracing([{ label: "v", value: 1n }, { action: "get" }]);
      const c = new Case(trace);
      c.draw(DIGIT, "v");

      check.isEqualTo(
        seat,
        refusal(seat, () => trace.refuse()),
        [1, "get", "step"],
        "the step entry",
      );
    });
  });
});
