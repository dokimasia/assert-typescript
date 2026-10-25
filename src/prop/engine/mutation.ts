// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The mutation of a member of a campaign's pool: one choice drawn again, a
 * span deleted, a span repeated after itself, or a span replaced with a
 * span of the same label of a member, and the provider that replays the
 * mutated choices.
 */

import type { Provider, Request } from "./case/providers.js";
import type { Span } from "./case/record.js";
import { type Bounds, type Choice, choiceOf, type Value } from "./choice.js";
import * as draw from "./draw.js";
import type { Source } from "./source.js";

/**
 * The kinds of mutation of a member, among which a mutated case chooses
 * uniformly: a choice drawn again, a span deleted, a span repeated, and the
 * fourth, a span replaced.
 */
const REDRAW = 0n;
const DELETE = 1n;
const REPEAT = 2n;
const KINDS = 4n;

/** Returns one element of items, chosen uniformly from source. */
function pick<T>(source: Source, items: readonly T[]): T {
  return items[Number(source.below(BigInt(items.length)))] as T;
}

/** Returns a value drawn from bounds alone, as a value request of those bounds draws it. */
function redrawn(bounds: Bounds, source: Source): Choice {
  switch (bounds.kind) {
    case "integer":
      return choiceOf(bounds, draw.integer(source, bounds));
    case "float":
      return choiceOf(bounds, draw.floatValue(source, bounds));
    default:
      return choiceOf(bounds, draw.sequence(source, bounds));
  }
}

/** Returns the choices of member with one of them, chosen uniformly, drawn again from its bounds. */
function redrawOne(member: Member, source: Source): Choice[] {
  const choices = [...member.choices];
  const at = Number(source.below(BigInt(choices.length)));
  choices[at] = redrawn(member.bounds[at] as Bounds, source);
  return choices;
}

/** A case of the pool: its choices, the bounds of the request of each, and its spans. */
export interface Member {
  readonly choices: readonly Choice[];
  readonly bounds: readonly Bounds[];
  readonly spans: readonly Span[];
}

/**
 * Returns the choices of a mutation of a member of pool. A member without
 * spans takes the mutation that draws a choice again, and so does a
 * replacement whose donor has no span of the span's label. A member without
 * choices takes no mutation.
 */
export function mutation(pool: readonly Member[], source: Source): Choice[] {
  const member = pick(source, pool);
  const { choices } = member;
  if (choices.length === 0) {
    return [];
  }
  const drawn = source.below(KINDS);
  const kind = member.spans.length === 0 ? REDRAW : drawn;
  if (kind === REDRAW) {
    return redrawOne(member, source);
  }
  const span = pick(source, member.spans);
  const before = choices.slice(0, span.start);
  const after = choices.slice(span.end);
  if (kind === DELETE) {
    return [...before, ...after];
  }
  if (kind === REPEAT) {
    return [...choices.slice(0, span.end), ...choices.slice(span.start)];
  }
  const donor = pick(source, pool);
  const same = donor.spans.filter((other) => other.label === span.label);
  if (same.length === 0) {
    return redrawOne(member, source);
  }
  const given = pick(source, same);
  return [...before, ...donor.choices.slice(given.start, given.end), ...after];
}

/**
 * A provider that replays the choices of a mutated case, each fitted to its
 * request's bounds, and draws each request past them from the campaign's
 * stream.
 */
export class Mutating implements Provider {
  readonly #choices: readonly Choice[];
  readonly #source: Source;

  constructor(choices: readonly Choice[], source: Source) {
    this.#choices = choices;
    this.#source = source;
  }

  value(request: Request, index: number): Value {
    const choice = this.#choices[index];
    return choice === undefined
      ? request.draw(this.#source)
      : request.bounds.coerce(choice);
  }
}
