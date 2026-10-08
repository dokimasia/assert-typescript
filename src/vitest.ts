/**
 * The Vitest adapter: a `seat` supplied per test.
 *
 * ```ts
 * import { test } from "@dokimi/assert/vitest";
 * import { check, soft } from "@dokimi/assert";
 *
 * test("get", ({ seat }) => {
 *   check.isNotNil(seat, store.get(id), "get returns the stored item");
 *   soft.equal(seat, store.size, 1, "and nothing else was added");
 * });
 * ```
 *
 * The recording surface needs a place to report at the end of the test,
 * so that a failing assertion is seen without stopping the ones after it.
 * A seat has no end of test, so the fixture creates a {@link Collector}
 * and flushes it once the body is done, which fails the test with every
 * failure that the body recorded. Before the flush, the fixture runs the
 * functions that the test registered through the seat's `cleanup`, such
 * as the removal of a workspace, also after a test that failed.
 *
 * The collector's signal is the test's own, which Vitest aborts when the
 * test times out and when the run is cancelled. With
 * `DOKIMI_ASSERT_RECORD=1`, the collector writes the call record of every
 * call into the array under the key `dokimi.assert` of the test's task
 * meta, one record per element, which Vitest's JSON reporter writes for
 * each test. The reporter writes the report with `JSON.stringify`, which
 * writes a float's -0 as 0.
 *
 * Importing this module imports Vitest. The core has no runner
 * dependency, so a project on another runner constructs a
 * {@link Collector} itself and calls `flush` where its own framework ends
 * a test.
 */

import { relative, sep } from "node:path";
import { test as base } from "vitest";
import { nameTest } from "./matcher/seat.js";
import { own, write } from "./record/calls.js";
import { reading } from "./record/switch.js";
import { Collector, cleanUp } from "./seat.js";

/** A task of Vitest: its title, and the suite that contains it. */
interface Task {
  readonly name: string;
  readonly suite?: Task | undefined;
}

/**
 * Returns the path of a test: the segments of its file's path relative to
 * the working directory, the titles of its describe blocks and its own
 * title.
 */
function pathOf(file: string, task: Task): string[] {
  const titles: string[] = [];
  for (let suite = task.suite; suite?.suite !== undefined; suite = suite.suite) {
    titles.unshift(suite.name);
  }
  return [...relative(process.cwd(), file).split(sep), ...titles, task.name];
}

/** The key of a test's task meta under which the call records of the test are. */
export const RECORDS = "dokimi.assert";

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
  seat: async ({ task, signal }, use) => {
    const collector = new Collector().withSignal(signal);
    nameTest(collector, pathOf(task.file.filepath, task));
    const read = reading();
    if ("on" in read && read.on) {
      const records: unknown[] = [];
      (task.meta as Record<string, unknown>)[RECORDS] = records;
      write(own(collector), (_seq, line) => {
        records.push(JSON.parse(line));
      });
    }
    await use(collector);
    cleanUp(collector);
    collector.flush();
  },
});

export { Collector, Recorder, Standard } from "./seat.js";
