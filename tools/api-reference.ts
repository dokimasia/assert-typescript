// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * Renders the README's API reference from the declarations that the build
 * emits.
 *
 * A list of signatures written by hand is wrong after the first change of
 * a parameter. This reads the emitted declarations, so the README matches
 * the code, or the spec of the README fails.
 *
 * It reads the build, so run `npm run build` first.
 *
 *     node tools/api-reference.ts --write
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the generated block starts and ends in README.md. */
const START = "<!-- api-reference:start -->";
const END = "<!-- api-reference:end -->";

/** A declared function of a declaration file, and the void return of a signature. */
const FUNCTION_LINE = /^(?:export )?declare function (?<name>\w+)(?<signature>.*);$/u;
const VOID_RETURN = /: void$/u;

/** The export of a local function under another name. */
const EXPORT_ALIAS = /^export \{ (?<local>\w+) as (?<exported>\w+) \};$/u;

/** A name that starts with a capital, as the name of a class does. */
const CAPITALISED = /^[A-Z]/u;

/** A public method of a class in a declaration file. */
const METHOD = /^ {4}(?<name>\w+)(?<generic><[^(]*>)?(?<params>\(.*\)): (?<type>.+);$/u;

/** A family of functions: its title, what it states, and the names of its functions. */
type Family = readonly [title: string, blurb: string, names: readonly string[]];

/** The tables of the reference, in the order a reader meets their functions. */
interface Tables {
  /** The families of the assertions of check. */
  readonly check: readonly Family[];
  /** The functions of the module files. */
  readonly files: readonly string[];
  /** The groups of the functions of the module prop. */
  readonly prop: readonly Family[];
  /** The functions of the module history. */
  readonly history: readonly string[];
  /** The functions of the module stateful. */
  readonly stateful: readonly string[];
  /** The functions of the module golden. */
  readonly golden: readonly string[];
  /** The methods of a case that the block of properties lists. */
  readonly caseMethods: readonly string[];
}

const {
  check: FAMILIES,
  files: FILES,
  prop: PROP,
  history: HISTORY,
  stateful: STATEFUL,
  golden: GOLDEN,
  caseMethods: CASE_METHODS,
} = JSON.parse(
  readFileSync(join(ROOT, "tools", "api-reference.json"), "utf8"),
) as Tables;

/**
 * Reads one emitted declaration file and returns its exported functions,
 * with the signature of each overload in order.
 *
 * A consumer's editor reads the build's .d.ts, and TypeScript emits one
 * declaration per line, so this needs no parser. TypeScript 7 moved the
 * compiler's API under `unstable`, so a documentation tool does not
 * depend on it.
 */
function declaredIn(file: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const local = new Map<string, string[]>();
  for (const line of readFileSync(join(ROOT, "dist", file), "utf8").split("\n")) {
    const declared = FUNCTION_LINE.exec(line.trim())?.groups;
    if (declared !== undefined) {
      // Almost every function returns void, so a reference that states it
      // on every line hides the few that return a value worth reading.
      const { name = "", signature = "" } = declared;
      const into = line.trim().startsWith("export ") ? found : local;
      into.set(name, [...(into.get(name) ?? []), signature.replace(VOID_RETURN, "")]);
    }
    // A function whose name a module format reserves, such as require,
    // has a local name and an export under its own name.
    const alias = EXPORT_ALIAS.exec(line.trim())?.groups;
    if (alias !== undefined) {
      found.set(alias["exported"] as string, local.get(alias["local"] as string) ?? []);
    }
  }
  return found;
}

/** Returns the exported functions of the declaration files, with the overloads of each in order. */
function declarations(...files: string[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const [fn, overloads] of files.flatMap((file) => [...declaredIn(file)])) {
    found.set(fn, [...(found.get(fn) ?? []), ...overloads]);
  }
  return found;
}

/** Returns the emitted declaration files of the directories dirs. */
function filesIn(...dirs: string[]): string[] {
  return dirs.flatMap((dir) =>
    readdirSync(join(ROOT, "dist", dir))
      .filter((name) => name.endsWith(".d.ts"))
      .map((name) => join(dir, name)),
  );
}

/**
 * Returns the line of each overload of the functions of names, which the
 * module of the directory dir exports, under prefix. It reads every
 * declaration file of the directory and of each of its subdirectories
 * nested, and checks that names lists every function that the module
 * exports.
 */
async function signatures(
  dir: string,
  prefix: string,
  names: readonly string[],
  nested: readonly string[] = [],
): Promise<Map<string, string[]>> {
  const found = declarations(...filesIn(dir, ...nested.map((n) => join(dir, n))));
  const module = (await import(
    pathToFileURL(join(ROOT, "dist", dir, "index.js")).href
  )) as Record<string, unknown>;
  // A class is a function whose name starts with a capital, and its methods
  // are read from its declaration.
  const exported = Object.keys(module).filter(
    (n) => typeof module[n] === "function" && !CAPITALISED.test(n),
  );
  const unlisted = exported.filter((n) => !names.includes(n));
  if (unlisted.length > 0) {
    throw new Error(`api-reference: ${dir} lists no ${unlisted.join(", ")}`);
  }
  return new Map(
    names.map((name) => {
      const overloads = found.get(name);
      if (overloads === undefined) {
        throw new Error(`api-reference: ${dir} has no ${name}`);
      }
      return [name, overloads.map((s) => `${prefix}.${name}${s}`)] as const;
    }),
  );
}

/** Reads the public methods of a class from its emitted declaration, those of names alone when it states them. */
function methods(file: string, className: string, names?: readonly string[]): string[] {
  const lines = readFileSync(join(ROOT, "dist", file), "utf8").split("\n");

  const declared = new RegExp(`declare (?:abstract )?class ${className}\\b`, "u");
  const at = lines.findIndex((l) => declared.test(l));
  if (at < 0) {
    return [];
  }

  const rendered: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith("}")) {
      break;
    }
    const method = METHOD.exec(line)?.groups;
    const name = method?.["name"];
    if (name !== undefined && (names === undefined || names.includes(name))) {
      rendered.push(
        `${className}.${name}${method?.["generic"] ?? ""}${method?.["params"]}: ${method?.["type"]}`,
      );
    }
  }
  return rendered;
}

