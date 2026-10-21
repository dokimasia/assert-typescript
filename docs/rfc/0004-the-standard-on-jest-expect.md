---
rfc: 0004
title: The standard's assertions on jest's expect
author: Roy Klopper <roy.klopper@stealthscale.io>
status: Accepted
created: 2026-10-20
updated: 2026-10-20
discussion: none
depends-on: RFC-0002, assert-spec RFC-0013
supersedes: none
superseded-by: none
produces-adr: none
---

# RFC-0004: The standard's assertions on jest's expect

## Summary

`@dokimi/assert/jest` gains `register`. It adds the standard's
assertions to jest's own `expect` with `expect.extend` and takes the
allow, shadow and strict modes of the vitest entry point. It also adds
`expect.soft`, which jest does not define. A test then calls the same
chain under both runners:

```ts
expect(reply.status).isEqualTo(200, "the request succeeds");
expect.soft(reply.items).hasLength(3, "every item comes back");
```

One entry point serves jest 29 and jest 30. The package also publishes
CommonJS builds of `.` and `./jest`, because jest runs a test file as
CommonJS by default and cannot load the package's ES modules in that
mode. The jest and vitest entry points share the matcher table, the
record of unsettled matchers, the shadow comparison, the strict table
and one interface of matcher types.

## Motivation

### A jest suite has no expect chain for the standard

A jest test asserts with `expect`. It can use the standard only through
the function form, with a seat that the test constructs and flushes
itself. The package publishes ES modules only, so jest cannot load it
from a test file in its default mode.

In the last week before 2026-10-20, npm counted 25,791,387 downloads of
jest and 77,531,558 of vitest. Jest 29 had 46.7% of the jest downloads,
and jest 30 had 38.1%.

### Jest takes the same matchers as vitest

A matcher for jest's `expect.extend` has the same signature as a matcher
for vitest's. It is a function of `this`, the received value and the
arguments, and it returns `pass` and `message`. We registered four of
the standard's assertions in a prototype. We ran it on jest 29.7.0 and
30.5.2 with Node 26.12.0:

- A failure printed the assertion's sentence and a code frame at the
  test's line.
- A call with `.not` failed with the negative to use in its message.
- `await expect(promise).resolves` applied a matcher to the resolved
  value.
- The matchers counted toward `expect.assertions`.
- A custom reporter received the failure record, the observed value and
  the required value in each test's `failureDetails`. It received them
  from a second worker as well.
- The global `expect` and the `expect` of `@jest/globals` both had the
  matchers.

### Where jest differs from vitest

| Concern | Vitest | Jest 29.7.0 and 30.5.2 |
|---|---|---|
| Format of a test file | ES module | CommonJS, unless Node runs with `--experimental-vm-modules` |
| A recording chain | `expect.soft` | None |
| A hook after one test | `onTestFinished`, registered from inside the test | `afterEach`, which jest does not run for a `test.concurrent` test |
| Where registered matchers are stored | chai's `Assertion.prototype` | A registry object under `Symbol.for("$$jest-matchers-object")` |
| Where matcher types are declared | The `vitest` module | The `expect` module for `@jest/globals`, and the `jest` namespace of `@types/jest` |

### The package's ES modules do not load in jest's default mode

We loaded the package from a CommonJS test file and from an ES module
test file. We ran each with and without Node's flag:

| Test file and Node flag | Conditions in the package's `exports` | Jest 29.7.0 | Jest 30.5.2 |
|---|---|---|---|
| CommonJS, no flag | `import`, as published | Cannot find module | Cannot find module |
| CommonJS, no flag | `import`, `module-sync` and `default` | `SyntaxError` at `export` | `ERR_REQUIRE_ESM` |
| CommonJS, flag | `import`, as published | Cannot find module | Cannot find module |
| CommonJS, flag | `import`, `module-sync` and `default` | `ERR_REQUIRE_ESM` | Loads |
| ES module, no flag | `import`, as published | `SyntaxError` at `import` | `ERR_REQUIRE_ESM` |
| ES module, flag | `import`, as published | Loads | Loads |
| CommonJS, no flag | `require`, to a CommonJS build | Loads | Loads |

Jest 30.4.0 added `require()` of an ES module. Its runtime enables it
only when `vm.SourceTextModule` has a `hasAsyncGraph` method. Node
26.12.0 defines `vm.SourceTextModule` only under
`--experimental-vm-modules`. Node then prints an `ExperimentalWarning` on
every run. Jest's own guide calls its ES module support experimental.

