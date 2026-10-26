// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The runners of the property vectors.
 *
 * Each kind of vector has a function that takes a vector's inputs and
 * returns the outputs that this engine computes for them. A runner compares
 * each output with the one that the vector states, as JSON, and throws a
 * fault at the first output that differs.
 */

import { Fault } from "../../matcher/fault.js";
import { Bridging } from "../../prop/engine/bridge.js";
import { Generating, Replaying } from "../../prop/engine/case/providers.js";
import { Failed, Rejected } from "../../prop/engine/case/signals.js";
import { Case, DECODE, MAX_CHOICES } from "../../prop/engine/case.js";
import type { Choice } from "../../prop/engine/choice.js";
import * as coverage from "../../prop/engine/coverage.js";
import { encode } from "../../prop/engine/encoding.js";
import type { Body } from "../../prop/engine/execution.js";
import type { Generator } from "../../prop/engine/generator.js";
import { inverseOf } from "../../prop/engine/inverse.js";
import * as literal from "../../prop/engine/literal.js";
import { run } from "../../prop/engine/runner.js";
import { DEFAULT_CASES, type Settings } from "../../prop/engine/settings.js";
import { read as readShape } from "../../prop/engine/shape.js";
import { DEFAULT_BUDGET } from "../../prop/engine/shrink.js";
import { caseSource } from "../../prop/engine/source.js";
import type { Requirement } from "../../prop/engine/tally.js";
import * as token from "../../prop/engine/token.js";
import { drive } from "../../prop/engine/work.js";
import { sameJson } from "../equality.js";
import { buildBody } from "./body.js";
import { choiceLiteral, parseChoices, seedOf } from "./choices.js";
import { detail } from "./detail.js";
import { formsOf } from "./forms.js";
import { build } from "./generator.js";
import { storeOf, tokenOf } from "./replay.js";

/** A vector's JSON object. */
type Raw = Readonly<Record<string, unknown>>;

/** Returns the outputs that this engine computes for a vector's inputs. */
type Compute = (raw: Raw) => Promise<Record<string, unknown>>;

/** The identity that a shrinking vector's body fails with. */
const FAILS_WHEN = "fails-when";

/** The verdict of the call record of a run that passed or skipped. Every other run fails. */
const VERDICTS: Readonly<Partial<Record<string, string>>> = {
  passed: "pass",
  skipped: "skip",
};

/** Returns the corpus forms of a case's recorded choices. */
function recordedOf(c: Case): unknown[] {
  return c.choices.map(choiceLiteral);
}

/** Returns the recorded choices and the value of a decode, or that the case was rejected. */
function decoded(c: Case, decode: () => unknown): Record<string, unknown> {
  try {
    const value = decode();
    return { recorded: recordedOf(c), value: encode(value), rejected: false };
  } catch (err) {
    if (!(err instanceof Rejected)) {
      throw err;
    }
    return { recorded: recordedOf(c), value: null, rejected: true };
  }
}

/** Returns the choices and the value of each of the first cases of a seed. */
function generated(generator: Generator<unknown>, raw: Raw): Record<string, unknown> {
  const seed = seedOf(raw["seed"]);
  const cases = Array.from({ length: Number(raw["count"]) }, (_, index) => {
    const c = new Case(new Generating(caseSource(seed, BigInt(index))));
    const { recorded, ...rest } = decoded(c, () => generator[DECODE](c));
    return { choices: recorded, ...rest };
  });
  return { cases };
}

/** Returns the generator of a vector that states a shape or a generator. */
function generatorOf(raw: Raw): Generator<unknown> {
  if ("shape" in raw === "generator" in raw) {
    throw new Fault("", "the vector states neither a shape nor a generator, or both");
  }
  return "shape" in raw ? readShape(raw["shape"]) : build(raw["generator"]);
}

/** Returns the choices of a case whose draws decode to the entries that a vector states, and their values. */
function drawsOf(raw: Raw): Record<string, unknown> {
  const body = (raw["draws"] as readonly Raw[]).map(
    (d) => [String(d["label"]), build(d["generator"])] as const,
  );
  const stated = raw["entries"] as readonly Raw[];
  const choices: Choice[] = [];
  for (const [i, [label, generator]] of body.entries()) {
    const entry = stated[i];
    if (entry === undefined) {
      break;
    }
    const error = { choices: null, values: null };
    if (entry["label"] !== label) {
      return { ...error, error: { label, reason: "label" } };
    }
    const inverse = inverseOf(generator, literal.decode(entry["value"]));
    if (inverse === undefined) {
      return { ...error, error: { label, reason: "value" } };
    }
    choices.push(...inverse);
  }
  const replayed = new Case(new Replaying(choices));
  const values = body.map(([label, generator]) => ({
    label,
    value: encode(replayed.draw(generator, label)),
  }));
  return { choices: choices.map(choiceLiteral), values, error: null };
}

/** Returns the recorded choices and the value of a decoding vector, or that its case was rejected. */
function decodingOf(raw: Raw): Record<string, unknown> {
  const generator = build(raw["generator"]);
  const c = new Case(new Replaying(parseChoices(raw["choices"])));
  return decoded(c, () => generator[DECODE](c));
}

/** Returns the choices of an inverse vector's value, or that the value has no inverse. */
function invertedOf(raw: Raw): Record<string, unknown> {
  const choices = inverseOf(generatorOf(raw), literal.decode(raw["value"]));
  return choices === undefined
    ? { choices: null, error: true }
    : { choices: choices.map(choiceLiteral), error: false };
}

