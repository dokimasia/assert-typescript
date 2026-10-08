/**
 * A run: its phases, its counts and its outcome.
 *
 * The runner calls a body once per case, in four phases, and stops at the
 * first failing case:
 *
 * 1. Traces, examples and stored: each trace of a case whose draws and
 *    steps the caller states, then each example of a case whose values the
 *    caller states, in order, then each stored choice sequence. An example
 *    is a choice sequence, or the values of its draws when its generator has
 *    no inverse. These cases do not enter the case tree. A trace that the
 *    body cannot follow throws TraceError, which ends the run before any
 *    other case runs.
 * 2. Simplest: one case whose every choice is its target.
 * 3. Random: case i of the seed, for i = 0, 1, 2, …, until `cases` valid
 *    cases have run, the domain is exhausted, or ten times `cases` random
 *    cases have been generated, repeats included. Each random case is
 *    followed by its prefix case, while at most min(⌊cases / 10⌋, 50) cases
 *    are valid and the random case made at least two choices, and by the
 *    next edge case, until all four have run. Edge cases left when the
 *    random cases stop run then.
 * 4. Coverage: when a requirement is undecided at a check, further random
 *    cases up to the next check, at 2, 4 and 8 times `cases`.
 *
 * A valid case is one that passed and repeated no earlier case. Every
 * earlier phase's valid cases count towards `cases`.
 *
 * A failing case is replayed, shrunk and explained, and the run ends as a
 * counterexample, or as flaky when the replay differs. A diverging body
 * ends the run as flaky. A shrink budget of 0 reports the first failing
 * case as found, without replay or explanation. A failing example of values
 * has no choices, so the run reports it as found, without replay,
 * explanation or token.
 *
 * A run that found no failing case fails anyway when it rejected more than
 * ten times as many cases as were valid, when no case requested an input,
 * or when a coverage requirement is refuted or unmet, checked in that order.
 *
 * A campaign shares the counts, the known cases and the conclusion of a
 * failure with a run, and this module exports them for it.
 */

import { Generating, MAX_CHOICES, type Provider, Replaying, Valuing } from "./case.js";
import type { Choice } from "./choice.js";
import * as coverage from "./coverage.js";
import { BOUNDARIES, Edge } from "./edge.js";
import {
  type Body,
  type Divergence,
  type Execution,
  execute,
  identityOf,
  type Observer,
  type Phase,
  unobserved,
} from "./execution.js";
import {
  confirm,
  DEFAULT_BUDGET,
  type Explained,
  explain,
  type Failure,
  Shrinker,
} from "./shrink.js";
import { caseSource } from "./source.js";
import { encode } from "./token.js";
import { type Entry, Tracing } from "./trace.js";
import { Tree } from "./tree.js";
import type { Work } from "./work.js";

/** The valid cases that a run aims for when the caller states no number. */
export const DEFAULT_CASES = 100;

/** A run that rejects more than this many cases for every valid one ends as rejected. */
const MAX_REJECTIONS = 10;

/** A phase generates at most this many times as many random cases as the valid cases that it aims for. */
const GENERATION_FACTOR = 10;

/** A run tries prefix cases while at most cases / PREFIX_DIVISOR of its cases are valid, and never past MAX_PREFIX_CASES. */
const PREFIX_DIVISOR = 10;
const MAX_PREFIX_CASES = 50;

/** A random case has a prefix case only when it made at least this many choices. */
const MIN_PREFIXED_CHOICES = 2;

/** How a run ended. Every kind but passed fails the test. */
export type Kind =
  | "passed"
  | "counterexample"
  | "flaky"
  | "rejected"
  | "coverage-unmet"
  | "vacuous";

/** A label that must count at least share of the valid cases. */
export interface Requirement {
  readonly label: string;
  readonly share: number;
}

/** An example of a generator without an inverse: the values of its draws. */
export class Values {
  /** The values of the draws, in order. */
  readonly values: readonly unknown[];

