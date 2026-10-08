/**
 * The options of a property: the settings of a run of forAll, fuzz and a
 * property form, and the options that only a form takes.
 *
 * Each option states one setting, and a later option overrides an earlier
 * one, except require, which adds a requirement, and example and examples,
 * which add cases. A form also takes the relaxations of its assertion's
 * comparison, such as equateNans, in the same list.
 */

import type { Option as Relaxation } from "../matcher/option.js";
import { MAX_CHOICES } from "./engine/case.js";
import type { Generator } from "./engine/generator.js";
import { DEFAULT_CASES, type Requirement } from "./engine/runner.js";
import { DEFAULT_BUDGET } from "./engine/shrink.js";

/** The largest seed: every seed is an unsigned 64-bit integer. */
const SEED_LIMIT = 2n ** 64n;

/** The time that shrinking and explaining may take when no option states one, in milliseconds. */
const DEFAULT_SHRINK_TIME = 30_000;

/** One setting of a run of forAll, fuzz or a property form. */
export type Option =
  | { readonly kind: "cases"; readonly value: number }
  | { readonly kind: "seed"; readonly value: bigint }
  | { readonly kind: "replay"; readonly value: string }
  | {
      readonly kind: "require";
      readonly value: { readonly label: string; readonly share: number };
    }
  | { readonly kind: "shrink"; readonly value: number }
  | { readonly kind: "shrink-time"; readonly value: number }
  | { readonly kind: "max-choices"; readonly value: number }
  | { readonly kind: "store"; readonly value: string }
  | { readonly kind: "explain"; readonly value: boolean }
  | { readonly kind: "workers"; readonly value: number }
  | { readonly kind: "hermetic" }
  | { readonly kind: "draws"; readonly value: string };

/** An option that only a property form takes: the generator of its input, or its examples. */
export type FormOnly =
  | { readonly kind: "using"; readonly value: Generator<unknown> }
  | { readonly kind: "example"; readonly value: readonly unknown[] }
  | { readonly kind: "examples"; readonly value: readonly unknown[] };

/** An option of a property form: a setting of its run, a relaxation of its comparison, or a form's own option. */
export type FormOption = Option | Relaxation | FormOnly;

/**
 * What the options of one run state. A setting that no option states has
 * its default, and seed, replay, store and draws are undefined.
 */
export interface Config {
  readonly cases: number;
  readonly seed: bigint | undefined;
  readonly replay: string | undefined;
  readonly requirements: readonly Requirement[];
  readonly shrink: number;
  readonly shrinkTime: number;
  readonly maxChoices: number;
  readonly store: string | undefined;
  readonly explain: boolean;
  readonly hermetic: boolean;
  readonly draws: string | undefined;
}

/** Returns config with the setting of option applied. */
function apply(config: Config, option: Option): Config {
  switch (option.kind) {
    case "cases":
      return { ...config, cases: option.value };
    case "seed":
      return { ...config, seed: option.value };
    case "replay":
      return { ...config, replay: option.value };
    case "require":
      return { ...config, requirements: [...config.requirements, option.value] };
    case "shrink":
      return { ...config, shrink: option.value };
    case "shrink-time":
      return { ...config, shrinkTime: option.value };
    case "max-choices":
      return { ...config, maxChoices: option.value };
    case "store":
      return { ...config, store: option.value };
    case "explain":
      return { ...config, explain: option.value };
    case "workers":
      return config;
    case "hermetic":
      return { ...config, hermetic: true };
    default:
      return { ...config, draws: option.value };
  }
}

/**
 * Returns what options state: the defaults, with each option applied in
 * order. The defaults are 100 cases, a shrink budget of 2,000 runs and 30
 * seconds, a cap of 8,192 choices, and an explanation.
 *
 * @param options - The options of the run.
 * @returns The settings.
 */
