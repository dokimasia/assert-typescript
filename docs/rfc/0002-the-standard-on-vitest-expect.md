---
rfc: 0002
title: The standard's assertions on vitest's expect
author: Roy Klopper <roy.klopper@stealthscale.io>
status: Draft
created: 2026-10-01
updated: 2026-10-01
discussion: none
depends-on: assert-spec RFC-0013
supersedes: none
superseded-by: none
produces-adr: none
---

# RFC-0002: The standard's assertions on vitest's expect

## Summary

`@dokimi/assert/vitest` gains one function, `register`, which adds the
standard's assertions to vitest's own `expect` with `expect.extend`. A
suite calls it from a setup file and leaves its test files as they are.
A test can then write `expect(reply.status).isEqualTo(200, "the request succeeds")`
beside `toEqual`. `register` also takes a mode for
the vitest matchers that check what a standard assertion checks. Shadow
mode logs each `toEqual` and `toStrictEqual` call whose verdict the
standard would change. Strict mode makes those matchers fail with the
name of the standard's assertion to use. The matchers' types come in two
declaration files, one for vitest 5 and one for vitest 4.1.

## Motivation

### The standard is not on expect

A vitest test asserts with `expect`. To use the standard, a test takes a
seat from this library's `test` fixture and calls
`check.equal(seat, got, want, msg)`. Adopting the standard changes the
signature of every test and the style of every assertion. A file that
keeps one `expect` call mixes two styles.

### Vitest's extension point gives the standard vitest's handling

`expect.extend` registers a matcher on vitest's `expect`, and jest-dom
7.0.1 registers its 49 matchers through it. Vitest wraps a registered
matcher in the same soft-handling wrapper as its own matchers. We
registered matchers that run this library's checks, and measured them on
vitest 4.1.11 and 5.0.3:

- `expect.soft` recorded each failure as a separate error, and the test
  continued.
- The matchers counted toward `expect.assertions`. They worked on a
  concurrent test's `context.expect` and under `globals: true`.
- `await expect(promise).resolves` applied a matcher to the resolved
  value.
- The reporter printed the standard's message, an Expected and Received
  diff, and a code frame at the test's line.
- A custom reporter received the standard's failure record through the
  matcher's `meta`.

### The library's part

This design needs, for each assertion, a TypeScript name that vitest's
`expect` does not define. Under the names it uses, `equal` is
`isEqualTo`, `not-equal` is `isNotEqualTo`, `contains` is `doesContain`,
`not-contains` is `doesNotContain`, `length` is `hasLength`, `matches`
is `doesMatch`, `close-to` is `isCloseTo`, `throws` is `doesThrow` and
`rejects` is `doesReject`. The names come from the definition. Binding
them to a runner is this library's job, as the seat fixture already
binds a seat to vitest's `test`.

This library calls its surfaces `check` and `soft` so that no object of
its own shadows the `expect` that every runner defines. This design
keeps that property. It defines no `expect`, and adds methods to the
runner's.

## Detailed design

### Components

| Component | File | Responsibility |
|---|---|---|
| `register` | `src/vitest/api.ts` | Registers the matchers and applies the chosen mode |
| Matcher table | `src/vitest/matchers.ts` | One matcher per assertion, which runs the `check` function against a `Recorder` and returns the verdict |
| Await guard | `src/vitest/guard.ts` | Fails a test that ends with an asynchronous matcher it did not await |
| Shadow mode | `src/vitest/shadow.ts` | Wraps `toEqual` and `toStrictEqual`, and logs each verdict the standard would change |
| Strict mode | `src/vitest/strict.ts` | Replaces each overlapping vitest matcher with one that fails and names the standard's assertion |
| Declarations | `src/vitest/types5.ts`, `src/vitest/types4.ts` | The matchers' types in the vitest 5.0 shape and in the vitest 4.1 shape |
| Entry points | `src/vitest.ts`, `src/vitest4.ts` | The same runtime, each importing one of the two declarations |
| Type generator | `tools/vitest-types.ts` | Writes `types4.ts` from `types5.ts` |
| Call site | `callSite` in `src/failure.ts` | Finds the test's line for a failure's `where` and for the shadow log |
| Name gate | `tests/vitest-names.test.ts` | Fails when a TypeScript assertion name is a member of vitest's `expect` |

