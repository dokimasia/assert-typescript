/**
 * The options of a run of steps.
 */

import { Scheduler } from "./scheduler.js";

/** What the options of one run of steps state. */
export interface Config {
  /** The mean number of sequential steps. */
  readonly mean: number;
  /** The most sequential steps, and the most steps of the drain. */
  readonly max: number;
  /** Whether a case first chooses the actions that it keeps. */
  readonly swarm: boolean;
  /** The clients of the concurrent section besides client 0. */
  readonly clients: number;
  /** The most steps of a concurrent section. */
  readonly concurrent: number;
  /** The scheduler whose tasks run the clients of a concurrent section. */
  readonly scheduler: Scheduler | undefined;
}

/** An option of steps. A later option overrides an earlier one of the same setting. */
export interface Option {
  /** Returns the settings with the option's setting applied. */
  readonly set: (config: Config) => Config;
}

/** The settings of a run that no option states, which the definition fixes. */
const DEFAULTS: Config = {
  mean: 30,
  max: 100,
  swarm: true,
  clients: 1,
  concurrent: 16,
  scheduler: undefined,
};

/** Throws a RangeError for an n that is no integer of least or more. */
function atLeast(call: string, n: number, least: number): void {
  if (!Number.isSafeInteger(n) || n < least) {
    throw new RangeError(`stateful: ${call}(${n}) is no integer of ${least} or more`);
  }
}

/**
 * Returns the option that sets the mean number of sequential steps of a
 * case, 30 by default.
 *
 * @param n - The mean.
 * @returns The option.
 * @throws RangeError for an n that is no integer of 0 or more.
 */
export function mean(n: number): Option {
  atLeast("mean", n, 0);
  return { set: (config) => ({ ...config, mean: n }) };
}

/**
 * Returns the option that sets the most sequential steps of a case, and the
 * most steps of its drain, 100 by default.
 *
 * @param n - The most steps.
 * @returns The option.
 * @throws RangeError for an n that is no integer of 0 or more.
 */
export function max(n: number): Option {
  atLeast("max", n, 0);
  return { set: (config) => ({ ...config, max: n }) };
}

/**
 * Returns the option that sets whether a case first chooses the actions
 * that it keeps, on by default. Off, a case keeps every action.
 *
 * @param on - Whether the case chooses.
 * @returns The option.
 */
export function swarm(on: boolean): Option {
  return { set: (config) => ({ ...config, swarm: on }) };
}

/**
 * Returns the option that sets the clients of the concurrent section besides
 * client 0, 1 by default. A section runs for n of 2 or more, on the clients
 * 0 to n, and the clients 1 to n run as tasks of the scheduler of
 * {@link tasks}, which such a run requires.
 *
 * @param n - The clients.
 * @returns The option.
 * @throws RangeError for an n that is no integer of 1 or more.
 */
export function clients(n: number): Option {
  atLeast("clients", n, 1);
  return { set: (config) => ({ ...config, clients: n }) };
}

/**
 * Returns the option that sets the most steps of a concurrent section, 16 by
 * default.
 *
 * @param n - The most steps.
 * @returns The option.
 * @throws RangeError for an n that is no integer of 0 or more.
 */
export function concurrent(n: number): Option {
  atLeast("concurrent", n, 0);
  return { set: (config) => ({ ...config, concurrent: n }) };
}

/**
 * Returns the option that makes the clients of a concurrent section run as
 * tasks of scheduler, whose releases are choices of the case, so a race
 * replays and shrinks.
 *
 * @param scheduler - The scheduler.
 * @returns The option.
 * @throws TypeError for a scheduler that is no Scheduler.
 */
export function tasks(scheduler: Scheduler): Option {
  if (!(scheduler instanceof Scheduler)) {
    throw new TypeError("stateful: tasks() states no Scheduler");
  }
  return { set: (config) => ({ ...config, scheduler }) };
}

/**
 * Returns the settings of a run: the defaults, with each option applied in
 * order.
 *
 * @param options - The options.
 * @returns The settings.
 */
export function configure(options: readonly Option[]): Config {
  let config = DEFAULTS;
  for (const option of options) config = option.set(config);
  return config;
}
