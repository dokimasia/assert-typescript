/**
 * Completes dist/ after the ES build and the CommonJS build.
 *
 * - It writes dist/cjs/package.json, so that Node loads the files of the
 *   CommonJS build as CommonJS in a package whose type is module.
 * - It copies the vendored definition into dist/conformance: the
 *   directories spec, corpus and overlays and the file VERSION, which the
 *   conformance runner reads beside its modules.
 * - It copies the zone table into dist/cjs/conformance/spec, which the
 *   CommonJS build of the property engine reads, and the file VERSION into
 *   dist/cjs/conformance, which the CommonJS build of the call record reads.
 * - It copies the declarations of each vitest major into dist/vitest.
 *
 * Usage: node tools/dist.ts
 */

import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

/** Copies the file or the directory from, under src, to the path to, under dist. */
function copy(from: string, to: string): void {
  const target = join(DIST, to);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(SRC, from), target, { recursive: true });
}

writeFileSync(join(DIST, "cjs", "package.json"), '{ "type": "commonjs" }\n');
for (const entry of ["spec", "corpus", "overlays", "VERSION"]) {
  copy(`conformance/${entry}`, `conformance/${entry}`);
}
copy("conformance/spec/zones.json", "cjs/conformance/spec/zones.json");
copy("conformance/VERSION", "cjs/conformance/VERSION");
copy("vitest/vitest4.d.ts", "vitest/vitest4.d.ts");
copy("vitest/vitest5.d.ts", "vitest/vitest5.d.ts");
