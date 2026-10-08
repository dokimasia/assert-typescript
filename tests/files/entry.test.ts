/** The spec of the entries of a tree of files. */

import { describe } from "vitest";
import {
  bitsOf,
  bytes,
  contentOf,
  contentValue,
  directory,
  Entry,
  executable,
  isPermissions,
  type Kind,
  kindOf,
  link,
  modeText,
  OWNER_EXECUTE,
  PERMISSIONS,
  text,
  unstated,
  withText,
} from "../../src/files/entry.js";
import { check } from "../../src/index.js";
import { test as it } from "../../src/vitest.js";
import { thrown } from "../helpers.js";

/** The bytes of a PNG file's signature, which are no UTF-8 text. */
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47);

/** Returns the own fields of e. */
function fields(e: Entry): Record<string, unknown> {
  return { ...e };
}

describe("entry", () => {
  describe("PERMISSIONS", () => {
    it("contains the nine permission bits", ({ seat }) => {
      check.equal(seat, PERMISSIONS, 0o777, "the nine bits");
    });
  });

  describe("OWNER_EXECUTE", () => {
    it("contains the owner's execute bit", ({ seat }) => {
      check.equal(seat, OWNER_EXECUTE, 0o100, "the bit");
    });
  });

  describe("new Entry", () => {
    it("returns an entry that states nothing", ({ seat }) => {
      const e = new Entry();

      check.equal(seat, [fields(e), kindOf(e)], [{}, undefined], "the entry is empty");
    });
  });

  describe("text", () => {
    it("returns a file whose content is the text", ({ seat }) => {
      check.equal(
        seat,
        fields(text("a\n")),
        { text: "a\n" },
        "the file states its text",
      );
    });

    it("throws a RangeError for a string with a lone surrogate", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => text("\ud800")),
        "files: text states a string with a lone surrogate, which UTF-8 cannot encode",
        "the refusal",
      );
    });
  });

  describe("bytes", () => {
    it("returns a file that states content of UTF-8 text as text", ({ seat }) => {
      check.equal(
        seat,
        fields(bytes(Uint8Array.of(0x61, 0x0a))),
        { text: "a\n" },
        "the bytes are text",
      );
    });

    it("returns a file that states other content as bytes", ({ seat }) => {
      check.equal(seat, fields(bytes(PNG)), { bytes: PNG }, "the bytes are kept");
    });

    it("copies its content", ({ seat }) => {
      const content = Uint8Array.from(PNG);
      const e = bytes(content);
      content[0] = 0;

      check.equal(seat, e.bytes, PNG, "a change of the argument changes nothing");
    });
  });

  describe("executable", () => {
    it("returns a file whose owner may execute it", ({ seat }) => {
      check.equal(
        seat,
        fields(executable("#!/bin/sh\n")),
        { text: "#!/bin/sh\n", executable: true },
        "the file is executable",
      );
    });

    it("throws a RangeError for a string with a lone surrogate", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => executable("\udc00")),
        "files: executable states a string with a lone surrogate, which UTF-8 cannot encode",
        "the refusal",
      );
    });
  });

  describe("directory", () => {
    it("returns a directory", ({ seat }) => {
      check.equal(seat, fields(directory()), { directory: true }, "the directory");
    });
  });

  describe("link", () => {
    it("returns a link to its target", ({ seat }) => {
      check.equal(seat, fields(link("../a.txt")), { link: "../a.txt" }, "the link");
    });
  });

  describe("Entry.withMode", () => {
    it("returns a file with the mode", ({ seat }) => {
      check.equal(
        seat,
        fields(text("secret\n").withMode(0o600)),
        { text: "secret\n", mode: 0o600 },
        "the file states its mode",
      );
    });

    it("returns an executable file whose mode replaces the execute flag", ({
      seat,
    }) => {
      check.equal(
        seat,
        fields(executable("#!/bin/sh\n").withMode(0o700)),
        { text: "#!/bin/sh\n", mode: 0o700 },
        "the mode states the execute bit",
      );
    });

    it("returns a directory with the mode", ({ seat }) => {
      check.equal(
        seat,
        fields(directory().withMode(0o700)),
        { directory: true, mode: 0o700 },
        "the directory states its mode",
      );
    });

    it("leaves the entry that it was called on as it is", ({ seat }) => {
      const e = text("a");
      e.withMode(0o600);

      check.equal(seat, fields(e), { text: "a" }, "the entry states no mode");
    });

    const tests = [
      {
        name: "throws a RangeError for a mode beyond the nine permission bits",
        give: () => text("a").withMode(0o1000),
        want: "files: withMode(0o1000) states no integer from 0 to 0o777",
      },
      {
        name: "throws a RangeError for a negative mode",
        give: () => text("a").withMode(-1),
        want: "files: withMode(-1) states no integer from 0 to 0o777",
      },
      {
        name: "throws a RangeError for a mode that is no integer",
        give: () => text("a").withMode(1.5),
        want: "files: withMode(1.5) states no integer from 0 to 0o777",
      },
      {
        name: "throws a RangeError for a link",
        give: () => link("a").withMode(0o644),
        want: "files: withMode(0o644) states the mode of no file and no directory",
      },
      {
        name: "throws a RangeError for an entry that states nothing",
        give: () => new Entry().withMode(0o644),
        want: "files: withMode(0o644) states the mode of no file and no directory",
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(seat, thrown(tt.give), tt.want, "the refusal");
      });
    }
  });

  describe("withText", () => {
    it("returns the file with the text and its other fields", ({ seat }) => {
      check.equal(
        seat,
        fields(withText(text("a").withMode(0o600), "b")),
        { text: "b", mode: 0o600 },
        "the text is replaced and the mode is kept",
      );
    });

    it("throws a RangeError for a string with a lone surrogate", ({ seat }) => {
      check.equal(
        seat,
        thrown(() => withText(text("a"), "\ud800")),
        "files: text states a string with a lone surrogate, which UTF-8 cannot encode",
        "the refusal",
      );
    });
  });

  describe("kindOf", () => {
    const tests: { name: string; give: unknown; want: Kind | undefined }[] = [
      {
        name: "returns file for a file of text",
        give: text("a"),
        want: "file",
      },
      { name: "returns file for a file of bytes", give: bytes(PNG), want: "file" },
      {
        name: "returns directory for a directory",
        give: directory(),
        want: "directory",
      },
      { name: "returns link for a link", give: link("a"), want: "link" },
      {
        name: "returns undefined for an entry of two kinds",
        give: Object.assign(new Entry(), { text: "a", link: "b" }),
        want: undefined,
      },
      {
        name: "returns undefined for a value that is no entry",
        give: { text: "a" },
        want: undefined,
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(seat, kindOf(tt.give), tt.want, "the kind");
      });
    }
  });

  describe("isPermissions", () => {
    const tests = [
      { name: "returns true for 0", give: 0, want: true },
      { name: "returns true for 0o777", give: 0o777, want: true },
      { name: "returns false for 0o1000", give: 0o1000, want: false },
      { name: "returns false for a negative number", give: -1, want: false },
      { name: "returns false for a number that is no integer", give: 1.5, want: false },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(seat, isPermissions(tt.give), tt.want, "the verdict on the mode");
      });
    }
  });

  describe("modeText", () => {
    const tests = [
      { name: "returns a non-negative integer in octal", give: 0o640, want: "0o640" },
      { name: "returns a negative integer in decimal", give: -8, want: "-8" },
      {
        name: "returns a number that is no integer in decimal",
        give: 1.5,
        want: "1.5",
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(seat, modeText(tt.give), tt.want, "the text of the mode");
      });
    }
  });

  describe("contentOf", () => {
    it("returns the UTF-8 bytes of a file of text", ({ seat }) => {
      check.equal(
        seat,
        Uint8Array.from(contentOf(text("é"))),
        Uint8Array.of(0xc3, 0xa9),
        "the bytes",
      );
    });

    it("returns the bytes of a file of bytes", ({ seat }) => {
      check.equal(seat, contentOf(bytes(PNG)), PNG, "the bytes");
    });

    it("returns no bytes for a directory", ({ seat }) => {
      check.equal(seat, contentOf(directory()).length, 0, "a directory has no content");
    });
  });

  describe("contentValue", () => {
    it("returns content of UTF-8 text as a string", ({ seat }) => {
      check.equal(seat, contentValue(Uint8Array.of(0x61)), "a", "the text");
    });

    it("returns other content as bytes", ({ seat }) => {
      check.equal(seat, contentValue(PNG), PNG, "the bytes");
    });
  });

  describe("bitsOf", () => {
    const tests = [
      {
        name: "returns the mode that an entry states",
        give: text("a").withMode(0o640),
        want: 0o640,
      },
      {
        name: "returns the owner's execute bit of an executable file",
        give: executable("a"),
        want: 0o100,
      },
      { name: "returns 0 for a file that states no mode", give: text("a"), want: 0 },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(seat, bitsOf(tt.give), tt.want, "the bits");
      });
    }
  });

  describe("unstated", () => {
    const tests = [
      {
        name: "returns a file whose mode has the owner's execute bit as executable",
        give: text("a").withMode(0o750),
        want: { text: "a", executable: true },
      },
      {
        name: "returns a file whose mode lacks the owner's execute bit as a plain file",
        give: text("a").withMode(0o640),
        want: { text: "a" },
      },
      {
        name: "returns a directory without its mode",
        give: directory().withMode(0o700),
        want: { directory: true },
      },
    ];

    for (const tt of tests) {
      it(tt.name, ({ seat }) => {
        check.equal(
          seat,
          fields(unstated(tt.give)),
          tt.want,
          "the entry without its mode",
        );
      });
    }
  });
});
