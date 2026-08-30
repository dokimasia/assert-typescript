/**
 * Test assertions defined by a language-neutral standard.
 *
 * Two surfaces carry the same assertions under the same names.
 * {@link check} stops the test at the first failure; {@link soft}
 * records the failure and lets the test carry on.
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
export * as golden from "./golden.js";
export { equateEmpty, equateNans, type Option } from "./option.js";
export { rejects } from "./rejects.js";
export { AssertionFailed, Collector, Recorder, type Seat, Standard } from "./seat.js";
export * as soft from "./soft.js";
