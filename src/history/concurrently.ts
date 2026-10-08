/**
 * Running the clients of a history together.
 */

/** The longest time that a timer of the platform waits: 2^31 − 1 milliseconds. */
const LONGEST = 2 ** 31 - 1;

/** What one client of {@link concurrently} did. */
export interface Outcome {
  /** The client's number, from 0. */
  readonly client: number;
  /** Whether the client's body settled before the time of concurrently passed. */
  readonly finished: boolean;
  /** What the body returned, or what its promise fulfilled with, when it finished. */
  readonly output: unknown;
}

/**
 * Starts clients copies of body, the i-th with client number i, from 0. It
 * releases them together through one promise once it has started every
 * copy, and waits until every body has settled or within milliseconds have
 * passed on the platform clock. It returns one outcome per client, in client
 * order.
 *
 * A body may return a promise, which concurrently awaits. A body that is
 * still running when within passes has an outcome that is not finished, and
 * a call that it opened in a history is pending there.
 *
 * @param clients - The number of clients, 1 or more.
 * @param within - The milliseconds to wait, from 0 to 2^31 − 1.
 * @param body - The body of one client.
 * @returns A promise of the outcomes. It rejects, once the wait is over,
 *   with the error of the lowest-numbered client whose body threw or
 *   rejected before then. An error after the wait is lost.
 * @throws RangeError for fewer than one client, and for a time outside 0 to
 *   2^31 − 1 milliseconds.
 */
export async function concurrently(
  clients: number,
  within: number,
  body: (client: number) => unknown,
): Promise<readonly Outcome[]> {
  if (!Number.isSafeInteger(clients) || clients < 1) {
    throw new RangeError(
      `history: concurrently(${clients}, ${within}) starts no client`,
    );
  }
  if (!(within >= 0 && within <= LONGEST)) {
    throw new RangeError(
      `history: concurrently(${clients}, ${within}) waits no time from 0 to ${LONGEST} ms`,
    );
  }
  const { promise: released, resolve: release } = Promise.withResolvers<void>();
  const outcomes: Outcome[] = Array.from({ length: clients }, (_, client) => ({
    client,
    finished: false,
    output: undefined,
  }));
  const raised: { readonly error: unknown }[] = [];
  const runs = outcomes.map(({ client }) =>
    released
      .then(() => body(client))
      .then(
        (output) => {
          outcomes[client] = { client, finished: true, output };
        },
        (error: unknown) => {
          outcomes[client] = { client, finished: true, output: undefined };
          raised[client] = { error };
        },
      ),
  );
  release();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, within);
  });
  await Promise.race([Promise.all(runs), waited]);
  clearTimeout(timer);
  const first = raised.find((one) => one !== undefined);
  if (first !== undefined) throw first.error;
  return [...outcomes];
}
