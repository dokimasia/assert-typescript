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
import { fileURLToPath, pathToFileURL } from "node:url";

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
  [
    "Purity",
    "What observe answers defines what nothing means.",
    ["isPure", "isNotPure"],
  ],
  [
    "Relations",
    "Properties of a subject across its calls. A callable may return a promise. Every relation but isPermutation returns one, so await it.",
    [
      "isIdempotent",
      "accumulates",
      "isDeterministic",
      "isCommutative",
      "isAssociative",
      "roundTrip",
      "hasStableOrder",
      "noDuplicates",
      "isMonotonic",
      "isTotal",
      "failsAfterClose",
      "isPoisoned",
      "isPermutation",
    ],
  ],
  [
    "Testing an assertion",
    "On `check` only: `soft` cannot drive a check to failure, because it does not stop.",
    ["rejects"],
  ],
];

/** The functions of the module files, in the order a reader meets them. */
const FILES = [
  "workspace",
  "write",
  "read",
  "text",
  "bytes",
  "executable",
  "directory",
  "link",
  "equal",
  "contains",
  "unchanged",
  "absent",
  "isFile",
  "isDir",
  "linksTo",
  "hasContent",
  "hasMode",
];

/** The groups of the functions of the module prop, in the order a reader meets them. */
const PROP: [string, string, string[]][] = [
  [
    "Properties",
    "The body of a property draws its inputs from its case. A run shrinks a failing case to a minimal counterexample, and states the token that replays it. Each returns a promise, so await it.",
    ["forAll", "fuzz"],
  ],
  [
    "Property forms",
    "Each form states an assertion of a function of a generated input, and generates the input from the generator of `prop.using`.",
    [
      "equal",
      "notEqual",
      "isTrue",
      "isFalse",
      "isNil",
      "isNotNil",
      "length",
      "isEmpty",
      "isNotEmpty",
      "contains",
      "notContains",
      "containsInOrder",
      "isPermutation",
      "hasPrefix",
      "hasSuffix",
      "matches",
      "closeTo",
      "inRange",
      "pairwise",
      "noError",
      "hasError",
      "errorIs",
      "errorIsNot",
      "errorAs",
      "throws",
      "doesNotThrow",
      "isPure",
      "isNotPure",
      "nullHandleSafe",
      "honoursCancellation",
      "honoursDeadline",
      "isIdempotent",
      "accumulates",
      "isDeterministic",
      "isCommutative",
      "isAssociative",
      "roundTrip",
    ],
  ],
  [
    "Generators",
    "Each value is decoded from the choices of the case, so a value shrinks as its choices do.",
    [
      "integer",
      "float",
      "boolean",
      "just",
      "sampledFrom",
      "oneOf",
      "optional",
      "list",
      "dict",
      "string",
      "bytes",
      "duration",
      "permutation",
      "stringMatching",
      "recursive",
      "composite",
    ],
  ],
  [
    "Shapes and registrations",
    "A shape file states the type of an input, from which a generator is derived.",
    ["of", "ofShape", "shapeOf", "register", "registerValues", "registerVariants"],
  ],
  [
    "Property options",
    "The settings of a run. A later option overrides an earlier one of the same setting.",
    [
      "cases",
      "seed",
      "replay",
      "require",
      "shrink",
      "shrinkTime",
      "maxChoices",
      "store",
      "explain",
      "workers",
      "hermetic",
      "draws",
      "using",
      "example",
      "examples",
    ],
  ],
];

/** The functions of the module history, in the order a reader meets them. */
const HISTORY = [
  "fromIntervals",
  "concurrently",
  "specFrom",
  "isLinearizable",
  "isSerializable",
  "hasSnapshotIsolation",
  "budget",
  "memoLimit",
  "timeLimit",
  "workers",
];

/** The functions of the module stateful, in the order a reader meets them. */
const STATEFUL = [
  "steps",
  "mean",
  "max",
  "swarm",
  "clients",
  "concurrent",
  "tasks",
  "uniform",
  "pct",
];

/**
 * Reads one emitted declaration file and returns its exported functions,
 * with the signature of each overload in order.
 *
 * A consumer's editor reads the build's .d.ts, and TypeScript emits one
 * declaration per line, so this needs no parser. TypeScript 7 moved the
 * compiler's API under `unstable`, so a documentation tool does not
 * depend on it.
 */
function declarations(file: string): Map<string, string[]> {
  const path = join(ROOT, "dist", file);
  const found = new Map<string, string[]>();

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^export declare function (\w+)(.*);$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) {
      // Almost every function returns void, so a reference that states it
      // on every line hides the few that return a value worth reading.
      const signature = match[2].replace(/: void$/, "");
      found.set(match[1], [...(found.get(match[1]) ?? []), signature]);
    }
  }
  return found;
}

/**
 * Returns the line of each overload of the functions of names, which the
 * module of the directory dir exports, under prefix. It reads every
 * declaration file of the directory, and checks that names lists every
 * function that the module exports.
 */
