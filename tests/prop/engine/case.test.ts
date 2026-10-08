/**
 * The spec of a case: where its values come from, what it records, and its
 * cap. The pinned draws are the draws of the definition's reference
 * implementation.
 */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import {
  Case,
  DECODE,
  type Decoder,
  Failed,
  Generating,
  MAX_CHOICES,
  Overrun,
  type Provider,
  Rejected,
  Replaying,
  type Request,
  Valuing,
} from "../../../src/prop/engine/case.js";
import {
  type Choice,
  INT64_MAX,
  INT64_MIN,
  IntegerBounds,
  SequenceBounds,
  UINT64_MAX,
  type Value,
} from "../../../src/prop/engine/choice.js";
import * as draw from "../../../src/prop/engine/draw.js";
import { Source } from "../../../src/prop/engine/source.js";
import { test as it } from "../../../src/vitest.js";

/** The bounds that most cases request. */
const DIGIT = new IntegerBounds(0n, 9n);

/** The bounds of the reuse cases. */
const WIDE = new IntegerBounds(0n, 1_000_000_000n);

/** Returns a request for one digit, drawn as draw.integer draws. */
function digit(): Request {
  return { bounds: DIGIT, draw: (source) => draw.integer(source, DIGIT) };
}

/** Returns a request for one sequence inside bounds. */
function sequenceOf(bounds: SequenceBounds): Request {
  return { bounds, draw: (source) => draw.sequence(source, bounds) };
}

/** Returns integer choices of values. */
function integers(...values: bigint[]): Choice[] {
  return values.map((value) => ({ kind: "integer", value }));
}

/** A generator of one digit that opens no span. */
const DIGITS: Decoder = { [DECODE]: (c: Case) => c.choose(digit()) };

/** A generator that requests a digit, then draws a digit under the label inner. */
const OUTER: Decoder = {
  [DECODE]: (c: Case) => [c.choose(digit()), c.draw(DIGITS, "inner")],
};

/** A generator that requests a digit, then rejects the case. */
const REFUSING: Decoder = {
  [DECODE]: (c: Case) => {
    c.choose(digit());
    throw new Rejected();
  },
};

