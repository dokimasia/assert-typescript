/**
 * A campaign: a run that explores for a span of time instead of a number of
 * cases, and keeps the cases that show new behaviour.
 *
 * A campaign runs the traces, the examples and the stored cases first, as a
 * run does. It then runs cases one at a time until its budget has passed. A
 * valid case joins the campaign's pool when it counts a label that no
 * earlier case counted, records a fingerprint that no earlier case
 * recorded, or records a score above the best of its label. Three cases in
 * four of a campaign with a pool mutate a member of the pool, chosen
 * uniformly, and the fourth is the next random case of the seed. A mutation
 * draws one choice of the member again, deletes a span, repeats a span
 * after itself, or replaces a span with a span of the same label of a
 * member, each with odds of 1 in 4. A mutated case replays its choices, and
 * each request past them draws from the campaign's own stream: the stream
 * of index 2^64 − 1 of the seed, above the index of every random case.
 *
 * The definition leaves these odds to each library.
 */

import { Generating, type Provider, type Request, type Span, Valuing } from "./case.js";
import {
  type Bounds,
  type Choice,
  choiceOf,
  UINT64_MAX,
  type Value,
} from "./choice.js";
import * as draw from "./draw.js";
import {
  type Body,
  type Execution,
  execute,
  identityOf,
  type Observer,
  unobserved,
} from "./execution.js";
import {
  conclude,
  knownCases,
  type Outcome,
  type Resolved,
  resolve,
  type Settings,
  shortfallOf,
  Tally,
} from "./runner.js";
import { caseSource, type Source } from "./source.js";
import type { Work } from "./work.js";

/** The odds that a case of a campaign with a pool mutates a member of the pool: 3 in 4. */
const MUTATE_NUM = 3n;
const MUTATE_DEN = 4n;

/**
 * The kinds of mutation of a member, among which a mutated case chooses
 * uniformly: a choice drawn again, a span deleted, a span repeated, and the
 * fourth, a span replaced.
 */
const REDRAW = 0n;
const DELETE = 1n;
const REPEAT = 2n;
const KINDS = 4n;

/** What a campaign is asked to do: the settings of a run, and its budget. */
export interface CampaignSettings extends Settings {
  /** How long the campaign explores, in milliseconds. */
  readonly budget: number;
  /** Receives each failure that the campaign concludes, as the campaign concludes it. */
  readonly concluded?: ((outcome: Outcome) => void) | undefined;
  /** Returns the time that the budget is measured on, in milliseconds: performance.now by default. */
  readonly now?: (() => number) | undefined;
}

/** A case of the pool: its choices, the bounds of the request of each, and its spans. */
interface Member {
  readonly choices: readonly Choice[];
  readonly bounds: readonly Bounds[];
  readonly spans: readonly Span[];
}

/** Returns one element of items, chosen uniformly from source. */
function pick<T>(source: Source, items: readonly T[]): T {
  return items[Number(source.below(BigInt(items.length)))] as T;
}

/** Returns a value drawn from bounds alone, as a value request of those bounds draws it. */
function redrawn(bounds: Bounds, source: Source): Choice {
  switch (bounds.kind) {
    case "integer":
      return choiceOf(bounds, draw.integer(source, bounds));
    case "float":
      return choiceOf(bounds, draw.floatValue(source, bounds));
    default:
      return choiceOf(bounds, draw.sequence(source, bounds));
  }
}

/** Returns the choices of member with one of them, chosen uniformly, drawn again from its bounds. */
function redrawOne(member: Member, source: Source): Choice[] {
  const choices = [...member.choices];
  const at = Number(source.below(BigInt(choices.length)));
  choices[at] = redrawn(member.bounds[at] as Bounds, source);
  return choices;
}

/**
 * Returns the choices of a mutation of a member of pool. A member without
 * spans takes the mutation that draws a choice again, and so does a
 * replacement whose donor has no span of the span's label. A member without
 * choices takes no mutation.
 */
