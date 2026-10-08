/** The spec of work that may wait on a promise. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { drive, pending, type Work } from "../../../src/prop/engine/work.js";
import { test as it } from "../../../src/vitest.js";

describe("work", () => {
  describe("drive", () => {
    it("returns what work that yields nothing returns", async ({ seat }) => {
      // biome-ignore lint/correctness/useYield: the work waits on nothing.
      function* nothing(): Work<number> {
        return 7;
      }

      check.equal(seat, await drive(nothing()), 7, "the work's result");
    });

    it("passes what each yielded promise resolves to back into the work", async ({
      seat,
    }) => {
      function* sum(): Work<number> {
        const a = (yield Promise.resolve(2)) as number;
        const b = (yield Promise.resolve(3)) as number;
        return a + b;
      }

      check.equal(seat, await drive(sum()), 5, "the sum of the two results");
    });

    it("throws the error of a rejected promise into the work at its yield", async ({
      seat,
    }) => {
      function* recovers(): Work<string> {
        try {
          yield Promise.reject(new Error("refused"));
          return "resolved";
        } catch (error) {
          return (error as Error).message;
        }
      }

      check.equal(
        seat,
        await drive(recovers()),
        "refused",
        "the work caught the rejection",
      );
    });

    it("rejects with what the work throws", async ({ seat }) => {
      function* fails(): Work<never> {
        yield Promise.resolve();
        throw new Error("broke");
      }

      await check.rejectsWith(seat, () => drive(fails()), "the work's error");
    });
  });

  describe("pending", () => {
    it("returns a promise", ({ seat }) => {
      const promise = Promise.resolve(1);

      check.isTrue(seat, pending(promise) === promise, "the promise itself");
    });

    it("returns an object with a then method", ({ seat }) => {
      // biome-ignore lint/suspicious/noThenProperty: a thenable is the value under test
      const thenable = { then: () => undefined };

      check.isTrue(seat, Object.is(pending(thenable), thenable), "the thenable itself");
    });

    const tests = [
      { name: "undefined", give: undefined },
      { name: "null", give: null },
      { name: "a number", give: 5 },
      // biome-ignore lint/suspicious/noThenProperty: a then that is no function is the value under test
      { name: "an object whose then is no function", give: { then: 1 } },
    ];
    for (const tt of tests) {
      it(`returns undefined for ${tt.name}`, ({ seat }) => {
        check.isNil(seat, pending(tt.give), "no promise");
      });
    }
  });
});
