/** The spec of the directory of a property's store, and the files in it. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { check } from "../../src/index.js";
import { nameTest } from "../../src/matcher/seat.js";
import {
  claim,
  load,
  save,
  seeds,
  seedsOf,
  storeOf,
} from "../../src/prop/directory.js";
import { entry, name } from "../../src/prop/engine/store.js";
import { Collector, cleanUp, Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";
import { temporary, thrown } from "../helpers.js";

/** Returns the entry of the contract and the choice of one integer, found on found. */
function stored(
  contract: string,
  value: bigint,
  found: string,
): { name: string; entry: Record<string, unknown> } {
  const choices = [{ kind: "integer", value } as const];
  return {
    name: name(contract, choices),
    entry: entry(
      {
        contract,
        choices,
        identity: { assertion: "equal", contract },
        counterexample: [{ label: "x" }],
      },
      "7.2.1",
      found,
    ),
  };
}

/** Writes each entry into dir, and returns dir. */
function filled(
  dir: string,
  ...entries: { name: string; entry: Record<string, unknown> }[]
): string {
  for (const one of entries) save(dir, one.name, one.entry);
  return dir;
}

describe("directory", () => {
  describe("storeOf", () => {
    it("returns the stated directory", ({ seat }) => {
      check.equal(
        seat,
        storeOf(new Recorder(), "kept"),
        "kept",
        "the stated directory",
      );
    });

    it("returns the empty string that turns the store off", ({ seat }) => {
      const named = new Recorder();
      nameTest(named, ["a.test.ts", "t"]);

      check.equal(seat, storeOf(named, ""), "", "no store");
    });

    it("returns the empty string for a seat that runs no named test", ({ seat }) => {
      check.equal(seat, storeOf(new Recorder(), undefined), "", "no store");
    });

    it("returns the store of the test below testdata/prop with each segment escaped", ({
      seat,
    }) => {
      const named = new Recorder();
      nameTest(named, [
        "tests",
        "a.test.ts",
        "a suite",
        'c:\\d*"<x>|?',
        "50%",
        "ends.",
        "ends ",
        "\u0001",
      ]);

      check.equal(
        seat,
        storeOf(named, undefined),
        join(
          "testdata",
          "prop",
          "tests",
          "a.test.ts",
          "a suite",
          "c%3A%5Cd%2A%22%3Cx%3E%7C%3F",
          "50%25",
          "ends%2E",
          "ends%20",
          "%01",
        ),
        "the escaped path",
      );
    });
  });

  describe("seedsOf", () => {
    it("returns the seed files of the test below testdata/fuzz", ({ seat }) => {
      const named = new Recorder();
      nameTest(named, ["a.test.ts", "parses"]);

      check.equal(
        seat,
        seedsOf(named),
        join("testdata", "fuzz", "a.test.ts", "parses"),
        "the directory",
      );
    });

    it("returns the empty string for a seat that runs no named test", ({ seat }) => {
      check.equal(seat, seedsOf(new Recorder()), "", "no directory");
    });
  });

  describe("claim", () => {
    it("claims nothing without a store", ({ seat }) => {
      const collector = new Collector();

      check.isTrue(
        seat,
        claim(collector, "", "c") && claim(collector, "", "c"),
        "both claims succeed",
      );
    });

    it("claims nothing on a seat without cleanups", ({ seat }) => {
      const recorder = new Recorder();

      check.isTrue(
        seat,
        claim(recorder, "dir", "c") && claim(recorder, "dir", "c"),
        "both claims succeed",
      );
    });

    it("refuses a second claim of one contract in one store until the test ends", ({
      seat,
    }) => {
      const collector = new Collector();
      const first = claim(collector, "dir", "c");
      const second = claim(collector, "dir", "c");
      cleanUp(collector);
      const third = claim(collector, "dir", "c");
      cleanUp(collector);

      check.equal(
        seat,
        [first, second, third],
        [true, false, true],
        "the cleanup releases the claim",
      );
    });

    it("grants claims of two contracts in one store", ({ seat }) => {
      const collector = new Collector();
      const claims = [claim(collector, "dir", "a"), claim(collector, "dir", "b")];
      cleanUp(collector);

      check.equal(seat, claims, [true, true], "the store grants both claims");
    });
  });

  describe("load", () => {
    it("returns no entry for a store that does not exist", ({ seat }) => {
      check.equal(
        seat,
        load(join(temporary(), "absent"), "c"),
        { entries: [], skipped: [] },
        "an empty store",
      );
    });

    it("returns the entries of the contract oldest first", ({ seat }) => {
      const later = stored("c", 1n, "2026-10-08");
      const earlier = stored("c", 2n, "2026-01-01");
      const between = stored("c", 4n, "2026-05-05");
      const other = stored("d", 3n, "2025-01-01");
      const dir = filled(temporary(), later, earlier, between, other);

      check.equal(
        seat,
        load(dir, "c").entries.map((one) => [one.name, one.choices]),
        [
          [earlier.name, [{ kind: "integer", value: 2n }]],
          [between.name, [{ kind: "integer", value: 4n }]],
          [later.name, [{ kind: "integer", value: 1n }]],
        ],
        "the entries of c by date",
      );
    });

    it("orders the entries of one date by their names", ({ seat }) => {
      const a = stored("c", 1n, "2026-10-08");
      const b = stored("c", 2n, "2026-10-08");
      const dir = filled(temporary(), a, b);

      check.equal(
        seat,
        load(dir, "c").entries.map((one) => one.name),
        [a.name, b.name].sort(),
        "the names in order",
      );
    });

    it("returns an entry of an earlier date first whatever its name", ({ seat }) => {
      const one = stored("c", 1n, "2026-10-08");
      const two = stored("c", 2n, "2026-10-08");
      const [smaller, larger] = one.name < two.name ? [one, two] : [two, one];
      const earlier = { ...larger, entry: { ...larger.entry, found: "2026-01-01" } };
      const dir = filled(temporary(), smaller, earlier);

      check.equal(
        seat,
        load(dir, "c").entries.map((loaded) => loaded.name),
        [larger.name, smaller.name],
        "the entry of the larger name and the earlier date first",
      );
    });

    it("returns each entry's counterexample", ({ seat }) => {
      const dir = filled(temporary(), stored("c", 1n, "2026-10-08"));

      check.equal(
        seat,
        load(dir, "c").entries[0]?.counterexample,
        [{ label: "x" }],
        "the draws",
      );
    });

    it("skips an entry of a later format", ({ seat }) => {
      const dir = temporary();
      writeFileSync(join(dir, "later.json"), JSON.stringify({ store: 2 }));

      check.equal(
        seat,
        load(dir, "c"),
        { entries: [], skipped: ["later.json"] },
        "the file is skipped",
      );
    });

    it("reads only the files whose names end in .json", ({ seat }) => {
      const dir = temporary();
      mkdirSync(join(dir, "nested.json"));
      writeFileSync(join(dir, "notes.txt"), "free text");

      check.equal(
        seat,
        load(dir, "c"),
        { entries: [], skipped: [] },
        "nothing is read",
      );
    });

    it("throws a fault that names each damaged file", ({ seat }) => {
      const dir = temporary();
      writeFileSync(join(dir, "a.json"), "{");
      writeFileSync(join(dir, "b.json"), Uint8Array.of(0xff, 0xfe));

      check.equal(
        seat,
        thrown(() => load(dir, "c")),
        `${dir}: the store has damaged files: a.json, b.json`,
        "the damaged files",
      );
    });

    it("throws a fault for a store that cannot be read", ({ seat }) => {
      const file = join(temporary(), "file");
      writeFileSync(file, "");

      check.hasPrefix(
        seat,
        thrown(() => load(file, "c")),
        `${file}: the store cannot be read: `,
        "the fault",
      );
    });
  });

  describe("save", () => {
    it("writes the entry as indented JSON that ends in a newline", ({ seat }) => {
      const dir = join(temporary(), "deep", "store");
      const written = save(dir, "e.json", { store: 1 });

      check.equal(
        seat,
        [written, readFileSync(join(dir, "e.json"), "utf8")],
        [true, '{\n  "store": 1\n}\n'],
        "the file is written",
      );
    });

    it("returns false without replacing the file of a name that exists", ({ seat }) => {
      const dir = temporary();
      save(dir, "e.json", { store: 1 });
      const written = save(dir, "e.json", { store: 2 });

      check.equal(
        seat,
        [written, readFileSync(join(dir, "e.json"), "utf8")],
        [false, '{\n  "store": 1\n}\n'],
        "the first entry is kept",
      );
    });

    it("throws the error of a file system that cannot keep the entry", ({ seat }) => {
      const file = join(temporary(), "file");
      writeFileSync(file, "");

      check.notEqual(
        seat,
        thrown(() => save(file, "e.json", {})),
        "",
        "the save throws",
      );
    });

    it("throws the error of a name that no file can have", ({ seat }) => {
      check.notEqual(
        seat,
        thrown(() => save(temporary(), "a\u0000.json", {})),
        "",
        "the write throws",
      );
    });
  });

  describe("seeds", () => {
    it("returns no seed for a directory that does not exist", ({ seat }) => {
      check.isEmpty(seat, seeds(join(temporary(), "absent")), "no seed");
    });

    it("returns the bytes of the files alone in the order of their names", ({
      seat,
    }) => {
      const dir = temporary();
      writeFileSync(join(dir, "b"), Uint8Array.of(2));
      writeFileSync(join(dir, "a"), Uint8Array.of(1, 1));
      mkdirSync(join(dir, "c"));

      check.equal(
        seat,
        seeds(dir),
        [
          ["a", Uint8Array.of(1, 1)],
          ["b", Uint8Array.of(2)],
        ],
        "two seeds",
      );
    });

    it("throws a fault for a directory that cannot be read", ({ seat }) => {
      const file = join(temporary(), "file");
      writeFileSync(file, "");

      check.hasPrefix(
        seat,
        thrown(() => seeds(file)),
        `${file}: the seed files cannot be read: `,
        "the fault",
      );
    });
  });
});
