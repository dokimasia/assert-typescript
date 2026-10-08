/**
 * Trees of files for a test, and the assertions about the files that the
 * code under test reads and writes.
 *
 * A {@link Tree} states files with their content, directories and symbolic
 * links, each at a slash-separated path relative to the tree's root.
 * {@link text}, {@link bytes}, {@link executable}, {@link directory} and
 * {@link link} state its entries, and {@link Entry.withMode} states the
 * permission bits of a file or a directory where they are part of the
 * contract.
 *
 * ```ts
 * const dir = files.workspace(seat, {
 *   "go.mod": files.text("module example.com/a\n"),
 *   "a/a.go": files.text("package a\n\nfunc Old() {}\n"),
 *   "keys/id": files.text("secret\n").withMode(0o600),
 * });
 * ```
 *
 * {@link workspace} writes a tree into a directory of the test's own, and
 * {@link write} writes a tree over the entries of a directory that exists.
 * {@link equal}, {@link contains} and {@link unchanged} compare the tree in
 * a directory with a wanted one. {@link absent}, {@link isFile},
 * {@link isDir}, {@link linksTo}, {@link hasContent} and {@link hasMode}
 * check the entry at one path, and {@link read} returns the content of a
 * file, so that the text assertions apply to it.
 *
 * Every assertion here stops the test on a failure, as the golden
 * comparisons do. A file system that records no permission bits, as on
 * Windows, reads no mode and no execute bit: a comparison then compares
 * neither, and {@link hasMode} ends the call with a fault.
 */

export { contains, equal, unchanged } from "./compare.js";
export { bytes, directory, Entry, executable, link, text } from "./entry.js";
export { absent, hasContent, hasMode, isDir, isFile, linksTo } from "./path.js";
export { read } from "./read.js";
export type { Tree } from "./tree.js";
export { workspace } from "./workspace.js";
export { write } from "./write.js";