describe("case", () => {
  describe("MAX_CHOICES", () => {
    it("caps a case at 8192 choices", ({ seat }) => {
      check.equal(seat, MAX_CHOICES, 8192, "the cap");
    });
  });

  describe("new Rejected", () => {
    it("returns the signal of a rejected case", ({ seat }) => {
      const signal = new Rejected();

      check.equal(
        seat,
        [signal.name, signal.message],
        ["Rejected", "prop: the case is rejected"],
        "the name and the message",
      );
    });
  });

  describe("new Overrun", () => {
    it("returns a rejection", ({ seat }) => {
      check.errorIs(seat, new Overrun(), Rejected, "an overrun is a rejection");
    });
  });

  describe("new Failed", () => {
    it("returns the failure of an identity with its record", ({ seat }) => {
      const failed = new Failed("true@a.ts:1", { assertion: "true" });

      check.equal(
        seat,
        [failed.name, failed.message, failed.identity, failed.record],
        [
          "Failed",
          "prop: the case fails as true@a.ts:1",
          "true@a.ts:1",
          { assertion: "true" },
        ],
        "the fields",
      );
    });
  });

  describe("Generating.value", () => {
    it("returns the draw of each request", ({ seat }) => {
      const c = new Case(new Generating(new Source(3n)));
      const twin = new Source(3n);
      const got = Array.from({ length: 20 }, () => c.choose(digit()));

      check.equal(
        seat,
        got,
        got.map(() => draw.integer(twin, DIGIT)),
        "the draws of the source alone",
      );
    });

    it("draws a coin before it takes an earlier value of a reuse request", ({
      seat,
    }) => {
      const c = new Case(new Generating(new Source(5n)));
      const twin = new Source(5n);
      const first = c.integer(WIDE, undefined, true);
      const earlier = [first];
      const want = [draw.integer(twin, WIDE)];
      for (let i = 0; i < 40; i += 1) {
        const got = c.integer(WIDE, undefined, true);
        want.push(
          twin.coin(1n, draw.REUSE_ODDS)
            ? (earlier[Number(twin.below(BigInt(earlier.length)))] as bigint)
            : draw.integer(twin, WIDE),
        );
        earlier.push(got);
      }

      check.equal(seat, earlier, want, "41 reuse requests");
    });

    it("returns the pinned reuse requests of seed 42", ({ seat }) => {
      const c = new Case(new Generating(new Source(42n)));
      const wide = new IntegerBounds(INT64_MIN, INT64_MAX);

      check.equal(
        seat,
        Array.from({ length: 12 }, () => c.integer(wide, undefined, true)),
        [
          11n,
          13n,
          INT64_MAX,
          INT64_MAX,
          -207n,
          -781_715_023_583_996_500n,
          INT64_MIN,
          -43n,
          -12n,
          -2_609_675_888_663_766_267n,
          -2_609_675_888_663_766_267n,
          229n,
        ],
        "twelve requests",
      );
    });

    it("takes no coin for a reuse request with equal bounds", ({ seat }) => {
      const c = new Case(new Generating(new Source(7n)));
      const twin = new Source(7n);
      const seven = new IntegerBounds(7n, 7n);
      const sevens = Array.from({ length: 3 }, () => c.integer(seven, undefined, true));
      const after = Array.from({ length: 5 }, () => c.integer(WIDE));

      check.equal(
        seat,
        [sevens, after],
        [[7n, 7n, 7n], after.map(() => draw.integer(twin, WIDE))],
        "the stream is untouched",
      );
    });

    it("reuses only values of the bounds of the request", ({ seat }) => {
      const c = new Case(new Generating(new Source(5n)));
      for (let i = 0; i < 30; i += 1)
        c.integer(new IntegerBounds(500n, 600n), undefined, true);
      const values = Array.from({ length: 30 }, () =>
        c.integer(DIGIT, undefined, true),
      );

      check.isTrue(
        seat,
        values.every((value) => DIGIT.admits(value)),
        "every value is a digit",
      );
    });

    it("takes no coin for a request without reuse", ({ seat }) => {
      const c = new Case(new Generating(new Source(9n)));
      const twin = new Source(9n);
      c.integer(DIGIT, undefined, true);
      draw.integer(twin, DIGIT);

      check.equal(
        seat,
        c.integer(DIGIT, 0n),
        draw.integer(twin, DIGIT),
        "a plain draw",
      );
    });

    it("reuses no value of a removed choice", ({ seat }) => {
      const got = Array.from({ length: 50 }, (_, seed) => {
        const c = new Case(new Generating(new Source(BigInt(seed))));
        const start = c.mark();
        c.integer(WIDE, undefined, true);
        c.rewind(start);
        return c.integer(WIDE, undefined, true);
      });
      const want = Array.from({ length: 50 }, (_, seed) => {
        const twin = new Source(BigInt(seed));
        draw.integer(twin, WIDE);
        return draw.integer(twin, WIDE);
      });

      check.equal(seat, got, want, "no coin after the rewind for 50 seeds");
    });

    it("reuses no removed value of other bounds", ({ seat }) => {
      const narrow = new IntegerBounds(0n, 999_999_999n);
      const got = Array.from({ length: 50 }, (_, seed) => {
        const c = new Case(new Generating(new Source(BigInt(seed))));
        const start = c.mark();
        c.integer(WIDE, undefined, true);
        c.rewind(start);
        c.integer(narrow, undefined, true);
        return c.integer(WIDE, undefined, true);
      });
      const want = Array.from({ length: 50 }, (_, seed) => {
        const twin = new Source(BigInt(seed));
        draw.integer(twin, WIDE);
        draw.integer(twin, narrow);
        return draw.integer(twin, WIDE);
      });

      check.equal(seat, got, want, "no coin after the rewind for 50 seeds");
    });
  });

  describe("Replaying.value", () => {
    it("returns the recorded values that fit", ({ seat }) => {
      const c = new Case(new Replaying(integers(7n, 3n)));

      check.equal(seat, [c.choose(digit()), c.choose(digit())], [7n, 3n], "the digits");
    });

    it("returns the target for a recorded value outside the bounds", ({ seat }) => {
      check.equal(
        seat,
        new Case(new Replaying(integers(12n))).choose(digit()),
        0n,
        "12 is no digit",
      );
    });

    it("returns the target for a recorded value of another kind", ({ seat }) => {
      const c = new Case(new Replaying([{ kind: "sequence", value: [5] }]));

      check.equal(seat, c.choose(digit()), 0n, "a sequence is no digit");
    });

    it("returns the target past the recorded choices", ({ seat }) => {
      const bounds = new IntegerBounds(3n, 9n);
      const c = new Case(new Replaying(integers(5n)));
      const request = {
        bounds,
        draw: (source: Source) => draw.integer(source, bounds),
      };

      check.equal(
        seat,
        [c.choose(request), c.choose(request), c.choose(request)],
        [5n, 3n, 3n],
        "the target after the last choice",
      );
    });
  });

  describe("Valuing.valued", () => {
    it("gives each draw the next stated value without a choice", ({ seat }) => {
      const c = new Case(new Valuing([5, "x"]));
      const drawn = [c.draw(DIGITS, "a"), c.draw(DIGITS, "b")];

      check.equal(
        seat,
        [drawn, c.choices, c.spans, c.draws.map((one) => [one.label, one.value])],
        [
          [5, "x"],
          [],
          [],
          [
            ["a", 5],
            ["b", "x"],
          ],
        ],
        "the values, without a choice or a span",
      );
    });
  });

  describe("Valuing.value", () => {
    it("gives a request of a draw past the last value its target", ({ seat }) => {
      const c = new Case(new Valuing([5]));
      c.draw(DIGITS, "a");

      check.equal(
        seat,
        [c.draw(DIGITS, "b"), c.choices],
        [0n, integers(0n)],
        "the decoded target",
      );
    });
  });

  describe("Case.choose", () => {
    it("records each choice with its request", ({ seat }) => {
      const c = new Case(new Generating(new Source(3n)));
      const request = digit();
      const value = c.choose(request);

      check.equal(
        seat,
        [c.choices, c.requests[0] === request],
        [integers(value as bigint), true],
        "the choice and the request",
      );
    });

    it("records the fitted value of a replay", ({ seat }) => {
      const c = new Case(new Replaying(integers(12n)));
      c.choose(digit());

      check.equal(seat, c.choices, integers(0n), "what the body received");
    });

    it("allows exactly maxChoices choices", ({ seat }) => {
      const c = new Case(new Replaying([]), 3);
      for (let i = 0; i < 3; i += 1) c.choose(digit());

      check.length(seat, c.choices, 3, "three choices");
    });

    it("throws an Overrun for a choice past the cap", ({ seat }) => {
      const c = new Case(new Replaying([]), 3);
      for (let i = 0; i < 3; i += 1) c.choose(digit());

      check.errorIs(
        seat,
        check.throws(seat, () => c.choose(digit()), "the fourth choice throws"),
        Overrun,
        "the error is an overrun",
      );
    });

    it("counts a sequence as one choice plus one for each element", ({ seat }) => {
      const bounds = new SequenceBounds(10, 3, 3);
      const recorded: Choice[] = [{ kind: "sequence", value: [1, 2, 3] }];
      new Case(new Replaying(recorded), 4).choose(sequenceOf(bounds));

      const err = check.throws(
        seat,
        () => new Case(new Replaying(recorded), 3).choose(sequenceOf(bounds)),
        "a cap of 3 refuses four",
      );

      check.errorIs(seat, err, Overrun, "the error is an overrun");
    });

    it("throws an Overrun before the draw of a sequence whose minimum passes the cap", ({
      seat,
    }) => {
      const source = new Source(7n);
      const twin = new Source(7n);
      const err = check.throws(
        seat,
        () =>
          new Case(new Generating(source), 3).choose(
            sequenceOf(new SequenceBounds(10, 3)),
          ),
        "the minimum alone passes the cap",
      );

      check.errorIs(seat, err, Overrun, "the error is an overrun");
      check.equal(seat, source.next(), twin.next(), "the stream is untouched");
    });

    it("passes each choice to the observer", ({ seat }) => {
      const seen: [number, Value][] = [];
      const c = new Case(new Replaying(integers(1n, 2n)), MAX_CHOICES, {
        step: (index, _request, value) => seen.push([index, value]),
      });
      c.choose(digit());
      c.choose(digit());

      check.equal(
        seat,
        seen,
        [
          [0, 1n],
          [1, 2n],
        ],
        "two steps",
      );
    });
  });

  describe("Case.integer", () => {
    it("states the edge of its request", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.integer(DIGIT, 1n);

      check.equal(
        seat,
        [c.requests[0]?.edge, c.requests[0]?.reuse],
        [1n, false],
        "the edge without reuse",
      );
    });
  });

  describe("Case.sequence", () => {
    it("returns a sequence choice drawn as draw.sequence draws", ({ seat }) => {
      const bounds = new SequenceBounds(256, 0, 8);
      const c = new Case(new Generating(new Source(4n)));

      check.equal(
        seat,
        c.sequence(bounds),
        draw.sequence(new Source(4n), bounds),
        "the draw",
      );
    });
  });

  describe("Case.random", () => {
    it("returns an integer over the whole unsigned 64-bit range", ({ seat }) => {
      const c = new Case(new Replaying(integers(UINT64_MAX)));

      check.equal(
        seat,
        [c.random(), c.requests[0]?.bounds.id],
        [UINT64_MAX, `integer 0 ${UINT64_MAX}`],
        "the largest value",
      );
    });
  });

  describe("Case.span", () => {
    it("covers the choices made inside it", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.choose(digit());
      c.span("pair", () => {
        c.choose(digit());
        c.choose(digit());
      });

      check.equal(
        seat,
        c.spans,
        [{ label: "pair", start: 1, end: 3, depth: 0, parent: undefined }],
        "one span",
      );
    });

    it("records the depth and the parent of nested spans", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.span("outer", () => {
        c.span("first", () => c.choose(digit()));
        c.span("second", () => c.choose(digit()));
      });

      check.equal(
        seat,
        c.spans,
        [
          { label: "outer", start: 0, end: 2, depth: 0, parent: undefined },
          { label: "first", start: 0, end: 1, depth: 1, parent: 0 },
          { label: "second", start: 1, end: 2, depth: 1, parent: 0 },
        ],
        "three spans",
      );
    });

    it("starts at an earlier choice", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.choose(digit());
      c.span("element", () => c.choose(digit()), 0);

      check.equal(
        seat,
        c.spans,
        [{ label: "element", start: 0, end: 2, depth: 0, parent: undefined }],
        "the span of the flag and the element",
      );
    });

    it("closes where its decoding throws", ({ seat }) => {
      const c = new Case(new Replaying([]));
      const err = check.throws(
        seat,
        () =>
          c.span("list", () => {
            c.choose(digit());
            throw new Rejected();
          }),
        "the rejection passes",
      );

      check.errorIs(seat, err, Rejected, "the error is the rejection");
      check.equal(
        seat,
        c.spans,
        [{ label: "list", start: 0, end: 1, depth: 0, parent: undefined }],
        "the closed span",
      );
    });
  });

  describe("Case.open", () => {
    it("returns the function that closes the span at the current choice", ({
      seat,
    }) => {
      const c = new Case(new Replaying([]));
      c.choose(digit());
      const close = c.open("step", 0);
      c.choose(digit());
      close();
      c.choose(digit());

      check.equal(
        seat,
        c.spans,
        [{ label: "step", start: 0, end: 2, depth: 0, parent: undefined }],
        "the span of the first two choices",
      );
    });

    it("nests a span that opens before it closes", ({ seat }) => {
      const c = new Case(new Replaying([]));
      const close = c.open("step");
      c.span("inner", () => c.choose(digit()));
      close();

      check.equal(
        seat,
        c.spans,
        [
          { label: "step", start: 0, end: 1, depth: 0, parent: undefined },
          { label: "inner", start: 0, end: 1, depth: 1, parent: 0 },
        ],
        "the inner span's parent is the step",
      );
    });
  });

  describe("Case.provider", () => {
    it("returns where the case's values come from", ({ seat }) => {
      const provider = new Replaying([]);

      check.isTrue(seat, new Case(provider).provider === provider, "the provider");
    });
  });

  describe("Case.rewind", () => {
    it("removes everything that the case recorded after the mark", ({ seat }) => {
      const c = new Case(new Replaying(integers(1n, 2n)));
      c.draw(DIGITS, "kept");
      const mark = c.mark();
      c.span("attempt", () => c.draw(DIGITS, "removed"));
      c.rewind(mark);

      check.equal(
        seat,
        [c.choices, c.requests.length, c.spans, c.draws.map((one) => one.label)],
        [integers(1n), 1, [], ["kept"]],
        "the record before the mark",
      );
    });

    it("gives the next choice the index of the first removed choice", ({ seat }) => {
      const c = new Case(new Replaying(integers(1n, 2n, 3n)));
      c.choose(digit());
      const mark = c.mark();
      c.choose(digit());
      c.rewind(mark);

      check.equal(
        seat,
        c.choose(digit()),
        2n,
        "the replay reads the choice at the mark again",
      );
    });

    it("counts the removed choices towards the cap", ({ seat }) => {
      const c = new Case(new Replaying([]), 2);
      const start = c.mark();
      c.choose(digit());
      c.rewind(start);
      c.choose(digit());

      check.errorIs(
        seat,
        check.throws(seat, () => c.choose(digit()), "a third choice passes the cap"),
        Overrun,
        "the error is an overrun",
      );
    });

    it("leaves the steps of the removed choices with the observer", ({ seat }) => {
      const values: Value[] = [];
      const c = new Case(new Replaying(integers(1n, 2n, 3n)), MAX_CHOICES, {
        step: (_index, _request, value) => values.push(value),
      });
      c.choose(digit());
      const mark = c.mark();
      c.choose(digit());
      c.rewind(mark);
      c.choose(digit());

      check.equal(
        seat,
        [values, c.choices.length],
        [[1n, 2n, 2n], 2],
        "three steps and two choices",
      );
    });

    it("removes the wheres of the removed choices", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.choose(digit());
      const mark = c.mark();
      c.draw(DIGITS, "v");
      c.rewind(mark);

      check.equal(
        seat,
        c.wheres,
        [{ label: undefined, place: undefined }],
        "one where",
      );
    });
  });

  describe("Case.draw", () => {
    it("tells a provider that serves a trace the label of each draw before it decodes", ({
      seat,
    }) => {
      const heard: [string, number][] = [];
      let served = 0;
      const replay = new Replaying(integers(4n, 5n, 6n));
      const provider: Provider = {
        value: (request, index) => {
          served += 1;
          return replay.value(request, index);
        },
        drawing: (_generator, label) => heard.push([label, served]),
      };
      const c = new Case(provider);

      check.equal(
        seat,
        [[c.draw(DIGITS, "a"), c.draw(DIGITS, "b")], heard],
        [
          [4n, 5n],
          [
            ["a", 0],
            ["b", 1],
          ],
        ],
        "the labels before the values",
      );
    });

    it("records the label of the draw with each of its requests", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.draw(DIGITS, "v");
      c.choose(digit());

      check.equal(
        seat,
        c.wheres,
        [
          { label: "v", place: undefined },
          { label: undefined, place: undefined },
        ],
        "the label inside the draw alone",
      );
    });

    it("records the innermost label for the requests of a nested draw", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.draw(OUTER, "outer");

      check.equal(
        seat,
        c.wheres.map((where) => where.label),
        ["outer", "inner"],
        "the two labels",
      );
    });

    it("closes its label when the generator throws", ({ seat }) => {
      const c = new Case(new Replaying([]));
      const err = check.throws(
        seat,
        () => c.draw(REFUSING, "v"),
        "the rejection passes",
      );

      check.errorIs(seat, err, Rejected, "the error is the rejection");
      check.equal(
        seat,
        [c.wheres, c.where()],
        [[{ label: "v", place: undefined }], { label: undefined, place: undefined }],
        "outside every draw",
      );
    });

    it("records the place that the case states with each request", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.place = { part: "sequential", position: 2, action: "put" };
      c.draw(DIGITS, "v");

      check.equal(
        seat,
        c.wheres,
        [{ label: "v", place: { part: "sequential", position: 2, action: "put" } }],
        "the label and the place",
      );
    });

    it("records the draw with the first span of its generator", ({ seat }) => {
      const c = new Case(new Replaying(integers(3n)));
      const spanning: Decoder = {
        [DECODE]: (inner: Case) => inner.span("digit", () => inner.choose(digit())),
      };
      c.choose(digit());
      c.span("before", () => undefined);
      c.draw(spanning, "v");

      check.equal(
        seat,
        c.draws.map((one) => [
          one.label,
          one.value,
          one.span,
          one.generator === spanning,
        ]),
        [["v", 0n, 1, true]],
        "the span after the earlier one",
      );
    });
  });

  describe("Case.step", () => {
    it("records a step after the draws before it", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.step({ action: "put" });
      c.draw(DIGITS, "v");
      c.step({ action: "get", client: 1 });

      check.equal(
        seat,
        c.steps,
        [
          [0, { action: "put" }],
          [1, { action: "get", client: 1 }],
        ],
        "two steps",
      );
    });
  });

  describe("Case.assume", () => {
    it("throws Rejected for a false condition", ({ seat }) => {
      const err = check.throws(
        seat,
        () => new Case(new Replaying([])).assume(false),
        "the condition is false",
      );

      check.errorIs(seat, err, Rejected, "the case is rejected");
    });

    it("returns for a true condition", ({ seat }) => {
      check.doesNotThrow(
        seat,
        () => new Case(new Replaying([])).assume(true),
        "the condition is true",
      );
    });
  });

  describe("Case.classify", () => {
    it("counts a label once", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.classify("even");
      c.classify("even");
      c.classify("small");

      check.equal(seat, [...c.labels], ["even", "small"], "two labels");
    });
  });

  describe("Case.note", () => {
    it("keeps the notes in order", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.note("first");
      c.note("second");

      check.equal(seat, c.notes, ["first", "second"], "two notes");
    });
  });

  describe("Case.observe", () => {
    it("records each fingerprint with where the case observed it", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.observe(1n);
      c.place = { part: "drain", position: 0, action: "flush" };
      c.observe(2n);

      check.equal(
        seat,
        [c.fingerprints, c.observed],
        [
          [1n, 2n],
          [
            { label: undefined, place: undefined },
            {
              label: undefined,
              place: { part: "drain", position: 0, action: "flush" },
            },
          ],
        ],
        "two fingerprints and their places",
      );
    });
  });

  describe("Case.target", () => {
    it("keeps the higher of two scores under one label", ({ seat }) => {
      const c = new Case(new Replaying([]));
      c.target("depth", 3);
      c.target("depth", 1);
      c.target("depth", 5);
      c.target("width", -2);

      check.equal(
        seat,
        [...c.targets],
        [
          ["depth", 5],
          ["width", -2],
        ],
        "the highest score of each label",
      );
    });
  });

  describe("Case.fail", () => {
    it("throws the failure of an identity", ({ seat }) => {
      const err = check.throws(
        seat,
        () => new Case(new Replaying([])).fail("raises@a.ts:3", "the record"),
        "fail throws",
      );

      check.equal(
        seat,
        [(err as Failed).identity, (err as Failed).record],
        ["raises@a.ts:3", "the record"],
        "the failure",
      );
    });
  });
});
