---
research: 0001
title: Can a vitest suite use the standard's assertions through expect while every file written for vitest 4.1 or 5.0 runs unchanged, and which vitest mechanisms does that need?
author: Roy Klopper <roy.klopper@stealthscale.io>
status: Answered
created: 2026-10-01
updated: 2026-10-01
freshest-source: 2026-09-30
supersedes: none
superseded-by: none
---

# Research-0001: Can a vitest suite use the standard's assertions through expect while every file written for vitest 4.1 or 5.0 runs unchanged, and which vitest mechanisms does that need?

## The question

We want this library to be a drop-in replacement for vitest. Where vitest
already implements a mechanism, such as soft failures or reporting, the
library should call vitest's version instead of its own. Drop-in sets the
bar: a test file written for vitest keeps its imports, its `vi.mock`
calls, its globals, its third-party matchers and its verdicts. The
standard's assertions then have to be available through `expect`, the
entry point every vitest user already types.

The research covers vitest 4.1, which the repository pins as `^4.1.11`,
and vitest 5.0, whose 5.0.3 release has been the registry's `latest`
since 2026-09-30.

### What would count as an answer

- For each part of vitest's surface: the source line in the published
  4.1.11 and 5.0.3 packages that implements it, or vitest's documentation
  at those tags, and a measurement that exercises it on both.
- For a mechanism this library would build on: a prototype that runs on
  both versions, with its result.
- For prior art: a project doing the same thing, read at a named version.

### What sources are admissible

Vitest's published packages and its documentation at the release tags.
Vitest's pull requests and issues, where maintainers state a position.
Other projects' published packages, documentation and issues. Our own
measurements in scratch projects. A blog post about vitest is not vitest.

### What would change the answer

- A vitest option that declares another module as the source of `vi`.
- A vitest release that changes the type parameters of `Matchers` or
  `Assertion` again.
- A reproduction of the lost matcher types that jest-dom issue #738
  reports.
- Vitest starting to track custom asynchronous matchers that nobody
  awaits.

## The answer

Yes, through vitest's own `expect` rather than a replacement for it. When
a setup file registers the standard's assertions with `expect.extend`, as
`@testing-library/jest-dom/vitest` does, test files keep importing from
`"vitest"`. Mock hoisting, globals, `context.expect`, `expect.soft`,
assertion counting, diffs and reporters then remain vitest's own. We
measured each of them on 4.1.11 and 5.0.3.

Seven of the standard's 35 TypeScript names already exist on vitest's
`expect`: `equal`, `contains`, `length`, `matches`, `closeTo`, `throws` and
`rejects`. Five of them behave differently there, and `rejects` is a
getter that cannot be replaced. `closeTo` agreed on the two inputs we
tried. Those seven need other names on `expect`, which is a decision for
the naming table, or remain in the function form only.

Replacing the `vitest` module, as vite-plus does with
`export * from 'vitest'`, keeps the runner but breaks `vi.mock` for `vi`
imported from the replacement. Replacing `expect` with an object of our
own drops vitest's matchers. A hook that reads `context.expect` to build
such an object silently switches off `expect.assertions`.

## Findings

We measured in two scratch projects: one with vitest 4.1.11, copied from
this repository's installed packages, and one with vitest 5.0.3 from npm.
Both ran on Node 26.10.0 with TypeScript 7.0.2. Every measurement below
gave the same result on both versions unless a version is named.

### Vitest's surface differs between 4.1 and 5.0

- Vitest 4.1.11's `package.json` exports 21 subpaths, and 5.0.3 exports 15.
  Version 5.0.3 drops `coverage`, `environments`, `reporters`, `runners`,
  `snapshot`, `src/*` and `suite`, and adds `internal/traces`. Vitest's
  migration guide at v5.0.3 lists each removal with its replacement
  (`docs/guide/migration/index.md`, lines 634-645).
- The root module exports 28 runtime names at 4.1.11 and 26 at 5.0.3. The
  missing two are `bench` and `BenchmarkRunner`, which the guide's
  "Benchmarking API Rewrite" covers (lines 241-270). The declaration file
  exports 140 names at 4.1.11 and 156 at 5.0.3.
