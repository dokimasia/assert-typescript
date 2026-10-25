// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

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
import { SMALL_INT_WIDTH } from "../../prop/convert/numbers.js";
import type { Generator } from "../../prop/engine/generator.js";
import * as engine from "../../prop/engine/literal.js";
import * as prop from "../../prop/index.js";
import { Recorder } from "../../seat.js";
import { canonical } from "../equality.js";
import { decode, type Literal } from "../literal.js";
import { BEHAVIOUR_DRIVERS } from "./behaviours.js";
import type { Driver, Run } from "./drive.js";
import { build } from "./generator.js";
import { VALUE_DRIVERS } from "./values.js";

/** A vector's JSON object. */
type Raw = Readonly<Record<string, unknown>>;

/** The driver of each form that a vector runs, by the form's id. */
const DRIVERS: ReadonlyMap<string, Driver> = new Map<string, Driver>([
  ...VALUE_DRIVERS,
  ...BEHAVIOUR_DRIVERS,
]);

/** Returns a value with each bigint in it, the elements of an array included, as a number. */
function numbered(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(numbered);
  }
  return typeof value === "bigint" ? Number(value) : value;
}

/** Reports whether the integers of a shape, or of the shape of its elements, decode to numbers: an int of 32 bits or fewer. */
function smallIntegers(shape: Raw): boolean {
  if (shape["shape"] === "int") {
    return Number(shape["width"]) <= SMALL_INT_WIDTH;
  }
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
  if ("generator" in raw) {
    return { generator: build(raw["generator"]), numbers: false };
  }
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
  if (!(isObject(ours) && isObject(theirs))) {
    return ours;
  }
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
