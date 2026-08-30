/**
 * Performance ceilings, stated as a contract a benchmark must meet.
 *
 * A benchmark that only prints numbers tells you what happened; a
 * ceiling tells you whether it was acceptable. State the ceiling once
 * and the run fails when it is crossed, the same way any other
 * assertion does.
 *
 * ```ts
 * const contract = new Contract(seat, "Get stays quick")
 *   .maxLatency(2)
 *   .maxMean(1);
 *
 * await contract.loop(10_000, () => store.get(id));
 * contract.check();
 * ```
 *
 * The standard also states ceilings on allocations and on bytes
 * allocated per iteration. Neither is implemented here, and the
 * overlay in the standard's repository records why: V8 exposes no
 * per-iteration allocation counter, and a heap-usage delta moves with
 * whether the collector happened to run. Measuring the same body six
 * times gave 43, -3, 43, -10, -10 and -8 bytes per iteration, so a
 * ceiling set from one run would fail the next for no reason.
 */

import { Mode, report, type Seat } from "./matcher/seat.js";

/** How many samples a p99 needs before it means anything. */
const P99_MINIMUM = 100;

/** What one run of the body cost. */
interface Measurement {
  /** How many times the body ran. */
  readonly iterations: number;
  /** Every sample, in milliseconds, sorted. */
  readonly latencies: readonly number[];
}

/**
 * A set of ceilings, and the run that has to meet them.
 *
 * Every ceiling method answers the contract, so they chain. Nothing is
 * asserted until {@link Contract.check} runs.
 */
export class Contract {
  readonly #seat: Seat;
  readonly #msg: string;
  #maxLatency: number | undefined;
  #maxMean: number | undefined;
  #measurement: Measurement | undefined;

  /**
   * Return a contract that states no ceilings yet.
   *
   * @param seat Where a crossed ceiling is reported.
   * @param msg The contract under test.
   */
  constructor(seat: Seat, msg: string) {
    this.#seat = seat;
    this.#msg = msg;
  }

  /**
   * State the highest acceptable p99 latency per iteration.
   *
   * The p99 rather than the mean, because the tail is what a caller
   * waits for. With fewer than a hundred iterations it is the slowest
   * one.
   *
   * @param ms The ceiling, in milliseconds.
   * @returns The contract, so ceilings can be chained.
   */
  maxLatency(ms: number): this {
    this.#maxLatency = ms;
    return this;
  }

  /**
   * State the highest acceptable mean latency per iteration.
   *
   * Use it beside {@link Contract.maxLatency} rather than instead of
   * it: a mean that holds while the tail grows is the regression a
   * mean alone misses.
   *
   * @param ms The ceiling, in milliseconds.
   * @returns The contract, so ceilings can be chained.
   */
  maxMean(ms: number): this {
    this.#maxMean = ms;
    return this;
  }

  /**
   * Run the body the given number of times, timing each.
   *
   * @param iterations How many times to run the body.
   * @param body The work to measure, awaited if it answers a promise.
   * @returns The contract, so the call chains into check.
   */
  async loop(iterations: number, body: () => unknown): Promise<this> {
    const latencies: number[] = [];
    for (let i = 0; i < iterations; i += 1) {
      const started = performance.now();
      await body();
      latencies.push(performance.now() - started);
    }
    latencies.sort((a, b) => a - b);
    this.#measurement = { iterations, latencies };
    return this;
  }

  /** Report every ceiling the run crossed. */
  check(): void {
    this.#seat.helper();
    const run = this.#measurement;
    if (run === undefined) {
      report(this.#seat, Mode.Fatal, `${this.#msg}: nothing was measured`);
      return;
    }

    const mean =
      run.latencies.reduce((total, ms) => total + ms, 0) / run.latencies.length;
    const p99 = percentile(run.latencies, 99);

    if (this.#maxLatency !== undefined && p99 > this.#maxLatency) {
      report(
        this.#seat,
        Mode.Fatal,
        `${this.#msg}: p99 was ${p99.toFixed(3)}ms, want at most ` +
          `${this.#maxLatency}ms over ${run.iterations} iterations`,
      );
    }
    if (this.#maxMean !== undefined && mean > this.#maxMean) {
      report(
        this.#seat,
        Mode.Fatal,
        `${this.#msg}: mean was ${mean.toFixed(3)}ms, want at most ` +
          `${this.#maxMean}ms over ${run.iterations} iterations`,
      );
    }
  }
}

/**
 * Answer the given percentile of a sorted list of samples.
 *
 * Below {@link P99_MINIMUM} samples a percentile is the slowest one:
 * with ten samples the 99th is the tenth, and calling that a p99 would
 * dress a single reading up as a distribution.
 */
function percentile(sorted: readonly number[], nth: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length < P99_MINIMUM) return sorted[sorted.length - 1] as number;

  const at = Math.ceil((nth / 100) * sorted.length) - 1;
  return sorted[Math.min(at, sorted.length - 1)] as number;
}
