/**
 * Comparison against a recorded file.
 *
 * Written with the library, as a consumer would. The comparison core
 * cannot do the same: a module that tests itself with itself lets one
 * bug hide another.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import * as check from "../src/check.js";
import * as golden from "../src/golden.js";
import { Recorder } from "../src/seat.js";

/** Whether a run may rewrite its golden files. Named, not repeated. */
const UPDATING = true;
const CHECKING = false;

/** Put content in a golden file and answer its path. */
function written(content: string, name = "golden.txt"): string {
  const dir = mkdtempSync(join(tmpdir(), "dokimi-golden-"));
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

/** Answer a path in a fresh directory, with nothing at it. */
function absent(name = "golden.txt"): string {
  return join(mkdtempSync(join(tmpdir(), "dokimi-golden-")), name);
}

it("matching content reports nothing", () => {
  const seat = new Recorder();
  golden.matchAt(seat, written("recorded output"), "recorded output", CHECKING);

  expect(seat.failed, seat.message).toBe(false);
});

it("differing content names the file, then shows the diff", () => {
  const path = written("recorded output");
  const seat = new Recorder();
  golden.matchAt(seat, path, "something else", CHECKING);

  expect(seat.failed).toBe(true);
  expect(seat.message).toContain(path);
  expect(seat.message).toContain("--- want");
  expect(seat.message).toContain("+++ got");
});

it("a missing file says how to create it", () => {
  const seat = new Recorder();
  golden.matchAt(seat, absent(), "content", CHECKING);

  expect(seat.message).toContain("does not exist");
  expect(seat.message).toContain(golden.UPDATE_ENV);
});

it("an update creates a file that was not there", () => {
  const path = absent();
  const seat = new Recorder();
  golden.matchAt(seat, path, "recorded output", UPDATING);

  expect(seat.failed, seat.message).toBe(false);
  expect(readFileSync(path, "utf8")).toBe("recorded output");
});

it("an update rewrites content that moved on", () => {
  const path = written("old output");
  const seat = new Recorder();
  golden.matchAt(seat, path, "new output", UPDATING);

  expect(readFileSync(path, "utf8")).toBe("new output");
});

it("a write that cannot happen is reported, not thrown", () => {
  const blocked = written("this is a file, so it cannot hold a directory");
  const seat = new Recorder();
  golden.matchAt(seat, join(blocked, "golden.txt"), "content", UPDATING);

  expect(seat.failed).toBe(true);
  expect(seat.message).toContain("could not be written");
});

it("scrubTimestamps replaces a recorded timestamp", () => {
  const seat = new Recorder();
  golden.matchAt(
    seat,
    written("started at SCRUBBED_TIMESTAMP"),
    "started at 2026-08-30T11:22:33Z",
    CHECKING,
    golden.scrubTimestamps(),
  );

  expect(seat.failed, seat.message).toBe(false);
});

it("scrubHashes replaces a hex digest", () => {
  const seat = new Recorder();
  golden.matchAt(
    seat,
    written("digest SCRUBBED_HASH"),
    `digest ${"a1b2c3d4".repeat(8)}`,
    CHECKING,
    golden.scrubHashes(),
  );

  expect(seat.failed, seat.message).toBe(false);
});

it("scrubRunIds replaces an identifier minted per run", () => {
  const seat = new Recorder();
  golden.matchAt(
    seat,
    written("run SCRUBBED_RUN_ID finished"),
    "run run_0123456789abcdef finished",
    CHECKING,
    golden.scrubRunIds(),
  );

  expect(seat.failed, seat.message).toBe(false);
});

it("scrubJsonFields replaces only the fields it is given", () => {
  const path = written('{"id": "SCRUBBED", "name": "kept"}', "g.json");

  const passing = new Recorder();
  golden.matchAt(
    passing,
    path,
    '{"id": "01J8XY", "name": "kept"}',
    CHECKING,
    golden.scrubJsonFields("id"),
  );
  expect(passing.failed, passing.message).toBe(false);

  const failing = new Recorder();
  golden.matchAt(
    failing,
    path,
    '{"id": "01J8XY", "name": "changed"}',
    CHECKING,
    golden.scrubJsonFields("id"),
  );
  expect(failing.failed, "an unnamed field still has to match").toBe(true);
});

it("scrubJsonFields with no fields changes nothing", () => {
  const seat = new Recorder();
  golden.matchAt(
    seat,
    written('{"id": "01J8XY"}', "g.json"),
    '{"id": "01J8XY"}',
    CHECKING,
    golden.scrubJsonFields(),
  );

  expect(seat.failed, seat.message).toBe(false);
});

it("shouldUpdate is false without the variable", () => {
  const before = process.env[golden.UPDATE_ENV];
  delete process.env[golden.UPDATE_ENV];
  expect(golden.shouldUpdate()).toBe(false);

  process.env[golden.UPDATE_ENV] = "1";
  expect(golden.shouldUpdate()).toBe(true);

  process.env[golden.UPDATE_ENV] = "0";
  expect(golden.shouldUpdate(), "0 is not an instruction to update").toBe(false);

  if (before === undefined) delete process.env[golden.UPDATE_ENV];
  else process.env[golden.UPDATE_ENV] = before;
});

it("match resolves a name against the conventional directory", () => {
  const seat = new Recorder();
  golden.match(seat, "absent-on-purpose.txt", "content", CHECKING);

  expect(seat.message).toContain(golden.GOLDEN_DIR);
});

it("matchJsonField compares one field and ignores the rest", () => {
  const path = written('{"items": [1, 2], "other": 1}', "g.json");

  const seat = new Recorder();
  golden.matchJsonField(seat, path, "items", "[1, 2]", CHECKING);
  expect(seat.failed, seat.message).toBe(false);
});

it("matchJsonField ignores formatting differences", () => {
  const seat = new Recorder();
  golden.matchJsonField(
    seat,
    written('{"one":[1,2]}', "g.json"),
    "one",
    "[ 1,\n  2 ]",
    CHECKING,
  );

  expect(seat.failed, seat.message).toBe(false);
});

it("matchJsonField reports a field that differs", () => {
  const seat = new Recorder();
  golden.matchJsonField(
    seat,
    written('{"items": [1]}', "g.json"),
    "items",
    "[1, 2]",
    CHECKING,
  );

  expect(seat.failed).toBe(true);
});

it("matchJsonField adds a missing field when updating", () => {
  const path = written('{"other": 1}', "g.json");
  const seat = new Recorder();
  golden.matchJsonField(seat, path, "added", "[1, 2]", UPDATING);

  expect(seat.failed, seat.message).toBe(false);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
    other: 1,
    added: [1, 2],
  });
});

