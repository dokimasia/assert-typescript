/** The spec of the stateful module, which re-exports the machines, their steps and the task scheduler. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import * as stateful from "../../src/stateful/index.js";
import { test as it } from "../../src/vitest.js";

describe("index", () => {
  it("exports the steps, their options, the scheduler and its strategies", ({
    seat,
  }) => {
    check.equal(
      seat,
      Object.keys(stateful).sort(),
      [
        "Scheduler",
        "clients",
        "concurrent",
        "max",
        "mean",
        "pct",
        "steps",
        "swarm",
        "tasks",
        "uniform",
      ],
      "the names",
    );
  });
});
