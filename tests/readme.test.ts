/**
 * The README, held to the code.
 *
 * Its examples are the first thing anyone runs, and its reference is
 * generated. Both are checked here so neither can drift.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { Collector, check, equateEmpty, Recorder, soft } from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const README = readFileSync(join(ROOT, "README.md"), "utf8");

it("the api reference matches the code", () => {
  const generated = execFileSync(
    process.execPath,
    [join(ROOT, "tools", "api-reference.ts")],
    { encoding: "utf8" },
  ).trim();

  const start = "<!-- api-reference:start -->";
  const end = "<!-- api-reference:end -->";
  const published = README.split(start)[1]?.split(end)[0]?.trim();

  expect(published, "run npm run build && node tools/api-reference.ts --write").toBe(
    generated,
  );
});

it("the single-failure message is what the README shows", () => {
  const seat = new Recorder();
  check.equal(seat, "gadget", "widget", "and the item is the one stored");

  expect(README).toContain(`AssertionFailed: ${seat.message}`);
});

it("the seat table says what the seats do", () => {
  const collector = new Collector();
  soft.equal(collector, 1, 2, "it holds");
  expect(collector.collected, "Collector collects what soft records").toHaveLength(1);
  expect(() => check.equal(collector, 1, 2, "it holds")).toThrow();

  const recorder = new Recorder();
  check.equal(recorder, 1, 2, "it holds");
  expect(recorder.failed, "Recorder collects both").toBe(true);
});

it("equateEmpty does what the README says", () => {
  const strict = new Recorder();
  check.equal(strict, null, [], "no items came back");
  expect(strict.failed).toBe(true);

  const relaxed = new Recorder();
  check.equal(relaxed, null, [], "no items came back", equateEmpty());
  expect(relaxed.failed).toBe(false);
});

it("the forgotten-await report reads as the README shows", () => {
  const seat = new Collector();
  check.honoursCancellation(
    seat,
    async () => "carried on",
    "the worker stops when told",
  );

  let reported = "";
  try {
    seat.flush();
  } catch (thrown) {
    reported = (thrown as Error).message;
  }

  expect(reported).toContain("were never awaited, so they asserted nothing");
  expect(reported).toContain("the worker stops when told");
  expect(reported).toContain("Add `await` to the call.");
});

it("the corpus count the README states is the real one", async () => {
  const { cases } = await import("../src/conformance/corpus.js");
  const stated = /(\d+) corpus cases state/.exec(README)?.[1];

  expect(Number(stated)).toBe(cases().length);
});

it("the divergences the README names are the ones declared", async () => {
  const { overlay } = await import("../src/conformance/definition.js");

  for (const d of overlay().diverge) {
    // bench-max-allocs is written maxAllocs in prose, as the naming
    // table has it.
    const member = d.id
      .split("-")
      .slice(1)
      .map((part, at) => (at === 0 ? part : part[0]?.toUpperCase() + part.slice(1)))
      .join("");

    expect(README, `${d.id} is declared but not explained`).toContain(member);
  }
});