/** Returns a family's block: its title, what it states, and its lines. */
function block(title: string, blurb: string, lines: readonly string[]): string[] {
  return [`**${title}** — ${blurb}`, "", "```ts", ...lines, "```", ""];
}

/** Returns the introduction and the block of each family of the assertions of check. */
function checkBlocks(): string[] {
  // check re-exports the modules of its directory and rejects.
  const check = declarations(...filesIn("check"), "rejects.d.ts");
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
    const lines = names.flatMap((name) => {
      const overloads = check.get(name);
      if (overloads === undefined) {
        throw new Error(`api-reference: check has no ${name}`);
      }
      return overloads.map((signature) => `check.${name}${signature}`);
    });
    out.push(...block(title, blurb, lines));
  }
  return out;
}

/** Returns the block of the functions of golden, the scrubbers that it re-exports included. */
function goldenBlock(): string[] {
  const golden = declarations("golden.d.ts", join("golden", "scrub.d.ts"));
  return block(
    "Golden files",
    "recorded output, compared and rewritable.",
    GOLDEN.flatMap((name) =>
      (golden.get(name) ?? []).map((signature) => `golden.${name}${signature}`),
    ),
  );
}

/** Returns the block of the functions of files and the methods of an entry. */
async function filesBlock(): Promise<string[]> {
  const files = await signatures("files", "files", FILES);
  return block(
    "Trees of files",
    "a workspace for a test, and the assertions about the files that the code under test leaves. Each stops the test on a failure.",
    [
      ...FILES.flatMap((name) => files.get(name) ?? []),
      ...methods("files/entry.d.ts", "Entry"),
    ],
  );
}

/** Returns the block of each group of the functions of prop, with the methods of a case and of a generator. */
async function propBlocks(): Promise<string[]> {
  const prop = await signatures(
    "prop",
    "prop",
    PROP.flatMap(([, , names]) => names),
    ["forms", "generators", "registry"],
  );
  return PROP.flatMap(([title, blurb, names]) => {
    const lines = names.flatMap((name) => prop.get(name) ?? []);
    if (title === "Properties") {
      lines.push(...methods("prop/case.d.ts", "Case", CASE_METHODS));
    }
    if (title === "Generators") {
      lines.push(...methods("prop/engine/generator/base.d.ts", "Generator"));
    }
    return block(title, blurb, lines);
  });
}

/** Returns the block of a history's methods and the functions of history. */
async function historyBlock(): Promise<string[]> {
  const history = await signatures("history", "history", HISTORY);
  return block(
    "Histories",
    "the calls that the clients of a subject make, checked against a sequential specification or for an isolation level.",
    [
      ...methods("history/history.d.ts", "History"),
      ...methods("history/history.d.ts", "Call"),
      ...HISTORY.flatMap((name) => history.get(name) ?? []),
    ],
  );
}

/** Returns the block of the functions of stateful and the methods of the scheduler. */
async function statefulBlock(): Promise<string[]> {
  const stateful = await signatures("stateful", "stateful", STATEFUL);
  return block(
    "Machines",
    "the steps of a case over a subject, and the task scheduler that releases its tasks in an order that the case decides.",
    [
      ...STATEFUL.flatMap((name) => stateful.get(name) ?? []),
      ...methods("stateful/scheduler.d.ts", "Scheduler"),
    ],
  );
}

/** Returns the whole reference section. */
async function reference(): Promise<string> {
  const out: string[] = [
    ...checkBlocks(),
    ...goldenBlock(),
    ...(await filesBlock()),
    ...block(
      "Benchmark ceilings",
      "chained onto one contract.",
      methods("bench.d.ts", "Contract"),
    ),
    ...(await propBlocks()),
    ...(await historyBlock()),
    ...(await statefulBlock()),
    "Each one carries a full doc comment: what it states, what every",
    "argument means, the edge cases it decides, and a worked call.",
  ];
  return out.join("\n");
}

const section = await reference();
if (process.argv.includes("--write")) {
  const path = join(ROOT, "README.md");
  const text = readFileSync(path, "utf8");
  if (!(text.includes(START) && text.includes(END))) {
    console.error(`api-reference: README.md has no ${START} block`);
    process.exit(1);
  }
  const head = text.slice(0, text.indexOf(START));
  const tail = text.slice(text.indexOf(END));
  writeFileSync(path, `${head}${START}\n\n${section}\n\n${tail}`);
  console.log("README.md: api reference written");
} else {
  console.log(section);
}