- Vitest 5.0.3 no longer depends on `@vitest/expect`, `@vitest/runner`,
  `@vitest/snapshot` or `@vitest/utils`. The guide states that
  `@vitest/expect` "no longer shares state with Vitest's `expect`", and
  tells users to "Interact with Vitest's assertions through the `vitest`
  entry point (`expect`, `expect.extend`, `chai`) instead" (lines 623-633).

We conclude that a library supporting both versions can use only what the
`vitest` module exports. A re-export with `export *` follows whichever
version a consumer has installed.

### Only mock hoisting depends on the import specifier

- Vitest's mock hoister treats an import as the source of `vi` only when
  its specifier is `"vitest"` or one of the entries in
  `REDISTRIBUTED_HOISTED_MODULES = ["vite-plus/test"]`
  (`@vitest/mocker/dist/chunk-hoistMocks.js`, lines 353, 373 and 390 at
  4.1.11, and lines 355, 375 and 392 at 5.0.3).
- `MocksPlugins()` constructs the hoisting plugin with a filter and a code
  frame generator and passes no option for the specifier
  (`vitest/dist/chunks/cli-api.CnMVyzaz.js:9874-9885` at 4.1.11,
  `vitest/dist/chunks/index.DpLw24bj.js:9271-9283` at 5.0.3).
- Vitest's documentation states the limit: "`vi` that was not directly
  imported from the `vitest` package (for example, from some utility file)
  cannot be used. Use `vi.mock` with `vi` imported from `vitest`, or enable
  `globals` config option" (`docs/api/vi.md`, line 45, at v4.1.11 and
  v5.0.3).
- Vitest PR #10489, merged on 2026-06-01, added `vite-plus/test` to that
  list. Its author first proposed a `hoistedModule` option. A maintainer
  pointed out that vitest passes the plugin no public configuration, and
  the author replaced the option with the `vite-plus/test` entry. The
  author offered a generic mechanism instead, and two maintainers approved
  the `vite-plus/test` entry. PR #10548 backported it to vitest 4.
- In our measurement, `vi.mock` with `vi` imported from a re-exporting
  module stopped the file with "There are some problems in resolving the
  mocks API". With `globals: true` it failed with
  `ReferenceError: Cannot access '__vi_import_0__' before initialization`
  on 4.1.11. The documentation's `globals` remedy covers a `vi` that is not
  imported at all, not one imported from another module.
- Vitest's resolver and its static test collector also read the specifier,
  and neither changes behaviour. The resolver maps a bare `"vitest"` to
  the running copy's own `dist/index.js` (`cli-api.CnMVyzaz.js:10310-10321`
  at 4.1.11, `index.DpLw24bj.js:9408-9428` at 5.0.3). The collector
  recognises tests by the callee's name, `describe`, `suite`, `it`, `test`
  or a name that starts with `test` or ends with `Test`, not by the import
  (`cli-api.CnMVyzaz.js:122-127` at 4.1.11).

We conclude that a module replacing `vitest` needs an upstream change to
the hoister before `vi.mock` works through it. A route that leaves the
imports on `"vitest"` needs none.

### A re-export of vitest runs a suite, except for `vi.mock`

- vite-plus 1.0.0 implements `vite-plus/test` as the one line
  `export * from 'vitest';`, and its `config`, `node` and `globals`
  subpaths the same way. Its migration guide states that it "re-exports
  upstream `vitest@5.0.1` under `vite-plus/test*`", and that type
  augmentations "have to target the upstream module identity to merge
  correctly" (`docs/guide/migrate.md`, lines 154 and 180).
- Our prototype re-exported vitest and replaced `test` and `it` with the
  seat fixture. `describe`, `.each`, `.for`, `.concurrent`, `.skip`,
  `.fails`, `vi.fn`, `onTestFinished` and `expectTypeOf` worked through it,
  and tsc typed the fixture.
