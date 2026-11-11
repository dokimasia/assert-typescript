// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The choices that the steps of a machine make: the swarm's choice of the
 * actions that a case keeps, the index of a step's action, and the client
 * of a concurrent step.
 */

import { type Case, onEngine } from "../prop/case.js";
import type { Case as Engine } from "../prop/engine/case.js";
import { IntegerBounds } from "../prop/engine/choice.js";
import * as draw from "../prop/engine/draw.js";
import type { Tracing } from "../prop/engine/trace.js";
import type { Action } from "./machine.js";

/** The probability with which swarm keeps an action, before the draw conditions the choices on keeping one. */
const SWARM: draw.Rational = { num: 1n, den: 2n };

/** The bounds of a swarm choice that the last action must take, and of one that it may. */
const FORCED = new IntegerBounds(1n, 1n);
const FREE = new IntegerBounds(0n, 1n);

/**
 * Returns the actions that the case c keeps, in order, with one choice per
 * action without keep at the action's swarm position of e. The case keeps
 * an action with keep set without a choice, and such an action counts as
 * kept before the first choice, so the remaining actions of each choice are
 * the actions without keep alone. A case that follows trace keeps the
 * actions that its step entries name.
 *
 * @param c - The case.
 * @param e - The engine's record of the case, whose place each choice sets.
 * @param actions - The machine's actions.
 * @param trace - The trace that the case follows, or undefined.
 * @returns The kept actions.
 */
export function keptActions<S>(
  c: Case,
  e: Engine,
  actions: readonly Action<S>[],
  trace: Tracing | undefined,
): Action<S>[] {
  const named = trace?.actions() ?? new Set<string>();
  const marked = actions.some((action) => action.keep === true);
  let remaining = actions.filter((action) => action.keep !== true).length;
  const kept: Action<S>[] = [];
  actions.forEach((action, position) => {
    if (action.keep === true) {
      kept.push(action);
      return;
    }
    e.place = { part: "swarm", position, action: action.name };
    trace?.prepare(named.has(action.name) ? 1n : 0n);
    const earlier = marked || kept.length > 0;
    const left = remaining;
    const value = onEngine(c, (engine) =>
      engine.choose({
        bounds: !earlier && left === 1 ? FORCED : FREE,
        draw: (source) => draw.keep(source, SWARM, earlier, left),
        edge: 1n,
      }),
    );
    if (value === 1n) {
      kept.push(action);
    }
    remaining -= 1;
  });
  return kept;
}

/**
 * Returns the case's choice of an action of listed, by weight.
 *
 * @param c - The case.
 * @param listed - The actions to choose from, at least one.
 * @returns The index of the action.
 */
export function actionIndex<S>(c: Case, listed: readonly Action<S>[]): number {
  const weights = listed.map((action) => BigInt(Math.max(action.weight ?? 1, 1)));
  const bounds = new IntegerBounds(0n, BigInt(listed.length - 1));
  const index = onEngine(c, (e) =>
    e.choose({
      bounds,
      draw: (source) => BigInt(draw.weighted(source, weights)),
      edge: 0n,
    }),
  );
  return Number(index);
}

/**
 * Returns the case's choice of a concurrent step's client, uniform from 0 to
 * clients with target 0.
 *
 * @param c - The case.
 * @param clients - The clients of the concurrent section.
 * @returns The client.
 */
export function clientOf(c: Case, clients: number): number {
  const most = BigInt(clients);
  const client = onEngine(c, (e) =>
    e.choose({
      bounds: new IntegerBounds(0n, most),
      draw: (source) => source.below(most + 1n),
      edge: 0n,
    }),
  );
  return Number(client);
}