The seat fixture moves from `src/vitest.ts` into `src/vitest/api.ts`
unchanged, and both entry points export it.

### register

```ts
/**
 * What `register` does to the vitest matchers that check what a
 * standard assertion checks.
 *
 * - `allow` leaves them as vitest defines them.
 * - `shadow` leaves every verdict as vitest gives it, and appends one
 *   JSON line to `log` for each `toEqual` or `toStrictEqual` call whose
 *   verdict the standard's equality would change.
 * - `strict` makes each of them fail, with a message that gives the
 *   standard's assertion to use.
 */
export type Overlap =
  | { readonly mode: "allow" }
  | { readonly mode: "shadow"; readonly log: string }
  | { readonly mode: "strict" };

/**
 * Add the standard's assertions to vitest's `expect`.
 *
 * Call it from a file that `setupFiles` names. Vitest runs a setup file
 * before each test file, so one worker can run `register` many times. A
 * repeated call with the same mode registers the same matchers again
 * and changes nothing else.
 *
 * @param overlap - What happens to vitest's overlapping matchers.
 *   `{ mode: "allow" }` when omitted.
 * @throws Error when a chai plugin already defines one of the
 *   assertion names. The message gives the property's name.
 * @throws Error when an earlier call in this worker chose another mode.
 * @throws Error when shadow mode cannot append to `log`.
 */
export function register(overlap?: Overlap): void;
```

A suite registers from its setup file, and its tests keep vitest's
imports:

```ts
// vitest.setup.ts
import { register } from "@dokimi/assert/vitest";

register();
```

```ts
// reply.test.ts
import { describe, expect, it } from "vitest";

describe("reply", () => {
  it("succeeds", async () => {
    const reply = await client.fetch(url);

    expect(reply.status).isEqualTo(200, "the request succeeds");
    expect.soft(reply.items).hasLength(3, "every item comes back");
    await expect(() => worker.drain()).completesWithin(50, "the worker drains in time");
  });
});
```

`register` records the mode it applied in a symbol-keyed property of
chai's `Assertion.prototype`. The record exists exactly as long as the
methods that `register` changed, whether vitest keeps that prototype
across test files or not.

### The matchers

`register` adds 35 matchers. They are the 34 assertions of the
definition's root namespace that this library implements, and
`rejectsWith`. The overlay declines `max-allocs`, so it is absent here
as it is on `check`. The value an assertion is about becomes the
argument to `expect`, and the other arguments follow in the order of the
function form. These assertions take another value as their subject:

| Function form | On `expect` |
|---|---|
| `completesWithin(seat, within, fn, msg)` | `await expect(fn).completesWithin(within, msg)` |
| `eventually(seat, timeout, interval, body, msg)` | `await expect(body).eventually(timeout, interval, msg)` |
| `eventuallyTrue(seat, timeout, predicate, msg)` | `await expect(predicate).eventuallyTrue(timeout, msg)` |
| `isPure(seat, observe, fn, msg)` | `await expect(fn).isPure(observe, msg)` |
| `noTaskLeaks(seat, msg)`, which returns the callable that ends the scope | `await expect(scope).noTaskLeaks(msg)`, where `scope` runs the work |
| `doesReject(seat, msg, body)` | `expect(body).doesReject(msg)` |

A matcher builds a `Recorder`, runs the `check` function against it, and
returns what vitest reads:

```ts
/** What a matcher returns to vitest. */
interface Outcome {
  /** Whether the assertion passed. */
  pass: boolean;
  /** The failure as the function form renders it. */
  message: () => string;
  /** The observed value, set when the failure has both `got` and `want`. */
  actual?: unknown;
  /** The required value, set when the failure has both `got` and `want`. */
  expected?: unknown;
  /** The standard's failure record, which a reporter reads. */
  meta: { readonly failure?: Failure };
}
```

