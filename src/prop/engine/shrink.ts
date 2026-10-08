/**
 * Shrinking: the search for the smallest case that fails the same way.
 *
 * A case is smaller than another when its choice sequence is shorter, or
 * equally long and smaller in the first choice where the two differ, as
 * the order module states.
 *
 * Before shrinking, the failing case is replayed once from its choices. A
 * replay that requests another choice, observes another fingerprint, or
 * ends another way makes the run flaky.
 *
 * The shrinker runs its passes over the best case of one failure, in the
 * order that Shrinker.shrink lists them, until a whole round accepts no
 * candidate. delete-and-lower runs only in a round in which no other pass
 * accepted a candidate. A candidate is run only when it is smaller than the
 * best case and no earlier candidate had the same choices. It is accepted
 * when its run fails with the same identity and the run's recorded choices
 * are smaller than the best case's. A run that fails with another identity
 * is kept as a further failure. Every failure is shrunk in turn, the one
 * with the smallest case first, and all of them share one budget of runs.
 *
 * The explain phase then fills each draw of the counterexample with four
 * random values. A draw for which every filling still fails the same way is
 * one where any value fails. For an integer draw that matters, one step
 * towards its target that passes is its nearest passing value.
 */

import {
  Case,
  DECODE,
  type Drawn,
  Failed,
  Generating,
  Rejected,
  Replaying,
  type Request,
  type Span,
  type Where,
} from "./case.js";
import {
  type Choice,
  choiceOf,
  type FloatBounds,
  IntegerBounds,
  type Value,
} from "./choice.js";
import {
  type Body,
  type Divergence,
  type Execution,
  execute,
  identityOf,
  type Observer,
  type Phase,
  unobserved,
} from "./execution.js";
import { INTEGRAL_LIMIT, type Key } from "./float.js";
import { type Generator, Integer, Mapped } from "./generator.js";
import { choiceKey, compareSequences } from "./order.js";
import { MASK, Source } from "./source.js";
import { encode } from "./token.js";
import type { Work } from "./work.js";

/** The runs of the body that shrinking every failure of a run may spend. */
export const DEFAULT_BUDGET = 2000;

/** The random fillings that the explain phase tries for each draw. */
const EXPLAIN_FILLINGS = 4;

/** The probes that findInteger makes one by one before it starts doubling. */
const LINEAR_PROBES = 4n;

/** The fewest siblings that delete-span-chunk deletes at once; delete-span deletes one. */
const SMALLEST_CHUNK = 2;

/** The signal that the shrink budget is spent. */
export class Exhausted extends Error {
  /** Returns the signal. */
  constructor() {
    super("prop: the shrink budget is spent");
    this.name = "Exhausted";
  }
}

/** One recorded choice with its request. */
export interface Node {
  readonly request: Request;
  readonly choice: Choice;
}

/** The smallest case found so far that fails with one identity. */
export interface Failure {
  readonly identity: string;
  readonly execution: Execution;
  readonly nodes: readonly Node[];
  readonly keys: readonly Key[];
}

/**
 * One draw of the counterexample, explained. anyValueFails is undefined
 * when the draw makes no choice, no filling decodes, or the budget ran out
 * before its fillings. nearest is the value one step towards the target,
 * for an integer draw where that value passes.
 */
export interface Explained {
  readonly label: string;
  readonly value: unknown;
  readonly anyValueFails: boolean | undefined;
  readonly nearest: { readonly value: unknown } | undefined;
}

/**
 * Returns a case's choices with their requests.
 *
 * @param c - The case.
 * @returns The nodes.
 */
export function nodesOf(c: Case): Node[] {
  return c.choices.map((choice, i) => ({ request: c.requests[i] as Request, choice }));
}

/** Returns the keys of the choices of nodes. */
function keysOf(nodes: readonly Node[]): Key[] {
  return nodes.map((node) => choiceKey(node.request.bounds, node.choice.value));
}

/**
 * Returns a k with f(k) true and f(k + 1) false, given that f(0) is true.
 * It probes 1 to 4 in turn, then doubles until f fails, then bisects.
 */
