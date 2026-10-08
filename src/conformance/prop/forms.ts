/**
 * The runner of the forms vectors: a property form run on named subjects.
 *
 * A forms vector names a form, the kinds of the subjects that its assertion
 * takes, the values that the assertion takes beside them, the shape or the
 * generator of what the form generates, the examples, the seed, and the
 * detail of the run. The runner calls the form of this library on a
 * recorder, with the generator through prop.using, and returns the detail
 * that the form's call record states.
 *
 * A run keeps its subjects across its cases, as a caller's closure keeps
 * them. A subject behaves as its summary in the definition's table of
 * subjects states. The integers that a subject returns have the type of the
 * integers of the input: a number for an int of 32 bits or fewer, as
 * prop.ofShape decodes one, and a bigint otherwise.
 */

import { Fault } from "../../matcher/fault.js";
import type { Seat } from "../../matcher/seat.js";
import type { Generator } from "../../prop/engine/generator.js";
import * as engine from "../../prop/engine/literal.js";
import * as prop from "../../prop/index.js";
import { Recorder } from "../../seat.js";
import { canonical, decode, type Literal } from "../literal.js";
import { SUBJECTS, type Subject } from "../subject.js";
import { FUNCTIONS } from "./function.js";
import { build } from "./generator.js";

/** A vector's JSON object. */
type Raw = Readonly<Record<string, unknown>>;

/** The contract of the run of a forms vector's form. */
const CONTRACT = "the form of a forms vector";

/** The failure that a failing subject of the error forms returns, and the class that err-as takes. */
class OwnError extends Error {}

/** The subject's own failure: err-is and err-is-not take it as their sentinel. */
const OWN = new OwnError("the subject failed for its own reason");

/** One run of a vector's form: its subject kinds, the values beside them, its options, and the integers of its input. */
interface Run {
  readonly subjects: readonly unknown[];
  readonly args: readonly unknown[];
  readonly options: readonly prop.FormOption[];
  /** Returns a value with each integer in it as an integer of the input. */
  readonly bind: (value: unknown) => unknown;
  /** Returns the integer of decimal text as an integer of the input. */
  readonly integer: (text: string) => unknown;
}

/** Calls a vector's form on seat. */
type Driver = (seat: Seat, run: Run) => Promise<void>;

/** The predicates over two adjacent items, by subject kind. */
const PREDICATES: ReadonlyMap<string, (earlier: unknown, later: unknown) => boolean> =
  new Map([
    [
      "ascending",
      (earlier: unknown, later: unknown) => (earlier as number) <= (later as number),
    ],
  ]);

/** What each subject kind of the error forms returns for an input: its own failure, or null for success. */
const FAILS: ReadonlyMap<string, (input: unknown) => unknown> = new Map([
  ["returns-ok", () => null],
  ["fails-otherwise", () => OWN],
  ["fails-on-negative", (input: unknown) => ((input as number) < 0 ? OWN : null)],
]);

/** What each subject kind of throws and doesNotThrow does with an input: throws its own failure, or returns. */
const RAISES: ReadonlyMap<string, (input: unknown) => unknown> = new Map<
  string,
  (input: unknown) => unknown
>([
  ["returns-ok", () => undefined],
  [
    "raises",
    () => {
      throw OWN;
    },
  ],
  [
    "raises-on-negative",
    (input) => {
      if ((input as number) < 0) throw OWN;
    },
  ],
]);

/** Returns what table states for the subject kind at index of a run. */
function kind<T>(table: ReadonlyMap<string, T>, run: Run, index: number): T {
  const stated = run.subjects[index];
  const found = typeof stated === "string" ? table.get(stated) : undefined;
  if (found === undefined) {
    throw new Fault(
      `subjects[${index}]`,
      `${JSON.stringify(stated)} is no subject that the form takes`,
    );
  }
  return found;
}

/** Returns the function of the input of the subject at index, whose integers are of the input. */
function fn(run: Run, index: number): (input: unknown) => unknown {
  const f = kind(FUNCTIONS, run, index);
  return (input) => run.bind(f(input));
}

