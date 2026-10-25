// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The behaviours of a corpus case that read or write the files of the tree
 * in a directory, as the callable of unchanged.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Subject } from "../subject.js";

/** The mode that a subject creates a file with. */
const NEW_FILE_MODE = 0o644;

/** Calls fn with the path of each file of the tree in dir. It follows no link. */
function eachFile(dir: string, fn: (path: string) => void): void {
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      fn(join(entry.parentPath, entry.name));
    }
  }
}

/** A subject that reads every file of the tree in a directory, and writes nothing. */
export function leavesFilesAlone(): Subject {
  return { files: (dir) => eachFile(dir, (path) => readFileSync(path)) };
}

/** A subject that writes every file of the tree in a directory again, with the bytes that the file has. */
export function rewritesFiles(): Subject {
  // A file that exists keeps its mode.
  return {
    files: (dir) => eachFile(dir, (path) => writeFileSync(path, readFileSync(path))),
  };
}

/** A subject that writes a file of content at name, at the root of the tree in a directory. */
export function writesFile(name: string, content: string): Subject {
  return {
    files: (dir) => writeFileSync(join(dir, name), content, { mode: NEW_FILE_MODE }),
  };
}