- Re-exporting typed hooks broke the declaration build.
  `export const beforeEach = test.beforeEach` emitted an import of
  `@vitest/runner`, a package the consumer does not declare, on 4.1.11. On
  5.0.3 tsc failed with TS4023. With only `test` and `it` replaced, the
  emitted declarations imported nothing but `"vitest"`.
- This library's `package.json` declares no `peerDependencies`, although
  `dist/vitest.js` imports vitest. pnpm 12.8.1 still resolved the import in
  a single-project install, with hoisting on and off. With hoisting off,
  pnpm's hidden hoisting directory was empty. We attribute the resolution
  to Node's directory walk, which finds the consumer's own
  `node_modules/vitest`. jest-dom 7.0.1 declares vitest as an optional
  peer, `>= 0.32`.

### The library's current fixture reports one soft failure twice

- Vitest's `callFixtureCleanupFrom` truncates its list of cleanups only
  after every cleanup succeeds (`@vitest/runner/dist/chunk-artifact.js`,
  lines 270-283, at 4.1.11). When the seat fixture's `flush` throws, the
  entry remains, and `callFixtureCleanup` runs it again (line 3002). Vitest
  5.0.3 has the same code (`vitest/dist/chunks/run.BTlFXlnv.js`, lines
  1605-1614 and 3920).
- Vitest's JSON reporter recorded two failure messages for one failing
  test that used this library's `test` from `@dokimi/assert/vitest`. A
  fixture that flushes from `onTestFinished` recorded one, and `test.fails`
  still passed.

### Registering the standard on vitest's `expect` keeps everything vitest does

- `expect.extend` installs each matcher on `chai.Assertion.prototype`,
  which every `expect` in a worker shares (`@vitest/expect/dist/index.js`,
  lines 1867-1903, at 4.1.11, and
  `vitest/dist/chunks/index.C4tKZ0yW.js:2566-2592` at 5.0.3). A matcher
  added this way goes through the same soft handling as a built-in one,
  which records each failure on the test (`@vitest/expect`, lines
  1139-1175).
- jest-dom 7.0.1 registers its matchers this way. Its `vitest.js` calls
  `expect.extend(extensions)`, and its `types/vitest.d.ts` augments the
  `vitest` module.
- Storybook builds the same combination outside vitest. Its documentation
  states that its `expect` "combines the methods available in Vitest's
  `expect` as well as those from `@testing-library/jest-dom`", and
  Storybook 10.6.1 depends on `@vitest/expect` and `@vitest/spy` 3.2.4.
- Our prototype registered `isNotNil`, `hasPrefix` and the standard's
  `equal` under a free name from a setup file. They worked on the global
  `expect` with `globals: true`, and on `context.expect` in a concurrent
  test. `expect.soft` reported each failure as a separate error. The
  matchers counted toward `expect.assertions`. A call returned an
  assertion object, so a chain of matchers ran.
- Vitest's reporter showed each failure with a code frame at the test's
  own line. For the standard's `equal`, which returns `actual` and
  `expected`, it printed vitest's Expected and Received diff.
- A custom reporter's `onTestCaseResult` received the standard's failure
  record, with the assertion's id, the contract and the detail fields, in
  the error's `__vitest_error_context__.meta`. Vitest's `SerializedError`
  type allows such fields with an index signature
  (`@vitest/utils/dist/types.d.ts:19-32` at 4.1.11).
- `.not` on a check that passed produced an error with an empty message.
  The standard states its own negatives, and the prototype's matchers gave
  `.not` no meaning.
- The record's `where` field pointed into `node_modules/chai/index.js`.
  This library's `callSite` skips frames under `/dist/`, `/src/` and
  `node:` only (`src/failure.ts:100-115`).

### Seven names collide, and taking one changes chai for the whole worker

Vitest's `expect` chain defines 7 of the 35 names on this library's
`check`: `closeTo`, `contains`, `equal`, `length`, `matches`, `rejects` and
`throws`. We read the chain's members from the running engine, 181 at
4.1.11 and 184 at 5.0.3. On one input chosen to tell the two apart, the
verdicts were these:

| Name and input | Vitest's `expect` | The standard |
|---|---|---|
| `equal`, `[1]` against `[1]` | fail | pass |
| `contains`, `[{a: 1}]` contains `{a: 1}` | fail | pass |
| `length`, `{a: 1, b: 2}` has 2 | fail | pass |
| `matches`, `"abc"` against the pattern `"a.c"` | TypeError | pass |
| `throws`, with `"the parser refuses"` as its argument | fail | pass |
| `closeTo`, 1.5 within 0.5 of 1 | pass | pass |
| `closeTo`, NaN within 1 of 1 | fail | fail |

- Chai reads the string passed to `throws` as text the error's message
  must contain. The standard reads it as the contract.
- Registering a matcher named `equal` replaced chai's `to.equal` for every
  later test in the worker. `expect([1]).to.equal([1])` failed before the
  registration and passed after it.
- Registering a matcher named `rejects` threw
  `TypeError: Cannot set property rejects of #<_Assertion> which has only a getter`.

We conclude that registering any of the five differing names would change
the verdicts of existing tests, and that `rejects` cannot be registered.

### Matcher types differ between the two versions

- Vitest 4.1.11 declares `interface Matchers<T = any>` and
  `interface Assertion<T = any>` (`@vitest/expect/dist/index.d.ts`, lines
  181 and 635). Its documentation augments `Matchers<T = any>`
  (`docs/guide/extending-matchers.md`, lines 28-42, at v4.1.11).
- Vitest 5.0.3 declares `Matchers<R extends void | Promise<void>, T>` and
  `Assertion<R, T>` (`vitest/dist/chunks/config.d.BxjInJat.d.ts`, lines
  1238-1241 and 1700-1703). Its migration guide states that custom matchers
  augment `Matchers<R, T>` and that vitest no longer reads the global
  `jest.Matchers` (lines 320-334). vite-plus's upgrade checklist names the
  same change (`docs/guide/vitest-v5.md:201`).
- A 4.1-shaped declaration in a `.d.ts` file, with `skipLibCheck: true`,
  kept the matcher typed on both versions. It accepted a `want` of the
  received value's type and rejected a string and an object with a field
  of the wrong type.
- With `skipLibCheck: false`, the same declaration failed on 5.0.3 with
  TS2428, "All declarations of 'Matchers' must have identical type
  parameters". jest-dom 7.0.1 failed the same way on 5.0.3 with three
  TS2428 errors, and passed on 4.1.11. In a `.ts` file, which tsc always
  checks, the 4.1 shape failed on 5.0.3 as well.
- A 5.0-shaped declaration worked on 5.0.3 only.

The sources disagree on one point. jest-dom issue #738, opened on
2026-09-06 against vitest 5.0.0, reports 1,203 errors of the form
`Property 'toBeInTheDocument' does not exist on type 'Assertion<void, HTMLElement>'`
with `skipLibCheck: true`. We ran the issue's reproduction as written,
with npm and vitest 5.0.0, and npm installed TypeScript 7.0.2. We ran it
again with vitest 5.0.3, and with pnpm 12.8.1 and vitest 5.0.0. Each time
tsc exited 0, with the matchers typed. The condition behind the report is
not stated in the issue. jest-dom PR #742,
open since 2026-09-23, adds support for vitest 5.

### Replacing vitest's `expect` costs what vitest counts and offers

- Vitest 4.1.11 has 59 jest-style matchers, 25 of which need vitest's
  spies and 5 its snapshot engine. Vitest 5.0.3 has 62.
- Vitest checks `expect.assertions` and `requireAssertions` against a
  test's `context.expect` once anything has read that property, and
  against the global `expect` otherwise
  (`vitest/dist/chunks/test.DNmyFkvJ.js:4362-4380` at 4.1.11,
  `index.C4tKZ0yW.js:8516-8521` at 5.0.3).
- A test that called `expect.assertions(1)` and asserted nothing failed
  normally. With a hook that read `context.expect`, the same test passed.
- Extending the test context from a `beforeEach` in a setup file is
  deprecated. Vitest's documentation at v3.2.4 states that "it will not
  work when the `test` is extended with `test.extend`"
  (`docs/guide/test-context.md`, lines 460-464), and commit `e3138bd1d`
  removed the section on 2025-09-19. In our measurement, such a setup file
  made a test built with `test.extend` fail with `FixtureParseError`.
