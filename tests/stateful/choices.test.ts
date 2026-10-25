// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the choices that the steps of a machine make. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { actionIndex, clientOf, keptActions } from "../../src/stateful/choices.js";
import type { Action } from "../../src/stateful/machine.js";
import { test as it } from "../../src/vitest.js";
import { bodyCase, replaying } from "../helpers.js";

/** Returns the actions of names, which do nothing, with the weights of weights. */
function actions(
  names: readonly string[],
  weights: readonly number[] = [],
): Action<unknown>[] {
  return names.map((name, i) => ({ name, run: () => undefined, weight: weights[i] }));
}

describe("choices", () => {
  describe("keptActions", () => {
    it("keeps the actions whose choices are 1", ({ seat }) => {
      const { c, engine } = bodyCase(replaying(1, 0, 1));

      check.isEqualTo(
        seat,
        keptActions(c, engine, actions(["a", "b", "c"]), undefined).map(
          (action) => action.name,
        ),
        ["a", "c"],
        "a and c",
      );
    });

    it("keeps the last action when the case kept no earlier one", ({ seat }) => {
      const { c, engine } = bodyCase(replaying(0, 0));

      check.isEqualTo(
        seat,
        keptActions(c, engine, actions(["a", "b"]), undefined).map(
          (action) => action.name,
        ),
        ["b"],
        "b alone",
      );
    });

    it("makes each choice at the swarm position of its action", ({ seat }) => {
      const { c, engine } = bodyCase(replaying(1, 1));
      keptActions(c, engine, actions(["a", "b"]), undefined);

      check.isEqualTo(
        seat,
        engine.wheres.map((where) => where.place),
        [
          { part: "swarm", position: 0, action: "a" },
          { part: "swarm", position: 1, action: "b" },
        ],
        "the places of the two choices",
      );
    });
  });

  describe("actionIndex", () => {
    it("returns the recorded index of an action with the edge 0", ({ seat }) => {
      const { c, engine } = bodyCase(replaying(2));

      check.isEqualTo(
        seat,
        [actionIndex(c, actions(["a", "b", "c"], [1, 2, 3])), engine.requests[0]?.edge],
        [2, 0n],
        "the index 2",
      );
    });
  });

  describe("clientOf", () => {
    it("returns the recorded client from 0 to the clients", ({ seat }) => {
      const { c, engine } = bodyCase(replaying(2));

      check.isEqualTo(
        seat,
        [clientOf(c, 2), engine.requests[0]?.bounds.id],
        [2, "integer 0 2"],
        "the client 2",
      );
    });
  });
});
