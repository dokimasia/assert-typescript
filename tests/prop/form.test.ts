/** The spec of the machinery of the property forms. */

import { describe } from "vitest";
import { byIdentity, check, equateEmpty, equateNans } from "../../src/index.js";
import { Mode } from "../../src/matcher/seat.js";
import * as value from "../../src/matcher/value.js";
import { Mapped } from "../../src/prop/engine/generator.js";
import { type Form, INPUT, PAIR, runForm, TRIPLE } from "../../src/prop/form.js";
import { integer } from "../../src/prop/generators.js";
import {
  cases,
  draws,
  example,
  examples,
  hermetic,
  seed,
  store,
  using,
} from "../../src/prop/option.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import { records } from "../helpers.js";

/** A form of one input whose assertion takes no relaxation. */
const BELOW: Form = {
  op: "prop.below",
  id: "prop-below",
  relaxed: false,
  labels: INPUT,
};

/** A form of two inputs whose assertion takes relaxations. */
const BOTH: Form = { op: "prop.both", id: "prop-both", relaxed: true, labels: PAIR };

/** The options that make a run of a form reproducible. */
const STEADY = [hermetic(), seed(1n), store("")];

/** Runs isTrue on whether each generated argument is below 5. */
function belowFive(
  c: Parameters<Parameters<typeof runForm>[4]>[0],
  args: readonly unknown[],
): void {
  value.isTrue(
    c,
    Mode.Fatal,
    args.every((arg) => (arg as number) < 5),
    "each argument is below 5",
  );
}

