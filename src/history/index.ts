/**
 * Histories: the calls that concurrent clients make to an object, and the
 * checks that a recorded history is linearizable, serializable or has
 * snapshot isolation. A history is linearizable when its calls have an
 * order that respects their real-time order and that the object's
 * sequential specification accepts.
 *
 * A test records each call through a {@link History}: {@link History.invoke}
 * before the call to the subject starts, and {@link Call.ok},
 * {@link Call.fail} or {@link Call.unknown} after it returns.
 * {@link concurrently} runs the clients, and {@link isLinearizable} checks
 * the history against a {@link Spec}:
 *
 * ```ts
 * test("the register is linearizable", async ({ seat }) => {
 *   const h = new history.History();
 *   const reg = new Register();
 *   await history.concurrently(2, 60_000, async (client) => {
 *     for (let i = 0; i < 50; i += 1) {
 *       const write = h.invoke(client, "write", [client * 1000 + i], "x");
 *       await reg.write(client * 1000 + i);
 *       write.ok(null);
 *       const read = h.invoke(client, "read", [], "x");
 *       read.ok(await reg.read());
 *     }
 *   });
 *   history.isLinearizable(seat, h, {
 *     initial: () => 0,
 *     next: (s: number, op) => {
 *       if (op.name === "write") return [op.args[0] as number];
 *       return op.returned(s) ? [s] : [];
 *     },
 *   }, "the register is linearizable");
 * });
 * ```
 *
 * The definition fixes the recording order, the processes, the partitions,
 * the search, its budget and its record, so one history gives the same
 * verdict and the same record in every implementation of the definition.
 * {@link specFrom} builds the spec from the subject itself, which checks that
 * the calls were atomic. {@link isSerializable} and
 * {@link hasSnapshotIsolation} read each call of the operation "txn" as a
 * transaction of list appends and list reads.
 */

import { registerSentence } from "../failure.js";
import { SERIALIZABLE, SNAPSHOT_ISOLATION } from "./isolation.js";
import { LINEARIZABLE } from "./linearizable.js";
import { isolationSentence, sentence } from "./sentence.js";

registerSentence(sentence, LINEARIZABLE);
registerSentence(isolationSentence, SERIALIZABLE, SNAPSHOT_ISOLATION);

export { concurrently, type Outcome } from "./concurrently.js";
export type { Edge, Evidence, Link, Observation } from "./derivation.js";
export type { Completion, Event, Invocation, Kind } from "./event.js";
export { Call, History } from "./history.js";
export { fromIntervals, type Interval } from "./interval.js";
export { hasSnapshotIsolation, isSerializable } from "./isolation.js";
export { isLinearizable } from "./linearizable.js";
export { budget, memoLimit, type Option, timeLimit, workers } from "./option.js";
export type { Span } from "./partition.js";
export { type Operation, type Spec, specFrom } from "./spec.js";
export type { Transaction } from "./transaction.js";
