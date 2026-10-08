/**
 * The entries of a tree of files: a file with its content, a directory and
 * a symbolic link, each with its permission bits where a test states them.
 */

import { isUtf8 } from "node:buffer";

/** The kind of an entry, as a record states it. */
export type Kind = "file" | "directory" | "link";

/** The nine permission bits: read, write and execute for the owner, the group and others. */
export const PERMISSIONS = 0o777;

/** The permission bit that lets the owner execute a file. */
export const OWNER_EXECUTE = 0o100;

/** The fields that state the kind of an entry, each with the kind that it states. */
const KINDS = [
  ["text", "file"],
  ["bytes", "file"],
  ["directory", "directory"],
  ["link", "link"],
] as const;

/**
 * A file, a directory or a symbolic link of a tree.
 *
 * An entry states its parts in the fields of the tree literal. A file
 * states its content in `text` when the content is UTF-8 text, and in
 * `bytes` otherwise, so two files of the same bytes are equal entries. A
 * directory states `directory`, and a link states its target in `link`. A
 * file whose owner may execute it states `executable`, and an entry that
 * states its permission bits states them in `mode`.
 *
 * Build an entry with {@link text}, {@link bytes}, {@link executable},
 * {@link directory} or {@link link}. An entry that the constructor returns
 * states nothing, and a tree that contains one is refused.
 */
export class Entry {
  /** The content of a file that is UTF-8 text. */
  declare readonly text?: string;
  /** The content of a file that is no UTF-8 text. */
  declare readonly bytes?: Uint8Array;
  /** True for a directory. */
  declare readonly directory?: true;
  /** The target of a link. */
  declare readonly link?: string;
  /** True for a file that its owner may execute, where the entry states no mode. */
  declare readonly executable?: true;
  /** The nine permission bits of a file or a directory, where the entry states them. */
  declare readonly mode?: number;

  /**
   * Returns this entry with the nine permission bits of mode, which a
   * workspace sets and a comparison compares. The mode of a file states
   * whether its owner may execute it.
   *
   * @param mode - The permission bits, an integer from 0 to 0o777.
   * @returns A new entry.
   * @throws RangeError for a mode that is no integer from 0 to 0o777, and
   *   for an entry that is no file and no directory.
   * @example
   * files.text("secret\n").withMode(0o600)
   */
  withMode(mode: number): Entry {
    if (!isPermissions(mode)) {
      throw new RangeError(
        `files: withMode(${modeText(mode)}) states no integer from 0 to 0o777`,
      );
    }
    const kind = kindOf(this);
    if (kind !== "file" && kind !== "directory") {
      throw new RangeError(
        `files: withMode(${modeText(mode)}) states the mode of no file and no directory`,
      );
    }
    return entry({ ...partsOf(this), mode });
  }
}

/** Returns an entry of fields. */
function entry(fields: object): Entry {
  return Object.assign(new Entry(), fields);
}

/** Returns the fields of e that state its kind and its content or target. */
function partsOf(e: Entry): object {
  return Object.fromEntries(
    Object.entries(e).filter(([field]) => field !== "executable" && field !== "mode"),
  );
}

/** Returns content, which the call named call states, after it checks that UTF-8 encodes it. */
function wellFormed(call: string, content: string): string {
  if (!content.isWellFormed()) {
    throw new RangeError(
      `files: ${call} states a string with a lone surrogate, which UTF-8 cannot encode`,
    );
  }
  return content;
}

/** Returns the fields of a file of content: text when it is UTF-8 text, and a copy of the bytes otherwise. */
function contentFields(content: Uint8Array): { text: string } | { bytes: Uint8Array } {
  return isUtf8(content)
    ? { text: Buffer.from(content).toString("utf8") }
    : { bytes: Uint8Array.from(content) };
}

/**
 * Returns a file whose content is text.
 *
 * @param content - The text, which UTF-8 encodes in the file.
 * @returns The entry.
 * @throws RangeError for a string with a lone surrogate, which UTF-8
 *   cannot encode.
 * @example
 * files.text("module example.com/a\n")
 */
export function text(content: string): Entry {
  return entry({ text: wellFormed("text", content) });
}