  /**
   * Returns the example of values.
   *
   * @param values - The values of the draws, in order.
   */
  constructor(values: readonly unknown[]) {
    this.values = values;
  }
}

/**
 * What a run is asked to do. traces are the cases whose draws and machine
 * steps the caller states, which run first, and examples the cases whose
 * values the caller states, which run next: each the choice sequence that
 * decodes to its values, or its Values. shrink is the budget of runs that
 * shrinking and explaining every failure may spend, and 0 turns both off.
 * shrinkTime is the milliseconds that they may take on the platform clock,
 * and 0 sets no limit. replay, when set, is the one case that the run
 * tries.
 */
export interface Settings {
  readonly seed: bigint;
  readonly cases?: number;
  readonly maxChoices?: number;
  readonly requirements?: readonly Requirement[];
  readonly traces?: readonly (readonly Entry[])[];
  readonly examples?: readonly (readonly Choice[] | Values)[];
  readonly stored?: readonly (readonly Choice[])[];
  readonly shrink?: number;
  readonly shrinkTime?: number;
  readonly explain?: boolean;
  readonly replay?: readonly Choice[] | undefined;
}

/** A requirement that a run refuted or left unmet, with its counts. */
export interface Shortfall {
  readonly requirement: Requirement;
  readonly counted: number;
  readonly valid: number;
  readonly verdict: coverage.Verdict;
}

/**
 * The end of a run. cases counts the valid cases. failing is the minimal
 * failing execution of a counterexample, or the case that a flaky replay
 * contradicted; token is its replay token. others are the minimal
 * executions of the other failures, in the order they were found.
 * divergence is the difference that made a run flaky, and shortfall the
 * requirement that a coverage-unmet run missed. runs counts the runs that
 * shrinking and explaining spent. valued is set for a counterexample that
 * an example of values found, which has no token. stored are the runs of
 * the stored cases, in order, up to the one that ended the run.
 */
export interface Outcome {
  readonly kind: Kind;
  readonly cases: number;
  readonly rejected: number;
  readonly seed: bigint;
  readonly failing?: Execution | undefined;
  readonly divergence?: Divergence | undefined;
  readonly shortfall?: Shortfall | undefined;
  readonly others: readonly Execution[];
  readonly explanation: readonly Explained[];
  readonly token?: string | undefined;
  readonly runs: number;
  readonly valued: boolean;
  readonly stored: readonly Execution[];
}

/** The counts of a run so far, from which every outcome takes its counts. */
export class Tally {
  /** The seed of the run. */
  readonly seed: bigint;
  /** The valid cases. */
  valid = 0;
  /** The rejected cases. */
  rejected = 0;
  /** Whether any case requested an input. */
  requested = false;
  /** The valid cases that counted each label. */
  readonly labels = new Map<string, number>();

  /**
   * Returns the counts of a run of seed that has run no case.
   *
   * @param seed - The run's seed.
   */
  constructor(seed: bigint) {
    this.seed = seed;
  }

  /**
   * Counts one execution, and returns the outcome when it ends the run: a
   * counterexample for a failed case, and flaky for a diverged one. A case
   * that repeated an earlier one counts nowhere.
   *
   * @param execution - The execution.
   * @returns The outcome, or undefined for a case that does not end the run.
   */
  take(execution: Execution): Outcome | undefined {
    const c = execution.case;
    this.requested = this.requested || c.draws.length > 0 || c.choices.length > 0;
    if (execution.status === "failed")
      return this.outcome("counterexample", { failing: execution });
    if (execution.status === "diverged") {
      return this.outcome("flaky", { divergence: execution.divergence });
    }
    if (execution.status === "rejected") this.rejected += 1;
    else if (execution.status === "passed") {
      this.valid += 1;
      for (const label of c.labels)
        this.labels.set(label, (this.labels.get(label) ?? 0) + 1);
    }
    return undefined;
  }