## Detailed design

### Components

| Component | File | Responsibility |
|---|---|---|
| `register` | `src/jest/api.ts` | Registers the matchers on jest's `expect`, adds `expect.soft`, registers the end-of-test hook and applies the mode |
| Entry point | `src/jest.ts` | Exports `register` and `Overlap`, and imports the declarations |
| Declarations | `src/jest/types.ts` | Adds the matchers to `Matchers` of the `expect` module and of the global `jest` namespace, and declares `expect.soft` |
| Matcher table | `src/expect/matchers.ts` | Gives one matcher per assertion to both runners |
| Pending record | `src/expect/guard.ts` | Records each asynchronous matcher with the test that started it, and lists the ones that have not settled when a runner ends that test |
| Shadow comparison | `src/expect/shadow.ts` | Compares the values of a call with the standard's equality, and appends a log line when the verdicts differ |
| Strict table | `src/expect/strict.ts` | Lists the refused matchers and the standard's assertion to use instead |
| Matcher interface | `src/expect/types.ts` | Declares `StandardMatchers<R, T>`, the 49 matchers of the chain, and the `Overlap` type |
| Module directory | `directoryOf` in `src/failure.ts` | Returns the directory of the module that calls it, in either module format |
| CommonJS build | `tsconfig.cjs.json` and `tools/dist.ts` | Compiles `src/index.ts` and `src/jest.ts` into `dist/cjs/`, and completes `dist/` |

The vitest adapter imports the same modules of `src/expect/`, and its two
declaration files extend `StandardMatchers`.

### register

```ts
/**
 * Add the standard's assertions to jest's `expect`, and add
 * `expect.soft`.
 *
 * Call it from a file that `setupFilesAfterEnv` names. Jest runs that
 * file in the environment of each test file, so `register` runs once for
 * each test file. A repeated call in one test file with the same mode
 * registers the same matchers again and changes nothing else.
 *
 * @param overlap - What happens to jest's overlapping matchers.
 *   `{ mode: "allow" }` when omitted.
 * @throws Error when jest's `expect` already has a matcher under one of
 *   the assertion names, or a property named `soft`. The message
 *   contains the name.
 * @throws Error when an earlier call in this test file chose another
 *   mode.
 * @throws Error when shadow mode cannot append to `log`, or cannot read
 *   jest's matcher registry.
 */
export function register(overlap?: Overlap): void;
```

`src/expect/types.ts` declares `Overlap` once, and both entry points
export it. Its `allow`, `shadow` and `strict` modes mean on jest what
they mean on vitest.

A jest project lists a setup file in `setupFilesAfterEnv`:

```js
// jest.config.js
module.exports = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};
```

```ts
// jest.setup.ts
import { register } from "@dokimi/assert/jest";

register();
```

Its test files keep jest's imports, or use jest's globals:

```ts
// reply.test.ts
import { describe, expect, it } from "@jest/globals";

describe("reply", () => {
  it("succeeds", async () => {
    const reply = await client.fetch(url);

    expect(reply.status).isEqualTo(200, "the request succeeds");
    expect.soft(reply.items).hasLength(3, "every item comes back");
    await expect(() => worker.drain()).completesWithin(50, "the worker drains in time");
  });
});
```

`register` imports `expect` and `afterEach` from `@jest/globals`. Jest's
runtime returns the globals of the running test file for that specifier.
It does not resolve a package for it. `register` records the mode it
applied in a symbol-keyed property of jest's `expect`.

### The matchers

The matcher table serves both runners unchanged. A matcher reads
`this.isNot`, runs the `check` function against a `Recorder`, and
returns `pass`, `message`, `actual`, `expected` and `meta`. Jest copies
the whole result into `matcherResult` of the error it throws, so a
custom reporter reads the failure record in
`failureDetails[].matcherResult.meta`.

Jest prints the message of a registered matcher and does not print a
diff. The function form's sentence contains both values:

```text
the records are equal: want {a: 2}, got {a: 1}
```

A registered matcher called with `.not` returns `pass: true`, so jest
throws its message. The message contains the negative to use from the
negation table of the vitest design. On both majors we measured the
refusal for `expect` and for `expect.soft`.

The frames between a matcher and the test are jest's `throwingMatcher`
and `__EXTERNAL_MATCHER_TRAP__` in `node_modules/expect/build/index.js`.
`callSite` skips frames under `node_modules` by the rule of the vitest
design. The prototype applied that rule and read the line of the call
for every failure on both majors. Jest's code frame shows the first frame
outside `node_modules`, so the frames of the installed library do not
hide the test's line.

