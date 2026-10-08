/**
 * The tree literal of the definition: `{"type": "tree", "entries": [...]}`,
 * its entries in path order. Each entry states `path` and exactly one of
 * `text`, `bytes`, `directory` and `link`, with `executable` or `mode`
 * where the entry states one. A record states a file whose content is
 * longer than its limit by `digest` and `size`.
 */

import { createHash } from "node:crypto";
import { Fault } from "../matcher/fault.js";
import type { Literal } from "../record/literal.js";
import {
  bytes,
  contentOf,
  directory,
  type Entry,
  isPermissions,
  kindOf,
  link,
  OWNER_EXECUTE,
  text,
  unstated,
} from "./entry.js";
import { check, compareBytes, pathsOf } from "./tree.js";

/** The longest content, in bytes, that a record states in full. */
export const CONTENT_LIMIT = 65_536;

/** The members that state the kind of an entry, of which an entry states exactly one. */
const KIND_MEMBERS = ["text", "bytes", "directory", "link", "digest"] as const;

/** The members that an entry of each kind may state. */
const TAKES: Readonly<Record<string, readonly string[]>> = {
  text: ["path", "text", "executable", "mode"],
  bytes: ["path", "bytes", "executable", "mode"],
  directory: ["path", "directory", "mode"],
  link: ["path", "link"],
  digest: ["path", "digest", "size", "executable", "mode"],
};

/** Returns the literal of a file's content: its text or its bytes, or its digest and size beyond limit. */
function contentLiteral(e: Entry, limit: number): Record<string, unknown> {
  const content = contentOf(e);
  if (content.length > limit) {
    const digest = createHash("sha256").update(content).digest("hex");
    return { digest: `sha256:${digest}`, size: content.length };
  }
  return e.text === undefined
    ? { bytes: Buffer.from(content).toString("hex") }
    : { text: e.text };
}

/** Returns the literal of the entry e at path. */
function entryLiteral(path: string, e: Entry, limit: number): Record<string, unknown> {
  const out: Record<string, unknown> = { path };
  const kind = kindOf(e);
  if (kind === "file") Object.assign(out, contentLiteral(e, limit));
  if (kind === "directory") out["directory"] = true;
  if (kind === "link") out["link"] = e.link;
  if (e.executable === true) out["executable"] = true;
  if (e.mode !== undefined) out["mode"] = e.mode;
  return out;
}

/**
 * Returns the tree literal of tree: its entries in path order, each file
 * by its text when its content is UTF-8 text and by its bytes otherwise,
 * and by its digest and its size when its content is longer than limit.
 *
 * @param tree - The tree.
 * @param limit - The longest content in bytes that the literal states in
 *   full: {@link CONTENT_LIMIT} for a record, and Infinity for an input.
 * @returns The literal.
 */
export function encode(tree: ReadonlyMap<string, Entry>, limit: number): Literal {
  return {
    type: "tree",
    entries: pathsOf(tree.keys()).map((path) =>
      entryLiteral(path, tree.get(path) as Entry, limit),
    ),
  };
}

/** Reports whether value is a JSON object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the string of member, or a fault at it for any other value. */
function stringAt(raw: Record<string, unknown>, member: string, at: string): string {
  const value = raw[member];
  if (typeof value !== "string")
    throw new Fault(`${at}.${member}`, `the ${member} is no string`);
  return value;
}

/** Returns e with the executable bit or the mode that raw states. */
function stated(e: Entry, raw: Record<string, unknown>, at: string): Entry {
  const execute = raw["executable"];
  const mode = raw["mode"];
  if (execute !== undefined && mode !== undefined) {
    throw new Fault(
      at,
      "the entry states a mode and executable, and the mode states the execute bit",
    );
  }
  if (execute !== undefined && typeof execute !== "boolean") {
    throw new Fault(`${at}.executable`, "executable is no boolean");
  }
  if (mode !== undefined && !(typeof mode === "number" && isPermissions(mode))) {
    throw new Fault(
      `${at}.mode`,
      `the mode ${JSON.stringify(mode)} is no integer from 0 to 511`,
    );
  }
  if (mode !== undefined) return e.withMode(mode as number);
  return execute === true ? unstated(e.withMode(OWNER_EXECUTE)) : e;
}

/** Returns the entry that the members of raw state, of the kind that kind names. */
function entryOf(raw: Record<string, unknown>, kind: string, at: string): Entry {
  switch (kind) {
    case "digest":
      throw new Fault(
        `${at}.digest`,
        "a digest states no content, and only a record states one",
      );
    case "directory":
      if (raw["directory"] !== true)
        throw new Fault(`${at}.directory`, "directory is not true");
      return stated(directory(), raw, at);
    case "link":
      return link(stringAt(raw, "link", at));
    case "bytes": {
      const hex = stringAt(raw, "bytes", at);
      if (!/^(?:[0-9a-f]{2})*$/.test(hex)) {
        throw new Fault(
          `${at}.bytes`,
          `${JSON.stringify(hex)} is no lowercase hexadecimal`,
        );
      }
      return stated(bytes(Buffer.from(hex, "hex")), raw, at);
    }
    default: {
      const content = stringAt(raw, "text", at);
      if (!content.isWellFormed())
        throw new Fault(`${at}.text`, "the text is no UTF-8 text");
      return stated(text(content), raw, at);
    }
  }
}

/** Returns the path and the entry that one entry of a tree literal states. */
function decodeEntry(raw: unknown, at: string): [string, Entry] {
  if (!isObject(raw)) throw new Fault(at, "the entry is no object");
  const kinds = KIND_MEMBERS.filter((member) => Object.hasOwn(raw, member));
  if (kinds.length !== 1) {
    throw new Fault(
      at,
      `the entry states [${kinds.join(" ")}], and an entry states one of text, bytes, directory and link`,
    );
  }
  const kind = kinds[0] as string;
  const extra = Object.keys(raw)
    .sort()
    .find((member) => !(TAKES[kind] as readonly string[]).includes(member));
  if (extra !== undefined)
    throw new Fault(`${at}.${extra}`, `a ${kind} entry takes no ${extra}`);
  return [stringAt(raw, "path", at), entryOf(raw, kind, at)];
}

/**
 * Returns the tree that a tree literal states as an input: its entries in
 * path order, each a file of its content, a directory or a link. No entry
 * states a digest, which only a record states. The tree keeps the rules of
 * a tree.
 *
 * @param literal - The literal, as JSON parses it.
 * @returns The tree.
 * @throws Fault at the member of the literal that it misstates, such as
 *   `entries[2].mode`, and at the path of an entry that breaks a rule of a
 *   tree.
 */
export function decode(literal: unknown): Map<string, Entry> {
  if (!isObject(literal)) throw new Fault("", "the literal is no object");
  if (literal["type"] !== "tree") {
    throw new Fault("type", `the type ${JSON.stringify(literal["type"])} is not tree`);
  }
  const entries = literal["entries"];
  if (!Array.isArray(entries))
    throw new Fault("entries", "the literal states no list of entries");
  const tree = new Map<string, Entry>();
  let last = "";
  entries.forEach((raw: unknown, i) => {
    const at = `entries[${i}]`;
    const [path, e] = decodeEntry(raw, at);
    if (i > 0 && compareBytes(path, last) <= 0) {
      throw new Fault(
        at,
        `the path ${JSON.stringify(path)} is not after the path before it`,
      );
    }
    last = path;
    tree.set(path, e);
  });
  check(tree);
  return tree;
}
