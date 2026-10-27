// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the run of a property's body on its case. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { Fault } from "../../../src/matcher/fault.js";
import { Faulted } from "../../../src/prop/case/state.js";
import { TraceError } from "../../../src/prop/engine/trace.js";
import { Diverged, Repeated } from "../../../src/prop/engine/tree.js";
import { test as it } from "../../../src/vitest.js";
import {
  caseAt as caseOn,
  ending,
  failingOf as recordOf,
  CASE_SITE as SITE,
} from "../../helpers.js";

describe("execute", () => {
  describe("execute", () => {
    it("returns for an async body that passes", async ({ seat }) => {
      const { c } = caseOn();

      check.isNil(seat, await ending(c, async () => undefined), "the case passes");
    });

    it("ends the case with the record of a raised error at the frame that raised it", async ({
      seat,
    }) => {
      const { c } = caseOn();
      const { failure, identity } = recordOf(
        await ending(c, () => {
          throw new TypeError("bad input");
        }),
      );

      check.isEqualTo(
        seat,
        [failure.assertion, failure.contract, failure.detail["error"], identity.error],
        ["", "bad input", "TypeError", "TypeError"],
        "the record of the error",
      );
      check.hasSuffix(
        seat,
        identity.where?.file,
        "execute.test.ts",
        "the frame is this file's",
      );
    });

    it("ends the case with the record of a rejected promise", async ({ seat }) => {
      const { c } = caseOn();
      const thrown = await ending(c, () => Promise.reject(new RangeError("late")));

      check.isEqualTo(
        seat,
        recordOf(thrown).failure.contract,
        "late",
        "the rejection fails the case",
      );
    });

    it("locates the record of a raised value that is no error at the property's call site", async ({
      seat,
    }) => {
      const { c } = caseOn();
      const { failure, identity } = recordOf(
        await ending(c, () => {
          throw "a string";
        }),
      );

      check.isEqualTo(
        seat,
        [failure.contract, failure.detail, identity],
        ["a string", { error: "string", stack: "" }, { error: "string", where: SITE }],
        "the record of the value",
      );
    });

    it("throws the failure of a case that a later assumption rejects", async ({
      seat,
    }) => {
      const { c } = caseOn();
      const thrown = await ending(c, (one) => {
        one.record("first");
        one.assume(false);
      });

      check.isEqualTo(
        seat,
        recordOf(thrown).failure.contract,
        "first",
        "the failure has priority",
      );
    });

    it("throws the failure of a case that a later skip ends", async ({ seat }) => {
      const { c } = caseOn();
      const thrown = await ending(c, (one) => {
        one.record("first");
        one.skip("a skip after the failure");
      });

      check.isEqualTo(
        seat,
        recordOf(thrown).failure.contract,
        "first",
        "the failure has priority",
      );
    });

    it("ends the case with a Fault that the body throws", async ({ seat }) => {
      const { c } = caseOn();
      const fault = new Fault("seed", "the seed is no number");
      const thrown = await ending(c, () => {
        throw fault;
      });

      check.isTrue(
        seat,
        thrown instanceof Faulted && thrown.fault === fault,
        "the thrown fault ends the case",
      );
    });

    it("keeps the fault of a cleanup over an earlier failure", async ({ seat }) => {
      const { c } = caseOn();
      const fault = new Error("the store is gone");
      const thrown = await ending(c, (one) => {
        one.cleanup(() => one.reportFault(fault, true));
        one.fail("the totals differ");
      });

      check.isTrue(
        seat,
        thrown instanceof Faulted && thrown.fault === fault,
        "the fault outweighs the failure",
      );
    });

    it("keeps a signal that ends the run over a later fault of a cleanup", async ({
      seat,
    }) => {
      const { c } = caseOn();
      const signal = new Repeated();
      const thrown = await ending(c, (one) => {
        one.cleanup(() => {
          throw new Fault("", "late");
        });
        throw signal;
      });

      check.isTrue(seat, thrown === signal, "the signal of the run");
    });

    const tests = [
      { name: "a repeat of a tested case", give: () => new Repeated() },
      { name: "a divergence", give: () => new Diverged(0, undefined, undefined) },
      {
        name: "an entry that a trace cannot follow",
        give: () => new TraceError(0, "x", "label"),
      },
    ];
    for (const tt of tests) {
      it(`throws the signal of ${tt.name} over an earlier failure`, async ({
        seat,
      }) => {
        const { c } = caseOn();
        const signal = tt.give();
        const thrown = await ending(c, (one) => {
          one.record("a failure first");
          throw signal;
        });

        check.isTrue(seat, thrown === signal, "the signal");
      });
    }
  });
});
