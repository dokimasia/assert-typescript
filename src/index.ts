/**
 * Test assertions defined by a language-neutral standard.
 *
 * Two surfaces export the same assertions under the same names.
 * {@link check} stops the test at the first failure; {@link soft}
 * records the failure and lets the test continue.
 *
 * ```ts
 * import { check, soft } from "@dokimi/assert";
 *
 * test("reply", ({ seat }) => {
 *   check.equal(seat, reply.status, 200, "the request succeeds");
 *   soft.length(seat, reply.items, 3, "every item comes back");
 * });
 * ```
 *
 * Every assertion takes a seat first and a message last. The seat is
 * where a failure is reported; import the Vitest adapter from
 * `@dokimi/assert/vitest` to have one supplied, or construct one from
 * this module.
 */

export * as bench from "./bench.js";
export * as check from "./check.js";
export { type Clock, Controlled, System } from "./clock.js";
export { Failure, type Where } from "./failure.js";
export * as files from "./files/index.js";
export * as golden from "./golden.js";
export * as history from "./history/index.js";
export { byIdentity, equateEmpty, equateNans, type Option } from "./option.js";
export * as prop from "./prop/index.js";
export { rejects } from "./rejects.js";
export {
  AssertionFailed,
  type Cleanups,
  Collector,
  Recorder,
  type Seat,
  Standard,
  signalOf,
} from "./seat.js";
export * as soft from "./soft.js";
export * as stateful from "./stateful/index.js";
