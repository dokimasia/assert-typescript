/**
 * The machinery of the property forms: a form runs its assertion on each
 * case of a run, as forAll runs a body, with the arguments that the case
 * generates.
 *
 * TypeScript erases the type of a form's input, so a form takes the
 * generator of its input through the option using, and ends its call with a
 * fault without one. A form also takes the options of a run, the
 * relaxations of its assertion, and the cases that example and examples
 * state, which run before the stored cases.
 */

import { callSite } from "../failure.js";
import { Fault } from "../matcher/fault.js";
import type { Option as Relaxation } from "../matcher/option.js";
import { track } from "../matcher/pending.js";
import type { Seat } from "../matcher/seat.js";
import { Running } from "../matcher/verdict.js";
import type { Case } from "./case.js";
import type { Choice } from "./engine/choice.js";
import type { Generator } from "./engine/generator.js";
import { CannotInvert, invert, NoInverse } from "./engine/inverse.js";
import { Values } from "./engine/runner.js";
import { configure, type FormOnly, type FormOption, type Option } from "./option.js";
import { type Call, Property } from "./property.js";

/** The label of the input of a form over a function and of a relation of one input. */
export const INPUT: readonly string[] = ["input"];

/** The labels of the two inputs of isCommutative. */
export const PAIR: readonly string[] = ["a", "b"];

/** The labels of the three inputs of isAssociative. */
export const TRIPLE: readonly string[] = ["a", "b", "c"];

/** What a property form states: its operation, its id, whether its assertion takes relaxations, and the labels of the arguments that it generates. */
export interface Form {
  /** The operation, which names the form's faults, such as prop.equal. */
  readonly op: string;
  /** The form's id, the assertion of its record, such as prop-equal. */
  readonly id: string;
  /** Whether the form's assertion takes relaxations. */
  readonly relaxed: boolean;
  /** The labels of the arguments that each case generates, in order. */
  readonly labels: readonly string[];
}

/** Runs a form's assertion on a case with the generated arguments and the relaxations. */
export type Check = (
  c: Case,
  args: readonly unknown[],
  relaxations: readonly Relaxation[],
) => unknown;

/** An option that states the values of cases. */
type Example = Extract<FormOnly, { kind: "example" | "examples" }>;

/** The options of one call of a form, by kind. */
interface Sorted {
  readonly run: Option[];
  readonly relaxations: Relaxation[];
  readonly examples: Example[];
  using: Generator<unknown> | undefined;
}

/** Returns the options of a form's call by kind. A later using replaces an earlier one. */
function sorted(options: readonly FormOption[]): Sorted {
  const out: Sorted = { run: [], relaxations: [], examples: [], using: undefined };
  for (const option of options) {
    switch (option.kind) {
      case "using":
        out.using = option.value;
        break;
      case "example":
      case "examples":
        out.examples.push(option);
        break;
      case "equate-empty":
      case "equate-nans":
      case "by-identity":
        out.relaxations.push(option);
        break;
      default:
        out.run.push(option);
    }
  }
  return out;
}

/**
 * Returns the case of values, one for each generated argument: the choices
 * that decode to them under generator, or the values themselves when the
 * generator has no inverse for one of them.
 *
 * @throws Fault at the value that the generator does not produce.
 */
function caseOf(
  generator: Generator<unknown>,
  values: readonly unknown[],
  at: (index: number) => string,
): readonly Choice[] | Values {
  const choices: Choice[] = [];
  for (const [index, value] of values.entries()) {
    try {
      choices.push(...invert(generator, value));
    } catch (err) {
      if (err instanceof NoInverse) return new Values(values);
      if (!(err instanceof CannotInvert)) throw err;
      throw new Fault(
        at(index),
        "the input's generator does not produce the value",
        err,
      );
    }
  }
  return choices;
}

/**
 * Returns the cases of the example options, in their order: the choices
 * of each case, or its values where the generator has no inverse.
 *
 * @throws Fault at an example of another number of values than the form
 *   generates, at examples of a form over more than one input, and at a
 *   value that the generator does not produce.
 */
function examplesOf(
  labels: readonly string[],
  generator: Generator<unknown>,
  examples: readonly Example[],
): (readonly Choice[] | Values)[] {
  const out: (readonly Choice[] | Values)[] = [];
  for (const [i, option] of examples.entries()) {
    const at = `${option.kind}[${i}]`;
    const values = option.value;
    if (option.kind === "example") {
      if (values.length !== labels.length) {
        throw new Fault(
          at,
          `the example states ${values.length} values, and the form generates ${labels.length}`,
        );
      }
      out.push(caseOf(generator, values, (j) => `${at}[${j}]`));
      continue;
    }
    if (labels.length !== 1) {
      throw new Fault(
        at,
        `the examples state one value per case, and the form generates ${labels.length}`,
      );
    }
    for (const [j, value] of values.entries())
      out.push(caseOf(generator, [value], () => `${at}[${j}]`));
  }
  return out;
}

/** Starts the property of a form's call, and runs check on each case, or ends the call with the fault of its options. */
async function start(
  seat: Seat,
  running: Running,
  form: Form,
  call: Call,
  options: readonly FormOption[],
  check: Check,
): Promise<void> {
  const stated = sorted(options);
  let property: Property;
  let generator: Generator<unknown>;
  try {
    if (stated.relaxations.length > 0 && !form.relaxed) {
      throw new Fault(
        "",
        "the form takes no relaxation, because its assertion takes none",
      );
    }
    if (stated.using === undefined) {
      throw new Fault(
        "",
        "the form has no generator of its input, which prop.using states",
      );
    }
    generator = stated.using;
    const examples = examplesOf(form.labels, generator, stated.examples);
    property = Property.of(seat, call, configure(stated.run), examples);
  } catch (err) {
    Property.fault(running, call, err);
    return;
  }
  const relaxations = stated.relaxations;
  await property.run(seat, running, (c) => {
    const args = form.labels.map((label) => c.draw(generator, label));
    return check(c, args, relaxations);
  });
}

/**
 * Runs the property form on seat, whose record states the form's id and
 * the contract msg, and whose location is the call of the form. check runs
 * the form's assertion on each case, with the case as its seat. The call
 * site is read before the first await, so a form calls this synchronously.
 *
 * @param seat - Where the failure is reported.
 * @param form - The form.
 * @param msg - The contract under test.
 * @param options - The options of the call.
 * @param check - Runs the assertion on a case.
 * @returns A promise of the verdict, which the forgotten-await guard tracks.
 */
export function runForm(
  seat: Seat,
  form: Form,
  msg: string,
  options: readonly FormOption[],
  check: Check,
): Promise<void> {
  seat.helper();
  const where = callSite();
  const running = Running.begin(seat, where);
  const call: Call = {
    op: form.op,
    assertion: form.id,
    contract: msg,
    where,
    pinned: true,
  };
  return track(seat, msg, start(seat, running, form, call, options, check));
}
