/**
 * The spec of the README: its examples run, and its counts and its API
 * reference are the code's. The API reference is generated from the
 * emitted declarations, so the build runs before this spec.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe } from "vitest";
import { cases } from "../src/conformance/corpus.js";
import { names, overlay } from "../src/conformance/definition.js";
import { vectors } from "../src/conformance/vector.js";
import {
  Collector,
  check,
  equateEmpty,
  files,
  history,
  prop,
  Recorder,
  soft,
  stateful,
} from "../src/index.js";
import { test as it } from "../src/vitest.js";
import { TRACKED, thrown } from "./helpers.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const README = readFileSync(join(ROOT, "README.md"), "utf8");

/** The kinds of the history vectors. */
const HISTORY = new Set(["linearizable", "seam", "serializable", "snapshot-isolation"]);

/** The kinds of the vectors of the assertions of files. */
const FILES = new Set([
  "golden-match-tree",
  "has-content",
  "has-mode",
  "is-dir",
  "is-file",
  "links-to",
  "path-absent",
  "tree-contains",
  "tree-equal",
  "tree-unchanged",
]);

/** Returns the text of the README's section under the heading title. */
function section(title: string): string {
  const start = README.indexOf(`\n${title}\n`);
  const end = README.indexOf("\n## ", start + title.length + 2);
  return README.slice(start, end < 0 ? undefined : end);
}

