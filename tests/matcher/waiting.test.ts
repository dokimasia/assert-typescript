/**
 * The spec of the assertions that retry, and of the one that checks that
 * nothing was left running. It uses vitest's `expect` alone, because the
 * surfaces call these assertions.
 *
 * Most cases give the seat a controlled clock, which the assertion
 * advances between attempts, so they spend no real time.
 */

import { describe, expect, it } from "vitest";
import * as check from "../../src/check.js";
import { Controlled } from "../../src/clock.js";
import { Mode, type Seat } from "../../src/matcher/seat.js";
import * as waiting from "../../src/matcher/waiting.js";
import { Recorder } from "../../src/seat.js";
import * as soft from "../../src/soft.js";
import { records } from "../helpers.js";

/** Returns a recorder that reads a clock the test controls. */
function controlled(): Recorder {
  return new Recorder().withClock(new Controlled(0));
}

/** Returns the assertion and the detail of each failure that seat received. */
function reported(seat: Recorder): [string, unknown][] {
  return seat.failures.map((f) => [f.assertion, f.detail]);
}

describe("waiting", () => {
  describe("eventually", () => {
    it("reports the number of attempts with the first failure of the last attempt", async () => {
      const seat = controlled();
      await waiting.eventually(
        seat,
        Mode.Fatal,
        20,
        5,
        (trial: Seat) => soft.isTrue(trial, false, "the inner reason"),
        "it converges",
      );

      expect(reported(seat)).toEqual([
        ["eventually", { attempts: 5, last: "the inner reason" }],
      ]);
    });

    it("passes a body that passes on its third attempt", async () => {
      let attempts = 0;
      const seat = controlled();
      await waiting.eventually(
        seat,
        Mode.Fatal,
        1000,
        5,
        (trial: Seat) => {
          attempts += 1;
          check.isTrue(trial, attempts >= 3, "it settled");
        },
        "it converges",
      );

      expect(seat.failed).toBe(false);
    });

    it("runs no attempt after the attempt that passes", async () => {
      let attempts = 0;
      await waiting.eventually(
        controlled(),
        Mode.Fatal,
        1000,
        5,
        (trial: Seat) => {
          attempts += 1;
          check.isTrue(trial, attempts >= 3, "it settled");
        },
        "it converges",
      );

      expect(attempts).toBe(3);
    });

    it("runs the body once with a timeout of 0", async () => {
      let attempts = 0;
      const seat = controlled();
      await waiting.eventually(
        seat,
        Mode.Fatal,
        0,
        1,
        () => {
          attempts += 1;
        },
        "it converges",
      );

      expect(attempts).toBe(1);
    });

    it("reports an attempt that passes after the deadline", async () => {
      const clock = new Controlled(0);
      const seat = new Recorder().withClock(clock);
      await waiting.eventually(
        seat,
        Mode.Fatal,
        10,
        5,
        () => clock.advance(11),
        "it converges in time",
      );

      expect(reported(seat)).toEqual([["eventually", { attempts: 1, last: "" }]]);
    });

    it("ends an attempt at its first failure that stops", async () => {
      let reached = 0;
      const seat = controlled();
      await waiting.eventually(
        seat,
        Mode.Fatal,
        10,
        5,
        (trial: Seat) => {
          check.isTrue(trial, false, "the first");
          reached += 1;
        },
        "it converges",
      );

      expect(reached).toBe(0);
    });

    it("rejects with what the body throws that is no failure", async () => {
      const boom = new RangeError("the body broke");

      await expect(
        waiting.eventually(
          controlled(),
          Mode.Fatal,
          10,
          5,
          () => {
            throw boom;
          },
          "it converges",
        ),
      ).rejects.toBe(boom);
    });

    it("hands each attempt a signal that aborts when the attempt ends", async () => {
      const signals: AbortSignal[] = [];
      const open: boolean[] = [];
      await waiting.eventually(
        controlled(),
        Mode.Fatal,
        10,
        5,
        (trial: Seat) => {
          signals.push(trial.signal as AbortSignal);
          open.push(!trial.signal?.aborted);
          soft.isTrue(trial, signals.length > 1, "it settles on the second attempt");
        },
        "it converges",
      );

      expect([open, signals.map((s) => s.aborted)]).toEqual([
        [true, true],
        [true, true],
      ]);
    });

    it("hands each attempt a signal that the signal of the seat aborts", async () => {
      const parent = new AbortController();
      parent.abort();
      let aborted: boolean | undefined;
      await waiting.eventually(
        controlled().withSignal(parent.signal),
        Mode.Fatal,
        10,
        5,
        (trial: Seat) => {
          aborted = trial.signal?.aborted;
        },
        "it converges",
      );

      expect(aborted).toBe(true);
    });

    it("records the calls of each attempt under its own call", async () => {
      const seat = controlled();
      let attempts = 0;
      await waiting.eventually(
        seat,
        Mode.Fatal,
        100,
        5,
        (trial: Seat) => {
          attempts += 1;
          soft.isTrue(trial, attempts === 2, "it settles");
        },
        "it converges",
      );

      expect(
        records(seat).map((r) => [
          r["seq"],
          r["parent"],
          r["run"],
          r["assertion"],
          r["verdict"],
        ]),
      ).toEqual([
        [1, undefined, undefined, "eventually", "pass"],
        [2, 1, 1, "true", "fail"],
        [3, 1, 2, "true", "pass"],
      ]);
    });

    it("advances a controlled clock instead of waiting on the platform", async () => {
      const started = performance.now();
      await waiting.eventually(
        controlled(),
        Mode.Fatal,
        3_600_000,
        60_000,
        (trial: Seat) => check.isTrue(trial, false, "never settles"),
        "the body settles",
      );

      expect(performance.now() - started).toBeLessThan(5000);
    });
  });

  describe("eventuallyTrue", () => {
    it("waits 1 ms then doubles each wait up to a quarter of the timeout", async () => {
      const clock = new Controlled(0);
      const times: number[] = [];
      await waiting.eventuallyTrue(
        new Recorder().withClock(clock),
        Mode.Fatal,
        20,
        () => {
          times.push(clock.now());
          return false;
        },
        "it settles",
      );

      expect(times).toEqual([0, 1, 3, 7, 12, 17, 20]);
    });

    it("reports the number of attempts of a predicate that never returns true", async () => {
      const seat = controlled();
      await waiting.eventuallyTrue(seat, Mode.Fatal, 20, () => false, "it settles");

      expect(reported(seat)).toEqual([["eventually-true", { attempts: 7 }]]);
    });

    it("passes a predicate that returns true", async () => {
      const seat = controlled();
      await waiting.eventuallyTrue(seat, Mode.Fatal, 1000, () => true, "it settles");

      expect(seat.failed).toBe(false);
    });

    it("awaits a predicate that returns a promise", async () => {
      const seat = controlled();
      await waiting.eventuallyTrue(
        seat,
        Mode.Fatal,
        1000,
        async () => true,
        "it settles",
      );

      expect(seat.failed).toBe(false);
    });

    it("reports a predicate that returns true only after the deadline", async () => {
      const clock = new Controlled(0);
      const seat = new Recorder().withClock(clock);
      await waiting.eventuallyTrue(
        seat,
        Mode.Fatal,
        10,
        () => {
          clock.advance(11);
          return true;
        },
        "it settles in time",
      );

      expect(reported(seat)).toEqual([["eventually-true", { attempts: 1 }]]);
    });

    it("waits on the platform clock for a seat without a clock", async () => {
      const seat = new Recorder();
      await waiting.eventuallyTrue(seat, Mode.Fatal, 5, () => false, "it settles");

      expect(seat.failures.map((f) => f.assertion)).toEqual(["eventually-true"]);
    });
  });

  describe("noTaskLeaks", () => {
    it("returns a callable that reports a timer left running", () => {
      const seat = new Recorder();
      const done = waiting.noTaskLeaks(seat, Mode.Fatal, "the handler cleans up");
      const timer = setTimeout(() => undefined, 5000);
      done();
      clearTimeout(timer);

      expect(reported(seat)).toEqual([["no-task-leaks", { leaked: ["1 Timeout"] }]]);
    });

    it("returns a callable that reports an immediate left queued", () => {
      const seat = new Recorder();
      const done = waiting.noTaskLeaks(seat, Mode.Fatal, "the handler cleans up");
      const immediate = setImmediate(() => undefined);
      done();
      clearImmediate(immediate);

      expect(reported(seat)).toEqual([["no-task-leaks", { leaked: ["1 Immediate"] }]]);
    });

    it("returns a callable that passes a scope that leaves nothing running", () => {
      const seat = new Recorder();
      const done = waiting.noTaskLeaks(seat, Mode.Fatal, "the handler cleans up");
      clearTimeout(setTimeout(() => undefined, 5000));
      done();

      expect(records(seat).map((r) => r["verdict"])).toEqual(["pass"]);
    });
  });
});