function mutation(pool: readonly Member[], source: Source): Choice[] {
  const member = pick(source, pool);
  const choices = member.choices;
  if (choices.length === 0) return [];
  const drawn = source.below(KINDS);
  const kind = member.spans.length === 0 ? REDRAW : drawn;
  if (kind === REDRAW) return redrawOne(member, source);
  const span = pick(source, member.spans);
  const before = choices.slice(0, span.start);
  const after = choices.slice(span.end);
  if (kind === DELETE) return [...before, ...after];
  if (kind === REPEAT)
    return [...choices.slice(0, span.end), ...choices.slice(span.start)];
  const donor = pick(source, pool);
  const same = donor.spans.filter((other) => other.label === span.label);
  if (same.length === 0) return redrawOne(member, source);
  const given = pick(source, same);
  return [...before, ...donor.choices.slice(given.start, given.end), ...after];
}

/**
 * A provider that replays the choices of a mutated case, each fitted to its
 * request's bounds, and draws each request past them from the campaign's
 * stream.
 */
class Mutating implements Provider {
  readonly #choices: readonly Choice[];
  readonly #source: Source;

  constructor(choices: readonly Choice[], source: Source) {
    this.#choices = choices;
    this.#source = source;
  }

  value(request: Request, index: number): Value {
    const choice = this.#choices[index];
    return choice === undefined
      ? request.draw(this.#source)
      : request.bounds.coerce(choice);
  }
}

/** The state of one campaign. */
class Exploration {
  readonly #body: Body;
  readonly #settings: Resolved;
  readonly #observer: Observer;
  readonly #concluded: (outcome: Outcome) => void;
  readonly #tally: Tally;
  readonly #source: Source;
  #index = 0;
  readonly #pool: Member[] = [];
  readonly #labels = new Set<string>();
  readonly #fingerprints = new Set<bigint>();
  readonly #best = new Map<string, number>();
  readonly #identities = new Set<string>();
  #found: Outcome | undefined;
  readonly #stored: Execution[] = [];

  constructor(body: Body, settings: CampaignSettings, observer: Observer) {
    this.#body = body;
    this.#settings = resolve(settings);
    this.#observer = observer;
    this.#concluded = settings.concluded ?? (() => undefined);
    this.#tally = new Tally(this.#settings.seed);
    this.#source = caseSource(this.#settings.seed, UINT64_MAX);
  }

