/**
 * The steps of a machine in a case.
 */

import { callSite, Failure } from "../failure.js";
import { fieldsOf, LINEARIZABLE, whole } from "../history/linearizable.js";
import { type Case, onEngine } from "../prop/case.js";
import type { Case as Engine, Place, Step } from "../prop/engine/case.js";
import { IntegerBounds } from "../prop/engine/choice.js";
import { more, Sizes } from "../prop/engine/collection.js";
import * as draw from "../prop/engine/draw.js";
import { Tracing } from "../prop/engine/trace.js";
import { type Action, type Machine, validate } from "./machine.js";
import { type Config, configure, type Option } from "./option.js";
import type { Scheduler } from "./scheduler.js";

/** The contract of the check after a step. */
const CONTRACT = "the history of the machine's steps is linearizable";

/** The probability with which swarm keeps an action, before the draw conditions the choices on keeping one. */
const SWARM: draw.Rational = { num: 1n, den: 2n };

/** The bounds of a swarm choice that the last action must take, and of one that it may. */
const FORCED = new IntegerBounds(1n, 1n);
const FREE = new IntegerBounds(0n, 1n);

/** A step of a concurrent section, listed before any step runs: its action and its input. */
type Planned<S> = readonly [action: Action<S>, input: unknown];

/**
 * Runs the steps of machine in the case c, in six parts, and records every
 * decision as a choice of the case:
 *
 * 1. Swarm: one choice per action, in order, whether the case keeps it, with
 *    odds of 1 in 2 conditioned on keeping one. A case keeps every action
 *    under `swarm(false)`.
 * 2. Setup: the check of the history, and the invariant.
 * 3. Sequential steps on client 0. Before each step, the kept actions that
 *    are enabled in every state that the last check left. With none, the
 *    steps end. Otherwise a continue flag, with the mean of {@link mean} and
 *    the most steps of {@link max}, and an index into the list by weight.
 *    The step is a span labelled with the action's name, from its flag to
 *    the end of its run, which requests the step's input and runs the
 *    action. The check and the invariant follow each step.
 * 4. A concurrent section, for {@link clients} of 2 or more. The section
 *    lists its steps before any runs: each a flag with the most steps of
 *    {@link concurrent}, a client from 0 to the clients, an index into the
 *    kept actions without enabled, and the step's input. Client 0 runs its
 *    steps, and then the other clients run theirs as tasks of the scheduler
 *    of {@link tasks}, one task per client that has a step, spawned in
 *    client order. The check follows.
 * 5. The drain: steps of the actions with drain set, without a flag, until
 *    none is enabled or the most steps ran, each followed by the check and
 *    the invariant.
 * 6. Settle, and the invariant.
 *
 * The check searches the case's history with the machine's spec, with every
 * call in one partition, and the next state is the first of the states that
 * the order it found leaves. A check that fails, violated or undecided, ends
 * the case with the record of linearizable, whose contract states that the
 * history of the machine's steps is linearizable.
 *
 * The case of prop.draws follows its trace: the swarm keeps the actions that
 * its step entries name, and each step entry becomes the choices of one
 * step. steps refuses a step entry that it cannot take at its position,
 * which ends the run with a fault at the entry before any other case: an
 * action that the step's list lacks, a step past its part's most steps, a
 * client outside the clients, a concurrent step of a machine with one
 * client, and a drain step after the drain.
 *
 * Each request that the case makes while steps runs, and each fingerprint
 * that it observes, belongs to the part and the step that run, which the
 * divergence of a flaky run names: a sequential, concurrent or drain step at
 * its position in its part, from 0, with its action once its index has
 * chosen it, and a swarm choice at the position of its action. Setup, settle
 * and the run of a concurrent section's steps have no position.
 *
 * @param c - The case.
 * @param machine - The machine.
 * @param options - The settings of the run.
 * @returns A promise that settles when the steps have ended.
 * @throws RangeError for an action whose weight is no integer of 0 or more.
 * @throws TypeError for an action without run.
 * @throws Error for two actions with one name, and for clients of 2 or more
 *   without tasks.
 */
export async function steps<S>(
  c: Case,
  machine: Machine<S>,
  ...options: Option[]
): Promise<void> {
  validate(machine);
  const config = configure(options);
  if (config.clients > 1 && config.scheduler === undefined) {
    throw new Error(
      `stateful: steps with clients(${config.clients}) runs its clients as tasks, and no option states tasks(scheduler)`,
    );
  }
  await new Run(c, machine, config).run();
}

/** One run of a machine's steps in one case. */
class Run<S> {
  readonly #c: Case;
  /** The engine's record of the case, whose place the run sets. */
  readonly #e: Engine;
  readonly #machine: Machine<S>;
  readonly #config: Config;
  /** The trace that the case follows, and undefined for a case that follows none. */
  readonly #trace: Tracing | undefined;
  /** The states that the last check left, and one undefined state before a check and for a machine without a spec. */
  #states: readonly S[] = [undefined as S];