The message is the sentence the function form throws, so a failure
reads the same on `check` and on `expect`. A matcher returns nothing
else. `errorAs`, `doesThrow`, `doesReject` and `rejectsWith` return a
value only in the function form, so a test that needs the value calls
the function form.

A failure's `where` comes from `callSite`. Today `callSite` skips every
stack frame whose path contains `/dist/` or `/src/`, and returns the
first frame left. Under a matcher, that frame is inside chai, whose
`index.js` is in neither directory. We measured `where` under a registered matcher as
chai's `index.js`, line 1700 on 4.1.11 and line 1737 on 5.0.3, with the
path written as `///var/…` because the pattern drops the `file:` scheme.
The rule also skips a test file whose path contains `/src/`. `callSite`
changes to return the first frame outside `node_modules`, Node's
internals and this library's own directory, and to convert a `file://`
URL to a path. `where` then names the test's line in both call styles.

The declaration in the vitest 5.0 shape:

```ts
// src/vitest/types5.ts
import type { ErrorClass } from "../matcher/errors.js";
import type { Option } from "../matcher/option.js";

/** The element type of an array subject, which `pairwise` compares. */
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;

// Under `resolves`, vitest 4.1 keeps the promise as T and vitest 5.0
// unwraps it, so `want` accepts T or what T resolves to.
declare module "vitest" {
  interface Matchers<R, T> {
    isEqualTo: (want: T | Awaited<T>, msg: string, ...options: Option[]) => R;
    isNotEqualTo: (want: T | Awaited<T>, msg: string, ...options: Option[]) => R;
    isTrue: (msg: string) => R;
    isFalse: (msg: string) => R;
    isNil: (msg: string) => R;
    isNotNil: (msg: string) => R;
    hasLength: (want: number, msg: string) => R;
    isEmpty: (msg: string) => R;
    isNotEmpty: (msg: string) => R;
    doesContain: (needle: unknown, msg: string, ...options: Option[]) => R;
    doesNotContain: (needle: unknown, msg: string, ...options: Option[]) => R;
    containsInOrder: (needles: readonly string[], msg: string) => R;
    hasPrefix: (prefix: string, msg: string) => R;
    hasSuffix: (suffix: string, msg: string) => R;
    doesMatch: (pattern: string, msg: string) => R;
    isCloseTo: (want: number, tolerance: number, msg: string) => R;
    inRange: (low: number, high: number, msg: string) => R;
    pairwise: (
      predicate: (earlier: ElementOf<Awaited<T>>, later: ElementOf<Awaited<T>>) => boolean,
      msg: string,
    ) => R;
    noError: (msg: string) => R;
    hasError: (msg: string) => R;
    errorIs: (target: unknown, msg: string) => R;
    errorIsNot: (target: unknown, msg: string) => R;
    errorAs: (want: ErrorClass<unknown>, msg: string) => R;
    doesThrow: (msg: string) => R;
    doesNotThrow: (msg: string) => R;
    doesReject: (msg: string) => R;
    rejectsWith: (msg: string) => Promise<void>;
    honoursCancellation: (msg: string) => Promise<void>;
    honoursDeadline: (msg: string) => Promise<void>;
    completesWithin: (within: number, msg: string) => Promise<void>;
    nullHandleSafe: (msg: string) => Promise<void>;
    isPure: (observe: () => unknown, msg: string, ...options: Option[]) => Promise<void>;
    eventually: (timeout: number, interval: number, msg: string) => Promise<void>;
    eventuallyTrue: (timeout: number, msg: string) => Promise<void>;
    noTaskLeaks: (msg: string) => Promise<void>;
  }
}
```

### Negation

A registered matcher called with `.not` fails. Its message gives the
negative assertion to use, or states that the assertion has none:

| Assertion | Use in place of `.not` |
|---|---|
| `isEqualTo` | `isNotEqualTo` |
| `doesContain` | `doesNotContain` |
| `isNil` | `isNotNil` |
| `isEmpty` | `isNotEmpty` |
| `isTrue` | `isFalse` |
| `noError` | `hasError` |
| `errorIs` | `errorIsNot` |
| `doesThrow` | `doesNotThrow` |

