// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The steps of a machine in a case that follows the trace of prop.draws:
 * each step entry becomes the choices of one step, and an entry that the
 * steps cannot take at its position is refused.
 */

import { type Case, onEngine } from "../prop/case.js";
import type { Tracing } from "../prop/engine/trace.js";
import type { Action } from "./machine.js";

/**
 * Serves the flag and the index of the trace's next entry when it is a
 * sequential step entry. It refuses the entry past the most steps, and for
 * an action that available lacks.
 *
 * @param c - The case.
 * @param trace - The trace that the case follows.
 * @param available - The actions that the step may take.
 * @param count - The position of the step in its part.
 * @param max - The most sequential steps.
 */
export function followSequential<S>(
  c: Case,
  trace: Tracing,
  available: readonly Action<S>[],
  count: number,
  max: number,
): void {
  onEngine(c, () => {
    const step = trace.nextStep();
    if (step === undefined || step.client !== undefined || step.drain === true) {
      return;
    }
    const index = available.findIndex((action) => action.name === step.action);
    if (count === max || index < 0) {
      trace.refuse();
    }
    trace.take(1n, BigInt(index));
  });
}

/**
 * Refuses the trace's next entry when it is a concurrent step entry, for a
 * machine that runs no concurrent section.
 *
 * @param c - The case.
 * @param trace - The trace that the case follows.
 */
export function refuseConcurrent(c: Case, trace: Tracing): void {
  onEngine(c, () => {
    const step = trace.nextStep();
    if (step?.client !== undefined && step.drain !== true) {
      trace.refuse();
    }
  });
}

/**
 * Serves the flag, the client and the index of the trace's next entry when
 * it is a concurrent step entry. It refuses the entry past the most steps,
 * for a client outside the clients, and for an action that eligible lacks.
 *
 * @param c - The case.
 * @param trace - The trace that the case follows.
 * @param eligible - The actions that a concurrent step may take.
 * @param count - The position of the step in its part.
 * @param limits - The most concurrent steps, and the clients.
 */
export function followConcurrent<S>(
  c: Case,
  trace: Tracing,
  eligible: readonly Action<S>[],
  count: number,
  limits: { readonly concurrent: number; readonly clients: number },
): void {
  onEngine(c, () => {
    const step = trace.nextStep();
    const client = step?.client;
    if (step === undefined || client === undefined || step.drain === true) {
      return;
    }
    const index = eligible.findIndex((action) => action.name === step.action);
    const outside = client < 0 || client > limits.clients;
    if (count === limits.concurrent || outside || index < 0) {
      trace.refuse();
    }
    trace.take(1n, BigInt(client), BigInt(index));
  });
}

/**
 * Serves the index of the trace's next entry when it is a drain step entry.
 * It refuses the entry for an action that available lacks, which is every
 * action once the drain has ended.
 *
 * @param c - The case.
 * @param trace - The trace that the case follows.
 * @param available - The drain actions that the step may take.
 */
export function followDrain<S>(
  c: Case,
  trace: Tracing,
  available: readonly Action<S>[],
): void {
  onEngine(c, () => {
    const step = trace.nextStep();
    if (step?.drain !== true) {
      return;
    }
    const index = available.findIndex((action) => action.name === step.action);
    if (index < 0) {
      trace.refuse();
    }
    trace.take(BigInt(index));
  });
}