export function configure(options: readonly Option[]): Config {
  let config: Config = {
    cases: DEFAULT_CASES,
    seed: undefined,
    replay: undefined,
    requirements: [],
    shrink: DEFAULT_BUDGET,
    shrinkTime: DEFAULT_SHRINK_TIME,
    maxChoices: MAX_CHOICES,
    store: undefined,
    explain: true,
    hermetic: false,
    draws: undefined,
  };
  for (const option of options) config = apply(config, option);
  return config;
}

/** Throws a RangeError for a count that is no whole number of at least min. */
function counted(call: string, n: number, min: number): void {
  if (!Number.isSafeInteger(n) || n < min) {
    throw new RangeError(
      `prop: ${call}(${n}) states no whole number of ${min} or more`,
    );
  }
}

/**
 * Sets the number of valid cases that a run aims for, 100 by default. A run
 * also stops once it has tested every input, and after ten times n
 * generated cases.
 *
 * @param n - The number, at least 1.
 * @returns The option.
 * @throws RangeError for an n that is no whole number of 1 or more.
 */
export function cases(n: number): Option {
  counted("cases", n, 1);
  return { kind: "cases", value: n };
}

/**
 * Sets the seed of the run. Without it, DOKIMI_ASSERT_PROP_SEED states the
 * seed in decimal, then a run in a process of a mutation run and a run
 * under the ci profile derive it from the contract, and otherwise each run
 * draws one. A hermetic run reads neither variable. A failing run reports
 * its seed.
 *
 * @param s - The seed, an integer in [0, 2^64).
 * @returns The option.
 * @throws RangeError for a seed outside [0, 2^64).
 */
export function seed(s: bigint | number): Option {
  const value = typeof s === "bigint" ? s : Number.isSafeInteger(s) ? BigInt(s) : -1n;
  if (value < 0n || value >= SEED_LIMIT) {
    throw new RangeError(`prop: seed(${s}) states no integer in [0, 2^64)`);
  }
  return { kind: "seed", value };
}

/**
 * Makes the run run the one case that token records, and nothing else. The
 * case is not shrunk. A token that no encoder writes ends the call with a
 * fault. Without it, DOKIMI_ASSERT_PROP_REPLAY states the token to replay,
 * which a hermetic run does not read.
 *
 * @param token - The replay token, as a failure reports it.
 * @returns The option.
 */
export function replay(token: string): Option {
  return { kind: "replay", value: token };
}

/**
 * Adds a coverage requirement: label must count at least share of the
 * valid cases, as Case.classify counts them. A Wilson score test decides
 * it after the stated number of cases, and again each time the number
 * doubles, up to eight times the number. A run that refutes it or leaves
 * it unmet fails as coverage-unmet.
 *
 * @param label - The label.
 * @param share - The share, in [0, 1].
 * @returns The option.
 * @throws RangeError for a share outside [0, 1].
 */
export function require(label: string, share: number): Option {
  if (!(share >= 0 && share <= 1)) {
    throw new RangeError(
      `prop: require(${JSON.stringify(label)}, ${share}) states a share outside [0, 1]`,
    );
  }
  return { kind: "require", value: { label, share } };
}

/**
 * Sets the budget of runs of the body that shrinking and explaining every
 * failure of a run may spend, 2,000 by default. A budget of 0 turns both
 * off, and a failing case is reported as found.
 *
 * @param runs - The budget, at least 0.
 * @returns The option.
 * @throws RangeError for a budget that is no whole number of 0 or more.
 */
export function shrink(runs: number): Option {
  counted("shrink", runs, 0);
  return { kind: "shrink", value: runs };
}

/**
 * Sets the time that shrinking and explaining may take, 30 seconds by
 * default, measured on the platform clock and not on the seat's. A shrink
 * that runs out of time reports the smallest case it found. A time of 0
 * sets no limit.
 *
 * @param ms - The time, in milliseconds, at least 0.
 * @returns The option.
 * @throws RangeError for a time that is no number of 0 or more.
 */
export function shrinkTime(ms: number): Option {
  if (!(ms >= 0) || !Number.isFinite(ms)) {
    throw new RangeError(`prop: shrinkTime(${ms}) states no time of 0 or more`);
  }
  return { kind: "shrink-time", value: ms };
}

