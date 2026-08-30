/**
 * Refresh the vendored definition from ../assert-spec.
 *
 * The files are vendored rather than fetched, so a build is
 * reproducible and a test run needs no network. That trade costs this
 * script: without it, a change to the standard is invisible here.
 */

import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = resolve(ROOT, "..", "assert-spec");
const INTO = join(ROOT, "src", "conformance", "spec");

if (!existsSync(SPEC)) {
  console.error(`spec-sync: ${SPEC} not found`);
  process.exit(1);
}

for (const [from, to] of [
  ["spec/assertions.json", "assertions.json"],
  ["spec/naming.json", "naming.json"],
  ["overlays/typescript.json", "overlay.json"],
  ["VERSION", "VERSION"],
] as const) {
  cpSync(join(SPEC, from), join(INTO, to));
  console.log(`  ${to}`);
}

rmSync(join(INTO, "corpus"), { recursive: true, force: true });
cpSync(join(SPEC, "corpus"), join(INTO, "corpus"), { recursive: true });
console.log("  corpus/");