function* findInteger(f: (k: bigint) => Work<boolean>): Work<bigint> {
  for (let k = 1n; k <= LINEAR_PROBES; k += 1n) {
    if (!(yield* f(k))) return k - 1n;
  }
  let low = LINEAR_PROBES;
  let high = LINEAR_PROBES + 1n;
  while (yield* f(high)) {
    low = high;
    high *= 2n;
  }
  while (low + 1n < high) {
    const middle = (low + high) / 2n;
    if (yield* f(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/**
 * Tries position 0, then bisects towards the smallest position that at
 * accepts. at(p) runs the candidate at position p of an order whose position
 * 0 is the target, and reports whether it was accepted. position is the
 * current one. The result reports whether any candidate was accepted.
 */
function* search(position: bigint, at: (p: bigint) => Work<boolean>): Work<boolean> {
  if (position === 0n) return false;
  if (yield* at(0n)) return true;
  let low = 0n;
  let high = position;
  let improved = false;
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    if (yield* at(middle)) {
      high = middle;
      improved = true;
    } else {
      low = middle;
    }
  }
  return improved;
}

/**
 * Returns the seed of a draw's filling: seed + (draw + 1) × 2^32 + filling,
 * modulo 2^64.
 *
 * @param seed - The run's seed.
 * @param draw - The draw's position in the case.
 * @param filling - The filling's position.
 * @returns The seed.
 */
export function explainSeed(seed: bigint, draw: number, filling: number): bigint {
  return (seed + (BigInt(draw + 1) << 32n) + BigInt(filling)) & MASK;
}

/** Returns the bounds id of a request, or undefined past the last one. */
function boundsAt(
  requests: readonly Request[],
  index: number,
): Request["bounds"] | undefined {
  return requests[index]?.bounds;
}

/**
 * Replays a failing case once, and returns how the replay differed, if it
 * did. The comparison takes the requests' bounds first, then the observed
 * fingerprints, then the way the replay ended. A request or a fingerprint
 * that differs takes the label and the step of the replay's request or
 * fingerprint at its position.
 *
 * @param body - The body.
 * @param failing - The failing execution.
 * @param maxChoices - The most choices of a case.
 * @param observer - What sees the replay.
 * @returns The work, which returns the divergence or undefined.
 */
export function* confirm(
  body: Body,
  failing: Execution,
  maxChoices: number,
  observer: Observer = unobserved,
): Work<Divergence | undefined> {
  const replay = yield* execute(body, new Replaying(failing.case.choices), maxChoices);
  observer("replay", replay);
  const recorded = failing.case.requests;
  const replayed = replay.case.requests;
  for (let i = 0; i < Math.max(recorded.length, replayed.length); i += 1) {
    const before = boundsAt(recorded, i);
    const after = boundsAt(replayed, i);
    if (before?.id !== after?.id) {
      const where: Where = replay.case.wheres[i] ?? {};
      return {
        what: "request",
        index: i,
        recorded: before,
        replayed: after,
        label: where.label,
        step: where.place,
      };
    }
  }
  const fingerprints = failing.case.fingerprints;
  const observed = replay.case.fingerprints;
  for (let i = 0; i < Math.max(fingerprints.length, observed.length); i += 1) {
    if (fingerprints[i] !== observed[i]) {
      const where: Where = replay.case.observed[i] ?? {};
      return {
        what: "fingerprint",
        index: i,
        recorded: fingerprints[i],
        replayed: observed[i],
        label: where.label,
        step: where.place,
      };
    }
  }
  if (identityOf(replay) !== identityOf(failing)) {
    return {
      what: "verdict",
      index: failing.case.choices.length,
      recorded: identityOf(failing),
      replayed: identityOf(replay),
    };
  }
  return undefined;
}

/** Returns nodes with one choice's value replaced. */
function replaced(nodes: readonly Node[], index: number, value: Value): Node[] {
  const node = nodes[index] as Node;
  const changed = {
    request: node.request,
    choice: choiceOf(node.request.bounds, value),
  };
  return [...nodes.slice(0, index), changed, ...nodes.slice(index + 1)];
}

/** Returns nodes without the nodes from start up to end. */
function without(nodes: readonly Node[], start: number, end: number): Node[] {
  return [...nodes.slice(0, start), ...nodes.slice(end)];
}

/** Returns the node with its choice at its target. */
function atTarget(node: Node): Node {
  return {
    request: node.request,
    choice: choiceOf(node.request.bounds, node.request.bounds.target),
  };
}

/** Returns the spans whose parent is parent, in order. */
function children(spans: readonly Span[], parent: number | undefined): Span[] {
  return spans.filter((span) => span.parent === parent);
}

/** Returns every parent of a sibling group: the later parents first, then the top. */
function parentsOf(spans: readonly Span[]): (number | undefined)[] {
  const parents = [
    ...new Set(
      spans.map((span) => span.parent).filter((p): p is number => p !== undefined),
    ),
  ].sort((a, b) => a - b);
  return [...parents.reverse(), ...(spans.length > 0 ? [undefined] : [])];
}

/** Returns the sibling groups, in the order of parentsOf. */
function groupsOf(spans: readonly Span[]): Span[][] {
  return parentsOf(spans).map((parent) => children(spans, parent));
}

/** Returns the descendants of the span at index, in order. */
function descendants(spans: readonly Span[], index: number): Span[] {
  const inside = new Set([index]);
  const found: Span[] = [];
  for (let later = index + 1; later < spans.length; later += 1) {
    const span = spans[later] as Span;
    if (span.parent === undefined || !inside.has(span.parent)) break;
    inside.add(later);
    found.push(span);
  }
  return found;
}

/** Returns the spans, from the span that starts last to the first, and of two that start together the longer first. */
function latestFirst(spans: readonly Span[]): Span[] {
  return [...spans].sort((a, b) => b.start - a.start || b.end - a.end);
}

/** Returns the largest power of two that is count or less, and 0 for 0. */
function largestPower(count: number): number {
  return count === 0 ? 0 : 2 ** Math.floor(Math.log2(count));
}

/** Returns n × 2^-k rounded down, for k ≥ 0. */
function floorShift(n: bigint, k: number): bigint {
  return n >> BigInt(k);
}

/** Returns n × 2^-k rounded up, for k ≥ 0. */
function ceilShift(n: bigint, k: number): bigint {
  return -(-n >> BigInt(k));
}

/** Returns a float's exact value as numerator × 2^-bits, with bits the fractional bits of the value. */
function fractionOf(value: number): {
  readonly numerator: bigint;
  readonly bits: number;
} {
  let bits = 0;
  let scaled = value;
  while (!Number.isInteger(scaled)) {
    scaled *= 2;
    bits += 1;
  }
  return { numerator: BigInt(scaled), bits };
}

/**
 * Yields a fraction rounded to fewer fractional bits, from 0 bits up. At
 * each number of bits it yields the value rounded towards the target, then
 * away from it, when the bounds admit them. An integral value, an infinity
 * and NaN yield nothing.
 */
function* roundedFloats(value: number, bounds: FloatBounds): Iterable<number> {
  if (!Number.isFinite(value)) return;
  const { numerator, bits } = fractionOf(value);
  const downward = value > bounds.target;
  for (let fractionBits = 0; fractionBits < bits; fractionBits += 1) {
    const shift = bits - fractionBits;
    const roundings = downward ? [floorShift, ceilShift] : [ceilShift, floorShift];
    for (const rounding of roundings) {
      const candidate = Number(rounding(numerator, shift)) * 2 ** -fractionBits;
      if (bounds.admits(candidate)) yield candidate;
    }
  }
}

/**
 * Returns nodes with the integer at index stepped once towards its target,
 * or undefined for a choice that is no integer and for an integer at its
 * target.
 */
function steppedAt(nodes: readonly Node[], index: number): Node[] | undefined {
  const node = nodes[index] as Node;
  if (node.request.bounds.kind !== "integer") return undefined;
  const value = node.choice.value as bigint;
  const target = node.request.bounds.target;
  if (value === target) return undefined;
  return replaced(nodes, index, value > target ? value - 1n : value + 1n);
}

/**
 * Yields nodes with 2^k consecutive elements deleted from the sequence
 * choice at index, the largest k first and the last run first, never below
 * its minSize. A choice of another kind yields nothing.
 */
function* sequenceDeletions(nodes: readonly Node[], index: number): Iterable<Node[]> {
  const node = nodes[index] as Node;
  const bounds = node.request.bounds;
  if (bounds.kind !== "sequence") return;
  const elements = node.choice.value as readonly number[];
  const count = elements.length;
  for (let size = largestPower(count); size >= 1; size = Math.floor(size / 2)) {
    if (count - size < bounds.minSize) continue;
    for (let first = count - size; first >= 0; first -= 1) {
      yield replaced(nodes, index, [
        ...elements.slice(0, first),
        ...elements.slice(first + size),
      ]);
    }
  }
}

/**
 * Yields nodes with one element deleted from the sequence choice at index,
 * the last element first, when the sequence is longer than its minSize. A
 * choice of another kind yields nothing.
 */
function* elementDeletions(nodes: readonly Node[], index: number): Iterable<Node[]> {
  const node = nodes[index] as Node;
  const bounds = node.request.bounds;
  if (bounds.kind !== "sequence") return;
  const elements = node.choice.value as readonly number[];
  if (elements.length <= bounds.minSize) return;
  for (let position = elements.length - 1; position >= 0; position -= 1) {
    yield replaced(nodes, index, [
      ...elements.slice(0, position),
      ...elements.slice(position + 1),
    ]);
  }
}

/** Reports whether a choice decides structure and allows two values or more. */
function freeStructure(node: Node): boolean {
  const bounds = node.request.bounds;
  return (
    node.request.edge !== undefined &&
    bounds.kind === "integer" &&
    bounds.lo < bounds.hi
  );
}

/** Returns the groups of choices that share bounds and a value off the target. */
function duplicates(nodes: readonly Node[]): number[][] {
  const shared = new Map<string, number[]>();
  nodes.forEach((node, index) => {
    const key = choiceKey(node.request.bounds, node.choice.value);
    const target = choiceKey(node.request.bounds, node.request.bounds.target);
    if (compareSequences([key], [target]) === 0) return;
    const identity = `${node.request.bounds.id}|${encode([node.choice])}`;
    const group = shared.get(identity);
    if (group === undefined) shared.set(identity, [index]);
    else group.push(index);
  });
  return [...shared.values()].filter((indices) => indices.length > 1);
}

/** The index of the next node after index with the same bounds as the node at index, or undefined. */
function nextWithBounds(nodes: readonly Node[], index: number): number | undefined {
  const id = (nodes[index] as Node).request.bounds.id;
  for (let j = index + 1; j < nodes.length; j += 1) {
    if ((nodes[j] as Node).request.bounds.id === id) return j;
  }
  return undefined;
}

/** The shrink of every failure of one run, over one budget. */
export class Shrinker {
  readonly #body: Body;
  readonly #maxChoices: number;
  readonly #observer: Observer;
  /** The runs of the body that the shrink may spend. */
  readonly budget: number;
  /** The runs spent. */
  runs = 0;
  /** The smallest case of each identity, in the order the identities were found. */
  readonly failures = new Map<string, Failure>();
  /** The token of every candidate run so far, with the number of choices its run recorded. */
  readonly #sizes = new Map<string, number>();
  /** The reading of the platform clock after which the shrink stops, or infinity for none. */
  readonly #deadline: number;
  #target: string;

  /**
   * Returns the shrinker that starts from the first failing case.
   *
   * @param body - The body.
   * @param first - The first failing execution.
   * @param maxChoices - The most choices of a case.
   * @param budget - The runs that the shrink may spend.
   * @param observer - What sees every run.
   * @param time - The milliseconds that the shrink may take on the platform
   *   clock, and 0 for no limit.
   */
  constructor(
    body: Body,
    first: Execution,
    maxChoices: number,
    budget: number,
    observer: Observer = unobserved,
    time = 0,
  ) {
    this.#body = body;
    this.#maxChoices = maxChoices;
    this.#observer = observer;
    this.#deadline = time > 0 ? performance.now() + time : Number.POSITIVE_INFINITY;
    this.budget = budget;
    this.#sizes.set(encode(first.case.choices), first.case.choices.length);
    this.#target = identityOf(first) as string;
    this.#record(first);
  }

  /** The failure being shrunk. */
  get best(): Failure {
    return this.failures.get(this.#target) as Failure;
  }

  /** The best case's choices. */
  get nodes(): readonly Node[] {
    return this.best.nodes;
  }

  /** The best case's spans. */
  get spans(): readonly Span[] {
    return this.best.execution.case.spans;
  }

  /** Keeps a failing run when it is its identity's first or smallest. */
  #record(execution: Execution): void {
    const identity = identityOf(execution) as string;
    const nodes = nodesOf(execution.case);
    const keys = keysOf(nodes);
    const known = this.failures.get(identity);
    if (known === undefined || compareSequences(keys, known.keys) < 0) {
      this.failures.set(identity, { identity, execution, nodes, keys });
    }
  }

  /**
   * Runs the body on choices in phase, spending one run of the budget.
   *
   * @param choices - The choices.
   * @param phase - The phase of the run.
   * @returns The work, which returns the execution.
   * @throws Exhausted when the budget or the time is spent.
   */
  *run(choices: readonly Choice[], phase: Phase = "shrink"): Work<Execution> {
    if (this.runs >= this.budget || performance.now() > this.#deadline)
      throw new Exhausted();
    this.runs += 1;
    const execution = yield* execute(
      this.#body,
      new Replaying(choices),
      this.#maxChoices,
    );
    this.#observer(phase, execution);
    return execution;
  }

  /** Runs a candidate that is smaller and new, and reports whether it became the best. */
  *#consider(nodes: readonly Node[]): Work<boolean> {
    if (compareSequences(keysOf(nodes), this.best.keys) >= 0) return false;
    const choices = nodes.map((node) => node.choice);
    const token = encode(choices);
    if (this.#sizes.has(token)) return false;
    const execution = yield* this.run(choices);
    this.#sizes.set(token, execution.case.choices.length);
    if (execution.failure === undefined) return false;
    const before = this.best;
    this.#record(execution);
    return this.best !== before;
  }

  /**
   * Shrinks each failure in turn, the one with the smallest case first.
   * Shrinking stops when every failure is done or the budget is spent. Two
   * failures of a body that is a function of its choices never have cases
   * of equal keys, because equal keys are equal choices.
   *
   * @returns The work.
   */
  *shrinkAll(): Work<void> {
    const done = new Set<string>();
    try {
      for (;;) {
        const pending = [...this.failures.values()].filter(
          (f) => !done.has(f.identity),
        );
        if (pending.length === 0) return;
        const target = pending.reduce((a, b) =>
          compareSequences(a.keys, b.keys) <= 0 ? a : b,
        );
        yield* this.#shrink(target.identity);
        done.add(target.identity);
      }
    } catch (err) {
      if (!(err instanceof Exhausted)) throw err;
    }
  }

  /** Runs rounds of every pass on one failure until a round accepts nothing. */
  *#shrink(identity: string): Work<void> {
    this.#target = identity;
    const passes = [
      () => this.#deleteSpanChunk(),
      () => this.#deleteSpan(),
      () => this.#liftDescendant(),
      () => this.#deleteSpanRun(),
      () => this.#sequenceDelete(),
      () => this.#deleteStructurePair(),
      () => this.#targetSpan(),
      () => this.#minimizeChoice(),
      () => this.#sequenceLower(),
      () => this.#lowerAndDelete(),
      () => this.#sortSiblings(),
      () => this.#redistribute(),
      () => this.#lowerTogether(),
      () => this.#minimizeDuplicates(),
      () => this.#floatSimplify(),
    ];
    for (;;) {
      let improved = false;
      for (const pass of passes) {
        if (yield* pass()) improved = true;
      }
      if (!improved && !(yield* this.#deleteAndLower())) return;
    }
  }

  /** Tries candidates in order, and after an acceptance starts over on the new best. */
  *#sweep(candidates: () => Iterable<readonly Node[]>): Work<boolean> {
    let improved = false;
    for (;;) {
      let accepted = false;
      for (const candidate of candidates()) {
        if (yield* this.#consider(candidate)) {
          accepted = true;
          break;
        }
      }
      if (!accepted) return improved;
      improved = true;
    }
  }

  /** Deletes 2^k consecutive siblings, the largest k first, the last chunk first. */
  #deleteSpanChunk(): Work<boolean> {
    const self = this;
    return this.#sweep(function* () {
      const nodes = self.nodes;
      for (const group of groupsOf(self.spans)) {
        const count = group.length;
        for (
          let size = largestPower(count);
          size >= SMALLEST_CHUNK;
          size = Math.floor(size / 2)
        ) {
          for (let first = count - size; first >= 0; first -= 1) {
            const start = (group[first] as Span).start;
            const end = (group[first + size - 1] as Span).end;
            if (start < end) yield without(nodes, start, end);
          }
        }
      }
    });
  }

  /** Deletes one span, from the span that starts last to the first, and of two that start together the longer first. */
  #deleteSpan(): Work<boolean> {
    const self = this;
    return this.#sweep(function* () {
      const nodes = self.nodes;
      for (const span of latestFirst(self.spans)) {
        if (span.start < span.end) yield without(nodes, span.start, span.end);
      }
    });
  }

  /** Replaces a span by a shorter descendant with the same label. */
  #liftDescendant(): Work<boolean> {
    const self = this;
    return this.#sweep(function* () {
      const nodes = self.nodes;
      const spans = self.spans;
      for (const [index, span] of spans.entries()) {
        for (const inner of descendants(spans, index)) {
          const shorter = inner.end - inner.start < span.end - span.start;
          if (inner.label === span.label && shorter) {
            yield [
              ...nodes.slice(0, span.start),
              ...nodes.slice(inner.start, inner.end),
              ...nodes.slice(span.end),
            ];
          }
        }
      }
    });
  }

  /**
   * Deletes as long a run of siblings as findInteger finds, at each start.
   * The groups are visited in parentsOf order. Within a group the runs start
   * at the first sibling and move to the last.
   */
  *#deleteSpanRun(): Work<boolean> {
    let improved = false;
    for (const parent of parentsOf(this.spans)) {
      for (let first = 0; first < children(this.spans, parent).length; first += 1) {
        const original = this.nodes;
        const group = children(this.spans, parent);
        const deleted = (count: bigint) =>
          this.#deleteRun(original, group, first, Number(count));
        if ((yield* findInteger(deleted)) > 0n) improved = true;
      }
    }
    return improved;
  }

  /** Considers original without count siblings of group from first. */
  *#deleteRun(
    original: readonly Node[],
    group: readonly Span[],
    first: number,
    count: number,
  ): Work<boolean> {
    if (first + count > group.length) return false;
    const start = (group[first] as Span).start;
    const end = (group[first + count - 1] as Span).end;
    return yield* this.#consider(without(original, start, end));
  }

  /** Deletes 2^k consecutive elements of a sequence, the largest k first, never below its minSize. */
  #sequenceDelete(): Work<boolean> {
    const self = this;
    return this.#sweep(function* () {
      const nodes = self.nodes;
      for (const index of nodes.keys()) yield* sequenceDeletions(nodes, index);
    });
  }

  /** Deletes two adjacent free structure choices, from the last pair to the first. */
  #deleteStructurePair(): Work<boolean> {
    const self = this;
    return this.#sweep(function* () {
      const nodes = self.nodes;
      for (let first = nodes.length - 2; first >= 0; first -= 1) {
        if (
          freeStructure(nodes[first] as Node) &&
          freeStructure(nodes[first + 1] as Node)
        ) {
          yield without(nodes, first, first + 2);
        }
      }
    });
  }

  /** Sets every choice of one span to its target, for each span in order. */
  #targetSpan(): Work<boolean> {
    const self = this;
    return this.#sweep(function* () {
      const nodes = self.nodes;
      for (const span of self.spans) {
        yield [
          ...nodes.slice(0, span.start),
          ...nodes.slice(span.start, span.end).map(atTarget),
          ...nodes.slice(span.end),
        ];
      }
    });
  }

  /**
   * Moves integer choices of one value together towards their target: the
   * target first, then a binary search over the value's position in the key
   * order of its bounds.
   */
  *#lower(indices: readonly number[]): Work<boolean> {
    const nodes = this.nodes;
    const node = nodes[indices[0] as number] as Node;
    const bounds = node.request.bounds as IntegerBounds;
    const value = node.choice.value as bigint;
    const at = (rank: bigint): Work<boolean> => {
      let moved: readonly Node[] = nodes;
      for (const index of indices) moved = replaced(moved, index, bounds.atRank(rank));
      return this.#consider(moved);
    };
    return yield* search(bounds.rank(value), at);
  }

  /** Moves each choice towards its target, in order. */
  *#minimizeChoice(): Work<boolean> {
    let improved = false;
    for (let index = 0; index < this.nodes.length; index += 1) {
      const node = this.nodes[index] as Node;
      const accepted =
        node.request.bounds.kind === "integer"
          ? yield* this.#lower([index])
          : yield* this.#consider(
              replaced(this.nodes, index, node.request.bounds.target),
            );
      improved = accepted || improved;
    }
    return improved;
  }

  /** Moves each element of each sequence towards 0: 0, then a binary search. */
  *#sequenceLower(): Work<boolean> {
    let improved = false;
    for (let index = 0; index < this.nodes.length; index += 1) {
      for (
        let position = 0;
        index < this.nodes.length && position < this.#length(index);
        position += 1
      ) {
        improved = (yield* this.#lowerElement(index, position)) || improved;
      }
    }
    return improved;
  }

  /** Returns the number of elements of the sequence choice at index, and 0 for another kind. */
  #length(index: number): number {
    const value = (this.nodes[index] as Node).choice.value;
    return Array.isArray(value) ? value.length : 0;
  }

  /** Moves one element of a sequence towards 0. */
  *#lowerElement(index: number, position: number): Work<boolean> {
    const nodes = this.nodes;
    const elements = (nodes[index] as Node).choice.value as readonly number[];
    const at = (element: bigint): Work<boolean> => {
      const changed = [...elements];
      changed[position] = Number(element);
      return this.#consider(replaced(nodes, index, changed));
    };
    return yield* search(BigInt(elements[position] as number), at);
  }

  /**
   * Steps each integer towards its target, deleting a later span that it
   * sizes. A step accepted with a deletion is tried again on the same
   * integer, and a step accepted alone moves on to the next integer.
   */
  *#lowerAndDelete(): Work<boolean> {
    let improved = false;
    let index = 0;
    while (index < this.nodes.length) {
      const before = this.best;
      const deleted = yield* this.#stepAndDelete(index);
      improved = improved || this.best !== before;
      if (!deleted) index += 1;
    }
    return improved;
  }

  /**
   * Steps the integer at index by one, alone and then with a later span
   * deleted, and reports whether a step with a deletion was accepted. When
   * the step alone makes the run record another number of choices, the step
   * is tried with each span that starts after the integer deleted, the span
   * that starts last first.
   */
  *#stepAndDelete(index: number): Work<boolean> {
    const nodes = this.nodes;
    const stepped = steppedAt(nodes, index);
    if (stepped === undefined || (yield* this.#consider(stepped))) return false;
    const size = this.#sizes.get(encode(stepped.map((n) => n.choice)));
    if (size === undefined || size === nodes.length) return false;
    const later = latestFirst(
      this.spans.filter((span) => index < span.start && span.start < span.end),
    );
    for (const span of later) {
      if (yield* this.#consider(without(stepped, span.start, span.end))) return true;
    }
    return false;
  }

  /**
   * Steps each integer towards its target with earlier data deleted: one
   * span removed that is not empty and ends at or before the integer, the
   * span that starts last first, then one element removed from an earlier
   * sequence, the last sequence and its last element first.
   */
  #deleteAndLower(): Work<boolean> {
    const self = this;
    return this.#sweep(function* () {
      const nodes = self.nodes;
      const spans = self.spans;
      for (const index of nodes.keys()) {
        const stepped = steppedAt(nodes, index);
        if (stepped === undefined) continue;
        const earlier = spans.filter((s) => s.start < s.end && s.end <= index);
        for (const span of latestFirst(earlier))
          yield without(stepped, span.start, span.end);
        for (let at = index - 1; at >= 0; at -= 1) yield* elementDeletions(stepped, at);
      }
    });
  }

  /** Swaps adjacent siblings with one label when the later one is smaller. */
  #sortSiblings(): Work<boolean> {
    const self = this;
    return this.#sweep(function* () {
      const nodes = self.nodes;
      for (const group of groupsOf(self.spans)) {
        for (let i = 0; i + 1 < group.length; i += 1) {
          const left = group[i] as Span;
          const right = group[i + 1] as Span;
          const first = nodes.slice(left.start, left.end);
          const second = nodes.slice(right.start, right.end);
          if (
            left.label === right.label &&
            compareSequences(keysOf(second), keysOf(first)) < 0
          ) {
            yield [
              ...nodes.slice(0, left.start),
              ...second,
              ...nodes.slice(left.end, right.start),
              ...first,
              ...nodes.slice(right.end),
            ];
          }
        }
      }
    });
  }

  /** Moves value from each integer to the next integer with the same bounds, keeping their sum. */
  *#redistribute(): Work<boolean> {
    let improved = false;
    for (let index = 0; index < this.nodes.length; index += 1) {
      improved = (yield* this.#move(index)) || improved;
    }
    return improved;
  }

  /** Moves value from the integer at index to the next one with its bounds: the whole distance, then a binary search. */
  *#move(index: number): Work<boolean> {
    const nodes = this.nodes;
    const node = nodes[index] as Node;
    const bounds = node.request.bounds;
    if (bounds.kind !== "integer") return false;
    const value = node.choice.value as bigint;
    const later = nextWithBounds(nodes, index);
    const target = bounds.target;
    if (later === undefined || value === target) return false;
    const other = (nodes[later] as Node).choice.value as bigint;
    const sign = value > target ? 1n : -1n;
    const moved = (amount: bigint): Work<boolean> | false => {
      const raised = other + sign * amount;
      if (!bounds.admits(raised)) return false;
      return this.#consider(
        replaced(replaced(nodes, index, value - sign * amount), later, raised),
      );
    };
    const tried = function* (amount: bigint): Work<boolean> {
      const work = moved(amount);
      return work === false ? false : yield* work;
    };
    const distance = value > target ? value - target : target - value;
    if (yield* tried(distance)) return true;
    let low = 0n;
    let high = distance;
    let improved = false;
    while (high - low > 1n) {
      const middle = (low + high) / 2n;
      if (yield* tried(middle)) {
        low = middle;
        improved = true;
      } else {
        high = middle;
      }
    }
    return improved;
  }

  /** Moves each integer and the next integer with its bounds towards their target by one amount. */
  *#lowerTogether(): Work<boolean> {
    let improved = false;
    for (let index = 0; index < this.nodes.length; index += 1) {
      improved = (yield* this.#lowerPair(index)) || improved;
    }
    return improved;
  }

  /** Moves the integer at index and the next one with its bounds by one amount, when both lie on one side of the target. */
  *#lowerPair(index: number): Work<boolean> {
    const nodes = this.nodes;
    const node = nodes[index] as Node;
    const bounds = node.request.bounds;
    if (bounds.kind !== "integer") return false;
    const value = node.choice.value as bigint;
    const later = nextWithBounds(nodes, index);
    if (later === undefined) return false;
    const other = (nodes[later] as Node).choice.value as bigint;
    const target = bounds.target;
    if (value > target !== other > target || value === target || other === target)
      return false;
    const step = value > target ? -1n : 1n;
    const distance = (v: bigint) => (v > target ? v - target : target - v);
    const room = distance(value) < distance(other) ? distance(value) : distance(other);
    const self = this;
    const moved = function* (amount: bigint): Work<boolean> {
      if (amount > room) return false;
      const lowered = replaced(nodes, index, value + step * amount);
      return yield* self.#consider(replaced(lowered, later, other + step * amount));
    };
    return (yield* findInteger(moved)) > 0n;
  }

  /** Moves every choice that shares a value and bounds towards the target together. */
  *#minimizeDuplicates(): Work<boolean> {
    let improved = false;
    for (let group = 0; ; group += 1) {
      const groups = duplicates(this.nodes);
      if (group >= groups.length) return improved;
      const indices = groups[group] as number[];
      if (
        (this.nodes[indices[0] as number] as Node).request.bounds.kind === "integer"
      ) {
        improved = (yield* this.#lower(indices)) || improved;
      } else {
        let moved: readonly Node[] = this.nodes;
        for (const index of indices) {
          moved = [
            ...moved.slice(0, index),
            atTarget(moved[index] as Node),
            ...moved.slice(index + 1),
          ];
        }
        improved = (yield* this.#consider(moved)) || improved;
      }
    }
  }

  /** Simplifies each float, in order: fewer fractional bits, then a smaller integer. */
  *#floatSimplify(): Work<boolean> {
    let improved = false;
    for (let index = 0; index < this.nodes.length; index += 1) {
      const node = this.nodes[index] as Node;
      const bounds = node.request.bounds;
      if (bounds.kind !== "float") continue;
      for (const rounded of roundedFloats(node.choice.value as number, bounds)) {
        if (yield* this.#consider(replaced(this.nodes, index, rounded))) {
          improved = true;
          break;
        }
      }
      improved = (yield* this.#lowerFloat(index)) || improved;
    }
    return improved;
  }

  /**
   * Moves an integral float towards an integral target, as an integer. The
   * search runs over the integers of the bounds below 2^53 in magnitude, in
   * their key order, and skips a value that the float's width cannot state.
   */
  *#lowerFloat(index: number): Work<boolean> {
    const nodes = this.nodes;
    const node = nodes[index] as Node;
    const bounds = node.request.bounds as FloatBounds;
    const value = node.choice.value as number;
    const target = bounds.target;
    const integral =
      Number.isInteger(value) &&
      Number.isInteger(target) &&
      Math.abs(value) < INTEGRAL_LIMIT &&
      Math.abs(target) < INTEGRAL_LIMIT;
    if (!integral) return false;
    const limit = INTEGRAL_LIMIT - 1;
    const integers = new IntegerBounds(
      BigInt(Math.max(Math.ceil(bounds.lo), -limit)),
      BigInt(Math.min(Math.floor(bounds.hi), limit)),
    );
    const at = (rank: bigint): Work<boolean> | false => {
      const candidate = Number(integers.atRank(rank));
      if (!bounds.admits(candidate)) return false;
      return this.#consider(replaced(nodes, index, candidate));
    };
    const tried = function* (rank: bigint): Work<boolean> {
      const work = at(rank);
      return work === false ? false : yield* work;
    };
    return yield* search(integers.rank(BigInt(value)), tried);
  }
}