  constructor(c: Case, machine: Machine<S>, config: Config) {
    this.#c = c;
    this.#e = onEngine(c, (e) => e);
    this.#machine = machine;
    this.#config = config;
    const provider = this.#e.provider;
    this.#trace = provider instanceof Tracing ? provider : undefined;
  }

  /** Runs the six parts in order, and restores the case's place when they end, however they end. */
  async run(): Promise<void> {
    const before = this.#e.place;
    try {
      const kept = this.#swarm();
      this.#at({ part: "setup" });
      this.#check();
      this.#invariant();
      await this.#sequential(kept);
      await this.#concurrent(kept);
      await this.#drain();
      this.#at({ part: "settle" });
      await this.#machine.settle?.(this.#c, this.#state());
      this.#invariant();
    } finally {
      this.#at(before);
    }
  }

  /** Calls fn with the engine's record of the case, and ends the case with a signal that fn throws. */
  #on<T>(fn: (e: Engine) => T): T {
    return onEngine(this.#c, fn);
  }

  /** Makes place the case's place. */
  #at(place: Place | undefined): void {
    this.#e.place = place;
  }

  /** Returns the actions that the case keeps, in order. A case that follows a trace keeps the actions that its step entries name. */
  #swarm(): Action<S>[] {
    const actions = this.#machine.actions;
    if (!this.#config.swarm) return [...actions];
    const named = this.#trace?.actions() ?? new Set<string>();
    const kept: Action<S>[] = [];
    actions.forEach((action, position) => {
      this.#at({ part: "swarm", position, action: action.name });
      this.#trace?.prepare(named.has(action.name) ? 1n : 0n);
      const earlier = kept.length > 0;
      const remaining = actions.length - position;
      const value = this.#on((e) =>
        e.choose({
          bounds: !earlier && remaining === 1 ? FORCED : FREE,
          draw: (source) => draw.keep(source, SWARM, earlier, remaining),
          edge: 1n,
        }),
      );
      if (value === 1n) kept.push(action);
    });
    return kept;
  }

  /** Takes sequential steps until no kept action is enabled or a flag stops them. */
  async #sequential(kept: readonly Action<S>[]): Promise<void> {
    const sizes = new Sizes(0, this.#config.max);
    for (let count = 0; ; count += 1) {
      this.#at({ part: "sequential", position: count });
      const available = this.#available(kept);
      const start = this.#on((e) => e.choices.length);
      if (this.#trace !== undefined) {
        this.#followSequential(this.#trace, available, count);
      }
      if (available.length === 0) return;
      if (!this.#on((e) => more(e, count, sizes, false, this.#config.mean))) return;
      await this.#take(start, available, "sequential", count);
    }
  }

  /** Lists the steps of the concurrent section, runs them, and checks the history. */
  async #concurrent(kept: readonly Action<S>[]): Promise<void> {
    const { clients, concurrent } = this.#config;
    if (clients === 1) {
      if (this.#trace !== undefined) this.#refuseConcurrent(this.#trace);
      return;
    }
    const eligible = kept.filter((action) => action.enabled === undefined);
    const planned: Planned<S>[][] = Array.from({ length: clients + 1 }, () => []);
    const sizes = new Sizes(0, concurrent);
    for (let count = 0; ; count += 1) {
      this.#at({ part: "concurrent", position: count });
      const start = this.#on((e) => e.choices.length);
      if (this.#trace !== undefined) {
        this.#followConcurrent(this.#trace, eligible, count);
      }
      if (eligible.length === 0 || !this.#on((e) => more(e, count, sizes))) break;
      const client = this.#client();
      const action = eligible[this.#index(eligible)] as Action<S>;
      this.#at({ part: "concurrent", position: count, action: action.name });
      this.#on((e) =>
        e.span(
          action.name,
          () => {
            e.step({ action: action.name, client });
            (planned[client] as Planned<S>[]).push([action, this.#input(action)]);
          },
          start,
        ),
      );
    }
    this.#at({ part: "concurrent" });
    await this.#section(planned);
    this.#check();
  }

  /** Runs the planned steps of client 0, and then those of the other clients as tasks. */
  async #section(planned: readonly (readonly Planned<S>[])[]): Promise<void> {
    for (const [action, input] of planned[0] as Planned<S>[]) {
      await action.run(this.#c, 0, input);
    }
    const scheduler = this.#config.scheduler as Scheduler;
    planned.forEach((listed, client) => {
      if (client === 0 || listed.length === 0) return;
      scheduler.spawn(async () => {
        for (const [action, input] of listed) await action.run(this.#c, client, input);
      });
    });
    await scheduler.run();
  }

  /** Takes drain steps until no drain action is enabled or the most steps ran. */
  async #drain(): Promise<void> {
    const drains = this.#machine.actions.filter((action) => action.drain === true);
    for (let count = 0; ; count += 1) {
      this.#at({ part: "drain", position: count });
      const available = count < this.#config.max ? this.#available(drains) : [];
      if (this.#trace !== undefined) this.#followDrain(this.#trace, available);
      if (available.length === 0) return;
      await this.#take(
        this.#on((e) => e.choices.length),
        available,
        "drain",
        count,
      );
    }
  }

  /**
   * Takes the step at position of part, sequential or drain, on client 0, of
   * the action of listed that the case's index chooses: a span labelled with
   * the action's name from start, which records the step, requests its input
   * and runs it, and then the check and the invariant.
   */
  async #take(
    start: number,
    listed: readonly Action<S>[],
    part: "sequential" | "drain",
    position: number,
  ): Promise<void> {
    const action = listed[this.#index(listed)] as Action<S>;
    this.#at({ part, position, action: action.name });
    const step: Step =
      part === "drain" ? { action: action.name, drain: true } : { action: action.name };
    const close = this.#on((e) => {
      const closer = e.open(action.name, start);
      e.step(step);
      return closer;
    });
    try {
      await action.run(this.#c, 0, this.#input(action));
    } finally {
      close();
    }
    this.#check();
    this.#invariant();
  }

  /** Returns the actions of listed that are enabled in every state that the last check left. It calls each enabled once per state. */
  #available(listed: readonly Action<S>[]): Action<S>[] {
    return listed.filter(
      (action) =>
        action.enabled === undefined ||
        this.#states.map((state) => action.enabled?.(state)).every(Boolean),
    );
  }

  /** Returns the case's choice of an action of listed, by weight. */
  #index(listed: readonly Action<S>[]): number {
    const weights = listed.map((action) => BigInt(Math.max(action.weight ?? 1, 1)));
    const bounds = new IntegerBounds(0n, BigInt(listed.length - 1));
    const index = this.#on((e) =>
      e.choose({
        bounds,
        draw: (source) => BigInt(draw.weighted(source, weights)),
        edge: 0n,
      }),
    );
    return Number(index);
  }

  /** Returns the case's choice of a concurrent step's client, uniform over the clients with target 0. */
  #client(): number {
    const clients = BigInt(this.#config.clients);
    const client = this.#on((e) =>
      e.choose({
        bounds: new IntegerBounds(0n, clients),
        draw: (source) => source.below(clients + 1n),
        edge: 0n,
      }),
    );
    return Number(client);
  }

  /** Returns the input that action requests from the state, and undefined for an action without input. */
  #input(action: Action<S>): unknown {
    return action.input?.(this.#c, this.#state());
  }

  /** Returns the first of the states that the last check left. */
  #state(): S {
    return this.#states[0] as S;
  }

  /** Runs the machine's invariant, when it has one. */
  #invariant(): void {
    this.#machine.invariant?.(this.#c, this.#state());
  }

  /**
   * Checks the case's history with the machine's spec, with every call in
   * one partition, and keeps the states that the order it found leaves. A
   * check that fails ends the case with its record. A machine without a spec
   * checks nothing.
   */
  #check(): void {
    const spec = this.#machine.spec;
    if (spec === undefined) return;
    const { detail, states } = whole(this.#c.history(), spec);
    if (detail.outcome !== "passed") {
      this.#c.report(
        new Failure(LINEARIZABLE, CONTRACT, fieldsOf(detail), callSite()),
        true,
      );
    }
    this.#states = states;
  }

  /** Serves the flag and the index of the trace's next entry when it is a sequential step entry, and refuses the entry past the most steps or for an action that available lacks. */
  #followSequential(
    trace: Tracing,
    available: readonly Action<S>[],
    count: number,
  ): void {
    this.#on(() => {
      const step = trace.nextStep();
      if (step === undefined || step.client !== undefined || step.drain === true)
        return;
      const index = available.findIndex((action) => action.name === step.action);
      if (count === this.#config.max || index < 0) trace.refuse();
      trace.take(1n, BigInt(index));
    });
  }

  /** Refuses the trace's next entry when it is a concurrent step entry, for a machine that runs no concurrent section. */
  #refuseConcurrent(trace: Tracing): void {
    this.#on(() => {
      const step = trace.nextStep();
      if (step?.client !== undefined && step.drain !== true) trace.refuse();
    });
  }

  /** Serves the flag, the client and the index of the trace's next entry when it is a concurrent step entry, and refuses the entry past the most steps, for a client outside the clients, or for an action that eligible lacks. */
  #followConcurrent(
    trace: Tracing,
    eligible: readonly Action<S>[],
    count: number,
  ): void {
    this.#on(() => {
      const step = trace.nextStep();
      const client = step?.client;
      if (step === undefined || client === undefined || step.drain === true) return;
      const index = eligible.findIndex((action) => action.name === step.action);
      const outside = client < 0 || client > this.#config.clients;
      if (count === this.#config.concurrent || outside || index < 0) trace.refuse();
      trace.take(1n, BigInt(client), BigInt(index));
    });
  }

  /** Serves the index of the trace's next entry when it is a drain step entry, and refuses the entry for an action that available lacks, which is every action once the drain has ended. */
  #followDrain(trace: Tracing, available: readonly Action<S>[]): void {
    this.#on(() => {
      const step = trace.nextStep();
      if (step?.drain !== true) return;
      const index = available.findIndex((action) => action.name === step.action);
      if (index < 0) trace.refuse();
      trace.take(BigInt(index));
    });
  }
}