### expect.soft

`expect.soft(value)` returns the chain of `expect(value)`. On that chain
a failing matcher records its failure and returns. On `expect` it
throws. The chain also records the failures of jest's own matchers, as
vitest's `expect.soft` does for vitest's. The `.not`, `.resolves` and
`.rejects` of a soft chain are soft chains.

A soft call pushes the error of a failing matcher onto
`expect.getState().suppressedErrors`. In both majors, jest's runner adds
those errors to the test when the test ends. Jest's snapshot matchers
report through the same list. We measured the soft chain on 29.7.0 and
30.5.2:

| Test | Result on both majors |
|---|---|
| Two soft failures, then a call that passes | Fails with both errors. The call after them runs |
| A soft failure, then a failure that throws | Fails with both errors, the thrown one first |
| An awaited `completesWithin` that fails on a soft chain | Fails when the test ends. The test continues past the call |
| `.not` on a soft chain | Fails. The message contains the negative to use |
| `expect.assertions(2)` and two soft calls that pass | Passes |

In a `test.concurrent` test the two majors differ. Jest 30.5.2 reported
the soft failure of a concurrent test on that test. Jest 29.7.0 reported
it on another concurrent test that ended after the failure.

### Declarations

`src/expect/types.ts` declares the 49 matchers of the chain once, as
`StandardMatchers<R, T>`, which the vitest design states. The jest
declaration extends it twice. TypeScript types an `expect` imported from
`@jest/globals` with `Matchers` of the `expect` module. It types the
global `expect` of `@types/jest` with `Matchers` of the `jest`
namespace:

```ts
// src/jest/types.ts
import type { StandardMatchers } from "../expect/types.js";

/** A chain of `expect.soft`: the matchers M, and the same matchers under `.not`. */
type Soft<M> = M & {
  not: M;
};

declare module "expect" {
  interface Matchers<R, T> extends StandardMatchers<R, T> {}

  interface BaseExpect {
    soft<T = unknown>(
      actual: T,
    ): Soft<Matchers<void, T>> & {
      resolves: Soft<Matchers<Promise<void>, T>>;
      rejects: Soft<Matchers<Promise<void>, T>>;
    };
  }
}

declare global {
  namespace jest {
    interface Matchers<R, T> extends StandardMatchers<R, T> {}

    interface Expect {
      soft<T = any>(
        actual: T,
      ): Soft<Matchers<void, T>> & {
        resolves: Soft<Matchers<Promise<void>, T>>;
        rejects: Soft<Matchers<Promise<void>, T>>;
      };
    }
  }
}
```

Jest 29.7.0 and 30.5.2 declare the same type parameters, so the one file
serves both majors. Their `expect` modules declare
`Matchers<R extends void | Promise<void>, T = unknown>`. `@types/jest`
29.5.14 and 30.0.0 declare `Matchers<R, T = {}>`. A declaration with the
parameters `R` and `T` and no constraint merges with both.

The vitest declarations extend the same interface. A consumer project
of each major compiled a probe with `skipLibCheck` off on TypeScript
7.0.2, as `tools/consumer/run.sh` builds one:

| Declaration | Compiles on |
|---|---|
| `src/jest/types.ts`, with `expect` imported from `@jest/globals` | Jest 29.7.0 and 30.5.2 |
| `src/jest/types.ts`, with the globals of `@types/jest` | `@types/jest` 29.5.14 and 30.0.0 |
| `src/vitest/vitest5.d.ts` | Vitest 5.0.5 |
| `src/vitest/vitest4.d.ts` | Vitest 4.1.12 |

Each probe also marked the following calls with `@ts-expect-error`.
TypeScript rejected each of them, as the marks require.

- A `want` of the wrong type on the chain.
- A `want` of the wrong type under `resolves`.
- A `want` of the wrong type on `expect.soft`.
- A `pairwise` predicate over the wrong element type.

### The await guard

Jest does not export `onTestFinished`, and a matcher's `this` does not
reference the running test. `register` registers one `afterEach` hook
from the setup file instead. An asynchronous matcher records itself
under the identity of its test, which jest 30's `expect.getState()`
returns from `currentTestIdentity`. Jest 29 has no such identity, so
there the record keys a call by the test file's path and the name of
the test, from `testPath` and `currentConcurrentTestName` or
`currentTestName`. After each test, the hook fails the test for the
first of its matchers that has not settled, with the message of the
vitest guard: "completesWithin was never awaited, so it asserted
nothing. Add await to the call." Such a matcher returns a passing
verdict when it settles, and its promise does not reject after the test.

