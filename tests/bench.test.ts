/**
 * The spec of the benchmark contracts.
 *
 * A contract reads time from the clock of its seat, so each case gives the
 * recorder a controlled clock and a body that advances it. The one case on
 * the platform clock sets a ceiling of 0 for a body that sleeps.
 */

import { describe } from "vitest";
import { Contract } from "../src/bench.js";
import { Controlled } from "../src/clock.js";
import { check } from "../src/index.js";
import { Recorder } from "../src/seat.js";
import { test as it } from "../src/vitest.js";
import { records, thrown } from "./helpers.js";

/** A recorder whose clock moves only when a body advances it, and that clock. */
interface Timed {
  readonly clock: Controlled;
  readonly recorder: Recorder;
}

/** Returns a recorder on a new controlled clock. */
function timed(): Timed {
  const clock = new Controlled();
  return { clock, recorder: new Recorder().withClock(clock) };
}

/** Returns the assertion and the detail of each failure that recorder received. */
function failures(recorder: Recorder): [string, unknown][] {
  return recorder.failures.map((f) => [f.assertion, f.detail]);
}

describe("bench", () => {
  describe("new Contract", () => {
    it("returns a contract whose check passes any run", async ({ seat }) => {
      const { clock, recorder } = timed();
      const contract = new Contract(recorder, "a get is measured");
      await contract.loop(5, () => clock.advance(5));
      contract.check();

      check.isFalse(
        seat,
        recorder.failed,
        "a contract without a ceiling reports nothing",
      );
    });
  });

  describe("Contract.warmup", () => {
    it("returns the contract", ({ seat }) => {
      const contract = new Contract(new Recorder(), "a get is quick");

      check.isTrue(seat, contract.warmup(1) === contract, "the warm-up chains");
    });

    it("leaves the warm-up iterations out of the measurement", async ({ seat }) => {
      const { clock, recorder } = timed();
      let first = true;
      const contract = new Contract(recorder, "a warm get is quick")
        .warmup(1)
        .maxLatency(5);
      await contract.loop(3, () => {
        clock.advance(first ? 50 : 1);
        first = false;
      });
      contract.check();

      check.isFalse(seat, recorder.failed, "the slow first iteration is not measured");
    });

    it("measures every iteration without a warm-up", async ({ seat }) => {
      const { clock, recorder } = timed();
      let first = true;
      const contract = new Contract(recorder, "a cold get is quick").maxLatency(5);
      await contract.loop(3, () => {
        clock.advance(first ? 50 : 1);
        first = false;
      });
      contract.check();

      check.equal(
        seat,
        failures(recorder),
        [["bench-max-latency", { want: 5, got: 50 }]],
        "the slow first iteration is measured",
      );
    });

    it("runs the body for each warm-up iteration and each measured one", async ({
      seat,
    }) => {
      let ran = 0;
      await new Contract(new Recorder(), "a get is quick").warmup(2).loop(3, () => {
        ran += 1;
      });

      check.equal(seat, ran, 5, "two warm-up and three measured iterations");
    });

    it("builds and consumes one input for each warm-up iteration in measuring", async ({
      seat,
    }) => {
      const events: string[] = [];
      let built = 0;
      await new Contract(new Recorder(), "a get is quick").warmup(1).measuring(
        2,
        () => {
          built += 1;
          events.push(`setup ${built}`);
          return built;
        },
        (input) => events.push(`body ${input}`),
      );

      check.equal(
        seat,
        events,
        ["setup 1", "body 1", "setup 2", "setup 3", "body 2", "body 3"],
        "the warm-up input is consumed before the measured inputs are built",
      );
    });

    const refusals = [
      { name: "throws a RangeError for a negative count", give: -1 },
      { name: "throws a RangeError for a count that is no whole number", give: 1.5 },
      { name: "throws a RangeError for NaN", give: Number.NaN },
    ];

    for (const tt of refusals) {
      it(tt.name, ({ seat }) => {
        check.equal(
          seat,
          thrown(() => new Contract(new Recorder(), "a get is quick").warmup(tt.give)),
          `bench: warmup(${tt.give}) states no whole number of 0 or more`,
          "the refusal",
        );
      });
    }

    it("throws a RangeError after loop has run the body", async ({ seat }) => {
      const contract = new Contract(new Recorder(), "a get is quick");
      await contract.loop(1, () => undefined);

      check.equal(
        seat,
        thrown(() => contract.warmup(1)),
        "bench: warmup after the contract has run its body",
        "the refusal",
      );
    });

    it("throws a RangeError after measuring has run the body", async ({ seat }) => {
      const contract = new Contract(new Recorder(), "a get is quick");
      await contract.measuring(
        1,
        () => 1,
        () => undefined,
      );

      check.equal(
        seat,
        thrown(() => contract.warmup(1)),
        "bench: warmup after the contract has run its body",
        "the refusal",
      );
    });
  });

  describe("Contract.maxLatency", () => {
    it("returns the contract", ({ seat }) => {
      const contract = new Contract(new Recorder(), "a get is quick");

      check.isTrue(seat, contract.maxLatency(1000) === contract, "the ceiling chains");
    });

    it("makes check report a p99 latency above the ceiling", async ({ seat }) => {
      const { clock, recorder } = timed();
      const contract = new Contract(recorder, "a get is quick").maxLatency(4);
      await contract.loop(2, () => clock.advance(5));
      contract.check();

      check.equal(
        seat,
        failures(recorder),
        [["bench-max-latency", { want: 4, got: 5 }]],
        "the p99 crossed 4 ms",
      );
    });

    it("makes check pass a p99 latency within the ceiling", async ({ seat }) => {
      const { clock, recorder } = timed();
      const contract = new Contract(recorder, "a get is quick").maxLatency(5);
      await contract.loop(10, () => clock.advance(5));
      contract.check();

      check.equal(
        seat,
        records(recorder).map((r) => [r["assertion"], r["verdict"]]),
        [["bench-max-latency", "pass"]],
        "the ceiling writes a pass",
      );
    });
  });

  describe("Contract.maxMean", () => {
    it("returns the contract", ({ seat }) => {
      const contract = new Contract(new Recorder(), "a get is quick");

      check.isTrue(seat, contract.maxMean(1000) === contract, "the ceiling chains");
    });

    it("makes check report a mean latency above the ceiling", async ({ seat }) => {
      const { clock, recorder } = timed();
      let ms = 0;
      const contract = new Contract(recorder, "a get is quick").maxMean(2);
      await contract.loop(2, () => {
        ms += 2;
        clock.advance(ms);
      });
      contract.check();

      check.equal(
        seat,
        failures(recorder),
        [["bench-max-mean", { want: 2, got: 3 }]],
        "the mean of 2 and 4 ms crossed 2 ms",
      );
    });

    it("makes check pass a mean latency within the ceiling", async ({ seat }) => {
      const { clock, recorder } = timed();
      const contract = new Contract(recorder, "a get is quick").maxMean(3);
      await contract.loop(10, () => clock.advance(3));
      contract.check();

      check.isFalse(seat, recorder.failed, "the mean is 3 ms");
    });
  });

  describe("Contract.measuring", () => {
    it("builds each input outside the measurement", async ({ seat }) => {
      const { clock, recorder } = timed();
      const contract = new Contract(recorder, "settling is quick").maxLatency(5);
      await contract.measuring(
        3,
        () => clock.advance(20),
        () => clock.advance(1),
      );
      contract.check();

      check.isFalse(seat, recorder.failed, "a setup of 20 ms is not measured");
    });

    it("hands the body what the setup built", async ({ seat }) => {
      const seen: number[] = [];
      await new Contract(new Recorder(), "the fixture arrives").measuring(
        3,
        () => 7,
        (input) => seen.push(input),
      );

      check.equal(seat, seen, [7, 7, 7], "each body received the input of its setup");
    });

    it("returns the contract", async ({ seat }) => {
      const contract = new Contract(new Recorder(), "the fixture arrives");
      const returned = await contract.measuring(
        1,
        () => 1,
        () => undefined,
      );

      check.isTrue(seat, returned === contract, "measuring chains into check");
    });
  });

  describe("Contract.loop", () => {
    it("runs the body as many times as asked", async ({ seat }) => {
      let ran = 0;
      await new Contract(new Recorder(), "a get is quick").loop(7, () => {
        ran += 1;
      });

      check.equal(seat, ran, 7, "the body ran seven times");
    });

    it("awaits a body that returns a promise", async ({ seat }) => {
      const { clock, recorder } = timed();
      const contract = new Contract(recorder, "a get is quick").maxLatency(4);
      await contract.loop(1, async () => {
        await Promise.resolve();
        clock.advance(5);
      });
      contract.check();

      check.equal(
        seat,
        failures(recorder).map(([assertion]) => assertion),
        ["bench-max-latency"],
        "the time after the await was measured",
      );
    });

    it("reads the platform clock for a seat without a clock", async ({ seat }) => {
      const recorder = new Recorder();
      const contract = new Contract(recorder, "a get is quick").maxLatency(0);
      await contract.loop(1, () => new Promise((resolve) => setTimeout(resolve, 5)));
      contract.check();

      check.equal(
        seat,
        failures(recorder).map(([assertion]) => assertion),
        ["bench-max-latency"],
        "the sleep was measured",
      );
    });

    it("returns the contract", async ({ seat }) => {
      const contract = new Contract(new Recorder(), "a get is quick");

      check.isTrue(
        seat,
        (await contract.loop(2, () => undefined)) === contract,
        "loop chains into check",
      );
    });
  });

  describe("Contract.check", () => {
    it("ends the call with a fault for a contract that measured nothing", ({
      seat,
    }) => {
      const recorder = new Recorder();
      new Contract(recorder, "a get is quick").maxLatency(1).check();

      check.equal(
        seat,
        [recorder.failures, recorder.message],
        [[], "a get is quick: nothing was measured"],
        "the contract faults",
      );
    });

    it("ends the call with a fault for a run of no iteration", async ({ seat }) => {
      const recorder = new Recorder();
      const contract = new Contract(recorder, "a get is quick").maxLatency(1);
      await contract.loop(0, () => undefined);
      contract.check();

      check.equal(
        seat,
        [recorder.failures, recorder.message],
        [[], "a get is quick: nothing was measured"],
        "the contract faults",
      );
    });

    it("reports the slowest sample as the p99 of fewer than 100 samples", async ({
      seat,
    }) => {
      const { clock, recorder } = timed();
      let ran = 0;
      const contract = new Contract(recorder, "a get is quick").maxLatency(2);
      await contract.loop(99, () => {
        ran += 1;
        clock.advance(ran === 99 ? 50 : 1);
      });
      contract.check();

      check.equal(
        seat,
        failures(recorder),
        [["bench-max-latency", { want: 2, got: 50 }]],
        "the slowest sample counts",
      );
    });

    it("leaves the slowest sample of 120 above the p99", async ({ seat }) => {
      const { clock, recorder } = timed();
      let ran = 0;
      const contract = new Contract(recorder, "a get is quick").maxLatency(2);
      await contract.loop(120, () => {
        ran += 1;
        clock.advance(ran === 120 ? 50 : 1);
      });
      contract.check();

      check.isFalse(seat, recorder.failed, "the p99 of 120 samples is 1 ms");
    });

    it("reports every ceiling that the run crossed", async ({ seat }) => {
      const { clock, recorder } = timed();
      const contract = new Contract(recorder, "a get is quick")
        .maxLatency(1)
        .maxMean(1);
      await contract.loop(2, () => clock.advance(2));
      contract.check();

      check.equal(
        seat,
        failures(recorder).map(([assertion]) => assertion),
        ["bench-max-latency", "bench-max-mean"],
        "both ceilings are reported",
      );
    });
  });
});
