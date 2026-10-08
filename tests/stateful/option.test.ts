/** The spec of the options of a run of steps. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { Case as Engine, Replaying } from "../../src/prop/engine/case.js";
import type { Seat } from "../../src/seat.js";
import {
  clients,
  concurrent,
  configure,
  max,
  mean,
  type Option,
  swarm,
  tasks,
} from "../../src/stateful/option.js";
import { Scheduler } from "../../src/stateful/scheduler.js";
import { uniform } from "../../src/stateful/strategy.js";
import { test as it } from "../../src/vitest.js";
import { bodyCase } from "../helpers.js";

/** Checks that option, alone, changes the defaults by want. */
function sets(seat: Seat, option: Option, want: Record<string, unknown>): void {
  check.equal(seat, configure([option]), { ...configure([]), ...want }, "one setting");
}

/** Checks that make throws a RangeError of message. */
function refuses(seat: Seat, make: () => Option, message: string): void {
  const err = check.throws(seat, make, "a refusal");

  check.equal(
    seat,
    [err instanceof RangeError, (err as Error).message],
    [true, message],
    "the error",
  );
}

describe("option", () => {
  describe("configure", () => {
    it("returns the settings that the definition fixes for no option", ({ seat }) => {
      check.equal(
        seat,
        configure([]),
        {
          mean: 30,
          max: 100,
          swarm: true,
          clients: 1,
          concurrent: 16,
          scheduler: undefined,
        },
        "the defaults",
      );
    });

    it("applies a later option of one setting over an earlier one", ({ seat }) => {
      check.equal(seat, configure([mean(3), mean(5)]).mean, 5, "the later mean");
    });
  });

  describe("mean", () => {
    it("returns the option of the mean", ({ seat }) => {
      sets(seat, mean(0), { mean: 0 });
    });

    it("throws a RangeError for a mean below 0", ({ seat }) => {
      refuses(seat, () => mean(-1), "stateful: mean(-1) is no integer of 0 or more");
    });
  });

  describe("max", () => {
    it("returns the option of the most steps", ({ seat }) => {
      sets(seat, max(7), { max: 7 });
    });

    it("throws a RangeError for a count that is no integer", ({ seat }) => {
      refuses(seat, () => max(1.5), "stateful: max(1.5) is no integer of 0 or more");
    });
  });

  describe("swarm", () => {
    it("returns the option of the swarm", ({ seat }) => {
      sets(seat, swarm(false), { swarm: false });
    });
  });

  describe("clients", () => {
    it("returns the option of the clients", ({ seat }) => {
      sets(seat, clients(3), { clients: 3 });
    });

    it("throws a RangeError for no client", ({ seat }) => {
      refuses(
        seat,
        () => clients(0),
        "stateful: clients(0) is no integer of 1 or more",
      );
    });
  });

  describe("concurrent", () => {
    it("returns the option of the most steps of a section", ({ seat }) => {
      sets(seat, concurrent(0), { concurrent: 0 });
    });

    it("throws a RangeError for a count below 0", ({ seat }) => {
      refuses(
        seat,
        () => concurrent(-1),
        "stateful: concurrent(-1) is no integer of 0 or more",
      );
    });
  });

  describe("tasks", () => {
    it("returns the option of the scheduler of a section", ({ seat }) => {
      const scheduler = new Scheduler(bodyCase(new Replaying([])).c, uniform());

      check.isTrue(
        seat,
        configure([tasks(scheduler)]).scheduler === scheduler,
        "the scheduler",
      );
    });

    it("throws a TypeError for a scheduler that is no Scheduler", ({ seat }) => {
      const err = check.throws(
        seat,
        () => tasks(new Engine(new Replaying([])) as unknown as Scheduler),
        "a refusal",
      );

      check.errorIs(seat, err, TypeError, "a TypeError");
    });
  });
});