- An `aroundEach` hook that runs each test inside an `AsyncLocalStorage`
  context gave every test its own seat. Vitest documents `aroundEach` for
  this purpose (`docs/api/hooks.md`, lines 180-182, at v4.1.11). In a run
  of three concurrent tests, the two that failed each reported only their
  own failure, and the third passed. Registered when a
  module was imported, the hook was missing for one of two files under
  `isolate: false`. Registered from `setupFiles`, it ran for both.

### Vitest's equality and the standard's disagree on half of the cases we tried

- We compared `toEqual`, `toStrictEqual` and the standard's `equal` on 28
  pairs of values. `toEqual` disagreed with the standard on 14 pairs and
  `toStrictEqual` on 16.
- Ten of the 14 come from rules. Vitest's `toEqual` ignores keys whose
  value is `undefined`, equates NaN with NaN and two invalid dates, tells
  `-0` from `0`, matches Map keys by structure, and compares an Error's
  `cause`, its own fields, symbol keys and extra fields on an array.
- The other four come from this library. Its `equal` passes two different
  `URL`, `Headers`, `URLSearchParams` or `Temporal.PlainDate` values,
  because `equalObjects` compares own enumerable keys only
  (`src/matcher/compare.ts:164-172`) and these values have none.
  `@vitest/expect` compares a URL by `href` and a Temporal value by
  `equals` (`dist/index.js`, lines 278-280 and 314-321, at 4.1.11).
- Five of seven matcher pairs disagreed: `toBeCloseTo` against `closeTo`,
  `toMatch` against `matches`, `toBeNull` against `isNil`, and `toContain`
  against `contains` for an object element and for an object key.
- A setup file can measure the same disagreement on an unchanged suite.
  Wrapping `toEqual` and `toStrictEqual` with chai's
  `utils.overwriteMethod` left a six-test suite's results as they were and
  logged the three disagreements we planted.

### Vitest does not cover the standard's unawaited assertions or fake timers

- Vitest 5.0 fails a test that leaves `resolves`, `rejects` or
  `toMatchFileSnapshot` unawaited (migration guide, lines 349-362), and an
  unawaited `expect.poll` (`index.C4tKZ0yW.js:1884-1920` and 7630-7637).
  Vitest 4.1.11 printed a warning instead (`@vitest/expect/dist/index.js`,
  lines 1113-1118). Both versions detect the miss the way this library's
  guard does, by recording whether anything called `then`.
- A custom asynchronous matcher is outside that tracking. A test that left
  a failing one unawaited passed, and its failure appeared as an unhandled
  rejection attributed to a later test.
- The standard's retrying assertions sleep through `setTimeout`. Under
  `vi.useFakeTimers()`, `eventuallyTrue` waited until the test's timeout.

We conclude that this library keeps its own forgotten-await guard for
asynchronous matchers. The guard can use `onTestFinished`, which vitest
exports. The retrying assertions need a clock that advances vitest's fake
timers, or a documented limit.

### Other projects that claim compatibility own the runner or the whole `expect`

- Bun's documentation offers "a Jest-like API" and states that "Long term,
  Bun aims for complete Jest compatibility", with a table of implemented
  matchers. Its migration guide states that "Bun internally rewrites
  imports from `@jest/globals` to their `bun:test` equivalents", so that
  "In many cases, Bun's test runner can run Jest test suites with no code
  changes."
- Deno's `@std/expect` 1.0.20 describes itself as "Jest compatible `expect`
  assertion functions". Its page lists `toThrowErrorMatchingSnapshot` and
  `toThrowErrorMatchingInlineSnapshot` as unsupported.
- earl 2.0.0 provides its own `expect` with its own equality. Its
  documentation states that it "should be used with a test runner like
  mocha, uvu or node:test", runners that have no `expect` of their own.

We did not find a project that registers matchers under names vitest's
`expect` already defines. The searches are listed at the end.

## What we could not establish