/** Returns the subject that the first subject kind of a run builds, which has every member of members. */
function subject<K extends keyof Subject>(
  run: Run,
  ...members: K[]
): Subject & Required<Pick<Subject, K>> {
  const stated = run.subjects[0];
  const built = typeof stated === "string" ? SUBJECTS[stated]?.() : undefined;
  if (built === undefined || members.some((member) => built[member] === undefined)) {
    throw new Fault(
      "subjects[0]",
      `${JSON.stringify(stated)} is no subject that the form takes`,
    );
  }
  return built as Subject & Required<Pick<Subject, K>>;
}

/** The driver of each form that a vector runs, by the form's id. */
const DRIVERS: ReadonlyMap<string, Driver> = new Map<string, Driver>([
  [
    "prop-equal",
    (seat, r) => prop.equal(seat, fn(r, 0), fn(r, 1), CONTRACT, ...r.options),
  ],
  [
    "prop-not-equal",
    (seat, r) => prop.notEqual(seat, fn(r, 0), fn(r, 1), CONTRACT, ...r.options),
  ],
  [
    "prop-true",
    (seat, r) =>
      prop.isTrue(
        seat,
        fn(r, 0) as (input: unknown) => boolean,
        CONTRACT,
        ...r.options,
      ),
  ],
  [
    "prop-false",
    (seat, r) =>
      prop.isFalse(
        seat,
        fn(r, 0) as (input: unknown) => boolean,
        CONTRACT,
        ...r.options,
      ),
  ],
  ["prop-nil", (seat, r) => prop.isNil(seat, fn(r, 0), CONTRACT, ...r.options)],
  ["prop-not-nil", (seat, r) => prop.isNotNil(seat, fn(r, 0), CONTRACT, ...r.options)],
  [
    "prop-length",
    (seat, r) =>
      prop.length(seat, fn(r, 0), r.args[0] as number, CONTRACT, ...r.options),
  ],
  ["prop-empty", (seat, r) => prop.isEmpty(seat, fn(r, 0), CONTRACT, ...r.options)],
  [
    "prop-not-empty",
    (seat, r) => prop.isNotEmpty(seat, fn(r, 0), CONTRACT, ...r.options),
  ],
  [
    "prop-contains",
    (seat, r) => prop.contains(seat, fn(r, 0), r.args[0], CONTRACT, ...r.options),
  ],
  [
    "prop-not-contains",
    (seat, r) => prop.notContains(seat, fn(r, 0), r.args[0], CONTRACT, ...r.options),
  ],
  [
    "prop-contains-in-order",
    (seat, r) =>
      prop.containsInOrder(
        seat,
        fn(r, 0),
        r.args[0] as string[],
        CONTRACT,
        ...r.options,
      ),
  ],
  [
    "prop-permutation",
    (seat, r) =>
      prop.isPermutation(
        seat,
        fn(r, 0) as (input: unknown) => unknown[],
        fn(r, 1) as (input: unknown) => unknown[],
        CONTRACT,
        ...r.options,
      ),
  ],
  [
    "prop-has-prefix",
    (seat, r) =>
      prop.hasPrefix(seat, fn(r, 0), r.args[0] as string, CONTRACT, ...r.options),
  ],
  [
    "prop-has-suffix",
    (seat, r) =>
      prop.hasSuffix(seat, fn(r, 0), r.args[0] as string, CONTRACT, ...r.options),
  ],
  [
    "prop-matches",
    (seat, r) =>
      prop.matches(seat, fn(r, 0), r.args[0] as string, CONTRACT, ...r.options),
  ],
  [
    "prop-close-to",
    (seat, r) =>
      prop.closeTo(
        seat,
        fn(r, 0),
        r.args[0] as number,
        r.args[1] as number,
        CONTRACT,
        ...r.options,
      ),
  ],
  [
    "prop-in-range",
    (seat, r) =>
      prop.inRange(
        seat,
        fn(r, 0),
        r.args[0] as number,
        r.args[1] as number,
        CONTRACT,
        ...r.options,
      ),
  ],
  [
    "prop-pairwise",
    (seat, r) =>
      prop.pairwise(
        seat,
        fn(r, 0) as (input: unknown) => unknown[],
        kind(PREDICATES, r, 1),
        CONTRACT,
        ...r.options,
      ),
  ],
  [
    "prop-err-absent",
    (seat, r) => prop.noError(seat, kind(FAILS, r, 0), CONTRACT, ...r.options),
  ],
  [
    "prop-err-present",
    (seat, r) => prop.hasError(seat, kind(FAILS, r, 0), CONTRACT, ...r.options),
  ],
  [
    "prop-err-is",
    (seat, r) => prop.errorIs(seat, kind(FAILS, r, 0), OWN, CONTRACT, ...r.options),
  ],
  [
    "prop-err-is-not",
    (seat, r) => prop.errorIsNot(seat, kind(FAILS, r, 0), OWN, CONTRACT, ...r.options),
  ],
  [
    "prop-err-as",
    (seat, r) =>
      prop.errorAs(seat, kind(FAILS, r, 0), OwnError, CONTRACT, ...r.options),
  ],
  [
    "prop-throws",
    (seat, r) => prop.throws(seat, kind(RAISES, r, 0), CONTRACT, ...r.options),
  ],
  [
    "prop-not-throws",
    (seat, r) => prop.doesNotThrow(seat, kind(RAISES, r, 0), CONTRACT, ...r.options),
  ],
  [
    "prop-pure",
    (seat, r) => {
      const s = subject(r, "call", "observe");
      return prop.isPure(seat, s.observe, s.call, CONTRACT, ...r.options);
    },
  ],
  [
    "prop-not-pure",
    (seat, r) => {
      const s = subject(r, "call", "observe");
      return prop.isNotPure(seat, s.observe, s.call, CONTRACT, ...r.options);
    },
  ],
  [
    "prop-nil-context-safe",
    (seat, r) => {
      const s = subject(r, "signalled");
      return prop.nullHandleSafe(
        seat,
        (signal) => s.signalled(signal),
        CONTRACT,
        ...r.options,
      );
    },
  ],
  [
    "prop-honours-cancellation",
    (seat, r) => {
      const s = subject(r, "signalled");
      return prop.honoursCancellation(
        seat,
        (signal) => s.signalled(signal),
        CONTRACT,
        ...r.options,
      );
    },
  ],
  [
    "prop-honours-deadline",
    (seat, r) => {
      const s = subject(r, "signalled");
      return prop.honoursDeadline(
        seat,
        (signal) => s.signalled(signal),
        CONTRACT,
        ...r.options,
      );
    },
  ],
  [
    "prop-idempotent",
    (seat, r) => {
      const s = subject(r, "call", "observe");
      return prop.isIdempotent(seat, s.call, s.observe, CONTRACT, ...r.options);
    },
  ],
  [
    "prop-accumulates",
    (seat, r) => {
      const s = subject(r, "call", "observe");
      return prop.accumulates(seat, s.call, s.observe, CONTRACT, ...r.options);
    },
  ],
  [
    "prop-deterministic",
    (seat, r) => {
      const s = subject(r, "compute");
      return prop.isDeterministic(
        seat,
        (input) => r.bind(s.compute(input)),
        CONTRACT,
        ...r.options,
      );
    },
  ],
  [
    "prop-commutative",
    (seat, r) => {
      const s = subject(r, "combine");
      return prop.isCommutative(
        seat,
        (a, b) => r.bind(s.combine(a, b)),
        CONTRACT,
        ...r.options,
      );
    },
  ],
  [
    "prop-associative",
    (seat, r) => {
      const s = subject(r, "combine");
      return prop.isAssociative(
        seat,
        (a, b) => r.bind(s.combine(a, b)),
        CONTRACT,
        ...r.options,
      );
    },
  ],
  [
    "prop-round-trip",
    (seat, r) => {
      const s = subject(r, "render");
      return prop.roundTrip(
        seat,
        (input) => s.render(input),
        (text) => r.integer(text),
        CONTRACT,
        ...r.options,
      );
    },
  ],
]);

