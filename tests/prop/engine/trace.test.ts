/** The spec of traces: the entries of a case, and the provider that serves a trace's values. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { Case, Replaying } from "../../../src/prop/engine/case.js";
import { IntegerBounds } from "../../../src/prop/engine/choice.js";
import { Integer, Mapped, Optional } from "../../../src/prop/engine/generator.js";
import {
  entries,
  isStep,
  TraceError,
  Tracing,
} from "../../../src/prop/engine/trace.js";
import { test as it } from "../../../src/vitest.js";

/** The generator that most draws use. */
const DIGIT = new Integer(new IntegerBounds(0n, 9n));

/** Returns the fields of the TraceError that fn throws. */
function refusal(
  seat: Parameters<typeof check.throws>[0],
  fn: () => unknown,
): unknown[] {
  const err = check.throws(seat, fn, "the trace is refused") as TraceError;
  check.errorIs(seat, err, TraceError, "the error is a TraceError");
  return [err.entry, err.what, err.reason];
}

describe("trace", () => {
  describe("isStep", () => {
    it("returns true only for a step entry", ({ seat }) => {
      check.equal(
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

      check.equal(
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

      check.equal(
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

      check.equal(
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

      check.equal(
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

      check.equal(
        seat,
        refusal(seat, () => c.draw(DIGIT, "x")),
        [0, "x", "label"],
        "the entry, the label and the reason",
      );
    });

    it("throws a TraceError for a draw where a step entry is next", ({ seat }) => {
      const c = new Case(new Tracing([{ action: "put" }]));

      check.equal(
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

      check.equal(
        seat,
        refusal(seat, () => c.draw(DIGIT, "x")),
        [1, "x", "value"],
        "12 is no digit",
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
        check.throws(seat, () => c.draw(broken, "x"), "the map throws"),
        TypeError,
        "the map's error",
      );
    });
  });

  describe("Tracing.value", () => {
    it("returns the target of a request outside a draw", ({ seat }) => {
      const c = new Case(new Tracing([{ label: "x", value: 7n }]));

      check.equal(
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

      check.equal(
        seat,
        c.integer(new IntegerBounds(1n, 1n)),
        1n,
        "0 is outside [1, 1]",
      );
    });
  });

  describe("Tracing.nextStep", () => {
    it("returns the next entry when it is a step entry", ({ seat }) => {
      check.equal(
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

      check.equal(
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

      check.equal(seat, [...trace.actions()], ["put", "get"], "each action once");
    });
  });

  describe("Tracing.refuse", () => {
    it("throws a TraceError that names the next step entry", ({ seat }) => {
      const trace = new Tracing([{ label: "v", value: 1n }, { action: "get" }]);
      const c = new Case(trace);
      c.draw(DIGIT, "v");

      check.equal(
        seat,
        refusal(seat, () => trace.refuse()),
        [1, "get", "step"],
        "the step entry",
      );
    });
  });
});
