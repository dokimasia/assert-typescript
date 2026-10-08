/**
 * The options of a check of linearizability: its limits, and its workers.
 */

/** The steps that the search of one partition may spend when no option states them. */
export const BUDGET = 10_000_000;

/** The bits that the memo of one partition may count when no option states them: 2^33, which is 1 GiB. */
export const MEMO_LIMIT = 2 ** 33;

/** What the options of one check state. */
export interface Config {
  /** The steps that one partition's search may spend. */
  readonly budget: number;
  /** The bits that one partition's memo may count. */
  readonly memoLimit: number;
  /** The milliseconds that the check may take, and 0 for no limit. */
  readonly timeLimit: number;
}

/** An option of a check of linearizability. A later option overrides an earlier one of the same setting. */
export interface Option {
  /** Returns the settings with the option's setting applied. */
  readonly set: (config: Config) => Config;
}

/** Throws a RangeError for a value that is no integer of least or more. */
function atLeast(call: string, value: number, least: number): void {
  if (!Number.isSafeInteger(value) || value < least) {
    throw new RangeError(
      `history: ${call}(${value}) is no integer of ${least} or more`,
    );
  }
}

/**
 * Returns the option that sets the steps that the search of one partition
 * may spend, 10,000,000 by default. A step is one call of the spec's next,
 * and a step of a spec that specFrom returns counts for the calls that it
 * applies. The search takes no step that would pass the budget, and ends as
 * undecided at the limit steps.
 *
 * @param steps - The steps.
 * @returns The option.
 * @throws RangeError for steps that are no integer of 1 or more.
 */
export function budget(steps: number): Option {
  atLeast("budget", steps, 1);
  return { set: (config) => ({ ...config, budget: steps }) };
}

/**
 * Returns the option that sets the bits that the memo of one partition's
 * search may count, 2^33 by default, which is 1 GiB. Each configuration in
 * the memo counts one bit for each call of the partition. The search stores
 * no configuration that would pass the limit, and ends as undecided at the
 * limit memo.
 *
 * @param bits - The bits.
 * @returns The option.
 * @throws RangeError for bits that are no integer of 1 or more.
 */
export function memoLimit(bits: number): Option {
  atLeast("memoLimit", bits, 1);
  return { set: (config) => ({ ...config, memoLimit: bits }) };
}

/**
 * Returns the option that sets the milliseconds that the whole check may
 * take, measured on the platform clock and not on the seat's. A time of 0,
 * the default, sets no limit. The search reads the clock before its first
 * step and every 1,024 steps after it, and once the time has passed it ends
 * as undecided at the limit time. A time limit makes the outcome depend on
 * the machine.
 *
 * @param ms - The milliseconds.
 * @returns The option.
 * @throws RangeError for a time that is no integer of 0 or more.
 */
export function timeLimit(ms: number): Option {
  atLeast("timeLimit", ms, 0);
  return { set: (config) => ({ ...config, timeLimit: ms }) };
}

/**
 * Returns the option that sets the number of partitions searched at once, 1
 * by default. The runtime runs one thread, so the check searches one
 * partition at a time whatever the number, and reports what a check on one
 * worker reports.
 *
 * @param n - The number of workers.
 * @returns The option.
 * @throws RangeError for a number that is no integer of 1 or more.
 */
export function workers(n: number): Option {
  atLeast("workers", n, 1);
  return { set: (config) => config };
}

/**
 * Returns the settings of a check: the defaults, with each option applied in
 * order.
 *
 * @param options - The options.
 * @returns The settings.
 */
export function configure(options: readonly Option[]): Config {
  let config: Config = { budget: BUDGET, memoLimit: MEMO_LIMIT, timeLimit: 0 };
  for (const option of options) config = option.set(config);
  return config;
}