/** Returns a value with each bigint in it, the elements of an array included, as a number. */
function numbered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(numbered);
  return typeof value === "bigint" ? Number(value) : value;
}

/** Reports whether the integers of a shape, or of the shape of its elements, decode to numbers: an int of 32 bits or fewer. */
function smallIntegers(shape: Raw): boolean {
  if (shape["shape"] === "int") return Number(shape["width"]) <= 32;
  const of = shape["of"];
  return typeof of === "object" && of !== null && smallIntegers(of as Raw);
}

/** Returns the generator of what a vector's form generates, and whether its integers are numbers. */
function inputOf(raw: Raw): {
  readonly generator: Generator<unknown>;
  readonly numbers: boolean;
} {
  if ("shape" in raw === "generator" in raw) {
    throw new Fault("", "the vector states neither a shape nor a generator, or both");
  }
  if ("generator" in raw) return { generator: build(raw["generator"]), numbers: false };
  const shape = raw["shape"] as Raw;
  return {
    generator: prop.ofShape(JSON.stringify(shape)),
    numbers: smallIntegers(shape),
  };
}

/** Reports whether value is a JSON object. */
function isObject(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the canonical text of the value of a typed literal, under which an int and a float of one value are one value. */
function literalKey(literal: unknown): string {
  try {
    return canonical(decode(literal as Literal));
  } catch {
    return "";
  }
}

/**
 * Returns the detail of a call record in the form of the vector's detail:
 * each typed literal that states the vector's value as the vector's
 * literal, because JavaScript has one number type, and the failure as its
 * assertion and the fields that the vector states.
 */
function aligned(ours: unknown, theirs: unknown): unknown {
  if (isObject(ours) && isObject(theirs) && "type" in ours && "type" in theirs) {
    const same = literalKey(ours) !== "" && literalKey(ours) === literalKey(theirs);
    return same ? theirs : ours;
  }
  if (Array.isArray(ours) && Array.isArray(theirs)) {
    return ours.map((item, i) => aligned(item, theirs[i]));
  }
  if (isObject(ours) && isObject(theirs)) {
    return Object.fromEntries(
      Object.entries(ours).map(([name, value]) => [name, aligned(value, theirs[name])]),
    );
  }
  return ours;
}

/**
 * Returns the failure of a record's detail as the vector states it: the
 * assertion, and the fields of the vector's failure. A form's case fails
 * with the record of an assertion, which states a detail.
 */
function failureOf(ours: unknown, theirs: unknown): unknown {
  if (!isObject(ours) || !isObject(theirs)) return ours;
  const stated = isObject(theirs["detail"]) ? Object.keys(theirs["detail"]) : [];
  const detail = ours["detail"] as Raw;
  return {
    assertion: ours["assertion"],
    detail: Object.fromEntries(
      stated.filter((name) => name in detail).map((name) => [name, detail[name]]),
    ),
  };
}

/**
 * Returns the detail that the call record of a vector's form states, in the
 * form of the vector's detail.
 *
 * @param raw - The vector's JSON object.
 * @returns The output detail, which the runner compares with the vector's.
 * @throws Fault for a vector that names no form that a vector runs, a
 *   subject kind that the form does not take, and an input that does not
 *   read.
 */
export async function formsOf(raw: Raw): Promise<Record<string, unknown>> {
  const driver = DRIVERS.get(String(raw["form"]));
  if (driver === undefined) {
    throw new Fault(
      "form",
      `${JSON.stringify(raw["form"])} is no form that a vector runs`,
    );
  }
  const { generator, numbers } = inputOf(raw);
  const literals = (raw["examples"] ?? []) as readonly Literal[];
  const examples = literals.map((literal) =>
    "shape" in raw ? decode(literal) : engine.decode(literal),
  );
  const options: prop.FormOption[] = [
    prop.using(generator),
    prop.seed(BigInt(String(raw["seed"]))),
    prop.hermetic(),
    prop.store(""),
    ...(examples.length > 0 ? [prop.examples(...examples)] : []),
  ];
  const run: Run = {
    subjects: (raw["subjects"] ?? []) as readonly unknown[],
    args: ((raw["args"] ?? []) as readonly Literal[]).map((literal) => decode(literal)),
    options,
    bind: numbers ? numbered : (value) => value,
    integer: (text) => (numbers ? Number(text) : BigInt(text)),
  };
  const recorder = new Recorder();
  await driver(recorder, run);
  const record = JSON.parse(recorder.records[0] as string) as Raw;
  const theirs = raw["detail"] as Raw;
  const ours = record["detail"] as Raw;
  return {
    detail: aligned(
      { ...ours, failure: failureOf(ours["failure"], theirs["failure"]) },
      theirs,
    ),
  };
}