/**
 * Returns the choices with one draw's span replaced by a filling from
 * source. A fresh decode that returns no value, because it rejects the case,
 * exceeds the cap on choices or fails, is no filling, and the result is
 * undefined.
 */
function filled(
  nodes: readonly Node[],
  span: Span,
  drawn: Drawn,
  source: Source,
): Choice[] | undefined {
  const fresh = new Case(new Generating(source));
  try {
    drawn.generator[DECODE](fresh);
  } catch (err) {
    if (err instanceof Rejected || err instanceof Failed) return undefined;
    throw err;
  }
  return [
    ...nodes.slice(0, span.start).map((node) => node.choice),
    ...fresh.choices,
    ...nodes.slice(span.end).map((node) => node.choice),
  ];
}

/**
 * Runs the fillings of one draw from seeds, and reports whether any value
 * fails: true when every filling that decoded fails the same way, false at
 * the first that does not, and undefined when none decoded. A filling whose
 * decode returns no value is skipped, and costs no run.
 */
function* relevance(
  shrinker: Shrinker,
  failure: Failure,
  span: Span,
  drawn: Drawn,
  seeds: readonly bigint[],
): Work<boolean | undefined> {
  let decoded = false;
  for (const seed of seeds) {
    const choices = filled(failure.nodes, span, drawn, new Source(seed));
    if (choices === undefined) continue;
    decoded = true;
    const execution = yield* shrinker.run(choices, "explain");
    if (identityOf(execution) !== failure.identity) return false;
  }
  return decoded ? true : undefined;
}

