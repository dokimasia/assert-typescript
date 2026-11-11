// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the setup of a machine subject. */

import { describe } from "vitest";
import { marked, schedulerOf } from "../../../src/conformance/stateful/setup.js";
import { check } from "../../../src/index.js";
import { IntegerBounds, UINT64_MAX } from "../../../src/prop/engine/choice.js";
import type { Action } from "../../../src/stateful/machine.js";
import { pct } from "../../../src/stateful/strategy.js";
import { test as it } from "../../../src/vitest.js";
import {
  bodyCase,
  ending,
  failingOf,
  MACHINE_SETUP,
  replaying,
} from "../../helpers.js";

describe("setup", () => {
  describe("schedulerOf", () => {
    it("returns a scheduler of the strategy and the most releases of the setup", async ({
      seat,
    }) => {
      const { c, engine } = bodyCase(replaying());
      const scheduler = schedulerOf(c, {
        ...MACHINE_SETUP,
        strategy: pct(1),
        maxReleases: 2,
      });
      const signal = await ending(c, async () => {
        scheduler.spawn(async () => {
          for (;;) {
            await scheduler.yield();
          }
        });
        await scheduler.run();
      });

      check.isEqualTo(
        seat,
        [
          engine.requests.map((request) => request.bounds),
          failingOf(signal).failure.contract,
        ],
        [
          [new IntegerBounds(0n, UINT64_MAX)],
          "the task scheduler released 2 tasks in one run, and a task is still ready",
        ],
        "a priority of PCT, and the limit of two releases",
      );
    });
  });

  describe("marked", () => {
    it("sets keep on each action that the setup names", ({ seat }) => {
      const actions: Action<unknown>[] = ["a", "b"].map((name) => ({
        name,
        run: () => undefined,
      }));

      check.isEqualTo(
        seat,
        marked({ ...MACHINE_SETUP, keep: ["b"] }, actions).map((action) => [
          action.name,
          action.keep,
        ]),
        [
          ["a", undefined],
          ["b", true],
        ],
        "b is kept",
      );
    });
  });
});
