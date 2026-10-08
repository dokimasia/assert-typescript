/** The spec of the comparison of output with a golden file. */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, onTestFinished } from "vitest";
import * as golden from "../src/golden.js";
import { check, files, type Seat } from "../src/index.js";
import { Recorder } from "../src/seat.js";
import { test as it } from "../src/vitest.js";
import { enter, records, temporary, UNENFORCED, WINDOWS } from "./helpers.js";

/** Whether a call may rewrite its golden file. */
const UPDATING = true;
const CHECKING = false;

/** Writes content into a golden file in a new directory, and returns its path. */
function written(content: string, name = "golden.txt"): string {
  const path = join(temporary(), name);
  writeFileSync(path, content);
  return path;
}

/** Returns a path in a new directory, with nothing at it. */
function absent(name = "golden.txt"): string {
  return join(temporary(), name);
}

/** Makes dir unwritable until the test ends. */
function lock(dir: string): void {
  chmodSync(dir, 0o500);
  onTestFinished(() => chmodSync(dir, 0o755));
}

/** Returns the assertion, the contract and the detail of each failure that recorder received. */
function reported(recorder: Recorder): [string, string, unknown][] {
  return recorder.failures.map((f) => [f.assertion, f.contract, f.detail]);
}

/** Windows records no permission bits, so a mode cannot make a directory unwritable there. */
const unwritable = it.skipIf(WINDOWS);

/** The contract of a comparison with the golden tree api. */
const API_CONTRACT = `the golden tree ${join("testdata", "golden", "api")} matches the output, and ${golden.UPDATE_ENV}=1 writes it`;

/**
 * Makes a new directory the working directory until the test ends, writes
 * the golden tree api there when one is given, and returns the directory.
 */
function project(seat: Seat, tree?: files.Tree): string {
  const dir = temporary();
  enter(dir);
  if (tree !== undefined) {
    const below = Object.entries(tree).map(([path, e]) => [
      `testdata/golden/api/${path}`,
      e,
    ]);
    files.write(seat, dir, Object.fromEntries(below));
  }
  return dir;
}

/** Sets the update variable to value, or unsets it, until the test ends. */
function updating(value: string | undefined): void {
  const before = process.env[golden.UPDATE_ENV];
  const assign = (v: string | undefined) => {
    if (v === undefined) Reflect.deleteProperty(process.env, golden.UPDATE_ENV);
    else process.env[golden.UPDATE_ENV] = v;
  };
  assign(value);
  onTestFinished(() => assign(before));
}