We measured a prototype of the guard on 29.7.0 and 30.5.2:

| Test | Result on both majors |
|---|---|
| Awaited, passes | Passes |
| Awaited, fails | Fails with the assertion's message and a code frame at the call |
| Not awaited, still running at the end | Fails as never awaited. The next test passes |
| Not awaited, fails before the end | Fails with the assertion's message. Jest reports the unhandled rejection on the running test |
| Not awaited, passes before the end | Passes. The guard does not report it |
| Not awaited, in a `test.concurrent` test | Passes. Jest does not run an `afterEach` hook for a concurrent test |

The vitest guard has a step for an unawaited matcher that fails before
its test ends. On jest that step is not needed, because jest fails such
a test itself.

### Shadow mode

Vitest's shadow mode wraps a matcher with chai's `overwriteMethod`, and
jest does not offer such a wrapper. Shadow mode reads the original
`toEqual` and `toStrictEqual` from jest's registry at
`globalThis[Symbol.for("$$jest-matchers-object")].matchers`, before
`register` changes anything. It registers a wrapper under each name with
`expect.extend`. A wrapper calls
the original with jest's matcher context. It compares the same values
with the standard's equality and appends a log line when the verdicts
differ. It then returns the original's result. The wrapper skips a
comparison that contains an asymmetric matcher.

Jest does not document the registry. Jest 29.7.0 and 30.5.2 keep it
under that symbol. The shadow fixture in CI fails when a release moves
it. On both majors, a suite of seven tests with three planted
disagreements gave the same statuses and the same failure messages with
and without shadow mode. The log contained exactly the three:

```json
{"test":"disagrees on a field that is undefined","file":"probes/shadow/shadow.test.cjs","line":7,"matcher":"toEqual","jest":"pass","standard":"fail"}
{"test":"disagrees on negative zero","file":"probes/shadow/shadow.test.cjs","line":10,"matcher":"not.toEqual","jest":"pass","standard":"fail"}
{"test":"disagrees on NaN","file":"probes/shadow/shadow.test.cjs","line":13,"matcher":"toEqual","jest":"pass","standard":"fail"}
```

The log line has the fields of the vitest log. Its field `jest` replaces
the field `vitest`.

### Strict mode

Strict mode registers a refusal under the name of each overlapping
matcher that the running jest defines:

| Jest matcher | Use | With `.not` |
|---|---|---|
| `toEqual`, `toStrictEqual` | `isEqualTo` | `isNotEqualTo` |
| `toContain`, `toContainEqual` | `doesContain` | `doesNotContain` |
| `toHaveLength` | `hasLength` | None |
| `toMatch` | `doesMatch` | None |
| `toBeCloseTo` | `isCloseTo` | None |
| `toThrow`, and `toThrowError` on jest 29 | `doesThrow` | `doesNotThrow` |

Jest 29 defines `toThrowError`, which jest 30 removed. We measured the
refusals of `toEqual`, `.not.toEqual`, `.resolves.toEqual`,
`toHaveLength` and `toThrow` on both majors, and of `toThrowError` on
29.7.0. `toBe` and `toMatchObject` kept their verdicts.

### Names

The 49 assertion names do not occur on jest's chain or among the
properties of jest's `expect`. We read both lists from the running
engine. With `not`, `resolves` and `rejects`, the chain had 50 names on
29.7.0 and 39 on 30.5.2. `expect` and `expect.not` had 22 property names
on 29.7.0 and 23 on 30.5.2. Jest 29.7.0 and 30.5.2 do not define
`expect.soft`, and their `@jest/globals` does not export
`onTestFinished`.

The definition's name rule covers vitest's `expect`. This proposal needs
the same rule for jest's `expect`.

### Module formats