describe("README", () => {
  describe("Getting started", () => {
    it("shows the sentence of a failing check", ({ seat }) => {
      const recorder = new Recorder();
      check.equal(recorder, "gadget", "widget", "and the item is the one stored");

      check.contains(
        seat,
        README,
        `AssertionFailed: ${recorder.message}\n`,
        "the sentence",
      );
    });
  });

  describe("What a seat is", () => {
    it("states the behaviour of each seat in its table", ({ seat }) => {
      const collector = new Collector();
      soft.equal(collector, 1, 2, "the count is right");
      const recorder = new Recorder();
      check.equal(recorder, 1, 2, "the count is right");
      soft.equal(recorder, 1, 2, "the count is right");

      check.length(
        seat,
        collector.collected,
        1,
        "a Collector collects what soft records",
      );
      check.throws(
        seat,
        () => check.equal(collector, 1, 2, "the count is right"),
        "it throws on check",
      );
      check.length(seat, recorder.failures, 2, "a Recorder collects both");
      check.contains(
        seat,
        section("### What a seat is"),
        "| `Collector`, from the `seat` fixture | throws | collects, thrown when the test ends |",
        "the table row of Collector",
      );
    });
  });

  describe("Two surfaces", () => {
    it("shows the report of two failing calls of soft", ({ seat }) => {
      const collector = new Collector();
      soft.length(collector, [1, 2], 3, "every item comes back");
      soft.contains(
        collector,
        { "content-type": "application/json" },
        "etag",
        "the reply is cacheable",
      );

      check.contains(
        seat,
        README,
        `AssertionFailed: ${thrown(() => collector.flush())}\n`,
        "the report",
      );
    });
  });

  describe("The assertions", () => {
    it("states the number of assertions on both surfaces", ({ seat }) => {
      check.contains(
        seat,
        section("## The assertions"),
        `Both surfaces have the same ${Object.keys(soft).length} assertions`,
        "the count is the surfaces'",
      );
    });
  });

  describe("Equality", () => {
    it("shows a call that equateEmpty relaxes", ({ seat }) => {
      const recorder = new Recorder();
      check.equal(recorder, null as unknown, [] as unknown, "strict");
      check.equal(recorder, null as unknown, [] as unknown, "relaxed", equateEmpty());

      check.equal(
        seat,
        recorder.failures.map((f) => f.contract),
        ["strict"],
        "equateEmpty relaxes its call",
      );
      check.contains(
        seat,
        section("## Equality"),
        'check.equal(seat, reply.items, [], "no items came back", equateEmpty());',
        "the example",
      );
    });
  });

  describe("Async and the forgotten await", () => {
    it("shows the report of an assertion that nobody awaited", ({ seat }) => {
      const collector = new Collector();
      void check.honoursCancellation(
        collector,
        async () => "did the work",
        "the worker stops when told",
      );

      check.contains(
        seat,
        README,
        `AssertionFailed: ${thrown(() => collector.flush())}\n`,
        "the report",
      );
    });

    it("names each assertion that returns a promise", ({ seat }) => {
      const text = section("## Async and the forgotten await");
      for (const name of [...TRACKED, "rejects", "files.unchanged"]) {
        soft.contains(seat, text, `\`${name}\``, `the section names ${name}`);
      }
    });
  });

  describe("Trees of files", () => {
    it("shows a tree that equal passes after the code under test edits it", ({
      seat,
    }) => {
      const dir = files.workspace(seat, {
        "go.mod": files.text("module example.com/a\n"),
        "a/a.go": files.text("package a\n\nfunc Old() {}\n"),
        "keys/id": files.text("secret\n").withMode(0o600),
      });
      files.write(seat, dir, { "a/a.go": files.text("package a\n\nfunc New() {}\n") });

      files.equal(
        seat,
        dir,
        {
          "go.mod": files.text("module example.com/a\n"),
          "a/a.go": files.text("package a\n\nfunc New() {}\n"),
          "keys/id": files.text("secret\n").withMode(0o600),
        },
        "the rename rewrites the declaration",
      );
      check.contains(
        seat,
        section("## Trees of files"),
        'files.text("secret\\n").withMode(0o600)',
        "the example states the mode of the key",
      );
    });
  });

  describe("Properties", () => {
    it("shows a property whose counterexample shrinks to [0, 1]", async ({ seat }) => {
      const recorder = new Recorder();
      await prop.forAll(
        recorder,
        "a reversed list starts with its first element",
        (c) => {
          const xs = c.draw(prop.list(prop.integer(0, 9)), "xs");
          check.equal(
            c,
            xs.toReversed()[0],
            xs[0],
            "the reverse starts with the first element",
          );
        },
      );

      check.contains(seat, recorder.message, "\n  xs: [0, 1]", "the counterexample");
      check.contains(
        seat,
        section("## Properties"),
        "`[0, 1]`",
        "the README states it",
      );
    });
  });

  describe("Histories", () => {
    it("shows the sentence of a register whose read misses a write", ({ seat }) => {
      const register: history.Spec<unknown> = {
        initial: () => null,
        next: (state, op) =>
          op.name === "write" ? [op.args[0]] : op.returned(state) ? [state] : [],
      };
      const calls = new history.History();
      calls.invoke(0, "write", [1], "x").ok(null);
      calls.invoke(1, "read", [], "x").ok(null);
      const recorder = new Recorder();
      history.isLinearizable(recorder, calls, register, "the register is linearizable");

      check.contains(
        seat,
        section("## Histories"),
        `AssertionFailed: ${recorder.message}\n`,
        "the sentence",
      );
    });
  });

  describe("Machines", () => {
    it("shows the counterexample of a race of two clients", async ({ seat }) => {
      const counter: history.Spec<number> = {
        initial: () => 0,
        next: (state, op) => (op.returned(state + 1) ? [state + 1] : []),
      };
      const recorder = new Recorder();
      await prop.forAll(recorder, "the counter counts every increment", async (c) => {
        const scheduler = new stateful.Scheduler(c, stateful.uniform());
        let count = 0;
        await stateful.steps(
          c,
          {
            spec: counter,
            actions: [
              {
                name: "increment",
                run: async (c, client) => {
                  const call = c.history().invoke(client, "increment", []);
                  const read = count;
                  await scheduler.yield();
                  count = read + 1;
                  call.ok(count);
                },
              },
            ],
          },
          stateful.clients(2),
          stateful.tasks(scheduler),
        );
      });
      const steps = "  step increment on client 1\n  step increment on client 2\n";

      check.contains(
        seat,
        `${recorder.message}\n`,
        `\n${steps}`,
        "the steps of the race",
      );
      check.contains(seat, section("## Machines"), steps, "the README states them");
    });
  });

  describe("The standard", () => {
    it("states the number of corpus cases", ({ seat }) => {
      check.contains(
        seat,
        section("## The standard"),
        `${cases().length} corpus cases state`,
        "the count is the corpus's",
      );
    });

    it("states the number of vectors of each family", ({ seat }) => {
      const counts = new Map<string, number>();
      for (const v of vectors()) {
        const family = HISTORY.has(v.kind)
          ? "history"
          : v.kind === "machines"
            ? "machine"
            : FILES.has(v.kind)
              ? "file"
              : "property";
        counts.set(family, (counts.get(family) ?? 0) + 1);
      }

      check.contains(
        seat,
        section("## The standard").replaceAll("\n  ", " "),
        `${counts.get("property")} property vectors, ${counts.get("history")} history vectors, ${counts.get("machine")} machine vectors and ${counts.get("file")} file vectors`,
        "the counts are the definition's",
      );
    });
  });

  describe("Where TypeScript differs", () => {
    it("explains each divergence that the overlay declares", ({ seat }) => {
      const named = names();
      const text = section("### Where TypeScript differs");
      for (const d of overlay().diverge) {
        // The prose names a member by the last segment of the name that the
        // naming table gives it: bench-max-allocs is written maxAllocs.
        const member = (named[d.id] ?? d.id).split(".").pop() as string;
        soft.contains(seat, text, member, `${d.id} is explained`);
      }
    });
  });

  describe("API reference", () => {
    it("contains the reference that tools/api-reference.ts generates", ({ seat }) => {
      check.isTrue(
        seat,
        existsSync(join(ROOT, "dist", "check.d.ts")),
        "the build exists: run npm run build, because the reference is generated from it",
      );
      const generated = execFileSync(
        process.execPath,
        [join(ROOT, "tools", "api-reference.ts")],
        { encoding: "utf8" },
      ).trim();
      const published = README.split("<!-- api-reference:start -->")[1]
        ?.split("<!-- api-reference:end -->")[0]
        ?.trim();

      check.equal(
        seat,
        published,
        generated,
        "the reference is current: run npm run build && node tools/api-reference.ts --write",
      );
    });
  });
});
