/** The spec of the rules by which a tree read differs from a wanted tree. */

import { describe } from "vitest";
import { differing, differs } from "../../src/files/difference.js";
import {
  bytes,
  directory,
  type Entry,
  executable,
  link,
  text,
} from "../../src/files/entry.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { WINDOWS } from "../helpers.js";

describe("difference", () => {
  describe("differs", () => {
    const tests: {
      name: string;
      giveWant: Entry;
      giveGot: Entry | undefined;
      want: boolean;
    }[] = [
      {
        name: "returns true for an entry that was not read",
        giveWant: text("a"),
        giveGot: undefined,
        want: true,
      },
      {
        name: "returns true for entries of other kinds",
        giveWant: directory(),
        giveGot: text(""),
        want: true,
      },
      {
        name: "returns true for files of other content",
        giveWant: text("a"),
        giveGot: text("b"),
        want: true,
      },
      {
        name: "returns true for files of other bytes",
        giveWant: bytes(Uint8Array.of(0x89)),
        giveGot: bytes(Uint8Array.of(0x8a)),
        want: true,
      },
      {
        name: "returns true for links of other targets",
        giveWant: link("a"),
        giveGot: link("b"),
        want: true,
      },
      {
        name: "returns false for equal links",
        giveWant: link("a"),
        giveGot: link("a"),
        want: false,
      },
      {
        name: "returns false for equal directories of any mode where the wanted one states none",
        giveWant: directory(),
        giveGot: directory().withMode(0o700),
        want: false,
      },
      {
        name: "returns false for a file whose mode differs outside the execute bit where the wanted one states none",
        giveWant: text("a"),
        giveGot: text("a").withMode(0o600),
        want: false,
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(seat, differs(tt.giveWant, tt.giveGot), tt.want, "the verdict");
      });
    }

    const modes: { name: string; giveWant: Entry; giveGot: Entry; want: boolean }[] = [
      {
        name: "returns true for another stated mode",
        giveWant: text("a").withMode(0o600),
        giveGot: text("a").withMode(0o644),
        want: true,
      },
      {
        name: "returns false for the stated mode",
        giveWant: text("a").withMode(0o600),
        giveGot: text("a").withMode(0o600),
        want: false,
      },
      {
        name: "returns true for another execute bit where the wanted file states no mode",
        giveWant: text("a"),
        giveGot: text("a").withMode(0o755),
        want: true,
      },
      {
        name: "returns false for the same execute bit where the wanted file states no mode",
        giveWant: executable("a"),
        giveGot: text("a").withMode(0o700),
        want: false,
      },
    ];

    for (const tt of modes) {
      it.skipIf(WINDOWS)(tt.name, ({ seat }) => {
        check.equal(seat, differs(tt.giveWant, tt.giveGot), tt.want, "the verdict");
      });
    }
  });

  describe("differing", () => {
    const want = new Map([
      ["a.txt", text("a")],
      ["docs/b.md", text("b")],
    ]);

    it("returns no path for a tree that has the wanted entries", ({ seat }) => {
      const got = new Map([
        ["a.txt", text("a")],
        ["docs", directory()],
        ["docs/b.md", text("b")],
      ]);

      check.isEmpty(seat, differing(want, got, false), "nothing differs");
    });

    it("returns a missing path, a path that the wanted tree implies, and an extra path, in order", ({
      seat,
    }) => {
      const got = new Map([
        ["a.txt", text("a")],
        ["z.txt", text("z")],
      ]);

      check.equal(
        seat,
        differing(want, got, false),
        ["docs", "docs/b.md", "z.txt"],
        "the paths that differ",
      );
    });

    it("returns no extra path for a comparison that only contains", ({ seat }) => {
      const got = new Map([
        ["a.txt", text("a")],
        ["docs", directory()],
        ["docs/b.md", text("b")],
        ["z.txt", text("z")],
      ]);

      check.isEmpty(seat, differing(want, got, true), "an extra path is no difference");
    });
  });
});
