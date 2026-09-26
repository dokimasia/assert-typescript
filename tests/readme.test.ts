/**
 * The README, held to the code.
 *
 * Its examples are the first thing anyone runs, and its reference is
 * generated. Both are checked here so neither can drift.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { Collector, check, equateEmpty, Recorder, soft } from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const README = readFileSync(join(ROOT, "README.md"), "utf8");

it("the api reference matches the code", () => {
  // The generator reads dist, so a clean checkout has to build first.
  // Saying that beats an ENOENT stack from three frames down.
  expect(
    existsSync(join(ROOT, "dist", "check.d.ts")),
    "run npm run build first: the reference is generated from the emit",
  ).toBe(true);

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
  check.equal(strict, null as unknown, [] as unknown, "no items came back");
  expect(strict.failed).toBe(true);

  const relaxed = new Recorder();
  check.equal(
    relaxed,
    null as unknown,
    [] as unknown,
    "no items came back",
    equateEmpty(),
  );
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
  const { names, overlay } = await import("../src/conformance/definition.js");
  const named = names();

  for (const d of overlay().diverge) {
    // Prose names a member by the last segment of the name the naming
    // table gives it: bench-max-allocs is written maxAllocs.
    const member = (named[d.id] ?? d.id).split(".").pop() as string;

    expect(README, `${d.id} is declared but not explained`).toContain(member);
  }
});