/**
 * Returns a file whose content is content. It copies content, and the
 * entry states it as text when it is UTF-8 text.
 *
 * @param content - The bytes of the file.
 * @returns The entry.
 * @example
 * files.bytes(Uint8Array.of(0x89, 0x50, 0x4e, 0x47))
 */
export function bytes(content: Uint8Array): Entry {
  return entry(contentFields(content));
}

/**
 * Returns a file whose content is text, which its owner may execute.
 *
 * @param content - The text, which UTF-8 encodes in the file.
 * @returns The entry.
 * @throws RangeError for a string with a lone surrogate, which UTF-8
 *   cannot encode.
 * @example
 * files.executable("#!/bin/sh\necho ok\n")
 */
export function executable(content: string): Entry {
  return entry({ text: wellFormed("executable", content), executable: true });
}

/**
 * Returns a directory. A tree states a directory only when the directory
 * is empty or when the tree states its mode, because every parent of an
 * entry is a directory of the tree.
 *
 * @returns The entry.
 */
export function directory(): Entry {
  return entry({ directory: true });
}

/**
 * Returns a symbolic link to target. The target is text that no rule of a
 * path limits, inside or outside the tree, and nothing follows it. A tree
 * reads a target with slashes on every platform, so a target separates its
 * names with slashes.
 *
 * @param target - The target of the link.
 * @returns The entry.
 * @example
 * files.link("bin/run")
 */
export function link(target: string): Entry {
  return entry({ link: target });
}

/**
 * Returns the file e with content as its text, and with the other fields
 * of e.
 *
 * @param e - A file.
 * @param content - The new content.
 * @returns A new entry.
 * @throws RangeError for a string with a lone surrogate, which UTF-8
 *   cannot encode.
 */
export function withText(e: Entry, content: string): Entry {
  return entry({ ...e, text: wellFormed("text", content) });
}

/**
 * Returns the kind of value: the kind of an entry that states exactly one
 * of a file's content, a directory and a link, and undefined for any other
 * value.
 *
 * @param value - A value of a tree.
 * @returns The kind, or undefined.
 */
export function kindOf(value: unknown): Kind | undefined {
  if (!(value instanceof Entry)) return undefined;
  const stated = KINDS.filter(([field]) => value[field] !== undefined);
  return stated.length === 1 ? (stated[0] as (typeof KINDS)[number])[1] : undefined;
}

/**
 * Reports whether mode is a set of the nine permission bits.
 *
 * @param mode - A mode that a caller states.
 * @returns True for an integer from 0 to 0o777.
 */
export function isPermissions(mode: number): boolean {
  return Number.isInteger(mode) && mode >= 0 && mode <= PERMISSIONS;
}

/**
 * Returns the text of a mode: a non-negative integer in octal, as `0o600`,
 * and any other number in decimal.
 *
 * @param mode - A mode that a caller states.
 * @returns The text.
 */
export function modeText(mode: number): string {
  return Number.isInteger(mode) && mode >= 0 ? `0o${mode.toString(8)}` : String(mode);
}

/**
 * Returns the content of a file as bytes, and no bytes for any other
 * entry.
 *
 * @param e - The entry.
 * @returns The content.
 */
export function contentOf(e: Entry): Uint8Array {
  return e.bytes ?? Buffer.from(e.text ?? "", "utf8");
}

/**
 * Returns content as a record states it: text when it is UTF-8 text, and
 * bytes otherwise.
 *
 * @param content - The content of a file.
 * @returns The text, or a copy of the bytes.
 */
export function contentValue(content: Uint8Array): string | Uint8Array {
  const fields = contentFields(content);
  return "text" in fields ? fields.text : fields.bytes;
}

/**
 * Returns the permission bits that e states: its mode, or the owner's
 * execute bit of a file that states executable.
 *
 * @param e - The entry.
 * @returns The bits.
 */
export function bitsOf(e: Entry): number {
  return e.mode ?? (e.executable === true ? OWNER_EXECUTE : 0);
}

/**
 * Returns e without its mode. A file whose bits include the owner's execute
 * bit states executable.
 *
 * @param e - The entry.
 * @returns A new entry that states no mode.
 */
export function unstated(e: Entry): Entry {
  const execute = kindOf(e) === "file" && (bitsOf(e) & OWNER_EXECUTE) !== 0;
  return entry({ ...partsOf(e), ...(execute ? { executable: true } : {}) });
}
