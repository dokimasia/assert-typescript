// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the engine's body of a property. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { Fault } from "../../../src/matcher/fault.js";
import type { Seat } from "../../../src/matcher/seat.js";
import type { Wrapper } from "../../../src/prop/option.js";
import { adapt, observerOf } from "../../../src/prop/property/body.js";
import type { Call } from "../../../src/prop/property.js";
import { Recorder } from "../../../src/seat.js";
import { test as it } from "../../../src/vitest.js";
import { executed } from "../../helpers.js";

/** The call of the property of this spec. */
const CALL: Call = {
  op: "prop.forAll",
  assertion: "prop-for-all",
  contract: "the property is true",
  where: undefined,
};

/** Returns the error that the execution of a case of the body adapted with around throws. */
async function thrownBy(around: Wrapper): Promise<unknown> {
  try {
    await executed(
      adapt(new Recorder(), undefined, () => undefined, CALL, around),
      [],
    );
  } catch (err) {
    return err;
  }
  return undefined;
}

describe("body", () => {
  describe("adapt", () => {
    it("runs the body on a case of the seat", async ({ seat }) => {
      let ran = false;
      const execution = await executed(
        adapt(
          new Recorder(),
          undefined,
          () => {
            ran = true;
          },
          CALL,
          undefined,
        ),
        [],
      );

      check.isEqualTo(
        seat,
        [execution.status, ran],
        ["passed", true],
        "a passing case",
      );
    });

    it("runs the body inside the wrapper", async ({ seat }) => {
      const order: string[] = [];
      const around: Wrapper = async (run) => {
        order.push("before");
        await run();
        order.push("after");
      };
      await executed(
        adapt(new Recorder(), undefined, () => order.push("body"), CALL, around),
        [],
      );

      check.isEqualTo(
        seat,
        order,
        ["before", "body", "after"],
        "the order of the calls",
      );
    });

    it("ends the case with a fault at around for a wrapper that does not call run", async ({
      seat,
    }) => {
      const err = check.errorAs(
        seat,
        await thrownBy(() => undefined),
        Fault,
        "a fault",
      );

      check.isEqualTo(
        seat,
        [err?.at, err?.reason],
        ["around", "the wrapper returned without calling run"],
        "the fault of the wrapper",
      );
    });

    it("ends the case with a fault at around for a wrapper that calls run twice", async ({
      seat,
    }) => {
      const err = check.errorAs(
        seat,
        await thrownBy(async (run) => {
          await run();
          await run();
        }),
        Fault,
        "a fault",
      );

      check.isEqualTo(
        seat,
        err?.reason,
        "the wrapper called run more than once",
        "the fault of the wrapper",
      );
    });

    it("stops the run once the signal of the seat aborted", async ({ seat }) => {
      const aborted: Seat = {
        helper: () => undefined,
        fail: () => undefined,
        record: () => undefined,
        signal: AbortSignal.abort("the test timed out"),
      };
      let stopped: unknown;
      try {
        await executed(
          adapt(aborted, undefined, () => undefined, CALL, undefined),
          [],
        );
      } catch (err) {
        stopped = err;
      }

      check.isEqualTo(
        seat,
        [(stopped as Error).name, (stopped as Error).cause],
        ["Stopped", "the test timed out"],
        "the stop with the reason of the signal",
      );
    });
  });

  describe("observerOf", () => {
    it("returns an observer that keeps no call without a slot", async ({ seat }) => {
      const execution = await executed(
        adapt(new Recorder(), undefined, () => undefined, CALL, undefined),
        [],
      );

      check.isNil(seat, observerOf(undefined)("random", execution), "nothing kept");
    });
  });
});
