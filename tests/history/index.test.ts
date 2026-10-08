/** The spec of the public module history. */

import { describe } from "vitest";
import { Failure, render } from "../../src/failure.js";
import * as history from "../../src/history/index.js";
import { isolationSentence, sentence } from "../../src/history/sentence.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

describe("index", () => {
  it("exports the names of the module", ({ seat }) => {
    check.equal(
      seat,
      Object.keys(history).sort(),
      [
        "Call",
        "History",
        "budget",
        "concurrently",
        "fromIntervals",
        "hasSnapshotIsolation",
        "isLinearizable",
        "isSerializable",
        "memoLimit",
        "specFrom",
        "timeLimit",
        "workers",
      ],
      "the module exports these names",
    );
  });

  it("makes the sentence of a check the sentence of each record of the module", ({
    seat,
  }) => {
    const linearizable = new Failure("linearizable", "c", {
      outcome: "violated",
      partitions: 1,
      steps: 1,
      partition: [],
      calls: 0,
      concurrency: 0,
      linearized: [],
      states: [],
      candidates: [],
      limit: null,
    });
    const isolated = ["serializable", "snapshot-isolation"].map(
      (id) =>
        new Failure(id, "c", {
          anomaly: "G2",
          kinds: ["G2"],
          transactions: [],
          cycle: [],
          explanation: [],
        }),
    );

    check.equal(
      seat,
      [render(linearizable), ...isolated.map(render)],
      [sentence(linearizable), ...isolated.map(isolationSentence)],
      "the registered sentences",
    );
  });
});