- **The condition behind jest-dom issue #738.** Settling it needs the
  reporter's project configuration, or a reproduction that loses the types.
- **Browser mode.** We ran nothing in vitest's browser mode. This
  library's root entry imports `node:fs` through its golden-file module.
- **Resolution without a declared peer in Yarn PnP and pnpm workspaces.**
  We measured a single-project pnpm install only.
- **Whether vitest would accept a generic way to name the source of `vi`.**
  Our issue searches, listed at the end, returned none that requests it.
  PR #10489's author offered one, and the maintainers did not take it up.
- **Whether `closeTo` agrees everywhere.** It agreed on both inputs we
  tried. Settling it needs the standard's corpus cases for `close-to` run
  against chai's `closeTo`.
- **How often existing suites call the seven colliding names with a
  message argument.** No corpus of vitest suites was measured.
- **Golden files through `toMatchFileSnapshot`.** Vitest's snapshot update
  mode is a private field (`@vitest/snapshot`, `private _updateSnapshot`),
  and the standard scrubs both sides of the comparison where a file
  snapshot compares the file's raw text. We built nothing to compare them.
- **A clock that advances fake timers.** Vitest exports `vi.isFakeTimers`
  and `vi.advanceTimersByTime`, and we built nothing with them.

## What would change this answer

- A vitest option, or a generic rule in the hoister, that accepts another
  module as the source of `vi`. A replacement for the `vitest` module would
  then lose its main defect.
- A vitest release that changes the type parameters of `Matchers` or
  `Assertion` again. The matcher declarations would have to change with
  it.
- A reproduction of jest-dom issue #738 under a common configuration. The
  single declaration that served both versions here would then fail for
  some consumers.
- Vitest tracking unawaited custom asynchronous matchers. This library's
  guard could then defer to vitest's.
- A naming-table change that gives TypeScript different names for the
  seven colliding assertions. Every one of them except `rejects` could
  then be registered on `expect`.

## Sources