/**
 * Returns an integer draw's value one step towards its target, when it
 * passes. A map of an integer is an integer draw too: its integer is its
 * choice, and its nearest passing value is what the map returns for the
 * step.
 */
function* nearest(
  shrinker: Shrinker,
  nodes: readonly Node[],
  span: Span,
  drawn: Drawn,
): Work<{ readonly value: unknown } | undefined> {
  let generator = drawn.generator as Generator<unknown>;
  const maps: Mapped<unknown, unknown>[] = [];
  while (generator instanceof Mapped) {
    maps.push(generator);
    generator = generator.of;
  }
  const value =
    maps.length > 0 ? (nodes[span.start] as Node).choice.value : drawn.value;
  if (!(generator instanceof Integer) || typeof value !== "bigint") return undefined;
  const target = generator.bounds.target;
  if (value === target) return undefined;
  const stepped = value > target ? value - 1n : value + 1n;
  const choices = replaced(nodes, span.start, stepped).map((node) => node.choice);
  const execution = yield* shrinker.run(choices, "explain");
  if (execution.status !== "passed") return undefined;
  let found: unknown = stepped;
  for (const mapped of maps.reverse()) found = mapped.f(found);
  return { value: found };
}

/**
 * Explains each draw of a failure's case, spending what remains of the
 * budget. Filling j of draw d decodes from the stream of
 * seed + (d + 1) × 2^32 + j.
 *
 * @param shrinker - The shrinker, whose budget the runs spend.
 * @param failure - The failure.
 * @param seed - The run's seed.
 * @returns The work, which returns each draw's explanation.
 */
export function* explain(
  shrinker: Shrinker,
  failure: Failure,
  seed: bigint,
): Work<Explained[]> {
  const c = failure.execution.case;
  const explained: Explained[] = [];
  for (const [number, drawn] of c.draws.entries()) {
    const span = c.spans[drawn.span] as Span;
    const unexplained = {
      label: drawn.label,
      value: drawn.value,
      anyValueFails: undefined,
      nearest: undefined,
    };
    if (span.start === span.end) {
      explained.push(unexplained);
      continue;
    }
    const seeds = Array.from({ length: EXPLAIN_FILLINGS }, (_, j) =>
      explainSeed(seed, number, j),
    );
    try {
      const anyValue = yield* relevance(shrinker, failure, span, drawn, seeds);
      const near =
        anyValue === false
          ? yield* nearest(shrinker, failure.nodes, span, drawn)
          : undefined;
      explained.push({
        label: drawn.label,
        value: drawn.value,
        anyValueFails: anyValue,
        nearest: near,
      });
    } catch (err) {
      if (!(err instanceof Exhausted)) throw err;
      explained.push(unexplained);
    }
  }
  return explained;
}
