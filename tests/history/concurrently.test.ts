/** The spec of running the clients of a history together. */

import { describe } from "vitest";
import { concurrently } from "../../src/history/concurrently.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";

describe("concurrently", () => {
  describe("concurrently", () => {
    it("returns the output of each client in client order", async ({ seat }) => {
      const outcomes = await concurrently(3, 1000, (client) => client * 10);

      check.equal(
        seat,
        outcomes,
        [
          { client: 0, finished: true, output: 0 },
          { client: 1, finished: true, output: 10 },
          { client: 2, finished: true, output: 20 },
        ],
        "three outcomes",
      );
    });

    it("awaits a body that returns a promise", async ({ seat }) => {
      const outcomes = await concurrently(2, 1000, async (client) => {
        await Promise.resolve();
        return `client ${client}`;
      });

      check.equal(
        seat,
        outcomes.map((outcome) => outcome.output),
        ["client 0", "client 1"],
        "the fulfilled values",
      );
    });

    it("starts every client before any body runs past its first await", async ({
      seat,
    }) => {
      const order: string[] = [];
      await concurrently(2, 1000, async (client) => {
        order.push(`start ${client}`);
        await Promise.resolve();
        order.push(`end ${client}`);
      });

      check.equal(
        seat,
        order,
        ["start 0", "start 1", "end 0", "end 1"],
        "both start, then both end",
      );
    });

    it("returns a client that is still running when the time passes as not finished", async ({
      seat,
    }) => {
      const outcomes = await concurrently(2, 0, (client) =>
        client === 0 ? "done" : new Promise(() => undefined),
      );

      check.equal(
        seat,
        outcomes,
        [
          { client: 0, finished: true, output: "done" },
          { client: 1, finished: false, output: undefined },
        ],
        "client 1 runs on",
      );
    });

    it("rejects with the error of the lowest client that threw", async ({ seat }) => {
      const err = await check.rejectsWith(
        seat,
        () =>
          concurrently(3, 1000, (client) => {
            if (client > 0) throw new RangeError(`client ${client}`);
          }),
        "the clients throw",
      );

      check.equal(seat, (err as Error).message, "client 1", "the error of client 1");
    });

    it("loses an error that a body raises after the time passed", async ({ seat }) => {
      let fail = (_: Error): void => undefined;
      const late = new Promise<void>((_, reject) => {
        fail = reject;
      });
      const outcomes = await concurrently(1, 0, () => late);
      fail(new Error("too late"));
      await Promise.resolve();

      check.equal(seat, outcomes[0]?.finished, false, "the outcome before the error");
    });

    const tests: { name: string; give: [number, number]; want: string }[] = [
      {
        name: "no client",
        give: [0, 10],
        want: "history: concurrently(0, 10) starts no client",
      },
      {
        name: "a fraction of a client",
        give: [1.5, 10],
        want: "history: concurrently(1.5, 10) starts no client",
      },
      {
        name: "a negative time",
        give: [1, -1],
        want: "history: concurrently(1, -1) waits no time from 0 to 2147483647 ms",
      },
      {
        name: "a time past the longest timer",
        give: [1, 2 ** 31],
        want: "history: concurrently(1, 2147483648) waits no time from 0 to 2147483647 ms",
      },
    ];
    for (const tt of tests) {
      it(`throws a RangeError for ${tt.name}`, async ({ seat }) => {
        const err = await check.rejectsWith(
          seat,
          () => concurrently(...tt.give, () => undefined),
          "the refusal",
        );

        check.equal(seat, (err as Error).message, tt.want, "the message");
      });
    }
  });
});
