/**
 * The sentences of the records of linearizable, serializable and
 * snapshot-isolation, which a seat without records receives.
 */

import type { Failure } from "../failure.js";
import { show } from "../matcher/inspect.js";
import type { Edge, Evidence, Observation } from "./derivation.js";
import type { Span } from "./partition.js";

/** Returns the text of the keys of a partition, and "every key" for a partition of every key. */
function keysText(keys: readonly unknown[]): string {
  return keys.length === 0 ? "every key" : keys.map((key) => show(key)).join(", ");
}

/** Returns the text of a list of values. */
function listText(values: readonly unknown[]): string {
  return `[${values.map((value) => show(value)).join(", ")}]`;
}

/**
 * Returns a line of the label and the text of each span, or "none" for no
 * span. A span's text states its call, its operation with its arguments, and
 * its output, or that its outcome is unknown.
 */
function spansText(label: string, spans: readonly Span[]): string {
  const texts = spans.map(({ call, operation }) => {
    const args = operation.args.map((arg) => show(arg)).join(", ");
    const outcome = operation.known
      ? ` → ${show(operation.output)}`
      : ", outcome unknown";
    return `call ${call} ${operation.name}(${args})${outcome}`;
  });
  return `\n    ${label}: ${texts.length === 0 ? "none" : texts.join("; ")}`;
}

/**
 * Returns the sentence of a failing linearizability check's record: the
 * contract, the outcome with the reported partition and the limit, and then
 * the counts, the frontier's order of calls, its states and the calls that
 * the spec rejected there, each on a line of its own.
 *
 * @param failure - The record.
 * @returns The sentence.
 */
export function sentence(failure: Failure): string {
  const d = failure.detail;
  const limit = d["limit"] === null ? "" : `, at the ${String(d["limit"])} limit`;
  const states = (d["states"] as readonly unknown[])
    .map((state) => show(state))
    .join(", ");
  return [
    `${failure.contract}: ${String(d["outcome"])} in the partition of ${keysText(d["partition"] as readonly unknown[])}${limit}`,
    `\n    steps ${String(d["steps"])}, partitions ${String(d["partitions"])}, calls ${String(d["calls"])}, concurrency ${String(d["concurrency"])}`,
    spansText("linearized", d["linearized"] as readonly Span[]),
    `\n    states: ${states}`,
    spansText("rejected", d["candidates"] as readonly Span[]),
  ].join("");
}

/** Returns the text of an edge of a cycle: its two calls and its relation, and the key and the values that prove it. */
function edgeText(e: Edge): string {
  const head = `call ${e.from} -${e.relation}-> call ${e.to}: `;
  if (e.relation === "ww") {
    return `${head}call ${e.to} appended ${show(e.next)} to ${show(e.key)} after ${show(e.value)}`;
  }
  if (e.relation === "wr") {
    return `${head}call ${e.to} read ${show(e.key)} ending in ${show(e.value)}`;
  }
  if (e.empty) {
    return `${head}call ${e.from} read [] from ${show(e.key)}, and call ${e.to} appended ${show(e.next)} to it`;
  }
  return `${head}call ${e.from} read ${show(e.key)} ending in ${show(e.value)}, and call ${e.to} appended ${show(e.next)} after it`;
}

/** Returns the text of the observation of an anomaly that is no cycle: the reads and the appends that show it. */
function observationText(o: Observation): string {
  const [call, other] = o.calls;
  const [read, second] = o.reads;
  const key = show(o.key);
  switch (o.anomaly) {
    case "garbage-read":
      return `call ${call} read ${listText(read as unknown[])} from ${key}, and no transaction appended ${show(o.value)}`;
    case "duplicate-append":
      return `call ${call} read ${listText(read as unknown[])} from ${key}, which contains ${show(o.value)} twice`;
    case "internal-inconsistency": {
      let text = `call ${call} read ${listText(read as unknown[])} from ${key}`;
      if (o.whole) text += `, and it knew the list was ${listText(o.expected)}`;
      else if (o.expected.length > 0)
        text += `, and it knew the list ended with ${listText(o.expected)}`;
      if (o.hasFuture)
        text += `, and ${show(o.future)} is a value that call ${call} appends later`;
      return text;
    }
    case "incompatible-order":
      return `calls ${call} and ${other} read ${listText(read as unknown[])} and ${listText(second as unknown[])} from ${key}, and neither is a prefix of the other`;
    case "aborted-read":
      return `call ${call} read ${show(o.value)} from ${key}, which call ${o.appender} appended and aborted`;
    default:
      return `call ${call} read ${key} ending in ${show(o.value)}, which call ${o.appender} followed with ${show(o.next)}`;
  }
}

/**
 * Returns the sentence of a failing isolation check's record: the contract
 * and the anomaly, then the kinds, and then a line for each entry of the
 * explanation.
 *
 * @param failure - The record.
 * @returns The sentence.
 */
export function isolationSentence(failure: Failure): string {
  const d = failure.detail;
  const lines = (d["explanation"] as readonly Evidence[]).map((evidence) =>
    "relation" in evidence ? edgeText(evidence) : observationText(evidence),
  );
  return [
    `${failure.contract}: ${String(d["anomaly"])}`,
    `\n    kinds: ${(d["kinds"] as readonly string[]).join(", ")}`,
    ...lines.map((line) => `\n    ${line}`),
  ].join("");
}
