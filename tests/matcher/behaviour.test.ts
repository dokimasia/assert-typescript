/**
 * The spec of the assertions about how a subject behaves. It uses vitest's
 * `expect` alone, because the surfaces call these assertions.
 *
 * Each assertion is driven with a subject that meets it and with one that
 * does not, because a one-sided case passes an assertion that reports
 * nothing whatever it is given.
 */

import { describe, expect, it } from "vitest";
import { Controlled } from "../../src/clock.js";
import * as behaviour from "../../src/matcher/behaviour.js";
import { equateEmpty } from "../../src/matcher/option.js";
import { Mode } from "../../src/matcher/seat.js";
import { Recorder } from "../../src/seat.js";
import { ignores, records } from "../helpers.js";

/** A subject that waits for its signal, and rejects with the signal's reason when it aborts. */
async function respects(signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw signal.reason;
  await new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

/** Returns the assertion and the detail of each failure that seat received. */
function reported(seat: Recorder): [string, unknown][] {
  return seat.failures.map((f) => [f.assertion, f.detail]);
}

describe("behaviour", () => {
  describe("honoursCancellation", () => {
    it("passes a subject that rejects with the reason of its signal", async () => {
      const seat = new Recorder();
      await behaviour.honoursCancellation(
        seat,
        Mode.Fatal,
        respects,
        "it stops when told",
      );

      expect(seat.failed).toBe(false);
    });

    it("hands the subject a signal that aborted with an AbortError", async () => {
      let reason: unknown;
      await behaviour.honoursCancellation(
        new Recorder(),
        Mode.Fatal,
        async (signal) => {
          reason = signal.reason;
        },
        "it stops when told",
      );

      expect((reason as Error).name).toBe("AbortError");
    });

    it("reports got null for a subject that resolves", async () => {
      const seat = new Recorder();
      await behaviour.honoursCancellation(
        seat,
        Mode.Fatal,
        ignores,
        "it stops when told",
      );

      expect(reported(seat)).toEqual([["honours-cancellation", { got: null }]]);
    });

    it("reports got with the error of a subject that rejects for its own reason", async () => {
      const own = new RangeError("its own reason");
      const seat = new Recorder();
      await behaviour.honoursCancellation(
        seat,
        Mode.Fatal,
        () => Promise.reject(own),
        "it stops when told",
      );

      expect(reported(seat)).toEqual([["honours-cancellation", { got: own }]]);
    });

    it("reports got with a rejection that is no error", async () => {
      const seat = new Recorder();
      await behaviour.honoursCancellation(
        seat,
        Mode.Fatal,
        () => Promise.reject("a bare string"),
        "it stops when told",
      );

      expect(reported(seat)).toEqual([
        ["honours-cancellation", { got: "a bare string" }],
      ]);
    });

    it("reports the call site that it read before its first await", async () => {
      const seat = new Recorder();
      await behaviour.honoursCancellation(
        seat,
        Mode.Fatal,
        ignores,
        "it stops when told",
      );

      expect(seat.failures[0]?.where?.file).toMatch(/behaviour\.test\.ts$/);
      expect(records(seat)[0]?.["where"]).toEqual({
        file: "behaviour.test.ts",
        line: expect.any(Number),
      });
    });
  });

  describe("honoursDeadline", () => {
    it("hands the subject a signal that aborted with a TimeoutError", async () => {
      let reason: unknown;
      await behaviour.honoursDeadline(
        new Recorder(),
        Mode.Fatal,
        async (signal) => {
          reason = signal.reason;
          throw signal.reason;
        },
        "it respects its deadline",
      );

      expect((reason as Error).name).toBe("TimeoutError");
    });

    it("passes a subject that rejects with the reason of its signal", async () => {
      const seat = new Recorder();
      await behaviour.honoursDeadline(
        seat,
        Mode.Fatal,
        respects,
        "it respects its deadline",
      );

      expect(seat.failed).toBe(false);
    });

    it("reports got null for a subject that resolves", async () => {
      const seat = new Recorder();
      await behaviour.honoursDeadline(
        seat,
        Mode.Fatal,
        ignores,
        "it respects its deadline",
      );

      expect(reported(seat)).toEqual([["honours-deadline", { got: null }]]);
    });

    it("reports got with an unrelated error", async () => {
      const unrelated = new TypeError("unrelated");
      const seat = new Recorder();
      await behaviour.honoursDeadline(
        seat,
        Mode.Fatal,
        () => Promise.reject(unrelated),
        "it respects its deadline",
      );

      expect(reported(seat)).toEqual([["honours-deadline", { got: unrelated }]]);
    });
  });

  describe("completesWithin", () => {
    it("passes a subject that returns at once", async () => {
      const seat = new Recorder();
      await behaviour.completesWithin(
        seat,
        Mode.Fatal,
        1000,
        () => undefined,
        "it is quick",
      );

      expect(seat.failed).toBe(false);
    });

    it("reports want for a subject that settles after the duration", async () => {
      const seat = new Recorder();
      await behaviour.completesWithin(
        seat,
        Mode.Fatal,
        0,
        () => new Promise((resolve) => setTimeout(resolve, 5)),
        "it is quick",
      );

      expect(seat.failures.map((f) => [f.assertion, f.want])).toEqual([
        ["completes-within", 0],
      ]);
    });

    it("reports the milliseconds waited for a subject that never settles", async () => {
      const seat = new Recorder();
      await behaviour.completesWithin(
        seat,
        Mode.Fatal,
        5,
        () => new Promise(() => undefined),
        "it settles in time",
      );

      expect(seat.failures[0]?.want).toBe(5);
      expect(seat.failures[0]?.got).toBeGreaterThanOrEqual(4);
    });

    it("aborts the signal of a subject that never settles with a TimeoutError", async () => {
      let signal: AbortSignal | undefined;
      await behaviour.completesWithin(
        new Recorder(),
        Mode.Fatal,
        5,
        (handed) => {
          signal = handed;
          return new Promise(() => undefined);
        },
        "it settles in time",
      );

      expect((signal?.reason as Error | undefined)?.name).toBe("TimeoutError");
    });

    it("reports the time of a subject that settles on the seat's clock", async () => {
      const clock = new Controlled(0);
      const seat = new Recorder().withClock(clock);
      await behaviour.completesWithin(
        seat,
        Mode.Fatal,
        1000,
        () => clock.advance(2500),
        "it is quick",
      );

      expect(reported(seat)).toEqual([["completes-within", { want: 1000, got: 2500 }]]);
    });

    it("passes a subject whose promise rejects in time", async () => {
      const seat = new Recorder();
      await behaviour.completesWithin(
        seat,
        Mode.Fatal,
        1000,
        () => Promise.reject(new Error("refused")),
        "it is quick",
      );

      expect(seat.failed).toBe(false);
    });

    it("passes a subject that throws at once", async () => {
      const seat = new Recorder();
      await behaviour.completesWithin(
        seat,
        Mode.Fatal,
        1000,
        () => {
          throw new Error("refused at once");
        },
        "it is quick",
      );

      expect(seat.failed).toBe(false);
    });

    it("hands the subject a signal that the signal of the seat aborts", async () => {
      const parent = new AbortController();
      parent.abort();
      let aborted: boolean | undefined;
      await behaviour.completesWithin(
        new Recorder().withSignal(parent.signal),
        Mode.Fatal,
        1000,
        (signal) => {
          aborted = signal.aborted;
        },
        "it is quick",
      );

      expect(aborted).toBe(true);
    });
  });

  describe("isPure", () => {
    it("passes a function that leaves the projection unchanged", async () => {
      const state = [1, 2];
      const seat = new Recorder();
      await behaviour.isPure(
        seat,
        Mode.Fatal,
        () => [...state],
        () => undefined,
        "it changes nothing",
      );

      expect(seat.failed).toBe(false);
    });

    it("reports both projections for a function that changes the projection", async () => {
      const state = [1, 2];
      const seat = new Recorder();
      await behaviour.isPure(
        seat,
        Mode.Fatal,
        () => [...state],
        () => state.push(3),
        "it changes nothing",
      );

      expect(reported(seat)).toEqual([["pure", { want: [1, 2], got: [1, 2, 3] }]]);
    });

    it("passes a change outside the projection", async () => {
      const state = { kept: 1, ignored: 0 };
      const seat = new Recorder();
      await behaviour.isPure(
        seat,
        Mode.Fatal,
        () => state.kept,
        () => {
          state.ignored = 1;
        },
        "it changes nothing observable",
      );

      expect(seat.failed).toBe(false);
    });

    it("passes a change that a relaxation of the call equates", async () => {
      let state: number[] | null = null;
      const seat = new Recorder();
      await behaviour.isPure(
        seat,
        Mode.Fatal,
        () => state,
        () => {
          state = [];
        },
        "it changes nothing that counts",
        equateEmpty(),
      );

      expect(seat.failed).toBe(false);
    });
  });

  describe("nullHandleSafe", () => {
    const tests: {
      name: string;
      give: (signal: AbortSignal | undefined) => unknown;
    }[] = [
      { name: "passes a subject that returns", give: () => undefined },
      {
        name: "passes a subject that throws an error of its own",
        give: (signal) => {
          if (signal === undefined) throw new Error("a signal is required");
        },
      },
      {
        name: "passes a subject that throws a RangeError",
        give: () => {
          throw new RangeError("a handle is required");
        },
      },
    ];

    for (const tt of tests) {
      it(tt.name, async () => {
        const seat = new Recorder();
        await behaviour.nullHandleSafe(
          seat,
          Mode.Fatal,
          tt.give,
          "no handle is not fatal",
        );

        expect(seat.failed).toBe(false);
      });
    }

    it("reports got with the TypeError of a subject that reads the missing signal", async () => {
      const seat = new Recorder();
      await behaviour.nullHandleSafe(
        seat,
        Mode.Fatal,
        (signal) => (signal as AbortSignal).aborted,
        "no handle is not fatal",
      );

      expect(reported(seat)).toEqual([
        ["nil-context-safe", { got: expect.any(TypeError) }],
      ]);
    });
  });
});
