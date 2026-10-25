// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the shapes of a zone. The decoded values are those of the
 * definition's reference implementation.
 */

import { describe } from "vitest";
import { check } from "../../../../src/index.js";
import { Generating } from "../../../../src/prop/engine/case/providers.js";
import { Case, DECODE } from "../../../../src/prop/engine/case.js";
import {
  divmod,
  FIRST_DAY,
  FIRST_SECOND,
  LAST_DAY,
  LAST_SECOND,
} from "../../../../src/prop/engine/shape/calendar.js";
import {
  InstantShape,
  instantValue,
  LocalDateTimeShape,
  localValue,
} from "../../../../src/prop/engine/shape/pair.js";
import { WallShape, ZonedShape } from "../../../../src/prop/engine/shape/zoned.js";
import { caseSource } from "../../../../src/prop/engine/source.js";
import { canonical, Fields } from "../../../../src/prop/engine/value.js";
import { ZONES } from "../../../../src/prop/engine/zone.js";
import { test as it } from "../../../../src/vitest.js";
import { decodeFrom } from "../../../helpers.js";

/** The first offset change of Europe/Amsterdam. */
const CHANGE = ZONES[1]?.changes[0] as (typeof ZONES)[number]["changes"][number];

/** Returns the shape of an instant of the whole range at per units in a second. */
function instantShape(per: bigint): InstantShape {
  return new InstantShape(per, [FIRST_SECOND, 0n], [LAST_SECOND, per - 1n]);
}

/** The shape of a local date and time of the whole range at seconds. */
const LOCAL = new LocalDateTimeShape(1n, [FIRST_DAY, 0n], [LAST_DAY, 86_399n]);

/** Returns the canonical value of a zoned instant. */
function zoned(instant: Fields, zone: string): string {
  return canonical(
    new Fields([
      ["instant", instant],
      ["zone", zone],
    ]),
  );
}

/** Returns the canonical value of a wall time. */
function wall(local: Fields, zone: string): string {
  return canonical(
    new Fields([
      ["local-date-time", local],
      ["zone", zone],
    ]),
  );
}

describe("zoned", () => {
  describe("ZonedShape", () => {
    it("decodes the instant of a zone without a change over the whole range", ({
      seat,
    }) => {
      const [value, c] = decodeFrom(new ZonedShape(instantShape(1n)), 0n, 42n);

      check.isEqualTo(
        seat,
        [canonical(value), c.choices.length],
        [zoned(instantValue(42n, 0n), "UTC"), 2],
        "UTC makes no choice of a change",
      );
    });

    it("decodes an instant one unit from a change", ({ seat }) => {
      const shape = new ZonedShape(instantShape(1_000_000_000n));

      check.isEqualTo(
        seat,
        canonical(decodeFrom(shape, 1n, 1n, 0n, -1n)[0]),
        zoned(instantValue(CHANGE.at - 1n, 999_999_999n), "Europe/Amsterdam"),
        "a nanosecond before the change",
      );
    });

    it("decodes an instant away from the changes over the whole range", ({ seat }) => {
      const shape = new ZonedShape(instantShape(1_000n));

      check.isEqualTo(
        seat,
        canonical(decodeFrom(shape, 1n, 0n, 7n, 8n)[0]),
        zoned(instantValue(7n, 8n), "Europe/Amsterdam"),
        "the instant's two choices",
      );
    });

    it("decodes about one case in four from the changes", ({ seat }) => {
      const shape = new ZonedShape(instantShape(1n));
      let near = 0;
      let changed = 0;
      for (let index = 0n; index < 4000n; index += 1n) {
        const c = new Case(new Generating(caseSource(11n, index)));
        shape[DECODE](c);
        if ((ZONES[Number(c.choices[0]?.value)]?.changes.length ?? 0) > 0) {
          changed += 1;
          if (c.choices[1]?.value === 1n) {
            near += 1;
          }
        }
      }

      check.isTrue(
        seat,
        changed > 3000 && Math.abs(near / changed - 0.25) <= 0.03,
        "a quarter of the zones with changes",
      );
    });
  });

  describe("WallShape", () => {
    for (const [side, offset] of [
      [0n, CHANGE.before],
      [1n, CHANGE.after],
    ] as const) {
      it(`decodes the change's instant in the offset ${side === 0n ? "before" : "after"} it`, ({
        seat,
      }) => {
        const [day, time] = divmod(CHANGE.at + offset, 86_400n);

        check.isEqualTo(
          seat,
          canonical(decodeFrom(new WallShape(LOCAL), 1n, 1n, 0n, 0n, side)[0]),
          wall(localValue(day, time), "Europe/Amsterdam"),
          "the wall time at the change",
        );
      });
    }

    it("decodes a wall time away from the changes over the whole range", ({ seat }) => {
      check.isEqualTo(
        seat,
        canonical(decodeFrom(new WallShape(LOCAL), 1n, 0n, 5n, 6n)[0]),
        wall(localValue(5n, 6n), "Europe/Amsterdam"),
        "the local date and time's two choices",
      );
    });

    it("decodes about half of the wall times near a change in the offset after it", ({
      seat,
    }) => {
      const shape = new WallShape(LOCAL);
      let near = 0;
      let after = 0;
      for (let index = 0n; index < 4000n; index += 1n) {
        const c = new Case(new Generating(caseSource(13n, index)));
        shape[DECODE](c);
        const changes = ZONES[Number(c.choices[0]?.value)]?.changes.length ?? 0;
        if (changes > 0 && c.choices[1]?.value === 1n) {
          near += 1;
          if (c.choices[4]?.value === 1n) {
            after += 1;
          }
        }
      }

      check.isTrue(
        seat,
        near > 600 && Math.abs(after / near - 0.5) <= 0.06,
        "half of the wall times near a change",
      );
    });
  });
});
