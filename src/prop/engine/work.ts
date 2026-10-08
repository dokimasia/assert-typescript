/**
 * Work that may wait on a promise.
 *
 * A body may return a promise, and the engine waits on it. Work is a
 * generator that yields each promise that it waits on and receives what the
 * promise resolves to, or the error it rejects with at the yield. drive runs
 * work to its end and waits on each promise. Work that yields nothing runs
 * to its end in one step, so a run whose body returns no promise waits on
 * nothing.
 */

/** Work that yields each promise that it waits on, and returns T. */
export type Work<T> = Generator<PromiseLike<unknown>, T, unknown>;

/**
 * Runs work to its end, and waits on each promise that it yields.
 *
 * @param work - The work.
 * @returns What the work returns.
 * @throws What the work throws.
 */
export async function drive<T>(work: Work<T>): Promise<T> {
  let step = work.next();
  while (step.done !== true) {
    let settled: { readonly value: unknown } | { readonly error: unknown };
    try {
      settled = { value: await step.value };
    } catch (error) {
      settled = { error };
    }
    step = "error" in settled ? work.throw(settled.error) : work.next(settled.value);
  }
  return step.value;
}

/**
 * Returns a value that is a promise as one, and undefined for any other
 * value. A body's result is waited on only when it is a promise.
 *
 * @param value - What a body returned.
 * @returns The promise, or undefined.
 */
export function pending(value: unknown): PromiseLike<unknown> | undefined {
  const then = (value as { then?: unknown } | null | undefined)?.then;
  return typeof then === "function" ? (value as PromiseLike<unknown>) : undefined;
}
