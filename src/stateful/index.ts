/**
 * The steps of a machine inside a property's case: the sequential
 * specification of a subject, actions over it, and the task scheduler that
 * releases the tasks of a subject in an order that the case decides.
 *
 * A {@link Machine} lists its actions in order, the simpler first, and
 * states the sequential specification of the subject. {@link steps} takes
 * the steps of a case, and records every decision as a choice of the case,
 * so a failing case shrinks to the steps that the failure needs and replays
 * from its token:
 *
 * ```ts
 * await prop.forAll(seat, "the queue keeps its values in order", async (c) => {
 *   const queue = new Queue(4);
 *   await stateful.steps(c, {
 *     spec: QUEUE,
 *     actions: [
 *       {
 *         name: "put",
 *         input: (c) => c.draw(prop.integer(0, 9), "v"),
 *         run: (c, client, v) => {
 *           const call = c.history().invoke(client, "put", [v]);
 *           call.ok(queue.put(v as number));
 *         },
 *       },
 *       {
 *         name: "get",
 *         run: (c, client) => c.history().invoke(client, "get", []).ok(queue.get()),
 *       },
 *     ],
 *   });
 * });
 * ```
 *
 * A concurrent section runs its clients as tasks of a {@link Scheduler},
 * whose releases are choices of the case, so a race replays and shrinks. A
 * subject that runs as tasks calls `await scheduler.yield()` at each point
 * where another task may run.
 */

export type { Action, Machine } from "./machine.js";
export {
  clients,
  concurrent,
  max,
  mean,
  type Option,
  swarm,
  tasks,
} from "./option.js";
export { Scheduler } from "./scheduler.js";
export { steps } from "./steps.js";
export { pct, type Strategy, uniform } from "./strategy.js";
