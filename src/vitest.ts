/**
 * The Vitest adapter: a `seat` supplied per test.
 *
 * ```ts
 * import { test } from "@dokimi/assert/vitest";
 * import { check, soft } from "@dokimi/assert";
 *
 * test("get", ({ seat }) => {
 *   check.isNotNil(seat, store.get(id), "get answers the stored item");
 *   soft.equal(seat, store.size, 1, "and nothing else was added");
 * });
 * ```
 *
 * The recording surface needs someone to report at the end of the
 * test, because that is what lets a failing assertion be seen without
 * stopping the ones after it. A seat has no end of test to report at,
 * so the fixture holds a {@link Collector} and flushes it once the
 * body is done. The failure lands on the test rather than on teardown.
 *
 * Importing this module is what pulls Vitest in. The core has no
 * runner dependency, so a project on another runner constructs a
 * {@link Collector} itself and calls `flush` where its own framework
 * ends a test.
 */

import { test as base } from "vitest";
import { Collector } from "./seat.js";

/** What this adapter adds to a Vitest test's context. */
export interface SeatFixture {
  /** The seat to pass to an assertion. */
  seat: Collector;
}

/**
 * A Vitest `test` that supplies a seat.
 *
 * Everything `soft` records on the seat is thrown when the body ends,
 * so a test that records two failures reports both at once.
 */
export const test = base.extend<SeatFixture>({
  // Vitest passes the context first and `use` second, so a fixture
  // that needs no other fixture still has to destructure nothing.
  // biome-ignore lint/correctness/noEmptyPattern: required by Vitest
  seat: async ({}, use) => {
    const collector = new Collector();
    await use(collector);
    collector.flush();
  },
});

export { Collector, Recorder, Standard } from "./seat.js";
