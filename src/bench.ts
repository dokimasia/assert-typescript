/**
 * Performance ceilings, stated as a contract that a benchmark must meet.
 *
 * A benchmark that only prints numbers states what happened. A ceiling
 * states whether that was acceptable. State the ceiling once, and the run
 * fails when it crosses the ceiling, as any other assertion fails.
 *
 * ```ts
 * const contract = new Contract(seat, "a get is quick")
 *   .warmup(1_000)
 *   .maxLatency(2)
 *   .maxMean(1);
 *
 * await contract.loop(10_000, () => store.get(id));
 * contract.check();
 * ```
 *
 * A contract reads time from the clock of its seat, and from the platform
 * clock for a seat without one.
 *
 * The standard also states ceilings on allocations and on bytes allocated
 * per iteration. Neither is implemented here, and the overlay in the
 * standard's repository records why: V8 exposes no per-iteration
 * allocation counter, and a delta of the heap's usage moves with whether
 * the collector happened to run. Measuring the same body six times gave
 * 43, -3, 43, -10, -10 and -8 bytes per iteration, so a ceiling set from
 * one run would fail the next for no reason.
 */

import { clockOf, Mode, type Seat } from "./matcher/seat.js";
import { end, fail, pass } from "./matcher/verdict.js";

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
 * Every ceiling method returns the contract, so they chain. Nothing is
 * asserted until {@link Contract.check} runs.
 */
export class Contract {
  readonly #seat: Seat;
  readonly #msg: string;
  #warmup = 0;
  #ran = false;
  #maxLatency: number | undefined;
  #maxMean: number | undefined;
  #measurement: Measurement | undefined;

  /**
   * Returns a contract that states no ceilings yet.
   *
   * @param seat Where a crossed ceiling is reported, and where the
   *   contract reads time.
   * @param msg The contract under test.
   */
  constructor(seat: Seat, msg: string) {
    this.#seat = seat;
    this.#msg = msg;
  }

  /**
   * States iterations that `loop` and `measuring` run before the measured
   * ones. No ceiling covers them, and the default is 0. A warm-up runs the
   * whole body, and in `measuring` the setup of each warm-up iteration too.
   *
   * @param iterations How many iterations to run untimed.
   * @returns The contract, so the call chains.
   * @throws RangeError when iterations is not a whole number of 0 or more,
   *   or when the contract has already run its body.
   */
  warmup(iterations: number): this {
    if (!Number.isInteger(iterations) || iterations < 0) {
      throw new RangeError(
        `bench: warmup(${iterations}) states no whole number of 0 or more`,
      );
    }
    if (this.#ran)
      throw new RangeError("bench: warmup after the contract has run its body");
    this.#warmup = iterations;
    return this;
  }

  /**
   * States the highest acceptable p99 latency per iteration.
   *
   * The p99 rather than the mean, because the tail is what a caller waits
   * for. With fewer than a hundred iterations it is the slowest one.
   *
   * @param ms The ceiling, in milliseconds.
   * @returns The contract, so ceilings can be chained.
   */
  maxLatency(ms: number): this {
    this.#maxLatency = ms;
    return this;
  }

  /**
   * States the highest acceptable mean latency per iteration.
   *
   * Use it beside {@link Contract.maxLatency} rather than instead of it: a
   * mean within its ceiling while the tail grows is the regression that a
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
   * Measures a body whose input is built fresh each iteration.
   *
   * A benchmark whose operation consumes its input builds a new one every
   * time, and {@link Contract.loop} would measure the build and the
   * operation together. This builds every input first, outside the
   * measurement, and measures only the bodies. A warm-up iteration builds
   * and consumes one input before the measured inputs are built.
   *
   * Every measured input exists at once, so a large fixture and a long run
   * cost that much memory. A body that needs no input wants
   * {@link Contract.loop}, which keeps nothing.
   *
   * @param iterations How many times to run the measured body.
   * @param setup Builds one input, outside the measurement.
   * @param body The measured work, given what setup built.
   * @returns The contract, so the call chains into check.
   */
  async measuring<T>(
    iterations: number,
    setup: () => T | Promise<T>,
    body: (input: T) => unknown,
  ): Promise<this> {
    this.#ran = true;
    for (let i = 0; i < this.#warmup; i += 1) {
      await body(await setup());
    }
    // Built first and all at once, so no clock is read between one
    // iteration's setup and the next iteration's work.
    const inputs: T[] = [];
    for (let i = 0; i < iterations; i += 1) {
      inputs.push(await setup());
    }

    const clock = clockOf(this.#seat);
    const latencies: number[] = [];
    for (const input of inputs) {
      const started = clock.now();
      await body(input);
      latencies.push(clock.now() - started);
    }
    latencies.sort((a, b) => a - b);
    this.#measurement = { iterations, latencies };
    return this;
  }

  /**
   * Runs the body the given number of times, timing each, after the
   * warm-up iterations.
   *
   * @param iterations How many times to run the measured body.
   * @param body The work to measure, awaited when it returns a promise.
   * @returns The contract, so the call chains into check.
   */
  async loop(iterations: number, body: () => unknown): Promise<this> {
    this.#ran = true;
    for (let i = 0; i < this.#warmup; i += 1) {
      await body();
    }
    const clock = clockOf(this.#seat);
    const latencies: number[] = [];
    for (let i = 0; i < iterations; i += 1) {
      const started = clock.now();
      await body();
      latencies.push(clock.now() - started);
    }
    latencies.sort((a, b) => a - b);
    this.#measurement = { iterations, latencies };
    return this;
  }

  /**
   * Reports every ceiling that the run crossed, one call of each ceiling's
   * assertion. A contract that has measured nothing, or a run of no
   * iteration, states no verdict, and ends the test through the seat's
   * `fail`.
   */
  check(): void {
    this.#seat.helper();
    const run = this.#measurement;
    if (run === undefined || run.iterations === 0) {
      end(this.#seat, new Error(`${this.#msg}: nothing was measured`));
      return;
    }

    const mean =
      run.latencies.reduce((total, ms) => total + ms, 0) / run.latencies.length;
    const p99 = percentile(run.latencies, 99);

    if (this.#maxLatency !== undefined) {
      this.#ceiling("bench-max-latency", this.#maxLatency, p99);
    }
    if (this.#maxMean !== undefined) {
      this.#ceiling("bench-max-mean", this.#maxMean, mean);
    }
  }

  /** Reports one ceiling: a failure when the measured value crossed it, and a pass otherwise. */
  #ceiling(assertion: string, want: number, measured: number): void {
    if (measured > want) {
      fail(this.#seat, Mode.Fatal, assertion, this.#msg, {
        want,
        got: Number(measured.toFixed(3)),
      });
      return;
    }
    pass(this.#seat, Mode.Fatal, assertion, this.#msg);
  }
}

/**
 * Returns the given percentile of a sorted list of one sample or more.
 *
 * Below {@link P99_MINIMUM} samples a percentile is the slowest one: with
 * ten samples the 99th is the tenth, and a p99 of ten samples is a single
 * reading.
 */
function percentile(sorted: readonly number[], nth: number): number {
  if (sorted.length < P99_MINIMUM) return sorted[sorted.length - 1] as number;

  const at = Math.ceil((nth / 100) * sorted.length) - 1;
  return sorted[Math.min(at, sorted.length - 1)] as number;
}
