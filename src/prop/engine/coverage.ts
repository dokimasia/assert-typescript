/**
 * The coverage test: whether a label covers a required share of the cases.
 *
 * A requirement is decided with the Wilson score interval of the label's
 * share, with the constants of QuickCheck's checkCoverage: a certainty of
 * 10^9 and a tolerance of 0.9. The runner checks every requirement after
 * `cases` valid cases and again each time that count doubles, up to the
 * last check. The test uses only arithmetic and a square root, which IEEE
 * 754 rounds exactly, so every language decides the same way from the same
 * counts when it evaluates bound in the order written.
 */

/** The standard normal quantile at 1 − 5e-10: a certainty of 10^9, split between the two tails. */
const Z = 6.109410191663286;

/** A requirement is met when the lower bound is at least this fraction of the required share. */
const TOLERANCE = 0.9;

/** The checks, as multiples of `cases` valid cases. The last is the last check of the run. */
export const CHECKS = [1, 2, 4, 8] as const;

/** What a check decides about one requirement. */
export type Verdict = "met" | "refuted" | "undecided" | "unmet";

/**
 * Returns the Wilson score bound of k successes in n trials at quantile z:
 * the upper bound for a positive z and the lower one for a negative z.
 *
 * @param k - The successes, from 0 to n.
 * @param n - The trials, at least 1.
 * @param z - The quantile.
 * @returns The bound.
 */
function bound(k: number, n: number, z: number): number {
  const p = k / n;
  const a = (z * z) / n;
  const centre = p + a / 2;
  const spread = z * Math.sqrt((p * (1 - p)) / n + a / (4 * n));
  return (centre + spread) / (1 + a);
}

/**
 * Returns the verdict on one requirement at one check. exact marks a run
 * that tested every input of its domain, whose shares are exact. An exact
 * share, and an undecided share at the last check, are met when k / n is at
 * least 0.9 times the share, and unmet otherwise.
 *
 * @param k - The valid cases that the label counted.
 * @param n - The valid cases, at least 1.
 * @param share - The required share.
 * @param last - Whether the check is the last of the run.
 * @param exact - Whether the run tested every input of its domain.
 * @returns The verdict.
 * @throws RangeError for an n below 1 or a k outside [0, n].
 */
export function verdict(
  k: number,
  n: number,
  share: number,
  last: boolean,
  exact: boolean,
): Verdict {
  if (n < 1 || k < 0 || k > n) throw new RangeError(`prop: ${k} of ${n} is no share`);
  if (!exact) {
    if (bound(k, n, -Z) >= TOLERANCE * share) return "met";
    if (bound(k, n, Z) < share) return "refuted";
    if (!last) return "undecided";
  }
  return k / n >= TOLERANCE * share ? "met" : "unmet";
}
