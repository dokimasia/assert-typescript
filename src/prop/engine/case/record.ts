// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The parts of the record of a case: its spans, its draws, the steps of a
 * machine, and where the case made each request.
 */

import type { Decoder } from "../case.js";
import type { Value } from "../choice.js";
import type { Request } from "./providers.js";

/** What watches each choice as the case records it: the case tree. */
export interface Observer {
  /** Takes the choice at index, or throws a signal that ends the body. */
  step: (index: number, request: Request, value: Value) => void;
}

/** One step that a machine took: its action's name, and where it ran. */
export interface Step {
  /** The action's name. */
  readonly action: string;
  /** The client of a step of a concurrent section. */
  readonly client?: number | undefined;
  /** Whether the step is a step of the drain. */
  readonly drain?: boolean | undefined;
}

/**
 * The part of a machine's steps that was running, and its step. part is
 * swarm, setup, sequential, concurrent, drain or settle. position is the
 * step's position in its part, and action the step's action.
 */
export interface Place {
  /** The part. */
  readonly part: string;
  /** The step's position in its part, from 0. */
  readonly position?: number | undefined;
  /** The swarm choice's action or the step's action. */
  readonly action?: string | undefined;
}

/** Where a case made a request or observed a fingerprint. */
export interface Where {
  /** The label of the innermost draw that was running. */
  readonly label?: string | undefined;
  /** The machine's part and step. */
  readonly place?: Place | undefined;
}

/** The choices that one generator, element or entry made: [start, end). */
export interface Span {
  /** The generator's id, `element` or `entry`. */
  readonly label: string;
  /** The first choice. */
  readonly start: number;
  /** The choice after the last. */
  end: number;
  /** The spans that were open when this one opened. */
  readonly depth: number;
  /** The index of the span that was open when this one opened, or undefined. */
  readonly parent: number | undefined;
}

/** One value that a body drew: its label, its generator and the index of that generator's span. */
export interface Drawn {
  /** The draw's label. */
  readonly label: string;
  /** The value. */
  readonly value: unknown;
  /** The index of the first span that the generator opened. */
  readonly span: number;
  /** The generator. */
  readonly generator: Decoder;
}

/** A point of a case's record, as the lengths of its choices, spans and draws. */
export interface Mark {
  readonly choices: number;
  readonly spans: number;
  readonly draws: number;
}