async function signatures(
  dir: string,
  prefix: string,
  names: readonly string[],
): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  for (const name of readdirSync(join(ROOT, "dist", dir)).filter((n) =>
    n.endsWith(".d.ts"),
  )) {
    for (const [fn, overloads] of declarations(join(dir, name))) {
      found.set(fn, [...(found.get(fn) ?? []), ...overloads]);
    }
  }
  const module = (await import(
    pathToFileURL(join(ROOT, "dist", dir, "index.js")).href
  )) as Record<string, unknown>;
  // A class is a function whose name starts with a capital, and its methods
  // are read from its declaration.
  const exported = Object.keys(module).filter(
    (n) => typeof module[n] === "function" && !/^[A-Z]/.test(n),
  );
  const unlisted = exported.filter((n) => !names.includes(n));
  if (unlisted.length > 0) {
    throw new Error(`api-reference: ${dir} lists no ${unlisted.join(", ")}`);
  }
  const lines = new Map<string, string[]>();
  for (const name of names) {
    const overloads = found.get(name);
    if (overloads === undefined)
      throw new Error(`api-reference: ${dir} has no ${name}`);
    lines.set(
      name,
      overloads.map((signature) => `${prefix}.${name}${signature}`),
    );
  }
  return lines;
}

/** Reads the public methods of a class from its emitted declaration, those of names alone when it states them. */
function methods(file: string, className: string, names?: readonly string[]): string[] {
  const path = join(ROOT, "dist", file);
  const lines = readFileSync(path, "utf8").split("\n");

  const declared = new RegExp(`declare (abstract )?class ${className}\\b`);
  const at = lines.findIndex((l) => declared.test(l));
  if (at < 0) return [];

  const rendered: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith("}")) break;
    const match = /^ {4}(\w+)(<[^(]*>)?(\(.*\)): (.+);$/.exec(line);
    const name = match?.[1];
    if (name === undefined || (names !== undefined && !names.includes(name))) continue;
    rendered.push(
      `${className}.${name}${match?.[2] ?? ""}${match?.[3]}: ${match?.[4]}`,
    );
  }
  return rendered;
}

/** Returns a family's block: its title, what it states, and its lines. */
function block(title: string, blurb: string, lines: readonly string[]): string[] {
  return [`**${title}** — ${blurb}`, "", "```ts", ...lines, "```", ""];
}

/** Returns the whole reference section. */
async function reference(): Promise<string> {
  // check re-exports rejects, whose declaration is in rejects.d.ts.
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
    const lines = names.flatMap((name) => {
      const overloads = check.get(name);
      if (overloads === undefined)
        throw new Error(`api-reference: check has no ${name}`);
      return overloads.map((signature) => `check.${name}${signature}`);
    });
    out.push(...block(title, blurb, lines));
  }

  const golden = declarations("golden.d.ts");
  out.push(
    ...block(
      "Golden files",
      "recorded output, compared and rewritable.",
      [
        "match",
        "matchAt",
        "matchJsonField",
        "matchTree",
        "shouldUpdate",
        "scrubTimestamps",
        "scrubHashes",
        "scrubRunIds",
        "scrubJsonFields",
      ].flatMap((name) =>
        (golden.get(name) ?? []).map((signature) => `golden.${name}${signature}`),
      ),
    ),
  );

  const files = await signatures("files", "files", FILES);
  out.push(
    ...block(
      "Trees of files",
      "a workspace for a test, and the assertions about the files that the code under test leaves. Each stops the test on a failure.",
      [
        ...FILES.flatMap((name) => files.get(name) ?? []),
        ...methods("files/entry.d.ts", "Entry"),
      ],
    ),
  );

  out.push(
    ...block(
      "Benchmark ceilings",
      "chained onto one contract.",
      methods("bench.d.ts", "Contract"),
    ),
  );

  const prop = await signatures(
    "prop",
    "prop",
    PROP.flatMap(([, , names]) => names),
  );
  for (const [title, blurb, names] of PROP) {
    const lines = names.flatMap((name) => prop.get(name) ?? []);
    if (title === "Properties") {
      lines.push(
        ...methods("prop/case.d.ts", "Case", [
          "draw",
          "assume",
          "classify",
          "note",
          "rand",
          "observe",
          "cleanup",
          "history",
          "target",
        ]),
      );
    }
    if (title === "Generators")
      lines.push(...methods("prop/engine/generator.d.ts", "Generator"));
    out.push(...block(title, blurb, lines));
  }

  const history = await signatures("history", "history", HISTORY);
  out.push(
    ...block(
      "Histories",
      "the calls that the clients of a subject make, checked against a sequential specification or for an isolation level.",
      [
        ...methods("history/history.d.ts", "History"),
        ...methods("history/history.d.ts", "Call"),
        ...HISTORY.flatMap((name) => history.get(name) ?? []),
      ],
    ),
  );

  const stateful = await signatures("stateful", "stateful", STATEFUL);
  out.push(
    ...block(
      "Machines",
      "the steps of a case over a subject, and the task scheduler that releases its tasks in an order that the case decides.",
      [
        ...STATEFUL.flatMap((name) => stateful.get(name) ?? []),
        ...methods("stateful/scheduler.d.ts", "Scheduler"),
      ],
    ),
  );

  out.push(
    "Each one carries a full doc comment: what it states, what every",
    "argument means, the edge cases it decides, and a worked call.",
  );
  return out.join("\n");
}

const section = await reference();
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