The package publishes CommonJS for `.` and `./jest` under the `require`
condition and ES modules under `import`. The other entry points remain
ES modules only, because vitest and the conformance runner import ES
modules.

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "require": "./dist/cjs/index.js",
      "import": "./dist/index.js"
    },
    "./jest": {
      "types": "./dist/jest.d.ts",
      "require": "./dist/cjs/jest.js",
      "import": "./dist/jest.js"
    },
    "./vitest": { "types": "./dist/vitest/vitest5.d.ts", "import": "./dist/vitest.js" },
    "./vitest4": { "types": "./dist/vitest/vitest4.d.ts", "import": "./dist/vitest.js" },
    "./conformance": {
      "types": "./dist/conformance/index.d.ts",
      "import": "./dist/conformance/index.js"
    }
  },
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json && tsc -p tsconfig.cjs.json && node tools/dist.ts"
  },
  "peerDependencies": {
    "jest": "^29.7.0 || ^30.5.2",
    "vitest": "^4.1.11 || ^5.0.3"
  },
  "peerDependenciesMeta": {
    "jest": { "optional": true },
    "vitest": { "optional": true }
  }
}
```

`tsconfig.cjs.json` compiles `src/index.ts` and `src/jest.ts` with
`module: CommonJS` and `moduleResolution: Bundler` into `dist/cjs/`. It
does not emit declarations. TypeScript 7.0.2 with `module: NodeNext`
checked a CommonJS file against the package's one set of declarations
without an error. `tools/dist.ts` then completes `dist/`:

- It writes `dist/cjs/package.json` with `"type": "commonjs"`, because
  the package's own `type` is `module`.
- It copies the vendored definition into `dist/conformance/spec/`.
- It copies the zone table into `dist/cjs/conformance/spec/`.
- It copies the declarations of each vitest major into `dist/vitest/`.

The CommonJS build needs three changes to the source:

- `src/failure.ts` reads `import.meta.url` for the library's directory.
  TypeScript refuses `import.meta` in CommonJS output (TS1470). The
  module reads its directory with `directoryOf` instead.
- `src/prop/engine/zone.ts` imports `zones.json` with an import
  attribute. TypeScript refuses an import attribute in CommonJS output
  (TS2856). The module reads the table with `readFileSync` from its own
  directory, which it finds with `directoryOf`.
- `src/prop/option.ts` declares a function named `require`, which a
  CommonJS module reserves (TS2441). The function gets a local name, and
  the module exports it as `require`. `prop.require` keeps its name.

```ts
// src/failure.ts
/**
 * Returns the directory of the module that calls it. A module calls it as
 * it loads, in an ES module and in a CommonJS module. It reads the file of
 * the caller's frame from V8's structured stack, which no source map
 * rewrites.
 */