Each pair applies in both directions. A matcher returns `pass: true`
when `this.isNot` is set, so vitest's wrapper throws the message. Strict
mode refuses a call the same way, and we measured that on both majors.

### Asynchronous matchers

`rejectsWith`, `honoursCancellation`, `honoursDeadline`,
`completesWithin`, `nullHandleSafe`, `isPure`, `eventually`,
`eventuallyTrue` and `noTaskLeaks` return a promise, and a test awaits
each.

The function form's guard notes when the caller takes a returned
promise. Vitest takes a registered matcher's promise as soon as the
matcher returns, so that guard would see every matcher as taken. The
await guard checks at the end of the test instead:

1. An asynchronous matcher that starts inside a test captures the stack
   and registers an `onTestFinished` hook. The matcher's `this.task` is
   the running test, and is unset outside one.
2. If the matcher has not settled when the hook runs, the hook fails the
   test: "`completesWithin` was never awaited, so it asserted nothing.
   Add `await` to the call." The matcher then returns a passing verdict
   when it settles, so no rejection follows the test.
3. If the matcher failed and the test's result is not a failure, the
   hook fails the test. The failure rejected a promise that the test
   never awaited.
4. The error has the captured stack without this library's frames, so
   the reporter's code frame shows the call in the test.

We measured a prototype of the guard on both majors:

| Test | Result |
|---|---|
| Awaited, passes | Passes |
| Awaited, fails | Fails with the assertion's message |
| Not awaited, still running at the end | Fails as never awaited. No rejection follows the test |
| Not awaited, fails before the end | Fails as failed and not awaited. Vitest also reports an unhandled rejection |
| Not awaited, passes before the end | Passes. The guard does not report it |
| `expect.soft`, awaited, fails twice | Fails with two errors, and the test continues after the first |

### Shadow mode

Shadow mode wraps `toEqual` and `toStrictEqual` with chai's
`overwriteMethod`. The wrapper calls vitest's matcher, then compares the
same values with the standard's equality. It skips a comparison that
contains an asymmetric matcher such as `expect.any(Date)`, because the
standard's equality cannot read one. When the two verdicts differ, it
appends one line to the log:

```json
{"test":"reply > succeeds","file":"tests/reply.test.ts","line":14,"matcher":"toEqual","vitest":"pass","standard":"fail"}
```

`matcher` is `toEqual`, `toStrictEqual`, `not.toEqual` or
`not.toStrictEqual`. `file` and `line` come from `callSite`. Vitest's
verdict, message and code frame do not change. On both majors, a suite
of six tests with three planted disagreements gave five passes and one
expected failure, as it does without shadow mode, and the log contained
exactly the three.

### Strict mode

Strict mode registers a matcher under the name of each overlapping
vitest matcher, through `expect.extend`. Each one fails and gives the
standard's assertion to use:

| Vitest matcher | Use | With `.not` |
|---|---|---|
| `toEqual`, `toStrictEqual` | `isEqualTo` | `isNotEqualTo` |
| `toContain`, `toContainEqual` | `doesContain` | `doesNotContain` |
| `toHaveLength` | `hasLength` | None |
| `toMatch` | `doesMatch` | None |
| `toBeCloseTo` | `isCloseTo` | None |
| `toThrow`, `toThrowError` | `doesThrow` | `doesNotThrow` |

A vitest matcher overlaps when a standard assertion checks the same
property of the same arguments. `toBe`, `toMatchObject`, the snapshot
matchers and the spy matchers have no counterpart, and strict mode
leaves them alone. The refusals are registered matchers, so
`expect.soft` records them and the reporter's code frame shows the
test's line. We measured that on both majors. `resolves.toEqual` was
refused as well, and `toBe` and `toMatchObject` kept their verdicts.

### Types for each vitest major

Vitest 4.1 declares `interface Matchers<T = any>`. Vitest 5.0 declares
`interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>`.
TypeScript merges two declarations of an interface only when their type
parameters agree, and no one declaration of `Matchers` agrees with both.
We compiled each declaration with `skipLibCheck` off on TypeScript 7.0.2:

| Declaration | Vitest 4.1.11 | Vitest 5.0.3 |
|---|---|---|
| `Matchers<T = any>` | Compiles | TS2428 in vitest's declarations and in ours |
| `Matchers<R, T>` | TS2428, TS2314 and TS2339 | Compiles |

The library publishes both declarations, with an entry point for each:

```json
{
  "exports": {
    "./vitest": { "types": "./dist/vitest.d.ts", "import": "./dist/vitest.js" },
    "./vitest4": { "types": "./dist/vitest4.d.ts", "import": "./dist/vitest4.js" }
  },
  "peerDependencies": { "vitest": "^4.1.11 || ^5.0.3" },
  "peerDependenciesMeta": { "vitest": { "optional": true } }
}
```

`src/vitest.ts` imports `types5.ts`, and `src/vitest4.ts` imports
`types4.ts`. Both export everything from `src/vitest/api.ts`, which
imports neither. A project on vitest 4 imports from
`@dokimi/assert/vitest4` wherever the documentation names
`@dokimi/assert/vitest`. The peer dependency is optional, because the
root entry point never imports vitest.

`tools/vitest-types.ts` writes `types4.ts` from `types5.ts`. It replaces
the header `Matchers<R, T>` with `Matchers<T = any>`, and each `=> R`
return with `=> void`. `npm run check` runs it in check mode and fails
when `types4.ts` differs from what it would write.

We compiled the declaration in this document on vitest 5.0.3, and the
form the generator writes from it on 4.1.11, with `skipLibCheck` off. A
probe that calls six of the matchers, under `expect.soft`, `.not` and
`resolves` as well, compiled on both. Both rejected a `want` of the
wrong type.

### The name gate and CI

`tests/vitest-names.test.ts` reads every member of chai's
`Assertion.prototype` chain and every own property of `expect` from the
running vitest. It fails when either list contains a TypeScript name of
an assertion this library implements, or `rejectsWith`. It runs in a
vitest project whose setup does not call `register`, because
`expect.extend` adds each matcher's name to both lists: as a method of
the assertion, and as an asymmetric matcher on `expect`.

The library's vitest configuration splits into four projects:

- The existing tests run with a setup that calls `register()`, so that
  every corpus case also runs against the matchers.
- The name gate runs without a setup file.
- The strict-mode tests run with a setup that registers strict mode.
- The shadow-mode tests run with a setup that registers shadow mode.

The corpus driver gains a third surface, `expect`, beside `check` and
`soft`. `tests/surface.test.ts` compares each matcher's message with
`check`'s for the assertions that the corpus cannot state as data.

For each supported vitest major, 4.1.11 and 5.0.3, CI installs that
vitest and its coverage plugin and runs the tests. It then compiles a
type probe with `skipLibCheck` off: `tests/types/vitest4.ts` against
`@dokimi/assert/vitest4`, or `tests/types/vitest5.ts` against
`@dokimi/assert/vitest`. Each probe calls every matcher once and marks a
`want` of the wrong type with `@ts-expect-error`. The install check also
runs one vitest test in the consumer project, which calls `register`
and one matcher.

### What fails, and where

| Event | Effect | Response |
|---|---|---|
| A vitest release adds a member under a TypeScript assertion name | The name gate fails against that release | The definition renames the assertion in its next major version |
| A chai plugin loaded before `register` defines one of the names as a property | `expect.extend` would throw a `TypeError` for a property with only a getter | `register` checks each name first, and throws an error that names the property |
| A chai plugin loaded after `register` defines one of the names | The plugin's property replaces the matcher for the rest of the worker | None. The name gate covers vitest, not plugins |
| A test leaves an asynchronous matcher unawaited | The test never receives the matcher's verdict | The guard fails the test, except for a matcher that passed before the test ended |
| A test calls a registered matcher with `.not` | The matcher fails | The message gives the negative to use |
| `register` runs again in the same worker with another mode | Shadow and strict mode both change `toEqual` | `register` throws and names both modes |
| Shadow mode cannot append to its log | No disagreement could be recorded | `register` appends an empty string to the log first, and throws with the path when that fails |
| A vitest major declares `Matchers` with other type parameters | Neither declaration compiles on that major | Each new shape is one more generated declaration and entry point |