  /**
   * Returns an outcome of kind with the counts so far.
   *
   * @param kind - How the run ended.
   * @param parts - The failing case, the divergence or the shortfall.
   * @returns The outcome, with no other failure, explanation or stored run.
   */
  outcome(
    kind: Kind,
    parts: Pick<Outcome, "failing" | "divergence" | "shortfall"> = {},
  ): Outcome {
    return {
      kind,
      cases: this.valid,
      rejected: this.rejected,
      seed: this.seed,
      ...parts,
      others: [],
      explanation: [],
      runs: 0,
      valued: false,
      stored: [],
    };
  }

  /**
   * Returns the outcome of too many rejections or of no input, if either:
   * more than ten rejected cases for every valid one, then no case that
   * requested an input.
   *
   * @returns The outcome, or undefined when neither ends the run.
   */
  failureWithoutCounterexample(): Outcome | undefined {
    if (this.rejected > MAX_REJECTIONS * this.valid) return this.outcome("rejected");
    if (!this.requested) return this.outcome("vacuous");
    return undefined;
  }
}

/** Returns the most valid cases that a run may have and still try a prefix case. */
function prefixCases(cases: number): number {
  return Math.min(Math.floor(cases / PREFIX_DIVISOR), MAX_PREFIX_CASES);
}

/**
 * Returns the first requirement that the counts refute or leave unmet, and
 * whether the counts meet every requirement.
 *
 * @param tally - The counts.
 * @param requirements - The requirements, in order.
 * @param last - Whether the check is the last, which decides every requirement.
 * @param exact - Whether the run tested every input of the domain.
 * @returns The shortfall, or undefined, and whether all are met.
 */
export function shortfallOf(
  tally: Tally,
  requirements: readonly Requirement[],
  last: boolean,
  exact: boolean,
): readonly [Shortfall | undefined, boolean] {
  let met = true;
  for (const requirement of requirements) {
    const counted = tally.labels.get(requirement.label) ?? 0;
    const verdict = coverage.verdict(
      counted,
      tally.valid,
      requirement.share,
      last,
      exact,
    );
    if (verdict === "refuted" || verdict === "unmet") {
      return [{ requirement, counted, valid: tally.valid, verdict }, false];
    }
    met = met && verdict === "met";
  }
  return [undefined, met];
}

/** The settings with every default filled in. */
export type Resolved = Required<Omit<Settings, "replay">> & Pick<Settings, "replay">;

/**
 * Returns settings with every default filled in: 100 cases, the cap of
 * 8,192 choices, no requirement, trace, example or stored case, a shrink
 * budget of 2,000 runs without a time limit, and an explanation.
 *
 * @param settings - What a run is asked to do.
 * @returns The settings with the defaults.
 * @throws RangeError for a run of fewer than one case.
 */
export function resolve(settings: Settings): Resolved {
  const cases = settings.cases ?? DEFAULT_CASES;
  if (cases < 1) throw new RangeError(`prop: a run of ${cases} cases tests nothing`);
  return {
    seed: settings.seed,
    cases,
    maxChoices: settings.maxChoices ?? MAX_CHOICES,
    requirements: settings.requirements ?? [],
    traces: settings.traces ?? [],
    examples: settings.examples ?? [],
    stored: settings.stored ?? [],
    shrink: settings.shrink ?? DEFAULT_BUDGET,
    shrinkTime: settings.shrinkTime ?? 0,
    explain: settings.explain ?? true,
    replay: settings.replay,
  };
}

/**
 * Replays, shrinks and explains the failing case of a counterexample, and
 * returns the outcome with the minimal case, the other failures that the
 * shrink found and the replay token. A shrink budget of 0 adds the token
 * alone. A replay that differs makes the outcome flaky. Any other outcome,
 * and a counterexample of values, which has no choices, return unchanged.
 *
 * @param body - The body.
 * @param settings - The settings of the run.
 * @param outcome - The outcome that the run ended with.
 * @param observer - What sees every call of the body with its phase.
 * @returns The work, which returns the concluded outcome.
 */