  /** Runs the known cases, and returns the outcome that ends the campaign. */
  *known(): Work<Outcome | undefined> {
    for (const [phase, provider] of knownCases(this.#settings)) {
      const execution = yield* execute(this.#body, provider, this.#settings.maxChoices);
      this.#observer(phase, execution);
      if (phase === "stored") this.#stored.push(execution);
      const ended = yield* this.#take(execution, provider instanceof Valuing);
      if (ended !== undefined) return ended;
    }
    return undefined;
  }

  /** Runs the next case of the exploration, and returns the outcome that ends the campaign. */
  *next(): Work<Outcome | undefined> {
    let provider: Provider;
    if (this.#pool.length > 0 && this.#source.coin(MUTATE_NUM, MUTATE_DEN)) {
      provider = new Mutating(mutation(this.#pool, this.#source), this.#source);
    } else {
      provider = new Generating(caseSource(this.#settings.seed, BigInt(this.#index)));
      this.#index += 1;
    }
    const execution = yield* execute(this.#body, provider, this.#settings.maxChoices);
    this.#observer("random", execution);
    return yield* this.#take(execution, false);
  }

  /**
   * Counts an execution, concludes a failure, admits a valid case to the
   * pool, and returns the outcome that ends the campaign. valued states a
   * case of an example of values.
   */
  *#take(execution: Execution, valued: boolean): Work<Outcome | undefined> {
    this.#tally.take(execution);
    if (execution.status === "failed") return yield* this.#fail(execution, valued);
    if (execution.status === "passed") this.#admit(execution);
    return undefined;
  }

  /**
   * Concludes the failing execution when no earlier failure had its
   * identity, and returns the flaky outcome of a replay that differs. The
   * other failures that its shrink finds are among its others, except those
   * of an identity concluded before.
   */
  *#fail(execution: Execution, valued: boolean): Work<Outcome | undefined> {
    const identity = identityOf(execution) as string;
    if (this.#identities.has(identity)) return undefined;
    const found = {
      ...this.#tally.outcome("counterexample", { failing: execution }),
      valued,
    };
    const outcome = yield* conclude(this.#body, this.#settings, found, this.#observer);
    if (outcome.kind === "flaky") {
      const parts = { failing: outcome.failing, divergence: outcome.divergence };
      return { ...this.#tally.outcome("flaky", parts), stored: this.#stored };
    }
    this.#identities.add(identity);
    const others: Execution[] = [];
    for (const other of outcome.others) {
      const key = identityOf(other) as string;
      if (this.#identities.has(key)) continue;
      this.#identities.add(key);
      others.push(other);
    }
    const concluded = { ...outcome, others };
    this.#concluded(concluded);
    if (this.#found === undefined) {
      this.#found = concluded;
      return undefined;
    }
    const failing = concluded.failing as Execution;
    this.#found = {
      ...this.#found,
      others: [...this.#found.others, failing, ...others],
    };
    return undefined;
  }

  /**
   * Adds a valid case to the pool when it counts a label, records a
   * fingerprint, or scores above the best of a label, for the first time.
   */
  #admit(execution: Execution): void {
    const c = execution.case;
    let novel = false;
    for (const label of c.labels) {
      novel = novel || !this.#labels.has(label);
      this.#labels.add(label);
    }
    for (const fingerprint of c.fingerprints) {
      novel = novel || !this.#fingerprints.has(fingerprint);
      this.#fingerprints.add(fingerprint);
    }
    for (const [label, score] of c.targets) {
      const best = this.#best.get(label);
      if (best !== undefined && !(score > best)) continue;
      this.#best.set(label, score);
      novel = true;
    }
    if (!novel) return;
    this.#pool.push({
      choices: [...c.choices],
      bounds: c.requests.map((request) => request.bounds),
      spans: c.spans.map((span) => ({ ...span })),
    });
  }

  /**
   * Returns the outcome of a campaign whose budget has passed: the first
   * failure that it concluded, with every later one among its others, or
   * the outcome that the last check of a run decides over every valid case.
   */
  result(): Outcome {
    const tally = this.#tally;
    const stored = this.#stored;
    if (this.#found !== undefined) {
      return { ...this.#found, cases: tally.valid, rejected: tally.rejected, stored };
    }
    const missing = tally.failureWithoutCounterexample();
    if (missing !== undefined) return { ...missing, stored };
    const [shortfall] = shortfallOf(tally, this.#settings.requirements, true, false);
    const kind = shortfall === undefined ? "passed" : "coverage-unmet";
    return { ...tally.outcome(kind, { shortfall }), stored };
  }
}

/**
 * Runs a campaign of body under settings: the known cases of a run, and
 * then cases until settings.budget has passed on settings.now.
 *
 * A failing case whose identity no earlier failure had is replayed, shrunk
 * and explained as a run concludes its failure, settings.concluded receives
 * the outcome, and the campaign goes on. A replay that differs ends the
 * campaign as flaky.
 *
 * When the budget has passed, the campaign returns a counterexample of the
 * first failure that it concluded, with every later one among its others,
 * or the outcome that the last check of a run decides over every valid case
 * of the campaign. The outcome counts the campaign's cases, and states the
 * runs of the stored cases. The random and the mutated cases are under the
 * phase random.
 *
 * @param body - The body.
 * @param settings - What the campaign is asked to do.
 * @param observer - What sees every call of the body with its phase, in
 *   the order of the campaign.
 * @returns The work, which returns the outcome.
 * @throws RangeError for settings of fewer than one case.
 * @throws TraceError when a trace states an entry that the body cannot
 *   follow.
 */
export function* campaign(
  body: Body,
  settings: CampaignSettings,
  observer: Observer = unobserved,
): Work<Outcome> {
  const now = settings.now ?? (() => performance.now());
  const end = now() + settings.budget;
  const exploration = new Exploration(body, settings, observer);
  const known = yield* exploration.known();
  if (known !== undefined) return known;
  while (now() < end) {
    const ended = yield* exploration.next();
    if (ended !== undefined) return ended;
  }
  return exploration.result();
}