### Bounds

- `register` adds 35 methods to chai's `Assertion.prototype`, and 35
  asymmetric matchers each to `expect` and `expect.not`. Strict mode
  replaces 9 of vitest's methods.
- A matcher call runs one check against one `Recorder`, the work of the
  function form, inside vitest's wrapper.
- Shadow mode adds one structural comparison to each `toEqual` and
  `toStrictEqual` call. The comparison stops at a depth of 100. On a
  value of 20 records, a `toEqual` call took 14.4 µs without shadow mode
  and 18.0 µs with it on vitest 4.1.11. On 5.0.3 it took 13.7 µs and
  17.8 µs. Each figure is the median of five runs of 10,000 calls.
- The guard adds one captured stack and one `onTestFinished` hook to
  each call of an asynchronous matcher.

### Migration

1. Call `register()` from a setup file, and name that file in
   `setupFiles`. The step touches the configuration and the setup file
   only.
2. Run the suite with `register({ mode: "shadow", log: "dokimi-shadow.jsonl" })`.
   Read each logged call, and decide whether the test meant the
   standard's equality.
3. Move call sites to the standard's names. Then switch to
   `register({ mode: "strict" })`, so that a new call to an overlapping
   matcher fails.

The function form, with the seat fixture, keeps working unchanged.

## Alternatives considered

### A. One declaration in the vitest 4.1 shape

Publish `Matchers<T = any>` alone, as jest-dom 7.0.1 declares its
matchers on vitest 4.1's `Assertion` shape, and rely on `skipLibCheck`.

**Why not:** with `skipLibCheck` off, the declaration fails to compile
on vitest 5.0.3 with TS2428, in vitest's own declarations and in ours.
jest-dom 7.0.1 fails the same way. A project that checks its
dependencies' declarations could not use the library on vitest 5.

### B. One declaration on chai's Assertion

Declare the matchers on the global `Chai.Assertion` interface, which has
no type parameters. Vitest's `Assertion` maps chai's members in both
majors, so one declaration serves both. We compiled it with
`skipLibCheck` off, and it compiled on 4.1.11 and on 5.0.3, with
`expect.soft` and `resolves` typed as well.

**Why not:** chai's interface cannot see the subject's type, so `want`
is `unknown` there. `expect(count).isEqualTo("3", msg)` compiles, while
`check.isEqualTo(seat, count, "3", msg)` does not, because the function
form types `want` as `NoInfer<T>`. The function form and the chain
would then check different things at compile time.

### C. Vitest 5 only

Publish the 5.0 declaration alone.

**Why not:** in the last week of npm's counts, version 4 had 52.5% of
vitest's downloads and version 5 had 15.0%. Vitest 5.0.0 was published
on 2026-09-03.

### D. The standard's equality as vitest's equality tester

Install the standard's `equal` with `expect.addEqualityTesters`, so that
`toEqual` and every matcher built on vitest's equality follow the
standard. We measured it on both majors, with the tester stepping aside
for asymmetric matchers. `toEqual`, `toStrictEqual`, `toContainEqual`
and `toHaveBeenCalledWith` followed the standard.

**Why not:**

- `toMatchObject` failed for every proper subset, because the tester
  compares whole values. `expect({a: 1, b: 2}).toMatchObject({a: 1})`
  failed.
- Verdicts flipped in both directions without a change to any test.
  `{a: undefined, b: 1}` against `{b: 1}` went from pass to fail, and
  `-0` against `0` went from fail to pass.
- `toStrictEqual` stopped checking classes.
- A failure showed vitest's message, without the standard's contract or
  its failure record.

### E. An entry point per mode, imported for its side effects

A setup file would import `@dokimi/assert/vitest/strict`, as a jest-dom
user imports `@testing-library/jest-dom/vitest`.