export function* conclude(
  body: Body,
  settings: Resolved,
  outcome: Outcome,
  observer: Observer,
): Work<Outcome> {
  const failing = outcome.failing;
  if (outcome.kind !== "counterexample" || failing === undefined || outcome.valued)
    return outcome;
  if (settings.shrink === 0) return { ...outcome, token: encode(failing.case.choices) };
  const divergence = yield* confirm(body, failing, settings.maxChoices, observer);
  if (divergence !== undefined) return { ...outcome, kind: "flaky", divergence };
  const shrinker = new Shrinker(
    body,
    failing,
    settings.maxChoices,
    settings.shrink,
    observer,
    settings.shrinkTime,
  );
  yield* shrinker.shrinkAll();
  const identity = identityOf(failing) as string;
  const first = shrinker.failures.get(identity) as Failure;
  const others = [...shrinker.failures.values()]
    .filter((found) => found.identity !== identity)
    .map((found) => found.execution);
  const explanation = settings.explain
    ? yield* explain(shrinker, first, settings.seed)
    : [];
  return {
    ...outcome,
    failing: first.execution,
    others,
    explanation,
    token: encode(first.execution.case.choices),
    runs: shrinker.runs,
  };
}

/**
 * The cases of a run after its stored cases, in the order that one worker
 * runs them. The simplest case comes first. Each random case is followed by
 * its prefix case and the next edge case, and the edge cases left when the
 * random cases stop run then. phase is the phase of the random cases:
 * random up to the first check, and coverage after it.
 */
class Phases {
  readonly #body: Body;
  readonly settings: Resolved;
  readonly tally: Tally;
  readonly #observer: Observer;
  readonly tree = new Tree();
  readonly #edges = BOUNDARIES.map((boundary) => new Edge(boundary));
  #index = 0;
  phase: Phase = "random";

  constructor(body: Body, settings: Resolved, tally: Tally, observer: Observer) {
    this.#body = body;
    this.settings = settings;
    this.tally = tally;
    this.#observer = observer;
  }

  /** Runs one case of phase into the tree, and shows it to the observer. */
  *call(provider: Provider, phase: Phase): Work<Execution> {
    const execution = yield* execute(
      this.#body,
      provider,
      this.settings.maxChoices,
      this.tree,
    );
    this.#observer(phase, execution);
    return execution;
  }

  /** Runs one case of phase, counts it, and returns the outcome that it ends the run with. */
  *attempt(provider: Provider, phase: Phase): Work<Outcome | undefined> {
    return this.tally.take(yield* this.call(provider, phase));
  }

  /** Runs the next random case, then its prefix case and the next edge case. */
  *#random(): Work<Outcome | undefined> {
    const source = caseSource(this.settings.seed, BigInt(this.#index));
    this.#index += 1;
    const execution = yield* this.call(new Generating(source), this.phase);
    const outcome = this.tally.take(execution);
    if (outcome !== undefined) return outcome;
    const choices = execution.case.choices;
    const prefixed =
      this.tally.valid <= prefixCases(this.settings.cases) &&
      choices.length >= MIN_PREFIXED_CHOICES &&
      !this.tree.exhausted;
    if (prefixed) {
      const cut = 1 + Number(source.below(BigInt(choices.length - 1)));
      const prefix = yield* this.attempt(
        new Replaying(choices.slice(0, cut)),
        "prefix",
      );
      if (prefix !== undefined) return prefix;
    }
    return yield* this.#nextEdge();
  }

  /** Runs the next edge case, unless none is left or the domain is exhausted. */
  *#nextEdge(): Work<Outcome | undefined> {
    const edge = this.#edges[0];
    if (edge === undefined || this.tree.exhausted) return undefined;
    this.#edges.shift();
    return yield* this.attempt(edge, "edge");
  }

