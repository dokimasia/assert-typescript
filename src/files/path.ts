/**
 * The assertions about the entry at one path of the operating system:
 * `absent`, `isFile`, `isDir`, `linksTo`, `hasContent` and `hasMode`.
 *
 * Each reads the entry at the path itself, and follows no link there. The
 * platform resolves the names before the last one, and follows a link
 * among them. Nothing is at a path below a file. Each stops the test on a
 * failure, and has no recording form. An entry that is no file, directory
 * or link, and any error of the file system but one that finds nothing at
 * the path, end the call with a fault.
 */

import { Fault, ofOperation } from "../matcher/fault.js";
import { Mode, type Seat } from "../matcher/seat.js";
import { Running } from "../matcher/verdict.js";
import {
  contentOf,
  contentValue,
  type Entry,
  isPermissions,
  type Kind,
  kindOf,
  modeText,
} from "./entry.js";
import { HOST } from "./platform.js";
import { readPath } from "./reader.js";

/** An assertion of one path: the operation that its faults name, and its id. */
interface Call {
  readonly op: string;
  readonly assertion: string;
}

/** The detail of a failure for the entry at a path, or undefined for a pass. */
type Detail = (e: Entry | undefined) => Readonly<Record<string, unknown>> | undefined;

/** Returns the kind of e as a record states it, and null for no entry. */
function kindName(e: Entry | undefined): Kind | null {
  return kindOf(e) ?? null;
}

/**
 * Reads the entry at path, with its content when content is set, and
 * reports the verdict of the call: a fault for refused and for an entry
 * that cannot be read, a failure with the detail that detail returns, and
 * a pass when detail returns undefined.
 */
function checkAt(
  seat: Seat,
  call: Call,
  path: string,
  msg: string,
  content: boolean,
  refused: string | undefined,
  detail: Detail,
): void {
  seat.helper();
  const running = Running.of(seat);
  let e: Entry | undefined;
  try {
    if (refused !== undefined) throw new Fault("", refused);
    e = readPath(path, content);
  } catch (err) {
    running.fault(Mode.Fatal, call.assertion, msg, ofOperation(call.op, err));
    return;
  }
  const failed = detail(e);
  if (failed === undefined) {
    running.pass(Mode.Fatal, call.assertion, msg);
    return;
  }
  running.fail(Mode.Fatal, call.assertion, msg, failed);
}

/** Returns the detail of an assertion that an entry of kind is at a path. */
function kindIs(kind: Kind): Detail {
  return (e) => (kindOf(e) === kind ? undefined : { got: kindName(e) });
}

/**
 * Checks that nothing is at path: no file, no directory and no link, a
 * link whose target is missing included. It stops the test with a record
 * of path-absent when an entry is there, whose got is the entry's kind:
 * file, directory or link.
 *
 * @param seat - Where the failure is reported.
 * @param path - The path, of the operating system.
 * @param msg - The contract under test.
 * @example
 * files.absent(seat, join(dir, "lock"), "the run removes its lock");
 */
export function absent(seat: Seat, path: string, msg: string): void {
  seat.helper();
  checkAt(
    seat,
    { op: "files.absent", assertion: "path-absent" },
    path,
    msg,
    false,
    undefined,
    (e) => (e === undefined ? undefined : { got: kindName(e) }),
  );
}

/**
 * Checks that a file is at path. A link to a file is a link. It stops the
 * test with a record of is-file when no file is there, whose got is the
 * kind of the entry there, or null for none.
 *
 * @param seat - Where the failure is reported.
 * @param path - The path, of the operating system.
 * @param msg - The contract under test.
 */
export function isFile(seat: Seat, path: string, msg: string): void {
  seat.helper();
  checkAt(
    seat,
    { op: "files.isFile", assertion: "is-file" },
    path,
    msg,
    false,
    undefined,
    kindIs("file"),
  );
}

/**
 * Checks that a directory is at path. A link to a directory is a link. It
 * stops the test with a record of is-dir when no directory is there, whose
 * got is the kind of the entry there, or null for none.
 *
 * @param seat - Where the failure is reported.
 * @param path - The path, of the operating system.
 * @param msg - The contract under test.
 */