**Why not:** shadow mode takes an argument, the log path. Modes that
exclude each other would be separate imports, and a project could import
both. Each such entry point would also have to be listed in the
`sideEffects` field, which is `false` today.

## Drawbacks

- The library gains 8 source files, 1 tool, 5 test files, 2 type probes
  with their `tsconfig` files, and 3 more vitest projects. `callSite`
  and the corpus driver change. CI runs once per supported vitest major.
- Every worker's chai `Assertion.prototype` gains 35 methods. A chai
  plugin that defines one of the names breaks registration or replaces a
  matcher.
- A project on vitest 4 imports from a second entry point.
- The guard does not report an unawaited matcher that passes before the
  test ends. It reports an unawaited failing matcher twice: as a failure
  of its test, and as an unhandled rejection that vitest reports.
- Shadow mode made each `toEqual` call 25% to 30% slower on the value
  we measured.
- Strict mode applies to every file that the configuration runs. A
  suite cannot move one file at a time under it.
- The chain returns no values. `errorAs`, `doesThrow`, `doesReject` and
  `rejectsWith` return one only in the function form.

## Open questions

- Should strict mode also refuse `toBeNull`, `toBeUndefined`,
  `toBeDefined`, `toBeTruthy` and `toBeFalsy`? The nearest standard
  assertions, `isNil`, `isNotNil`, `isTrue` and `isFalse`, check a
  different property.
- Should shadow mode also compare `toContainEqual` and
  `toHaveBeenCalledWith`, which use the same equality as `toEqual`?
- Should `rejectsWith`, which the naming table does not list, follow the
  auxiliary rule as `doesRejectWith`?

## Unresolved and future work

- A reporter that summarises the shadow log is not proposed here.
- `expect.poll` with a registered matcher is not measured.
- jest and Bun document `expect.extend`. Registering the matchers there
  is not proposed here.

## References

| What | Where |
|---|---|
| Vitest's guide to `expect.extend` and the `Matchers` interface | <https://vitest.dev/guide/extending-matchers> |
| `expect.extend` wraps each matcher with vitest's soft handling, installs it on chai's `Assertion` prototype, and defines an asymmetric matcher of the same name on `expect` | vitest 4.1.11: `@vitest/expect/dist/index.js`, lines 1146-1175 and 1867-1942; vitest 5.0.3: `dist/chunks/index.C4tKZ0yW.js`, lines 1936 and 2566-2590 |
| A matcher's `this.task` is the running test, and is unset outside one | vitest 4.1.11: `@vitest/expect/dist/index.js`, lines 1833-1851; vitest 5.0.3: `dist/chunks/index.C4tKZ0yW.js`, lines 2518-2547 |
| Vitest's `resolves` wraps each method of the assertion | vitest 4.1.11: `@vitest/expect/dist/index.js`, lines 1709-1745 |
| The `Matchers` and `Assertion` declarations | vitest 4.1.11: `@vitest/expect/dist/index.d.ts`, lines 181 and 635; vitest 5.0.3: `dist/chunks/config.d.BxjInJat.d.ts`, lines 1238-1241 and 1700-1703 |
| jest-dom registers 49 matchers through `expect.extend` | `@testing-library/jest-dom` 7.0.1: `vitest.js` and `dist/matchers.js` |
| Vitest's downloads by version in the last week | <https://api.npmjs.org/versions/vitest/last-week>, fetched 2026-10-01 |
| Vitest 5.0.0's publication date | `npm view vitest time`, run 2026-10-01 |
| Our measurements on vitest 4.1.11 and 5.0.3, Node 26.10.0 and TypeScript 7.0.2, 2026-10-01: registered matchers under `expect.soft`, `expect.assertions`, `context.expect`, `globals: true`, `resolves`, the default reporter and a custom reporter; shadow mode on a suite of six tests and on a failing `toEqual`; strict-mode refusals under `expect.soft`, `.not` and `resolves`; the await guard in six cases; the equality tester against `toMatchObject` and seven other cases; each declaration in this document on both majors with `skipLibCheck` off; the cost of `toEqual` with and without shadow mode | Scratch projects, one per vitest version |