| # | Source | What it is | Retrieved | What it supports |
|---|---|---|---|---|
| 1 | vitest 4.1.11 as published on npm: `package.json`, `dist/index.js`, `dist/index.d.ts`, `dist/chunks/cli-api.CnMVyzaz.js`, `dist/chunks/test.DNmyFkvJ.js`, and `@vitest/expect`, `@vitest/mocker`, `@vitest/runner`, `@vitest/snapshot` and `@vitest/utils` 4.1.11 | Source code | 2026-10-01 | Subpaths, exports, the hoister and its list, the resolver, the static collector, `context.expect` and assertion counting, `expect.extend`, soft handling, async tracking, matcher types, fixture cleanup, the private snapshot state |
| 2 | vitest 5.0.3 as published on npm: `package.json`, `dist/index.js`, `dist/index.d.ts`, `dist/chunks/index.DpLw24bj.js`, `index.C4tKZ0yW.js`, `run.BTlFXlnv.js`, `config.d.BxjInJat.d.ts`, and `@vitest/mocker` 5.0.3 | Source code | 2026-10-01 | The same points at 5.0.3, the bundled assertion code and the failing unawaited assertions |
| 3 | npm registry, `npm view vitest dist-tags time` | Registry metadata | 2026-10-01 | `latest` is 5.0.3, published 2026-09-30; 4.1.11 published 2026-08-18 |
| 4 | Vitest, "Migrating to Vitest 5.0", `docs/guide/migration/index.md` at v5.0.3 | Maintainers' documentation | 2026-10-01 | Removed entry points, the benchmark rewrite, top-level hoisting, `Matchers<R, T>`, failing unawaited assertions, the bundled `@vitest/expect` |
| 5 | Vitest, `docs/api/vi.md` at v4.1.11 and v5.0.3, line 45 | Maintainers' documentation | 2026-10-01 | `vi` must be imported from `vitest` for hoisting |
| 6 | Vitest, `docs/api/hooks.md` at v4.1.11, lines 145-182 | Maintainers' documentation | 2026-10-01 | `aroundEach` for `AsyncLocalStorage` |
| 7 | Vitest, `docs/guide/extending-matchers.md` at v4.1.11 and on `main` | Maintainers' documentation | 2026-10-01 | `Matchers<T = any>` and `Matchers<R, T>` |
| 8 | Vitest, `docs/guide/test-context.md` at v3.2.4, lines 460-509, and commit `e3138bd1d` | Maintainers' documentation and history | 2026-10-01 | The deprecated `beforeEach` context extension and its removal |
| 9 | Vitest PR #10489, <https://github.com/vitest-dev/vitest/pull/10489>, merged 2026-06-01, with its review comments; PR #10548, merged 2026-06-09 | Maintainer discussion | 2026-10-01 | The hardcoded `vite-plus/test` entry, why the option was dropped, the backport |
| 10 | Vitest PR #11141, <https://github.com/vitest-dev/vitest/pull/11141>, merged 2026-09-04 | Maintainer change | 2026-10-01 | An accidental `@vitest/expect` import removed from public declarations after 5.0.0 |
| 11 | vite-plus 1.0.0 as installed: `dist/test/*.js`, `dist/test/*.d.ts`, `docs/guide/test.md`, `docs/guide/migrate.md`, `docs/guide/vitest-v5.md` | Source code and maintainers' documentation | 2026-10-01 | `export * from 'vitest'`, the subpaths, augmentations targeting `vitest`, the matcher-type checklist item |
| 12 | `@testing-library/jest-dom` 7.0.1 from npm: `vitest.js`, `types/vitest.d.ts`, `package.json` | Source code | 2026-10-01 | Registration with `expect.extend`, the `Assertion<T = any>` augmentation, the optional peer |
| 13 | jest-dom issue #738, <https://github.com/testing-library/jest-dom/issues/738>, and PR #742, <https://github.com/testing-library/jest-dom/pull/742> | User report and open fix | 2026-10-01 | Lost matcher types on vitest 5.0.0; the hidden TS2428; the fix in progress |
| 14 | Storybook, "Interaction tests", <https://storybook.js.org/docs/writing-tests/interaction-testing>; `npm view storybook dependencies` for 10.6.1 | Maintainers' documentation and registry metadata | 2026-10-01 | An `expect` that combines vitest's and jest-dom's matchers; pinned `@vitest/expect` and `@vitest/spy` 3.2.4 |
| 15 | earl 2.0.0 from npm, `README.md` and `src/isEqual`; earl, "Getting started", <https://earl.fun/introduction/getting-started.html> | Source code and maintainers' documentation | 2026-10-01 | Its own `expect` and equality, for runners without one |
| 16 | Deno, `@std/expect` 1.0.20, <https://jsr.io/@std/expect> | Maintainers' documentation | 2026-10-01 | A Jest-compatible `expect`; two unsupported matchers |
| 17 | Bun, "Writing tests", <https://bun.com/docs/test/writing-tests>, and "Migrate from Jest", <https://bun.com/docs/guides/test/migrate-from-jest> | Maintainers' documentation | 2026-10-01 | The compatibility claim, the matcher table, the import rewrite |
| 18 | Our façade and fixture prototypes, run with each version's own `vitest` binary and checked with tsc 7.0.2, including a planted type error | Own measurement | 2026-10-01 | The re-export, the failing `vi.mock`, the typed hooks' emit, the double report and the `onTestFinished` fix |
| 19 | Our `expect.extend` prototype with a setup file, `globals: true`, a concurrent test, the JSON reporter, the default reporter and a custom reporter | Own measurement | 2026-10-01 | Soft errors, counting, chaining, diffs, code frames, the record in `meta`, the empty `.not` message, `where` in chai |
| 20 | Our collision probe: the 35 names against the chain's members read from the running engine, one discriminating input per name, and registrations of `equal` and `rejects` | Own measurement | 2026-10-01 | The seven names, their verdicts, the replaced `to.equal`, the getter error |
| 21 | Our type probes: 4.1- and 5.0-shaped declarations in `.ts` and `.d.ts` files, with `skipLibCheck` on and off, and jest-dom 7.0.1 against both versions | Own measurement | 2026-10-01 | Which declaration shape type-checks where |
| 22 | Our reproduction of jest-dom issue #738: its script as written, with npm, vitest 5.0.0 and TypeScript 7.0.2; the same with vitest 5.0.3; and with pnpm 12.8.1 and vitest 5.0.0 | Own measurement | 2026-10-01 | tsc exited 0 each time; the lost types did not reproduce |
| 23 | Our context probes: a `beforeEach` setup file with `test.extend`, an `aroundEach` hook with `AsyncLocalStorage` and three concurrent tests, `isolate: false` with two files, and `expect.assertions(1)` with and without a hook that reads `context.expect` | Own measurement | 2026-10-01 | `FixtureParseError`, separate seats, the lost hook, the disabled count |
| 24 | Our differential of `toEqual`, `toStrictEqual` and seven matcher pairs against this library on 35 cases, and the shadow setup file on a six-test suite | Own measurement | 2026-10-01 | 14 and 16 of 28, 5 of 7, the four `URL` and `Temporal` rows, the unchanged results |
| 25 | Our probes of an unawaited failing async matcher and of `eventuallyTrue` under `vi.useFakeTimers()` | Own measurement | 2026-10-01 | The passing test with an unhandled rejection; the timeout |
| 26 | Our installs of a packed build of this library into single-project pnpm 12.8.1 projects with vitest 5.0.3, hoisting on and off | Own measurement | 2026-10-01 | The undeclared peer still resolved |

