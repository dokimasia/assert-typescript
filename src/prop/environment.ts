/**
 * The environment variables that set the defaults of every property of a
 * test run, which a hermetic run does not read. An unset variable and an
 * empty one state nothing.
 *
 * - DOKIMI_ASSERT_PROP_SEED states the seed, in decimal, of every run that
 *   the seed option does not seed.
 * - DOKIMI_ASSERT_PROP_PROFILE names the profile: `default` draws a random
 *   seed for each run, `ci` derives each run's seed from its contract, and
 *   `campaign` runs each property as a campaign.
 * - DOKIMI_ASSERT_PROP_BUDGET states how long a campaign runs, in whole
 *   seconds.
 * - DOKIMI_ASSERT_PROP_REPLAY states the token that every run replays when
 *   the replay option states none.
 *
 * A process of a mutation run, whose environment contains
 * DOKIMI_MUTATE_MUTANT, derives every seed from the contract, runs no
 * campaign and writes no store entry.
 */

import { randomBytes } from "node:crypto";
import { Fault } from "../matcher/fault.js";
import { mix } from "./engine/source.js";

/** The variables of the engine. */
export const SEED_VARIABLE = "DOKIMI_ASSERT_PROP_SEED";
export const PROFILE_VARIABLE = "DOKIMI_ASSERT_PROP_PROFILE";
export const BUDGET_VARIABLE = "DOKIMI_ASSERT_PROP_BUDGET";
export const REPLAY_VARIABLE = "DOKIMI_ASSERT_PROP_REPLAY";

/** The variable that a mutation run sets in every process that it instruments. */
const MUTANT_VARIABLE = "DOKIMI_MUTATE_MUTANT";

/** The largest budget, in seconds: 2^33 − 1, as for every other language. */
const MAX_BUDGET = 2 ** 33 - 1;

/** The largest seed: every seed is an unsigned 64-bit integer. */
const SEED_LIMIT = 2n ** 64n;

/** A set of defaults for a whole test run. */
export type Profile = "default" | "ci" | "campaign";

/** Returns the value of a variable, or undefined for an unset or empty one. */
function variable(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

/**
 * Reports whether this process runs under a mutation run.
 *
 * @returns True when the environment contains DOKIMI_MUTATE_MUTANT.
 */
export function mutated(): boolean {
  return process.env[MUTANT_VARIABLE] !== undefined;
}

/**
 * Returns the profile that the environment names.
 *
 * @returns The profile.
 * @throws Fault at the variable for a name other than default, ci and campaign.
 */
export function profileOf(): Profile {
  const name = variable(PROFILE_VARIABLE) ?? "default";
  if (name === "default" || name === "ci" || name === "campaign") return name;
  throw new Fault(
    PROFILE_VARIABLE,
    `${JSON.stringify(name)} names none of the default, ci and campaign profiles`,
  );
}

/**
 * Returns the seed of a run of contract: the stated seed; then, unless the
 * run is hermetic, the one that DOKIMI_ASSERT_PROP_SEED states; then the
 * mix of the contract in a process of a mutation run, and under the ci
 * profile unless the run is hermetic; and otherwise a random seed. A run
 * that is not hermetic checks the profile first, so a misspelled profile
 * fails every such run.
 *
 * @param contract - The property's contract.
 * @param stated - The seed that the seed option states, or undefined.
 * @param hermetic - Whether the run reads none of the variables.
 * @returns The seed.
 * @throws Fault at the variable for a profile other than default, ci and
 *   campaign, and for a seed that is no decimal number below 2^64.
 */
export function seedOf(
  contract: string,
  stated: bigint | undefined,
  hermetic: boolean,
): bigint {
  const profile = hermetic ? "default" : profileOf();
  if (stated !== undefined) return stated;
  const text = hermetic ? undefined : variable(SEED_VARIABLE);
  if (text !== undefined) {
    const seed = /^[0-9]+$/.test(text) ? BigInt(text) : SEED_LIMIT;
    if (seed >= SEED_LIMIT) {
      throw new Fault(
        SEED_VARIABLE,
        `${JSON.stringify(text)} is no decimal number below 2^64`,
      );
    }
    return seed;
  }
  if (mutated() || profile === "ci") return mix(Buffer.from(contract, "utf8"));
  return randomBytes(8).readBigUInt64LE();
}

/**
 * Returns how long a campaign runs, in milliseconds: the whole seconds that
 * DOKIMI_ASSERT_PROP_BUDGET states under the campaign profile, and 0 for a
 * run that is no campaign. A hermetic run and a run in a process of a
 * mutation run are no campaign, and read no budget. The caller has checked
 * the profile.
 *
 * @param hermetic - Whether the run reads none of the variables.
 * @returns The budget, or 0.
 * @throws Fault at the variable for a budget that is no whole number of
 *   seconds from 1 to 2^33 − 1.
 */
export function budgetOf(hermetic: boolean): number {
  if (hermetic || mutated() || profileOf() !== "campaign") return 0;
  const text = process.env[BUDGET_VARIABLE] ?? "";
  const seconds = /^[0-9]+$/.test(text) ? Number(text) : 0;
  if (seconds < 1 || seconds > MAX_BUDGET) {
    throw new Fault(
      BUDGET_VARIABLE,
      `${JSON.stringify(text)} is no whole number of seconds above 0`,
    );
  }
  return seconds * 1000;
}

/**
 * Returns the token that a run replays and where it is stated: the one that
 * the replay option states, then, unless the run is hermetic, the one that
 * DOKIMI_ASSERT_PROP_REPLAY states.
 *
 * @param stated - The token that the replay option states, or undefined.
 * @param hermetic - Whether the run reads none of the variables.
 * @returns The token and its source, or undefined for a run that replays none.
 */
export function tokenOf(
  stated: string | undefined,
  hermetic: boolean,
): { readonly token: string; readonly source: string } | undefined {
  if (stated !== undefined) return { token: stated, source: "replay" };
  const token = hermetic ? undefined : variable(REPLAY_VARIABLE);
  return token === undefined ? undefined : { token, source: REPLAY_VARIABLE };
}