describe("form", () => {
  describe("INPUT", () => {
    it("labels the one input of a form", ({ seat }) => {
      check.equal(
        seat,
        [...INPUT, ...PAIR, ...TRIPLE],
        ["input", "a", "b", "a", "b", "c"],
        "the labels",
      );
    });
  });

  describe("runForm", () => {
    it("passes a form whose assertion passes for every case", async ({ seat }) => {
      const recorder = new Recorder();
      await runForm(
        recorder,
        BELOW,
        "below 5",
        [using(integer(0, 4)), ...STEADY],
        belowFive,
      );

      check.equal(
        seat,
        [recorder.failures, records(recorder)[0]?.["assertion"]],
        [[], "prop-below"],
        "a pass of the form's id",
      );
    });

    it("fails with a record of the form's id at the call of the form", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      await runForm(
        recorder,
        BELOW,
        "below 5",
        [using(integer(0, 9)), ...STEADY],
        belowFive,
      );
      const [failure] = recorder.failures;

      check.equal(
        seat,
        [
          failure?.assertion,
          failure?.caseFailure?.assertion,
          failure?.caseFailure?.where,
        ],
        ["prop-below", "true", failure?.where],
        "the case's failure is at the form's call",
      );
      check.hasSuffix(
        seat,
        failure?.where?.file,
        "form.test.ts",
        "the call of the form",
      );
    });

    it("draws each generated argument under its label", async ({ seat }) => {
      const recorder = new Recorder();
      await runForm(
        recorder,
        BOTH,
        "both below 5",
        [using(integer(0, 9)), ...STEADY],
        belowFive,
      );

      check.equal(
        seat,
        (
          recorder.failures[0]?.detail["counterexample"] as
            | { label: string }[]
            | undefined
        )?.map((entry) => entry.label),
        ["a", "b"],
        "the two labels",
      );
    });

    it("passes the relaxations to a form whose assertion takes them", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      let passed: readonly unknown[] = [];
      const relaxations = [equateEmpty(), equateNans(), byIdentity()];
      await runForm(
        recorder,
        BOTH,
        "c",
        [using(integer(0, 1)), ...relaxations, ...STEADY],
        (_c, _args, stated) => {
          passed = stated;
        },
      );

      check.equal(seat, passed, relaxations, "the relaxations in order");
    });

    it("uses the later of two generators", async ({ seat }) => {
      const recorder = new Recorder();
      await runForm(
        recorder,
        BELOW,
        "below 5",
        [using(integer(5, 9)), using(integer(0, 4)), ...STEADY],
        belowFive,
      );

      check.isEmpty(seat, recorder.failures, "the later generator is below 5");
    });

    it("runs the cases of the options of the run", async ({ seat }) => {
      const recorder = new Recorder();
      await runForm(
        recorder,
        BELOW,
        "c",
        [using(integer(0, 1000)), cases(7), ...STEADY],
        () => undefined,
      );

      check.equal(
        seat,
        (records(recorder)[0]?.["detail"] as { cases: number } | undefined)?.cases,
        7,
        "seven cases",
      );
    });

    it("shrinks a failing example that runs first", async ({ seat }) => {
      const recorder = new Recorder();
      await runForm(
        recorder,
        BELOW,
        "below 5",
        [using(integer(0, 9)), example(8), ...STEADY],
        belowFive,
      );
      const [drawn] = (recorder.failures[0]?.detail["counterexample"] ?? []) as {
        value: unknown;
      }[];

      check.equal(
        seat,
        [records(recorder)[1]?.["phase"], drawn?.value],
        ["example", 5],
        "the example shrinks to 5",
      );
    });

    it("runs one case per example value in order", async ({ seat }) => {
      const recorder = new Recorder();
      const seen: unknown[] = [];
      await runForm(
        recorder,
        BELOW,
        "c",
        [using(integer(0, 9)), examples(3, 4), cases(1), ...STEADY],
        (_c, args) => {
          seen.push(args[0]);
        },
      );

      check.equal(seat, seen.slice(0, 2), [3, 4], "the two examples first");
    });

    it("reports a failing example of a generator without an inverse as found", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      const doubled = integer(0, 4).map((x) => x * 2);
      await runForm(
        recorder,
        BELOW,
        "below 5",
        [using(doubled), example(7), ...STEADY],
        belowFive,
      );
      const detail = recorder.failures[0]?.detail ?? {};

      check.equal(
        seat,
        [
          (detail["counterexample"] as { value: unknown }[])[0]?.value,
          detail["choices"],
        ],
        [7, null],
        "the value, without a token",
      );
    });

    {
      const tests = [
        {
          name: "a relaxation of a form whose assertion takes none",
          give: { form: BELOW, options: [using(integer(0, 9)), equateNans()] },
          want: "prop.below: the form takes no relaxation, because its assertion takes none",
        },
        {
          name: "no generator of the input",
          give: { form: BELOW, options: [] },
          want: "prop.below: the form has no generator of its input, which prop.using states",
        },
        {
          name: "an example of another number of values",
          give: { form: BELOW, options: [using(integer(0, 9)), example(1, 2)] },
          want: "prop.below: example[0]: the example states 2 values, and the form generates 1",
        },
        {
          name: "examples of a form of two inputs",
          give: { form: BOTH, options: [using(integer(0, 9)), examples(1)] },
          want: "prop.both: examples[0]: the examples state one value per case, and the form generates 2",
        },
        {
          name: "an example of a value that the generator does not produce",
          give: { form: BOTH, options: [using(integer(0, 9)), example(1, 99)] },
          want: "prop.both: example[0][1]: the input's generator does not produce the value: ",
        },
        {
          name: "examples of a value that the generator does not produce",
          give: { form: BELOW, options: [using(integer(0, 9)), examples(1, 99)] },
          want: "prop.below: examples[0][1]: the input's generator does not produce the value: ",
        },
        {
          name: "a fault of the options of the run",
          give: { form: BELOW, options: [using(integer(0, 9)), draws("[")] },
          want: "prop.below: draws: the entries are no JSON array of objects: ",
        },
      ];
      for (const tt of tests) {
        it(`ends the call with a fault for ${tt.name}`, async ({ seat }) => {
          const recorder = new Recorder();
          await runForm(
            recorder,
            tt.give.form,
            "c",
            [...tt.give.options, ...STEADY],
            belowFive,
          );

          check.hasPrefix(seat, recorder.message, tt.want, "the fault");
        });
      }
    }

    it("ends the call with a fault for an example whose generator throws", async ({
      seat,
    }) => {
      const recorder = new Recorder();
      const broken = new Mapped(
        integer(0, 9),
        () => {
          throw new Error("the map broke");
        },
        (v: unknown) => v,
      );
      await runForm(
        recorder,
        BELOW,
        "c",
        [using(broken), example(1), ...STEADY],
        belowFive,
      );

      check.equal(
        seat,
        recorder.message,
        "prop.below: the map broke",
        "the generator's error",
      );
    });
  });
});
