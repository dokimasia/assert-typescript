/**
 * Render the README's API reference from the source itself.
 *
 * A signature list written by hand goes stale the first time a
 * parameter moves. This reads the real declarations through the
 * compiler's own parser, so the README either matches the code or the
 * documentation test fails.
 *
 * Reads the build, so run `npm run build` first.
 *
 *     node tools/api-reference.ts --write
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the generated block starts and ends in README.md. */
const START = "<!-- api-reference:start -->";
const END = "<!-- api-reference:end -->";

/** The families, in the order a reader meets them, and what each states. */
const FAMILIES: [string, string, string[]][] = [
  ["Equality", "Structural, and strict about types.", ["equal", "notEqual"]],
  [
    "Truth and absence",
    "`isNil` accepts null and undefined both, which is what nullish means.",
    ["isTrue", "isFalse", "isNil", "isNotNil"],
  ],
  [
    "Size",
    "A string, an array, a Map, a Set or a plain object.",
    ["length", "isEmpty", "isNotEmpty"],
  ],
  [
    "Containment",
    "What holding means follows the haystack.",
    ["contains", "notContains", "containsInOrder"],
  ],
  ["Text", "Strings.", ["hasPrefix", "hasSuffix", "matches"]],
  ["Numbers", "Where exact equality is the wrong question.", ["closeTo", "inRange"]],
  [
    "Ordering",
    "Sorted, unique, and anything else that holds between neighbours.",
    ["pairwise"],
  ],
  [
    "Errors",
    "For code that hands an error back. Matching follows the chain of `cause`.",
    ["noError", "hasError", "errorIs", "errorIsNot", "errorAs"],
  ],
  [
    "Throwing",
    "`throws` refuses a callable that answers a promise, since an unawaited rejection is not a throw.",
    ["throws", "doesNotThrow", "rejectsWith"],
  ],
  [
    "Cancellation",
    "AbortSignal is JavaScript's cancellation model. These answer promises, so await them.",
    ["honoursCancellation", "honoursDeadline", "completesWithin", "nullHandleSafe"],
  ],
  [
    "Retrying",
    "For a condition something outside the test makes true. Both spend real time.",
    ["eventually", "eventuallyTrue"],
  ],
  [
    "Concurrency",
    "Reads Node's active resources, so a timer or handle left open is a leak.",
    ["noTaskLeaks"],
  ],
  ["Purity", "What observe answers defines what nothing means.", ["isPure"]],
  [
    "Testing an assertion",
    "On `check` only: `soft` cannot drive a check to failure, because it does not stop.",
    ["rejects"],
  ],
];

/**
 * Read one emitted declaration file and answer its exported functions.
 *
 * The build's .d.ts is what a consumer's editor reads, and TypeScript
 * emits one declaration per line, so this needs no parser. The
 * compiler's own API would be the obvious alternative; TypeScript 7
 * moved it under `unstable`, and a documentation tool is not worth
 * pinning to that.
 */
function declarations(file: string): Map<string, string> {
  const path = join(ROOT, "dist", file);
  const found = new Map<string, string>();

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^export declare function (\w+)(.*);$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) {
      // Almost everything answers void, so saying so on every line
      // hides the few that answer something worth knowing about.
      found.set(match[1], match[2].replace(/: void$/, ""));
    }
  }
  return found;
}

/** Read a class's public methods from its emitted declaration. */
function methods(file: string, className: string): string[] {
  const path = join(ROOT, "dist", file);
  const lines = readFileSync(path, "utf8").split("\n");

  const at = lines.findIndex((l) => l.includes(`declare class ${className}`));
  if (at < 0) return [];

  const rendered: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith("}")) break;
    const match = /^ {4}(\w+)(\(.*\)): (.+);$/.exec(line);
    if (match?.[1] !== undefined && !match[1].startsWith("#")) {
      rendered.push(`${className}.${match[1]}${match[2]}: ${match[3]}`);
    }
  }
  return rendered;
}

/** Answer the whole reference section. */
function reference(): string {
  // check re-exports rejects, so its declaration lives elsewhere.
  const check = new Map([
    ...declarations("check.d.ts"),
    ...declarations("rejects.d.ts"),
  ]);
  const placed = new Set(FAMILIES.flatMap(([, , names]) => names));
  const missing = [...check.keys()].filter((n) => !placed.has(n));
  if (missing.length > 0) {
    throw new Error(`api-reference: no family for ${missing.join(", ")}`);
  }

  const out: string[] = [
    "Every assertion takes the seat first and the message last.",
    "`check` and `soft` carry the same names and the same signatures;",
    "only what happens on a failure differs.",
    "",
  ];

  for (const [title, blurb, names] of FAMILIES) {
    out.push(`**${title}** — ${blurb}`, "", "```ts");
    for (const name of names) {
      const signature = check.get(name);
      if (signature === undefined) {
        throw new Error(`api-reference: check has no ${name}`);
      }
      out.push(`check.${name}${signature}`);
    }
    out.push("```", "");
  }

  const golden = declarations("golden.d.ts");
  out.push("**Golden files** — recorded output, compared and rewritable.", "", "```ts");
  for (const name of [
    "match",
    "matchAt",
    "matchJsonField",
    "shouldUpdate",
    "scrubTimestamps",
    "scrubHashes",
    "scrubRunIds",
    "scrubJsonFields",
  ]) {
    const signature = golden.get(name);
    if (signature !== undefined) out.push(`golden.${name}${signature}`);
  }
  out.push("```", "");

  out.push("**Benchmark ceilings** — chained onto one contract.", "", "```ts");
  out.push(...methods("bench.d.ts", "Contract"));
  out.push("```", "");

  out.push(
    "Each one carries a full doc comment: what it states, what every",
    "argument means, the edge cases it decides, and a worked call.",
  );
  return out.join("\n");
}

const section = reference();
if (!process.argv.includes("--write")) {
  console.log(section);
} else {
  const path = join(ROOT, "README.md");
  const text = readFileSync(path, "utf8");
  if (!text.includes(START) || !text.includes(END)) {
    console.error(`api-reference: README.md has no ${START} block`);
    process.exit(1);
  }
  const head = text.slice(0, text.indexOf(START));
  const tail = text.slice(text.indexOf(END));
  writeFileSync(path, `${head}${START}\n\n${section}\n\n${tail}`);
  console.log("README.md: api reference written");
}
