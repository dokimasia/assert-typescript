// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the list of the cleanups of a seat. It uses vitest's `expect`
 * alone, because the seats of the library run their cleanups through it.
 */

import { describe, expect, it } from "vitest";
import { CleanupList } from "../../src/matcher/cleanup.js";

/** Runs one function of a list, as a seat runs it. */
async function runOne(fn: () => unknown): Promise<void> {
  await fn();
}

describe("cleanup", () => {
  describe("new CleanupList", () => {
    it("returns a list that runs nothing", async () => {
      const order: string[] = [];
      await new CleanupList().run(async (fn) => {
        order.push("ran");
        await fn();
      });

      expect(order).toEqual([]);
    });
  });

  describe("CleanupList.add", () => {
    it("keeps the function until a run", () => {
      const order: string[] = [];
      const kept = new CleanupList().add(() => {
        order.push("released");
      });

      expect([kept, order]).toEqual([true, []]);
    });

    it("does not keep a function after close", async () => {
      const order: string[] = [];
      const list = new CleanupList();
      list.add(() => {
        order.push("closed");
      });
      await list.close(runOne);
      const kept = list.add(() => {
        order.push("released");
      });
      await list.run(runOne);

      expect([kept, order]).toEqual([false, ["closed"]]);
    });
  });

  describe("CleanupList.run", () => {
    it("runs the last kept function first", async () => {
      const order: number[] = [];
      const list = new CleanupList();
      list.add(() => {
        order.push(1);
      });
      list.add(() => {
        order.push(2);
      });
      await list.run(runOne);

      expect(order).toEqual([2, 1]);
    });

    it("runs a function that a function adds in the same pass", async () => {
      const order: string[] = [];
      const list = new CleanupList();
      list.add(() => {
        order.push("adding");
        list.add(() => {
          order.push("added");
        });
      });
      await list.run(runOne);

      expect(order).toEqual(["adding", "added"]);
    });

    it("leaves a function that arrives after the run to the next run", async () => {
      const order: string[] = [];
      const list = new CleanupList();
      list.add(() => {
        order.push("first run");
      });
      await list.run(runOne);
      const kept = list.add(() => {
        order.push("second run");
      });
      expect([kept, order]).toEqual([true, ["first run"]]);

      await list.run(runOne);
      expect(order).toEqual(["first run", "second run"]);
    });

    it("leaves a closed list closed", async () => {
      const list = new CleanupList();
      await list.close(runOne);
      await list.run(runOne);

      expect(list.add(() => undefined)).toBe(false);
    });
  });

  describe("CleanupList.close", () => {
    it("runs a function that a function adds before it closes", async () => {
      const order: string[] = [];
      const list = new CleanupList();
      list.add(() => {
        order.push("adding");
        list.add(() => {
          order.push("added");
        });
      });
      await list.close(runOne);

      expect(order).toEqual(["adding", "added"]);
    });
  });
});