## What we searched

| Search | Tool | Date | Useful |
|---|---|---|---|
| Literal `"vitest"` comparisons in vitest 4.1.11's and 5.0.3's `dist` and `@vitest/*` | Source scan | 2026-10-01 | Yes; the hoister, the resolvers, the CLI parser, coverage's in-source test check |
| `vite-plus` | GitHub pull request search, vitest-dev/vitest | 2026-10-01 | Yes; PR #10489 and its backport |
| `REDISTRIBUTED_HOISTED_MODULES` | GitHub code search, vitest-dev/vitest | 2026-10-01 | Yes; `packages/mocker/src/node/hoistMocks.ts` |
| `vi.mock re-export hoist`, `problems in resolving the mocks API` | GitHub issue search, vitest-dev/vitest | 2026-10-01 | One closed issue, #6829, about in-source tests |
| `wrapper package re-export vitest`, `vi.mock not hoisted when imported from another module`, `replace expect vitest custom assertion library`, `hoistedModule option`, `re-export vi`, `hoist mock wrapper`, `expect.extend override builtin` | GitHub issue search, vitest-dev/vitest | 2026-10-01 | No results |
| `custom expect` | GitHub issue search, vitest-dev/vitest | 2026-10-01 | No; two unrelated issues |
| `vitest 5`, `Assertion type parameters` | GitHub issue search, testing-library/jest-dom | 2026-10-01 | Yes; issue #738 |
| `Matchers<R` | GitHub pull request search, testing-library/jest-dom | 2026-10-01 | Yes; PR #742 |
| Commits between v5.0.0 and v5.0.3 touching types or matchers | GitHub compare API, vitest-dev/vitest | 2026-10-01 | Yes; PR #11141 |
| `npm package that re-exports vitest under its own module name … vi.mock hoisting` | Web search | 2026-10-01 | Yes; vitest's `vi` docs and PR #10489; no other redistribution |
| `assertion library that adds its own matchers to Vitest expect with expect.extend while keeping different equality semantics` | Web search | 2026-10-01 | No such library; vitest's matcher guide, PR #7656, `expect.addEqualityTesters` |
| `@testing-library/jest-dom`, `jest-extended`, `earl`, `storybook`, `@storybook/test`, `vitest` | npm registry | 2026-10-01 | Yes; versions, peers, dependencies |
| Vitest's `docs/guide` and `docs/api` at v3.2.4, v4.0.0, v4.1.11, v5.0.3 and `main` | GitHub contents API | 2026-10-01 | Yes; sources 4 to 8 |
| Storybook, earl, Deno `@std/expect` and Bun documentation pages | Web fetch | 2026-10-01 | Yes; sources 14 to 17 |