describe("golden", () => {
  describe("UPDATE_ENV", () => {
    it("contains the name DOKIMI_ASSERT_UPDATE_GOLDEN", ({ seat }) => {
      check.equal(
        seat,
        golden.UPDATE_ENV,
        "DOKIMI_ASSERT_UPDATE_GOLDEN",
        "the variable",
      );
    });
  });

  describe("GOLDEN_DIR", () => {
    it("contains the directory testdata/golden", ({ seat }) => {
      check.equal(seat, golden.GOLDEN_DIR, join("testdata", "golden"), "the directory");
    });
  });

  describe("shouldUpdate", () => {
    const tests = [
      { name: "returns false for an unset variable", give: undefined, want: false },
      { name: "returns false for an empty variable", give: "", want: false },
      { name: "returns false for 0", give: "0", want: false },
      { name: "returns true for 1", give: "1", want: true },
      { name: "returns true for any other value", give: "yes", want: true },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        updating(tt.give);

        check.equal(
          seat,
          golden.shouldUpdate(),
          tt.want,
          "the variable decides an update",
        );
      });
    }
  });

  describe("scrubTimestamps", () => {
    it("replaces an ISO 8601 timestamp with SCRUBBED_TIMESTAMP", ({ seat }) => {
      check.equal(
        seat,
        golden.scrubTimestamps()("started at 2026-08-30T11:22:33Z"),
        "started at SCRUBBED_TIMESTAMP",
        "the timestamp is scrubbed",
      );
    });
  });

  describe("scrubHashes", () => {
    it("replaces a hex digest with SCRUBBED_HASH", ({ seat }) => {
      check.equal(
        seat,
        golden.scrubHashes()(`digest ${"a1b2c3d4".repeat(8)}`),
        "digest SCRUBBED_HASH",
        "the digest is scrubbed",
      );
    });
  });

  describe("scrubRunIds", () => {
    it("replaces an identifier of a run with SCRUBBED_RUN_ID", ({ seat }) => {
      check.equal(
        seat,
        golden.scrubRunIds()("run run_0123456789abcdef finished"),
        "run SCRUBBED_RUN_ID finished",
        "the run id is scrubbed",
      );
    });
  });

  describe("scrubJsonFields", () => {
    it("replaces the value of each field that it was given", ({ seat }) => {
      check.equal(
        seat,
        golden.scrubJsonFields("id")('{"id": "01J8XY", "name": "kept"}'),
        '{"id": "SCRUBBED", "name": "kept"}',
        "the id is scrubbed and the name is kept",
      );
    });

    it("returns the text unchanged without a field", ({ seat }) => {
      check.equal(
        seat,
        golden.scrubJsonFields()('{"id": "01J8XY"}'),
        '{"id": "01J8XY"}',
        "nothing is scrubbed",
      );
    });
  });

  describe("matchAt", () => {
    it("passes content that matches the golden file", ({ seat }) => {
      const recorder = new Recorder();
      golden.matchAt(recorder, written("recorded output"), "recorded output", CHECKING);

      check.equal(
        seat,
        records(recorder).map((r) => r["verdict"]),
        ["pass"],
        "the comparison passes",
      );
    });

    it("reports the content of the file as want with the output as got", ({ seat }) => {
      const path = written("recorded output");
      const recorder = new Recorder();
      golden.matchAt(recorder, path, "something else", CHECKING);

      check.equal(
        seat,
        reported(recorder),
        [
          [
            "golden-match-at",
            `the golden file ${path} matches the output, and ${golden.UPDATE_ENV}=1 writes it`,
            { want: "recorded output", got: "something else" },
          ],
        ],
        "the failure states both sides",
      );
    });

    it("reports want null for a missing file", ({ seat }) => {
      const recorder = new Recorder();
      golden.matchAt(recorder, absent(), "content", CHECKING);

      check.equal(
        seat,
        recorder.failures[0]?.detail,
        { want: null, got: "content" },
        "a missing file has no content",
      );
    });

    it("compares the two sides after its scrubbers", ({ seat }) => {
      const recorder = new Recorder();
      golden.matchAt(
        recorder,
        written("started at SCRUBBED_TIMESTAMP"),
        "started at 2026-08-30T11:22:33Z",
        CHECKING,
        golden.scrubTimestamps(),
      );

      check.isFalse(seat, recorder.failed, "the scrubbed sides match");
    });

    it("writes the output into a missing file when updating", ({ seat }) => {
      const path = absent();
      golden.matchAt(new Recorder(), path, "recorded output", UPDATING);

      check.equal(
        seat,
        readFileSync(path, "utf8"),
        "recorded output",
        "the file is written",
      );
    });

    it("passes when it writes the file", ({ seat }) => {
      const recorder = new Recorder();
      golden.matchAt(recorder, absent(), "recorded output", UPDATING);

      check.isFalse(seat, recorder.failed, "an update passes");
    });

    it("rewrites content that differs when updating", ({ seat }) => {
      const path = written("old output");
      golden.matchAt(new Recorder(), path, "new output", UPDATING);

      check.equal(
        seat,
        readFileSync(path, "utf8"),
        "new output",
        "the file is rewritten",
      );
    });

    it("ends the call with a fault for a file that cannot be read", ({ seat }) => {
      const blocked = written("this is a file, so no file is below it");
      const recorder = new Recorder();
      golden.matchAt(recorder, join(blocked, "golden.txt"), "content", CHECKING);

      check.equal(seat, recorder.failures, [], "a fault reports no failure");
      check.contains(
        seat,
        recorder.message,
        "the golden file cannot be read",
        "the fault",
      );
      check.equal(
        seat,
        records(recorder).map((r) => r["verdict"]),
        ["error"],
        "the call record states the fault",
      );
    });

    unwritable(
      "ends the call with a fault for a file that cannot be written",
      ({ seat }) => {
        const dir = temporary();
        lock(dir);
        const recorder = new Recorder();
        golden.matchAt(recorder, join(dir, "golden.txt"), "content", UPDATING);

        check.contains(
          seat,
          recorder.message,
          "the golden file cannot be written",
          "the fault",
        );
      },
    );
  });

  describe("match", () => {
    it("resolves the name against testdata/golden", ({ seat }) => {
      const recorder = new Recorder();
      golden.match(recorder, "absent-on-purpose.txt", "content", CHECKING);

      check.equal(
        seat,
        reported(recorder).map(([assertion, contract]) => [assertion, contract]),
        [
          [
            "golden-match",
            `the golden file ${join("testdata", "golden", "absent-on-purpose.txt")} matches the output, and ${golden.UPDATE_ENV}=1 writes it`,
          ],
        ],
        "the failure names the file under testdata/golden",
      );
    });
  });

  describe("matchJsonField", () => {
    it("passes a field whose value matches", ({ seat }) => {
      const recorder = new Recorder();
      golden.matchJsonField(
        recorder,
        written('{"items": [1, 2], "other": 1}', "g.json"),
        "items",
        "[1, 2]",
        CHECKING,
      );

      check.isFalse(seat, recorder.failed, "the field matches");
    });

    it("passes a value that differs from the field in its formatting alone", ({
      seat,
    }) => {
      const recorder = new Recorder();
      golden.matchJsonField(
        recorder,
        written('{"one":[1,2]}', "g.json"),
        "one",
        "[ 1,\n  2 ]",
        CHECKING,
      );

      check.isFalse(seat, recorder.failed, "formatting does not count");
    });

    it("reports both sides with the field for a field that differs", ({ seat }) => {
      const path = written('{"items": [1]}', "g.json");
      const recorder = new Recorder();
      golden.matchJsonField(recorder, path, "items", "[1, 2]", CHECKING);

      check.equal(
        seat,
        reported(recorder),
        [
          [
            "golden-match-json-field",
            `the field "items" of the golden file ${path} matches the value, and ${golden.UPDATE_ENV}=1 writes it`,
            { want: "[\n  1\n]", got: "[\n  1,\n  2\n]", field: "items" },
          ],
        ],
        "the failure states the field and both sides",
      );
    });

    it("reports want null for a missing field", ({ seat }) => {
      const recorder = new Recorder();
      golden.matchJsonField(
        recorder,
        written('{"other": 1}', "g.json"),
        "absent",
        "[1]",
        CHECKING,
      );

      check.equal(
        seat,
        recorder.failures[0]?.detail,
        { want: null, got: "[\n  1\n]", field: "absent" },
        "a missing field has no value",
      );
    });

    it("reports want null for a missing file", ({ seat }) => {
      const recorder = new Recorder();
      golden.matchJsonField(recorder, absent("g.json"), "items", "[1]", CHECKING);

      check.equal(
        seat,
        recorder.failures[0]?.detail,
        { want: null, got: "[\n  1\n]", field: "items" },
        "a missing file has no field",
      );
    });

    it("writes a missing field beside the other fields when updating", ({ seat }) => {
      const path = written('{"other": 1}', "g.json");
      golden.matchJsonField(new Recorder(), path, "added", "[1, 2]", UPDATING);

      check.equal(
        seat,
        JSON.parse(readFileSync(path, "utf8")),
        { other: 1, added: [1, 2] },
        "the file contains both fields",
      );
    });

    it("rewrites a field that differs when updating", ({ seat }) => {
      const path = written('{"items": [1]}', "g.json");
      golden.matchJsonField(new Recorder(), path, "items", "[1, 2]", UPDATING);

      check.equal(
        seat,
        JSON.parse(readFileSync(path, "utf8")),
        { items: [1, 2] },
        "the field is rewritten",
      );
    });

    it("creates a missing file when updating", ({ seat }) => {
      const path = absent("g.json");
      golden.matchJsonField(new Recorder(), path, "items", "[1]", UPDATING);

      check.equal(
        seat,
        JSON.parse(readFileSync(path, "utf8")),
        { items: [1] },
        "the file contains the field",
      );
    });

    it("ends the call with a fault for a file that cannot be read", ({ seat }) => {
      const blocked = written("this is a file, so no file is below it");
      const recorder = new Recorder();
      golden.matchJsonField(recorder, join(blocked, "g.json"), "i", "[1]", CHECKING);

      check.contains(
        seat,
        recorder.message,
        "the golden file cannot be read",
        "the fault",
      );
    });

    it("ends the call with a fault for a file that does not parse", ({ seat }) => {
      const recorder = new Recorder();
      golden.matchJsonField(
        recorder,
        written("{not json", "g.json"),
        "i",
        "[1]",
        CHECKING,
      );

      check.contains(
        seat,
        recorder.message,
        "the golden file cannot be read as a JSON object",
        "the fault",
      );
    });

    it("ends the call with a fault for a file that is no object", ({ seat }) => {
      const recorder = new Recorder();
      golden.matchJsonField(
        recorder,
        written("[1, 2]", "g.json"),
        "i",
        "[1]",
        CHECKING,
      );

      check.contains(
        seat,
        recorder.message,
        "the golden file cannot be read as a JSON object",
        "the fault",
      );
    });

    it("ends the call with a fault for a value that is no JSON", ({ seat }) => {
      const recorder = new Recorder();
      golden.matchJsonField(
        recorder,
        written("{}", "g.json"),
        "i",
        "not json",
        CHECKING,
      );

      check.contains(
        seat,
        recorder.message,
        'the value of the field "i" is no JSON',
        "the fault",
      );
    });

    unwritable(
      "ends the call with a fault for a directory that cannot be written",
      ({ seat }) => {
        const inner = join(temporary(), "inner");
        mkdirSync(inner);
        lock(inner);
        const recorder = new Recorder();
        golden.matchJsonField(recorder, join(inner, "g.json"), "i", "[1]", UPDATING);

        check.contains(
          seat,
          recorder.message,
          "the golden file cannot be written",
          "the fault",
        );
      },
    );
  });

  describe("matchTree", () => {
    const logo = files.bytes(Uint8Array.of(0x89, 0x50));

    it("passes an output equal to its golden tree", ({ seat }) => {
      project(seat, { "api.go": files.text("package api\n"), "logo.png": logo });
      const out = files.workspace(seat, {
        "api.go": files.text("package api\n"),
        "logo.png": logo,
      });
      const recorder = new Recorder();
      golden.matchTree(recorder, "api", out, CHECKING);

      check.equal(
        seat,
        records(recorder).map((r) => [r["assertion"], r["contract"], r["verdict"]]),
        [["golden-match-tree", API_CONTRACT, "pass"]],
        "the trees are equal",
      );
    });

    it("reports the entries at the paths that differ", ({ seat }) => {
      project(seat, {
        "api.go": files.text("package api\n"),
        "old.go": files.text("old"),
      });
      const out = files.workspace(seat, {
        "api.go": files.text("package api\n\nfunc New() {}\n"),
      });
      const recorder = new Recorder();
      golden.matchTree(recorder, "api", out, CHECKING);

      check.equal(
        seat,
        recorder.failures[0]?.detail,
        {
          want: { "api.go": files.text("package api\n"), "old.go": files.text("old") },
          got: { "api.go": files.text("package api\n\nfunc New() {}\n") },
          differences: 2,
        },
        "the record",
      );
      check.contains(
        seat,
        recorder.failures[0]?.where?.file ?? "",
        "golden.test.ts",
        "the call site is this spec",
      );
    });

    it("reports want null for a missing golden tree", ({ seat }) => {
      project(seat);
      const out = files.workspace(seat, { "v1/types.go": files.text("package v1\n") });
      const recorder = new Recorder();
      golden.matchTree(recorder, "api", out, CHECKING);

      check.equal(
        seat,
        recorder.failures[0]?.detail,
        {
          want: null,
          got: { v1: files.directory(), "v1/types.go": files.text("package v1\n") },
          differences: 2,
        },
        "the record",
      );
    });

    it.skipIf(WINDOWS)("compares the execute bit of a file alone", ({ seat }) => {
      project(seat, {
        "gen.sh": files.text("#!/bin/sh\n").withMode(0o700),
        "types.go": files.text("package api\n").withMode(0o644),
      });
      const out = files.workspace(seat, {
        "gen.sh": files.executable("#!/bin/sh\n"),
        "types.go": files.text("package api\n").withMode(0o600),
      });
      const recorder = new Recorder();
      golden.matchTree(recorder, "api", out, CHECKING);

      check.isFalse(seat, recorder.failed, "the modes differ in no execute bit");
    });

    it("compares the scrubbed text of each file on both sides", ({ seat }) => {
      project(seat, { "log.txt": files.text("at SCRUBBED_TIMESTAMP\n") });
      const out = files.workspace(seat, {
        "log.txt": files.text("at 2026-10-08T11:22:33Z\n"),
      });
      const recorder = new Recorder();
      golden.matchTree(recorder, "api", out, CHECKING, golden.scrubTimestamps());

      check.isFalse(seat, recorder.failed, "the scrubbed sides are equal");
    });

    it("writes a missing golden tree under update, and passes", ({ seat }) => {
      const dir = project(seat);
      const out = files.workspace(seat, { "v1/types.go": files.text("package v1\n") });
      const recorder = new Recorder();
      golden.matchTree(recorder, "api", out, UPDATING);

      check.isFalse(seat, recorder.failed, "an update passes");
      files.equal(
        seat,
        join(dir, "testdata", "golden", "api"),
        { "v1/types.go": files.text("package v1\n") },
        "the golden tree is written",
      );
    });

    it("rewrites a golden tree under update, without its extra entries, with the scrubbed text", ({
      seat,
    }) => {
      const dir = project(seat, {
        "old.go": files.text("old"),
        latest: files.link("old.go"),
      });
      const out = files.workspace(seat, {
        "log.txt": files.text("at 2026-10-08T11:22:33Z\n"),
      });
      golden.matchTree(new Recorder(), "api", out, UPDATING, golden.scrubTimestamps());

      files.equal(
        seat,
        join(dir, "testdata", "golden", "api"),
        { "log.txt": files.text("at SCRUBBED_TIMESTAMP\n") },
        "the golden tree equals the scrubbed output",
      );
    });

    it("ends the call with a fault for a name that is no path", ({ seat }) => {
      project(seat);
      const recorder = new Recorder();
      golden.matchTree(recorder, "../api", files.workspace(seat, {}), CHECKING);

      check.equal(
        seat,
        [recorder.message, records(recorder).map((r) => r["verdict"])],
        ['golden.matchTree: the path "../api" has the name ".."', ["error"]],
        "the fault",
      );
    });

    it("ends the call with a fault for an output that cannot be read", ({ seat }) => {
      const dir = project(seat);
      const recorder = new Recorder();
      golden.matchTree(recorder, "api", join(dir, "missing"), CHECKING);

      check.hasPrefix(
        seat,
        recorder.message,
        "golden.matchTree: the tree cannot be read: ENOENT",
        "the fault",
      );
    });

    it("ends the call with a fault for a golden tree that is no directory", ({
      seat,
    }) => {
      const dir = project(seat);
      files.write(seat, dir, { "testdata/golden/api": files.text("a file") });
      const recorder = new Recorder();
      golden.matchTree(recorder, "api", files.workspace(seat, {}), CHECKING);

      check.equal(
        seat,
        recorder.message,
        "golden.matchTree: the root of the tree is no directory",
        "the fault",
      );
    });

    it.skipIf(UNENFORCED)(
      "ends the call with a fault for a golden directory that cannot be created",
      ({ seat }) => {
        const dir = project(seat);
        files.write(seat, dir, {
          "testdata/golden": files.directory().withMode(0o500),
        });
        const recorder = new Recorder();
        golden.matchTree(recorder, "api", files.workspace(seat, {}), UPDATING);

        check.hasPrefix(
          seat,
          recorder.message,
          "golden.matchTree: the directory cannot be created: EACCES",
          "the fault",
        );
      },
    );
  });
});
