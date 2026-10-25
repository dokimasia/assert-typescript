// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the replay of a failing case before its shrink. Each
 * divergence is the result of the definition's reference implementation on
 * the same body and choices.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { MAX_CHOICES } from "../../../../src/prop/engine/case.js";
import { IntegerBounds } from "../../../../src/prop/engine/choice.js";
import { Integer } from "../../../../src/prop/engine/generator.js";
import { confirm } from "../../../../src/prop/engine/shrink/confirm.js";
import { drive } from "../../../../src/prop/engine/work.js";
import { test as it } from "../../../../src/vitest.js";
import { body, executed, integers } from "../../../helpers.js";

const WIDE = new Integer(new IntegerBounds(0n, 1_000_000_000n));
const SMALL = new Integer(new IntegerBounds(0n, 1000n));

/** A body that fails for a draw above 1000. */
const above = body((c) => {
  if (c.draw(WIDE, "n") > 1000n) {
    c.fail("above");
  }
});

describe("confirm", () => {
  describe("confirm", () => {
    it("returns undefined for a replay that fails the same way", async ({ seat }) => {
      check.isNil(
        seat,
        await drive(
          confirm(above, await executed(above, integers(2000n)), MAX_CHOICES),
        ),
        "no divergence",
      );
    });

    it("returns a verdict divergence for a replay that passes", async ({ seat }) => {
      let calls = 0;
      const once = body((c) => {
        calls += 1;
        c.place = { part: "settle" };
        c.draw(WIDE, "n");
        if (calls === 1) {
          c.fail("once");
        }
      });
      const divergence = await drive(
        confirm(once, await executed(once, integers(5n)), MAX_CHOICES),
      );

      check.isEqualTo(
        seat,
        divergence,
        { what: "verdict", index: 1, recorded: "once", replayed: undefined },
        "the identity against a pass",
      );
    });

    it("returns a request divergence with the label and the step of the replay's request", async ({
      seat,
    }) => {
      let calls = 0;
      const shifting = body((c) => {
        calls += 1;
        c.place = { part: "sequential", position: 1, action: "put" };
        c.draw(calls === 1 ? WIDE : SMALL, "n");
        c.fail("always");
      });
      const divergence = await drive(
        confirm(shifting, await executed(shifting, integers(5n)), MAX_CHOICES),
      );

      check.isEqualTo(
        seat,
        divergence,
        {
          what: "request",
          index: 0,
          recorded: WIDE.bounds,
          replayed: SMALL.bounds,
          label: "n",
          step: { part: "sequential", position: 1, action: "put" },
        },
        "the first request",
      );
    });

    it("returns a request divergence without a label for a replay that ends before a request", async ({
      seat,
    }) => {
      let calls = 0;
      const shortening = body((c) => {
        calls += 1;
        if (calls === 1) {
          c.draw(WIDE, "n");
        }
        c.fail("always");
      });
      const divergence = await drive(
        confirm(shortening, await executed(shortening, integers(5n)), MAX_CHOICES),
      );

      check.isEqualTo(
        seat,
        divergence,
        {
          what: "request",
          index: 0,
          recorded: WIDE.bounds,
          replayed: undefined,
          label: undefined,
          step: undefined,
        },
        "no request at the position",
      );
    });

    it("returns a fingerprint divergence with the step of the replay's fingerprint", async ({
      seat,
    }) => {
      let calls = 0;
      const observing = body((c) => {
        calls += 1;
        c.draw(WIDE, "n");
        c.place = { part: "drain", position: 0, action: "flush" };
        c.observe(BigInt(calls));
        c.fail("always");
      });
      const divergence = await drive(
        confirm(observing, await executed(observing, integers(5n)), MAX_CHOICES),
      );

      check.isEqualTo(
        seat,
        divergence,
        {
          what: "fingerprint",
          index: 0,
          recorded: 1n,
          replayed: 2n,
          label: undefined,
          step: { part: "drain", position: 0, action: "flush" },
        },
        "the fingerprints 1 and 2",
      );
    });

    it("returns a fingerprint divergence without a step for a fingerprint that the replay did not observe", async ({
      seat,
    }) => {
      let calls = 0;
      const once = body((c) => {
        calls += 1;
        c.draw(WIDE, "n");
        if (calls === 1) {
          c.observe(1n);
        }
        c.fail("always");
      });
      const divergence = await drive(
        confirm(once, await executed(once, integers(5n)), MAX_CHOICES),
      );

      check.isEqualTo(
        seat,
        divergence,
        {
          what: "fingerprint",
          index: 0,
          recorded: 1n,
          replayed: undefined,
          label: undefined,
          step: undefined,
        },
        "no fingerprint",
      );
    });

    it("returns undefined for a replay that observes the same fingerprints", async ({
      seat,
    }) => {
      const observing = body((c) => {
        c.observe(c.draw(WIDE, "n") % 7n);
        c.observe(3n);
        c.fail("always");
      });

      check.isNil(
        seat,
        await drive(
          confirm(observing, await executed(observing, integers(5n)), MAX_CHOICES),
        ),
        "no divergence",
      );
    });

    it("passes the replay to the observer under the phase replay", async ({ seat }) => {
      const phases: string[] = [];
      await drive(
        confirm(above, await executed(above, integers(2000n)), MAX_CHOICES, (phase) =>
          phases.push(phase),
        ),
      );

      check.isEqualTo(seat, phases, ["replay"], "one replay");
    });
  });
});