/**
 * Sets the most choices that one case may make, 8,192 by default. A
 * sequence counts as one choice and one for each element. A case that
 * requests more is rejected.
 *
 * @param n - The cap, at least 1.
 * @returns The option.
 * @throws RangeError for a cap that is no whole number of 1 or more.
 */
export function maxChoices(n: number): Option {
  counted("maxChoices", n, 1);
  return { kind: "max-choices", value: n };
}

/**
 * Sets the directory of the run's store, relative to the working directory.
 * The empty string turns the store off. Without it, the store of a test is
 * `testdata/prop/<file>/<describe titles>/<title>`, beside
 * `testdata/golden`, and a seat that runs no test has no store.
 *
 * @param dir - The directory.
 * @returns The option.
 */
export function store(dir: string): Option {
  return { kind: "store", value: dir };
}

/**
 * Sets whether a run explains its counterexample, on by default. The
 * explanation states for each draw whether any value fails there, and for
 * an integer or a duration whose value matters the nearest value that
 * passes.
 *
 * @param enabled - Whether to explain.
 * @returns The option.
 */
export function explain(enabled: boolean): Option {
  return { kind: "explain", value: enabled };
}

/**
 * Sets the number of cases that run at once, 1 by default. A body runs on
 * the runtime's one thread, so this runs one case at a time whatever n
 * states, and the run reports what a run on one worker reports.
 *
 * @param n - The number, at least 1.
 * @returns The option.
 * @throws RangeError for a number that is no whole number of 1 or more.
 */
export function workers(n: number): Option {
  counted("workers", n, 1);
  return { kind: "workers", value: n };
}

/**
 * Makes the run read none of the engine's four variables:
 * DOKIMI_ASSERT_PROP_SEED, DOKIMI_ASSERT_PROP_PROFILE,
 * DOKIMI_ASSERT_PROP_BUDGET and DOKIMI_ASSERT_PROP_REPLAY. The run's seed
 * is the one that seed states, or a random one, it runs as the default
 * profile runs, and it replays only a token that replay states. A test
 * states it when it runs a property to check something other than a
 * subject, such as a test of a property harness.
 *
 * @returns The option.
 */
export function hermetic(): Option {
  return { kind: "hermetic" };
}

/**
 * Makes the run's first case decode its draws and take its machine's steps
 * from entries: a JSON array of the entries of a counterexample, in request
 * order. A draw entry states a label and a typed literal, as a store entry
 * records a draw. A step entry states the action of a step, with its client
 * in a concurrent section and the drain mark in the drain. A draw whose
 * label differs from its entry's, and a draw whose generator does not
 * produce the entry's value, end the call with a fault before any other
 * case runs.
 *
 * @param entries - The JSON text of the entries.
 * @returns The option.
 */
export function draws(entries: string): Option {
  return { kind: "draws", value: entries };
}

/**
 * Makes a property form generate its input from generator. TypeScript has
 * no type to derive an input from, so a form takes its input's generator
 * through this option.
 *
 * @param generator - The generator of the input.
 * @returns The option.
 */
export function using<T>(generator: Generator<T>): FormOption {
  return { kind: "using", value: generator as Generator<unknown> };
}

/**
 * Makes a property form run first on a case whose generated arguments
 * decode to values, one value per generated argument in the argument
 * order: one for a form over a function, two for isCommutative and three
 * for isAssociative. A failing example shrinks as any other case does. An
 * example of an input whose generator has no inverse runs on its values,
 * and does not shrink.
 *
 * @param values - The values of the generated arguments.
 * @returns The option.
 */
export function example<T>(...values: readonly T[]): FormOption {
  return { kind: "example", value: values };
}

/**
 * Makes a property form over one input run first on one case of each value,
 * in order, as example of that one value does.
 *
 * @param values - The values, one per case.
 * @returns The option.
 */
export function examples<T>(...values: readonly T[]): FormOption {
  return { kind: "examples", value: values };
}