export function isDir(seat: Seat, path: string, msg: string): void {
  seat.helper();
  checkAt(
    seat,
    { op: "files.isDir", assertion: "is-dir" },
    path,
    msg,
    false,
    undefined,
    kindIs("directory"),
  );
}

/**
 * Checks that a symbolic link whose target is target is at path. The
 * target compares as text, read with slashes as separators on every
 * platform, and nothing follows the link. It stops the test with a record
 * of links-to when no such link is there: want is target, got the target
 * of the link there, or null when no link is there, and kind the kind of
 * the entry there, or null for none.
 *
 * @param seat - Where the failure is reported.
 * @param path - The path, of the operating system.
 * @param target - The wanted target.
 * @param msg - The contract under test.
 * @example
 * files.linksTo(seat, join(dir, "current"), "releases/2", "the deploy moves the link");
 */
export function linksTo(seat: Seat, path: string, target: string, msg: string): void {
  seat.helper();
  checkAt(
    seat,
    { op: "files.linksTo", assertion: "links-to" },
    path,
    msg,
    false,
    undefined,
    (e) =>
      e?.link === target
        ? undefined
        : { want: target, got: e?.link ?? null, kind: kindName(e) },
  );
}

/**
 * Checks that a file whose bytes equal want is at path. It compares bytes,
 * so a file that ends in `\r\n` does not equal text that ends in `\n`. It
 * stops the test with a record of has-content when no such file is there:
 * want is want, got the file's content, or null when no file is there, and
 * kind the kind of the entry there, or null for none. A content is a
 * string when it is UTF-8 text, and a Uint8Array otherwise.
 *
 * A string want with a lone surrogate, which UTF-8 cannot encode, ends the
 * call with a fault.
 *
 * @param seat - Where the failure is reported.
 * @param path - The path, of the operating system.
 * @param want - The wanted content, as text or as bytes.
 * @param msg - The contract under test.
 * @example
 * files.hasContent(seat, join(dir, "go.mod"), "module example.com/a\n", "the module is renamed");
 */
export function hasContent(
  seat: Seat,
  path: string,
  want: string | Uint8Array,
  msg: string,
): void {
  seat.helper();
  const text = typeof want === "string";
  const wanted = text ? Buffer.from(want, "utf8") : want;
  const refused =
    text && !want.isWellFormed()
      ? "the wanted text has a lone surrogate, which UTF-8 cannot encode"
      : undefined;
  checkAt(
    seat,
    { op: "files.hasContent", assertion: "has-content" },
    path,
    msg,
    true,
    refused,
    (e) => {
      const content = kindOf(e) === "file" ? contentOf(e as Entry) : undefined;
      if (content !== undefined && Buffer.from(content).equals(wanted))
        return undefined;
      return {
        want: contentValue(wanted),
        got: content === undefined ? null : contentValue(content),
        kind: kindName(e),
      };
    },
  );
}

/**
 * Checks that a file or a directory whose nine permission bits are want
 * is at path. A link has no mode. It stops the test with a record of
 * has-mode when no such entry is there: want is want, got the permission
 * bits of the file or the directory there, or null when neither is there,
 * and kind the kind of the entry there, or null for none.
 *
 * A want that is no integer from 0 to 0o777 ends the call with a fault, and
 * so does a file system that records no permission bits, where the bits
 * that it would compare are not stored.
 *
 * @param seat - Where the failure is reported.
 * @param path - The path, of the operating system.
 * @param want - The wanted permission bits.
 * @param msg - The contract under test.
 * @example
 * files.hasMode(seat, join(home, ".config/tool/key"), 0o600, "the key is private");
 */
export function hasMode(seat: Seat, path: string, want: number, msg: string): void {
  seat.helper();
  const refused =
    (isPermissions(want)
      ? undefined
      : `the mode ${modeText(want)} is no integer from 0 to 0o777`) ?? HOST.modeFault;
  checkAt(
    seat,
    { op: "files.hasMode", assertion: "has-mode" },
    path,
    msg,
    false,
    refused,
    (e) => {
      const kind = kindOf(e);
      const mode = kind === "file" || kind === "directory" ? (e as Entry).mode : null;
      return mode === want ? undefined : { want, got: mode ?? null, kind: kindName(e) };
    },
  );
}