/** Returns the choices and the value that a bridge vector's bytes decode to. */
function bridgedOf(raw: Raw): Record<string, unknown> {
  const generator = build(raw["generator"]);
  const c = new Case(
    new Bridging(Uint8Array.from(Buffer.from(String(raw["bytes"]), "hex"))),
  );
  const { recorded, ...rest } = decoded(c, () => generator[DECODE](c));
  return { choices: recorded, ...rest };
}

/** Returns the outcome of a shrinking vector's run. */
async function shrinkingOf(raw: Raw): Promise<Record<string, unknown>> {
  const body = buildBody({
    draw: raw["generator"],
    fails: [{ identity: FAILS_WHEN, when: raw[FAILS_WHEN] }],
  });
  const budget = Number(raw["budget"] ?? DEFAULT_BUDGET);
  const outcome = await drive(run(body, { seed: seedOf(raw["seed"]), shrink: budget }));
  const { failing } = outcome;
  return {
    outcome: outcome.kind,
    cases: outcome.cases,
    value: failing === undefined ? null : encode(failing.case.draws[0]?.value),
    choices: failing === undefined ? null : recordedOf(failing.case),
    token: outcome.token ?? null,
    runs: outcome.runs,
  };
}

/**
 * Returns the verdict of a run of a body that asserts once at its end, the
 * reason of a run that skips, and the call of the body, the phase and the
 * verdict of each assertion.
 */
async function recordingOf(raw: Raw): Promise<Record<string, unknown>> {
  const body = buildBody(raw["body"] as Raw);
  const made: string[] = [];
  const asserting: Body = (c) => {
    try {
      body(c);
    } catch (err) {
      if (err instanceof Failed) {
        made.push("fail");
      }
      throw err;
    }
    made.push("pass");
  };
  const calls: Record<string, unknown>[] = [];
  let runs = 0;
  const outcome = await drive(
    run(asserting, settingsOf((raw["settings"] ?? {}) as Raw), (phase) => {
      runs += 1;
      for (const verdict of made) {
        calls.push({ run: runs, phase, verdict });
      }
      made.length = 0;
    }),
  );
  return { verdict: VERDICTS[outcome.kind] ?? "fail", reason: outcome.reason, calls };
}

/** Returns the settings of a run that a vector states. */
export function settingsOf(written: Raw): Settings {
  const replayed = written["replay"];
  const requirements = (written["requirements"] ?? []) as readonly Raw[];
  return {
    seed: seedOf(written["seed"]),
    cases: Number(written["cases"] ?? DEFAULT_CASES),
    maxChoices: Number(written["max-choices"] ?? MAX_CHOICES),
    requirements: requirements.map(
      (r): Requirement => ({ label: String(r["label"]), share: Number(r["share"]) }),
    ),
    examples: ((written["examples"] ?? []) as unknown[]).map(parseChoices),
    stored: ((written["stored"] ?? []) as unknown[]).map(parseChoices),
    shrink: Number(written["shrink"] ?? DEFAULT_BUDGET),
    replay: replayed === undefined ? undefined : token.decode(String(replayed)),
  };
}

/** The function that computes each kind's outputs. */
export const KINDS: ReadonlyMap<string, Compute> = new Map<string, Compute>([
  ["decoding", async (raw) => decodingOf(raw)],
  ["generation", async (raw) => generated(build(raw["generator"]), raw)],
  ["shapes", async (raw) => generated(readShape(raw["shape"]), raw)],
  ["inverse", async (raw) => invertedOf(raw)],
  ["draws", async (raw) => drawsOf(raw)],
  ["shrinking", shrinkingOf],
  [
    "coverage",
    async (raw) => ({
      verdict: coverage.verdict(
        Number(raw["counted"]),
        Number(raw["valid"]),
        Number(raw["share"]),
        raw["last"] === true,
        raw["exact"] === true,
      ),
    }),
  ],
  ["bridge", async (raw) => bridgedOf(raw)],
  ["token", async (raw) => tokenOf(raw)],
  [
    "behaviour",
    async (raw) => {
      const body = buildBody(raw["body"] as Raw);
      const outcome = await drive(
        run(body, settingsOf((raw["settings"] ?? {}) as Raw)),
      );
      return { detail: detail(outcome) };
    },
  ],
  ["store", async (raw) => storeOf(raw)],
  ["recording", recordingOf],
  ["forms", formsOf],
]);

/**
 * Runs the JSON of one property vector against this engine, and compares
 * each output that the engine computes with the one that the vector states.
 *
 * @param kind - The vector's kind.
 * @param raw - The vector's JSON object.
 * @throws Fault at the first output that differs from the vector's, or at
 *   the input that the runner cannot take.
 */
export async function checkProp(kind: string, raw: Raw): Promise<void> {
  const compute = KINDS.get(kind) as Compute;
  let outputs: Record<string, unknown>;
  try {
    outputs = await compute(raw);
  } catch (err) {
    if (err instanceof Fault) {
      throw err;
    }
    throw new Fault("", "the vector does not run", { cause: err });
  }
  for (const [name, got] of Object.entries(outputs)) {
    if (!sameJson(got, raw[name])) {
      throw new Fault(
        name,
        `the engine computes ${JSON.stringify(got)}, want ${JSON.stringify(raw[name])}`,
      );
    }
  }
}