  /**
   * Runs random cases until target cases are valid, then the edge cases
   * left. The random cases also stop when the domain is exhausted, and after
   * ten times target random cases, repeats included.
   */
  *runTo(target: number): Work<Outcome | undefined> {
    while (
      this.tally.valid < target &&
      !this.tree.exhausted &&
      this.#index < GENERATION_FACTOR * target
    ) {
      const outcome = yield* this.#random();
      if (outcome !== undefined) return outcome;
    }
    while (this.#edges.length > 0 && !this.tree.exhausted) {
      const outcome = yield* this.#nextEdge();
      if (outcome !== undefined) return outcome;
    }
    return undefined;
  }
}

/** Returns the provider of an example: its values, or a replay of its choices. */
function exampleProvider(example: readonly Choice[] | Values): Provider {
  return example instanceof Values
    ? new Valuing(example.values)
    : new Replaying(example);
}

/**
 * Returns the cases that a run tries before it generates any, in order,
 * each with its phase and the provider of its values: each trace and each
 * example under example, then each stored case under stored.
 *
 * @param settings - The settings of the run.
 * @returns The phase and the provider of each case.
 */
export function knownCases(settings: Resolved): (readonly [Phase, Provider])[] {
  return [
    ...settings.traces.map((trace) => ["example", new Tracing(trace)] as const),
    ...settings.examples.map(
      (example) => ["example", exampleProvider(example)] as const,
    ),
    ...settings.stored.map((stored) => ["stored", new Replaying(stored)] as const),
  ];
}

/**
 * Runs the known cases of settings outside the case tree, counted by tally,
 * and returns the outcome that one of them ends the run with. stored
 * receives the run of each stored case.
 */
function* tryKnown(
  body: Body,
  settings: Resolved,
  tally: Tally,
  observer: Observer,
  stored: Execution[],
): Work<Outcome | undefined> {
  for (const [phase, provider] of knownCases(settings)) {
    const execution = yield* execute(body, provider, settings.maxChoices);
    observer(phase, execution);
    if (phase === "stored") stored.push(execution);
    const outcome = tally.take(execution);
    if (outcome !== undefined) {
      return {
        ...outcome,
        valued: provider instanceof Valuing && outcome.failing !== undefined,
        stored,
      };
    }
  }
  return undefined;
}

/**
 * Runs the random phase to each check, and returns the outcome that ends
 * the run, or undefined when the run passes. The random cases after the
 * first check are the coverage phase's. A run without requirements meets
 * them all at the first check, and the last check decides every
 * requirement, so the checks end with a pass or an outcome.
 */
function* checks(phases: Phases): Work<Outcome | undefined> {
  const { settings, tally } = phases;
  const multiples =
    settings.requirements.length > 0 ? coverage.CHECKS : coverage.CHECKS.slice(0, 1);
  for (const [position, multiple] of multiples.entries()) {
    phases.phase = position === 0 ? "random" : "coverage";
    const outcome =
      (yield* phases.runTo(multiple * settings.cases)) ??
      tally.failureWithoutCounterexample();
    if (outcome !== undefined) return outcome;
    const last = position === multiples.length - 1;
    const [shortfall, met] = shortfallOf(
      tally,
      settings.requirements,
      last,
      phases.tree.exhausted,
    );
    if (shortfall !== undefined) return tally.outcome("coverage-unmet", { shortfall });
    if (met) break;
  }
  return undefined;
}