export function directoryOf(): string;
```

We built the changed source into each format and ran both builds in
Node 26.12.0. Each build reported the caller's own file and line in
`where` and read the 16 zones of the table. The CommonJS build also
exported `prop.require`.

Jest maps the text of a stack through the source maps of the package, to
sources under `src/` that the package does not contain. In a consumer
project of jest, the directory read from the text of a stack did not
exist, and the zone table did not load. `directoryOf` reads the caller's file from V8's call sites,
through an `Error.prepareStackTrace` of its own for one call. It then
restores the runner's function. `callSite` treats the frames under both
directories as the library's: the directory of the files that run, and
the directory of the sources that a mapped stack names.

### Tests and CI

The specs of the source files that this proposal adds run in vitest:

- The specs of `src/expect/` test the shared modules as the vitest
  design describes.
- `tests/jest/api.test.ts` specifies `src/jest/api.ts`. It runs jest's
  `expect` package in a vitest worker, and replaces `@jest/globals` with
  that `expect` and a recording `afterEach` through `vi.mock`.
- `tests/jest.test.ts` specifies `src/jest.ts`. It runs jest as a child
  process on the fixture suites in `tests/testdata/jest/`, and compares
  jest's JSON report with the expected statuses, messages and code-frame
  lines. It also compares the shadow log, the strict refusals, the soft
  chain and the guard's cases.
- A fixture of `tests/jest.test.ts` reads the names of jest's `expect`
  from the running engine. The spec fails when either list contains an
  assertion name or `soft`.

Jest's `expect` 30.5.2 registered and ran a matcher in a vitest 4.1.12
worker. Vitest's own `toEqual` and `expect.soft` kept working beside it.
Both `expect` objects keep their registry under
`Symbol.for("$$jest-matchers-object")`, so in one worker they share it.
Vitest adds its own matchers to that registry, `toThrowError` among
them, so a case that states what a jest major defines removes vitest's
matcher first. Each case that registers the matchers restores the
registry and jest's `expect` when it ends.

The package gains `jest` 30.5.2 as a development dependency. CI runs the
jest specs on 30.5.2 in the check job, and on 29.7.0 in the job
`runners`. The job `consumer` packs the library and installs it beside
jest 29 or jest 30 and the `@types/jest` of the same major. It compiles
`tools/consumer/jest/globals.types.ts`, which imports `expect` from
`@jest/globals`, and `global.types.ts`, which uses the globals, with
`skipLibCheck` off. It then runs one jest test file in jest's default
mode. Its setup file calls `register`, and its tests call two matchers
and the function form from the CommonJS build.

### What fails, and where

| Event | Effect | Response |
|---|---|---|
| A jest release adds a member under an assertion name, or `expect.soft` | The name gate fails against that release | The definition renames the assertion in its next major version. For `soft`, `register` throws as it does for a plugin's property |
| A plugin registers one of the names before `register` runs | `expect.extend` would replace the plugin's matcher silently | `register` checks each name on `expect(undefined)` first. It throws an error with the matcher's name |
| A plugin registers one of the names after `register` | The plugin's matcher replaces the standard's for the rest of the test file | None. The name gate covers jest, not plugins |
| A test leaves an asynchronous matcher unawaited | The test never receives the matcher's verdict | The guard fails the test, except for a matcher that passed before the end and for a `test.concurrent` test |
| A test calls a registered matcher with `.not` | The matcher fails | The message contains the negative to use |
| `register` runs again in one test file with another mode | Shadow and strict mode both replace `toEqual` | `register` throws an error with both modes |
| Shadow mode cannot append to its log | No disagreement could be recorded | `register` appends an empty string to the log first, and throws with the path when that fails |
| A jest release moves its matcher registry | Shadow mode cannot read the original `toEqual` | `register` throws in shadow mode, and the shadow fixture fails in CI |
| A test file loads both builds of the package | Two copies of the library's module state, such as two pending records | None. A jest project loads one format unless it mixes `require` and `import` of the package |
| A runner maps the text of a stack through source maps that name sources the package does not ship | A directory read from that text does not exist | `directoryOf` reads V8's structured stack, and `callSite` treats both directories as the library's |

### Bounds

- `register` adds 49 matchers to jest's registry, 49 asymmetric matchers
  each to `expect` and `expect.not`, and `expect.soft`. Strict mode
  replaces 9 of jest's matchers on 29.7.0 and 8 on 30.5.2.
- A matcher call runs one check against one `Recorder` inside jest's
  `throwingMatcher`. The function form does the same work.
- Shadow mode adds one structural comparison to each `toEqual` and
  `toStrictEqual` call. On a value of 20 records, a `toEqual` call took
  162 µs without shadow mode and 220 µs with it on jest 29.7.0. On
  30.5.2 it took 205 µs and 283 µs. Each figure is the median of three
  rounds that alternated the two modes. A round's figure is the median of
  five runs of 10,000 calls.
- The guard adds one captured stack to each call of an asynchronous
  matcher, and one `afterEach` hook to each test file.
- The CommonJS build of `src/index.ts` and `src/jest.ts` has 119
  JavaScript files of 1,014,241 bytes in total. The ES build has 935,690
  bytes of JavaScript outside `dist/conformance/`.

### Migration

1. Name a setup file in `setupFilesAfterEnv`, and call `register()` from
   it. The step touches the configuration and the setup file only.
2. Run the suite with
   `register({ mode: "shadow", log: "dokimi-shadow.jsonl" })`. Read each
   logged call, and decide whether the test meant the standard's
   equality.
3. Move call sites to the standard's names. Then switch to
   `register({ mode: "strict" })`. A call to an overlapping matcher then
   fails.

The function form keeps working. It also loads in jest's default mode
through the CommonJS build.

## Alternatives considered

### A. ES modules only, with jest's ES module mode

Publish ES modules only. Document `--experimental-vm-modules`, and add
the `module-sync` condition so that jest 30 can `require()` the package.

**Why not:**

- Jest 29.7.0 cannot `require()` an ES module under any flag. Each of
  its suites would have to move every test file to ES modules.
- Jest 30.5.2 does so only under Node's experimental flag, which prints
  a warning on every run.
- Jest 29 had 46.7% of jest's downloads in the measured week, and jest 30
  had 38.1%.

### B. A bundled CommonJS build

Bundle each CommonJS entry point with rollup or esbuild. jest-dom 7.0.1
builds its `dist/*.js` and `dist/*.mjs` files this way with rollup. A
bundler rewrites `import.meta.url` and inlines `zones.json`, so the
source does not change.

**Why not:**

- It adds a bundler to the development dependencies and a configuration
  that rewrites `import.meta` for CommonJS.
- A bundle merges the library's modules into one file per entry point,
  so the two builds have different module graphs. Two `tsc` passes give
  two copies of one tree. Code that reads module locations then runs the
  same way in both.
- The source changes for the CommonJS build add about 25 lines.

### C. An entry point per type style

jest-dom 7.0.1 publishes `@testing-library/jest-dom` for the globals of
`@types/jest`, and `@testing-library/jest-dom/jest-globals` for
`@jest/globals`. Each entry point declares one of the two `Matchers`.

**Why not:** one declaration file with both augmentations compiled in
both styles on both majors. The global `expect` and the `expect` of
`@jest/globals` had the same matchers after one `register`, so one
runtime serves both styles.

### D. No soft chain on jest

Leave jest's `expect` without `soft`. A jest suite then records
failures through the function form and flushes a `Collector` in
`afterEach`.

**Why not:**

- A test that calls `expect.soft` under vitest would not run under jest.
- The function form needs a seat in every test. A jest test does not
  have a context object that could supply one.
- Jest's runner already reports suppressed errors when a test ends, so
  the soft chain does not add a mechanism to jest's runner.

The cost is a property on jest's `expect` that a jest release could
define. The name gate checks `soft` for that reason.

### E. Shadow mode through a copy of jest's toEqual

Rebuild `toEqual` and `toStrictEqual` from `this.equals` and
`this.utils`, which jest passes to every registered matcher. The design
would then not need the registry.

**Why not:** the copy would compute jest's verdict and print its own
message. The message of a failing `toEqual` would then differ from
jest's whenever jest changes its text. The wrapper over the registry's
original kept every message identical on both majors. Jest 29.7.0 also
exports its matchers under `expect/build/matchers`. Jest 30.5.2 lists
that path in its `exports`, and the package does not include the file,
because jest 30 bundles `expect` into one file.

### F. A seat for the function form on jest

Create a `Collector` in `beforeEach`, flush it in `afterEach`, and export
a function that returns the seat of the running test.

**Why not:** jest does not run `beforeEach` or `afterEach` for a
`test.concurrent` test. A soft failure that such a test records on a seat
is then never flushed. The test passes.

## Drawbacks

- The build gains a second `tsc` pass, `tsconfig.cjs.json` and
  `tools/dist.ts`. The CommonJS build adds 119 JavaScript files of
  1,014,241 bytes to the package.
- `src/failure.ts`, `src/prop/engine/zone.ts` and `src/prop/option.ts`
  change for the CommonJS build, by about 40 lines.
- The library gains `src/jest.ts`, `src/jest/api.ts` and
  `src/jest/types.ts`. It gains their specs, the fixture suites in
  `tests/testdata/jest/`, and the consumer probes of
  `tools/consumer/jest/`.
- The package gains `jest` as a development dependency. CI runs the jest
  specs once more, on jest 29.
- Shadow mode reads jest's matcher registry, which jest does not
  document.
- The guard does not report an unawaited matcher in a `test.concurrent`
  test.
- On jest 29.7.0, a soft failure in a `test.concurrent` test can be
  reported on another concurrent test.
- A soft failure is reported after a failure that throws in the same
  test, not in the order of the calls.
- A test file that loads both builds of the package has two copies of
  the library's module state.
- `expect.soft` on the types of `@jest/globals` does not have the
  snapshot matchers, because it returns `Matchers` of the `expect`
  module.
- Shadow mode made each `toEqual` call 36% slower on jest 29.7.0 and 38%
  slower on 30.5.2, on the value we measured.

## Unresolved and future work

- Resolution of the `expect` module from the declaration file was
  measured under npm only. pnpm with hoisting off and Yarn Plug'n'Play
  were not measured.
- TypeScript consumers below 7.0 were not measured. TypeScript 7.0.2
  removed `moduleResolution: node10`, so a TypeScript 7 consumer reads
  the `exports` map.
- In jest's ES module mode, loading the package was measured, and
  `register` was not.
- The retrying assertions under `jest.useFakeTimers()` were not
  measured.
- Registering the matchers on the `expect` of Bun's `bun:test` is not
  proposed here.
- A reporter that summarises the shadow log is not proposed here.

## References

| What | Where |
|---|---|
| Downloads by version in the last week | <https://api.npmjs.org/versions/jest/last-week> and <https://api.npmjs.org/versions/vitest/last-week>, fetched 2026-10-20 |
| The latest jest releases, 30.5.2 and 29.7.0 | `npm view jest dist-tags` and `npm view jest@29 version`, run 2026-10-20 |
| `expect.extend`, the registry under `Symbol.for("$$jest-matchers-object")`, and the asymmetric matcher of each registered name | expect 29.7.0: `build/jestMatchersObject.js`, lines 26 and 57-109; expect 30.5.2: `build/index.js`, lines 421 and 450-497 |
| The chain of `expect(value)`, built from the registry on each call, and the matcher's result in `matcherResult` | expect 29.7.0: `build/index.js`, lines 99-149 and 239-341; expect 30.5.2: `build/index.js`, lines 2102-2128 and 2161-2254 |
| Each matcher call counts toward `expect.assertions` | expect 29.7.0: `build/index.js`, line 267; expect 30.5.2: `build/index.js`, line 2188 |
| The `Matchers` and `MatcherState` declarations | expect 29.7.0: `build/index.d.ts`, lines 104 and 317-331; expect 30.5.2: `build/index.d.ts`, lines 102 and 270-291; @types/jest 29.5.14: `index.d.ts`, line 801; @types/jest 30.0.0: `index.d.ts`, line 833 |
| `require()` of an ES module, gated on `vm.SourceTextModule.prototype.hasAsyncGraph` | jest-runtime 30.5.2: `build/index.js`, lines 308-316 and 4441-4444 |
| The runtime returns the globals for `@jest/globals` before it resolves a package | jest-runtime 29.7.0: `build/index.js`, line 1040; jest-runtime 30.5.2: `build/index.js`, line 5107 |
| No `beforeEach` or `afterEach` for a concurrent test | jest-circus 29.7.0: `build/utils.js`, lines 179-187; jest-circus 30.5.2: `build/jestAdapterInit.js`, lines 1721-1729 |
| The runner adds suppressed errors to a test when it ends | jest-circus 29.7.0: `build/legacy-code-todo-rewrite/jestAdapterInit.js`, lines 233-238; jest-circus 30.5.2: `build/jestAdapterInit.js`, lines 2383 and 2405-2414 |
| Vitest keeps its matcher registry under the same symbol | vitest 4.1.12: `@vitest/expect/dist/index.js`, line 62; vitest 5.0.5: `dist/chunks/index.aTZaPVhf.js`, line 1094 |
| The code frame skips frames under `node_modules` | jest-message-util 29.7.0: `build/index.js`, lines 334-350; jest-message-util 30.5.2: `build/index.js`, lines 260-274 |
| Jest's guide to ES modules: experimental support, `require()` of an ES module on Node 24.9 and later, the `module-sync` condition | <https://github.com/jestjs/jest/blob/main/docs/ECMAScriptModules.md>, lines 6-14 and 47-61 |
| Jest 30.4.0 added `require()` of an ES module, and 30.5.0 the `module-sync` condition | <https://github.com/jestjs/jest/blob/main/CHANGELOG.md>, the entries for jest PRs 16074 and 16336 |
| jest-dom's CommonJS and ES builds per entry point, its `jest-globals` entry, and its two type files | `@testing-library/jest-dom` 7.0.1: `package.json`, `dist/`, `jest-globals.js`, `types/jest.d.ts` and `types/jest-globals.d.ts` |
| TypeScript 7.0.2 refuses `moduleResolution: node10` | `tsc --moduleResolution node10` exits with TS5108 |
| Our measurements on jest 29.7.0 and 30.5.2, vitest 4.1.12 and 5.0.5, Node 26.12.0 and TypeScript 7.0.2, 2026-10-20: the package loaded under seven combinations of format, flag and conditions; a prototype of `register` with four matchers, the guard, the soft chain, shadow mode and strict mode, in two workers and with a custom reporter; the names of jest's `expect`; the declarations with `skipLibCheck` off in both type styles; the source with the three changes, built in both formats; jest's `expect` in a vitest worker; the cost of `toEqual` with and without shadow mode | Scratch projects, one per jest and vitest version |
| Our runs of the library on 2026-10-20: the jest specs on jest 29.7.0 and 30.5.2, and a consumer project of each major that compiles the type probes and runs one test file in jest's default mode, where the zone table first failed to load under jest's mapped stacks | The jobs `runners` and `consumer` of CI, run locally |