it("matchJsonField rewrites a changed field when updating", () => {
  const path = written('{"items": [1]}', "g.json");
  const seat = new Recorder();
  golden.matchJsonField(seat, path, "items", "[1, 2]", UPDATING);

  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ items: [1, 2] });
});

it("matchJsonField reports a missing field when checking", () => {
  const seat = new Recorder();
  golden.matchJsonField(
    seat,
    written('{"other": 1}', "g.json"),
    "absent",
    "[1]",
    CHECKING,
  );

  expect(seat.message).toContain("has no field");
});

it("matchJsonField creates the file when updating", () => {
  const path = absent("g.json");
  const seat = new Recorder();
  golden.matchJsonField(seat, path, "items", "[1]", UPDATING);

  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ items: [1] });
});

it("matchJsonField reports a missing file when checking", () => {
  const seat = new Recorder();
  golden.matchJsonField(seat, absent("g.json"), "items", "[1]", CHECKING);

  expect(seat.message).toContain("does not exist");
});

it("matchJsonField refuses a file that will not parse", () => {
  const seat = new Recorder();
  golden.matchJsonField(seat, written("{not json", "g.json"), "i", "[1]", CHECKING);

  expect(seat.message).toContain("not JSON");
});

it("matchJsonField refuses a file that is not an object", () => {
  const seat = new Recorder();
  golden.matchJsonField(seat, written("[1, 2]", "g.json"), "i", "[1]", CHECKING);

  expect(seat.message).toContain("not a JSON object");
});

it("matchJsonField refuses a value that is not JSON", () => {
  const seat = new Recorder();
  golden.matchJsonField(seat, written("{}", "g.json"), "i", "not json", CHECKING);

  expect(seat.message).toContain("is not JSON");
});

it("the library reports its own golden failures like any other", () => {
  const seat = new Recorder();
  golden.matchAt(seat, written("a"), "b", CHECKING);

  check.isTrue(new Recorder(), seat.failed, "a mismatch reports");
});