/** Runs the phases until the run ends, without concluding a counterexample. */
function* explore(body: Body, settings: Resolved, observer: Observer): Work<Outcome> {
  const tally = new Tally(settings.seed);
  const stored: Execution[] = [];
  const known = yield* tryKnown(body, settings, tally, observer, stored);
  if (known !== undefined) return known;
  const phases = new Phases(body, settings, tally, observer);
  const outcome =
    (yield* phases.attempt(new Replaying([]), "simplest")) ??
    (yield* checks(phases)) ??
    tally.outcome("passed");
  return { ...outcome, stored };
}

/**
 * Runs the one case that choices record, and reports it as found. The case
 * runs outside a case tree, so it cannot diverge: an outcome that it ends
 * the run with is a counterexample.
 */
function* replayOnly(
  body: Body,
  settings: Resolved,
  choices: readonly Choice[],
  observer: Observer,
): Work<Outcome> {
  const tally = new Tally(settings.seed);
  const execution = yield* execute(body, new Replaying(choices), settings.maxChoices);
  observer("token", execution);
  const outcome = tally.take(execution);
  if (outcome === undefined)
    return tally.failureWithoutCounterexample() ?? tally.outcome("passed");
  return { ...outcome, token: encode(execution.case.choices) };
}

/**
 * Runs the phases and returns the outcome. A run with replay set runs that
 * one case instead, and neither shrinks nor explains it.
 *
 * @param body - The body.
 * @param settings - What the run is asked to do.
 * @param observer - What sees every call of the body with its phase, in
 *   the order of the run.
 * @returns The work, which returns the outcome.
 * @throws RangeError for a run of fewer than one case.
 * @throws TraceError when a trace states an entry that the body cannot
 *   follow.
 */
export function* run(
  body: Body,
  settings: Settings,
  observer: Observer = unobserved,
): Work<Outcome> {
  const resolved = resolve(settings);
  if (resolved.replay !== undefined)
    return yield* replayOnly(body, resolved, resolved.replay, observer);
  const explored = yield* explore(body, resolved, observer);
  return yield* conclude(body, resolved, explored, observer);
}

/**
 * Runs the stored cases of settings, oldest first, as run runs them before
 * its other cases, and returns how they ended: a pass that counts them, or
 * the outcome of the first of them that does not pass. A failing stored
 * case is reported as found, with its token, and is neither shrunk nor
 * explained. The outcome states the runs of the stored cases up to the one
 * that ended it. The settings' traces and examples do not run. A stored case
 * runs outside a case tree, so it cannot diverge.
 *
 * @param body - The body.
 * @param settings - What the run is asked to do.
 * @param observer - What sees every call of the body with its phase.
 * @returns The work, which returns the outcome.
 * @throws RangeError for a run of fewer than one case.
 */
export function* runStored(
  body: Body,
  settings: Settings,
  observer: Observer = unobserved,
): Work<Outcome> {
  const resolved = resolve({ ...settings, traces: [], examples: [] });
  const tally = new Tally(resolved.seed);
  const stored: Execution[] = [];
  const outcome = yield* tryKnown(body, resolved, tally, observer, stored);
  if (outcome === undefined) return { ...tally.outcome("passed"), stored };
  return {
    ...outcome,
    token: encode((outcome.failing as Execution).case.choices),
  };
}

/**
 * Replays, shrinks and explains failing, a failed case that the body ran
 * outside a run, such as the case that the fuzz bridge decoded from a
 * fuzzer's input. It returns a counterexample that counts no valid case, or
 * a flaky outcome when the replay of failing differs from it.
 *
 * @param body - The body.
 * @param settings - What the run is asked to do.
 * @param failing - The failed execution.
 * @param observer - What sees every call of the body with its phase.
 * @returns The work, which returns the outcome.
 * @throws RangeError for a run of fewer than one case.
 */
export function* concludeCase(
  body: Body,
  settings: Settings,
  failing: Execution,
  observer: Observer = unobserved,
): Work<Outcome> {
  const resolved = resolve(settings);
  const found = new Tally(resolved.seed).outcome("counterexample", { failing });
  return yield* conclude(body, resolved, found, observer);
}
