---
rfc: 0002
title: The standard's assertions on vitest's expect
author: Roy Klopper <roy.klopper@stealthscale.io>
status: Accepted
created: 2026-10-01
updated: 2026-10-20
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
`check.isEqualTo(seat, got, want, msg)`. Adopting the standard changes
the signature of every test and the style of every assertion. A file
that keeps one `expect` call mixes two styles.

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
| `register` and the seat fixture | `src/vitest/api.ts` | Registers the matchers, applies the chosen mode, and supplies the seat fixture |
| Matcher table | `src/expect/matchers.ts` | One matcher per assertion, which runs the function form against a `Recorder` and returns the verdict |
| Pending record | `src/expect/guard.ts` | Records each asynchronous matcher with the test that started it |
| Shadow comparison | `src/expect/shadow.ts` | Compares the values of a call of `toEqual` or `toStrictEqual` with the standard's equality, and appends a log line when the verdicts differ |
| Strict table | `src/expect/strict.ts` | Lists the refused matchers and the standard's assertion to call instead |
| Matcher interface | `src/expect/types.ts` | Declares `StandardMatchers<R, T>`, the matchers of the chain, and the `Overlap` type |
| Declarations | `src/vitest/vitest5.d.ts`, `src/vitest/vitest4.d.ts` | The matchers' types in the vitest 5 shape and in the vitest 4.1 shape, each with the exports of the entry point |
| Entry point | `src/vitest.ts` | Exports `register`, the fixture, the seats and `Overlap` |
| Build | `tools/dist.ts` | Copies the two declaration files into `dist/vitest/` |
| Call site | `callSite` and `stackOf` in `src/failure.ts` | Finds the test's line for a failure's `where` and for the shadow log |

The seat fixture moves from `src/vitest.ts` into `src/vitest/api.ts`
unchanged, and the entry point exports it.

### register

```ts
/**
 * What `register` does to the runner's matchers that check what a
 * standard assertion checks.
 *
 * - `allow` leaves them as the runner defines them.
 * - `shadow` leaves every verdict as the runner gives it. It appends one
 *   JSON line to `log` for each `toEqual` or `toStrictEqual` call whose
 *   verdict the standard's equality would change.
 * - `strict` makes each of them fail, with a message that gives the
 *   standard's assertion to call.
 */
export type Overlap =
  | { readonly mode: "allow" }
  | { readonly mode: "shadow"; readonly log: string }
  | { readonly mode: "strict" };

/**
 * Adds the standard's assertions to vitest's `expect`.
 *
 * Call it from a file that `setupFiles` names. vitest runs a setup file
 * before each test file, so one worker can run `register` many times. A
 * repeated call with the same mode registers the same matchers again and
 * changes nothing else.
 *
 * @param overlap - What happens to vitest's overlapping matchers, and
 *   `{ mode: "allow" }` when omitted.
 * @throws Error when a chai plugin already defines one of the assertion
 *   names. The message contains the name.
 * @throws Error when an earlier call in this worker chose another mode.
 * @throws Error when shadow mode cannot append to its log.
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

`register` adds 49 matchers. They are the 48 assertions of the
definition's root namespace that this library implements, and
`rejectsWith`. The overlay declines `max-allocs`, so it is absent here
as it is on `check`. `rejectsWith` keeps its name. The naming table does
not list a TypeScript name for it, and neither vitest nor jest defines
it.

The value an assertion is about becomes the argument to `expect`, and
the other arguments follow in the order of the function form. These
assertions take another value as their subject:

| Function form | On `expect` |
|---|---|
| `completesWithin(seat, within, fn, msg)` | `await expect(fn).completesWithin(within, msg)` |
| `eventually(seat, timeout, interval, body, msg)` | `await expect(body).eventually(timeout, interval, msg)` |
| `eventuallyTrue(seat, timeout, predicate, msg)` | `await expect(predicate).eventuallyTrue(timeout, msg)` |
| `isPure(seat, observe, fn, msg)` | `await expect(fn).isPure(observe, msg)` |
| `isNotPure(seat, observe, fn, msg)` | `await expect(fn).isNotPure(observe, msg)` |
| `failsAfterClose(seat, close, call, sentinel, msg)` | `await expect(call).failsAfterClose(close, sentinel, msg)` |
| `isPoisoned(seat, induce, observe, msg)` | `await expect(observe).isPoisoned(induce, msg)` |
| `noTaskLeaks(seat, msg)`, which returns the callable that ends the scope | `await expect(scope).noTaskLeaks(msg)`, where `scope` runs the work |
| `doesReject(seat, msg, body)` | `await expect(body).doesReject(msg)` |

The subject of `failsAfterClose` is the call that the closed subject
refuses, and the subject of `isPoisoned` is the reading that fails.
Each then reads as a sentence: `expect(read).failsAfterClose(close, ...)`.

A matcher builds a `Recorder`, runs the function form against it, and
returns what vitest reads:

```ts
/** What a matcher returns to its runner. */
export interface Outcome {
  /** Whether the assertion passed. */
  readonly pass: boolean;
  /** Returns the sentence of the failure, as the function form renders it. */
  readonly message: () => string;
  /** The observed value, for a failure whose record has a got and a want. */
  readonly actual?: unknown;
  /** The required value, for a failure whose record has a got and a want. */
  readonly expected?: unknown;
  /** The failure record, which a reporter reads. */
  readonly meta: { readonly failure?: Failure };
}
```

The message is the sentence the function form throws, so a failure
reads the same on `check` and on `expect`. A matcher returns nothing
else. `errorAs`, `doesThrow`, `doesReject` and `rejectsWith` return a
value only in the function form, so a test that needs the value calls
the function form.

A failure's `where` comes from `callSite`. Under a registered matcher,
the frames between the test and `callSite` are vitest's, chai's and this
library's. They are more than V8's default limit of 10 frames, so a
stack of the default limit has no frame of the test. `callSite` reads a
stack of at least 100 frames through `stackOf`. It returns the first
frame outside `node_modules`, Node's internals and this library's
directories, and converts a `file://` URL to a path. `where` then names
the test's line in both call styles.

`src/expect/types.ts` declares the chain's matchers once:

```ts
// src/expect/types.ts
import type { ErrorClass } from "../matcher/errors.js";
import type { Option } from "../matcher/option.js";
import type { Count } from "../matcher/relation.js";

/** The element type of an array subject. */
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;

/** The type of the first parameter of a function subject. */
type InputOf<T> = T extends (input: infer I, ...rest: never[]) => unknown ? I : never;

/** The type that a function subject returns, or that its promise resolves to. */
type ResultOf<T> = T extends (...args: never[]) => infer R ? Awaited<R> : never;

/**
 * The standard's assertions on a runner's chain. `R` is what a
 * synchronous matcher returns on that chain, and `T` is the type of the
 * value given to `expect`. Under `resolves`, vitest 4 keeps a promise as
 * `T` and vitest 5 and jest unwrap it, so `want` takes `T` or what `T`
 * resolves to.
 */
export interface StandardMatchers<R, T> {
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
  isPermutation: (want: readonly ElementOf<Awaited<T>>[], msg: string, ...options: Option[]) => R;
  doesReject: (msg: string) => Promise<void>;
  rejectsWith: (msg: string) => Promise<void>;
  honoursCancellation: (msg: string) => Promise<void>;
  honoursDeadline: (msg: string) => Promise<void>;
  completesWithin: (within: number, msg: string) => Promise<void>;
  nullHandleSafe: (msg: string) => Promise<void>;
  isPure: (observe: () => unknown, msg: string, ...options: Option[]) => Promise<void>;
  isNotPure: (observe: () => unknown, msg: string, ...options: Option[]) => Promise<void>;
  eventually: (timeout: number, interval: number, msg: string) => Promise<void>;
  eventuallyTrue: (timeout: number, msg: string) => Promise<void>;
  noTaskLeaks: (msg: string) => Promise<void>;
  isIdempotent: (input: InputOf<T>, observe: () => unknown, msg: string, ...options: Option[]) => Promise<void>;
  accumulates: (input: InputOf<T>, observe: () => Count | Promise<Count>, msg: string) => Promise<void>;
  isDeterministic: (input: InputOf<T>, msg: string, ...options: Option[]) => Promise<void>;
  isCommutative: (a: InputOf<T>, b: InputOf<T>, msg: string, ...options: Option[]) => Promise<void>;
  isAssociative: (a: InputOf<T>, b: InputOf<T>, c: InputOf<T>, msg: string, ...options: Option[]) => Promise<void>;
  roundTrip: (inverse: (encoded: ResultOf<T>) => unknown, input: InputOf<T>, msg: string, ...options: Option[]) => Promise<void>;
  hasStableOrder: (msg: string, ...options: Option[]) => Promise<void>;
  noDuplicates: (msg: string, ...options: Option[]) => Promise<void>;
  isMonotonic: (advance: () => unknown, steps: number, msg: string) => Promise<void>;
  isTotal: (domain: Iterable<InputOf<T>>, msg: string) => Promise<void>;
  failsAfterClose: (close: () => unknown, sentinel: unknown, msg: string) => Promise<void>;
  isPoisoned: (induce: () => unknown, msg: string) => Promise<void>;
}
```

### Negation

A registered matcher called with `.not` fails. Its message gives the
negative assertion to use, as in `isEqualTo does not take .not. Call
isNotEqualTo instead.`, or states that the assertion has none:

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
| `isPure` | `isNotPure` |

Each pair applies in both directions. A matcher returns `pass: true`
when `this.isNot` is set, so vitest's wrapper throws the message. Strict
mode refuses a call the same way, and we measured that on both majors.

### Asynchronous matchers

`doesReject`, `rejectsWith`, `honoursCancellation`, `honoursDeadline`,
`completesWithin`, `nullHandleSafe`, `isPure`, `isNotPure`,
`eventually`, `eventuallyTrue` and `noTaskLeaks` return a promise. So do
the relations besides `isPermutation`. A test awaits each.

The function form's guard notes when the caller takes a returned
promise. Vitest takes a registered matcher's promise as soon as the
matcher returns, so that guard would see every matcher as taken. The
await guard checks at the end of the test instead:

1. An asynchronous matcher that starts inside a test captures a stack of
   at least 100 frames. The first one of a test registers one hook with
   the `onTestFinished` of the test's context. The matcher's `this.task`
   is the running test, and is unset outside one.
2. If the matcher has not settled when the hook runs, the hook fails the
   test: "completesWithin was never awaited, so it asserted nothing. Add
   await to the call." The matcher then returns a passing verdict when it
   settles, so no rejection follows the test.
3. If the matcher failed and the test's result is not a failure, the
   hook fails the test: "rejectsWith failed, and the test did not await
   it. Add await to the call." The failure rejected a promise that the
   test never awaited.
4. The error has the captured stack without the frames of this library
   and of `node_modules`, so the reporter's code frame shows the call in
   the test.

A matcher that a finished hook of the test calls does not start a
guard, because vitest refuses a hook there. We measured a prototype of
the guard on both majors:

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
same values with the standard's equality. Under `expect.soft`, vitest's
matcher records a failure as an error of the test and returns, so the
wrapper reads vitest's verdict from the number of the test's errors. It
skips a comparison that contains an asymmetric matcher such as
`expect.any(Date)`, because the standard's equality cannot read one.
When the two verdicts differ, it appends one line to the log:

```json
{"test":"reply > succeeds","file":"tests/reply.test.ts","line":14,"matcher":"toEqual","vitest":"pass","standard":"fail"}
```

`matcher` is `toEqual`, `toStrictEqual`, `not.toEqual` or
`not.toStrictEqual`. `file` and `line` come from `callSite`, and are
`null` for a call that no frame of a caller makes. `test` is the empty
string for a call outside a test. Vitest's verdict, message and code
frame do not change. On both majors, a suite of six tests with three
planted disagreements gave five passes and one expected failure, as it
does without shadow mode, and the log contained exactly the three.

Shadow mode compares `toEqual` and `toStrictEqual` alone.

### Strict mode

Strict mode registers a matcher under the name of each overlapping
vitest matcher, through `expect.extend`. Each one fails and gives the
standard's assertion to use, as in `toEqual is refused in strict mode.
Call isEqualTo instead.`:

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
leaves them alone. Strict mode also leaves `toBeNull`, `toBeUndefined`,
`toBeDefined`, `toBeTruthy` and `toBeFalsy` alone. The nearest standard
assertions check another property: `isNil` accepts `null` and
`undefined` both, and `isTrue` accepts `true` alone. The refusals are
registered matchers, so `expect.soft` records them and the reporter's
code frame shows the test's line. We measured that on both majors.
`resolves.toEqual` was refused as well, and `toBe` and `toMatchObject`
kept their verdicts.

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

The library publishes both declarations as files of the build, and
names each in the `types` condition of an entry point:

```json
{
  "exports": {
    "./vitest": { "types": "./dist/vitest/vitest5.d.ts", "import": "./dist/vitest.js" },
    "./vitest4": { "types": "./dist/vitest/vitest4.d.ts", "import": "./dist/vitest.js" }
  },
  "peerDependencies": { "vitest": "^4.1.11 || ^5.0.3" },
  "peerDependenciesMeta": { "vitest": { "optional": true } }
}
```

Each declaration file re-exports the declarations of `src/vitest.ts` and
extends vitest's `Matchers` with `StandardMatchers`:

```ts
// src/vitest/vitest5.d.ts
import type { StandardMatchers } from "../expect/types.js";

export * from "../vitest.js";

declare module "vitest" {
  interface Matchers<R, T> extends StandardMatchers<R, T> {}
}
```

```ts
// src/vitest/vitest4.d.ts
import type { StandardMatchers } from "../expect/types.js";

export * from "../vitest.js";

declare module "vitest" {
  interface Matchers<T = any> extends StandardMatchers<void, T> {}
}
```

Both entry points load one module, `dist/vitest.js`, so a project that
imports both has one copy of the adapter's state. A program cannot
contain both declaration files. The library's own program contains
`vitest4.d.ts` alone, because its development dependency is vitest 4.
`tools/dist.ts` copies both files into `dist/vitest/`. A project on
vitest 4 imports from `@dokimi/assert/vitest4` wherever the documentation
names `@dokimi/assert/vitest`. The peer dependency is optional, because
the root entry point never imports vitest. The setup file stays in the
program of the project's `tsconfig.json`, so that its import brings the
declarations to every test file.

On 2026-10-20 a consumer project of each major compiled a probe that
calls every matcher once, with `skipLibCheck` off: vitest 4.1.12 against
`@dokimi/assert/vitest4`, and vitest 5.0.5 against `@dokimi/assert/vitest`.
Each probe marks a `want` of the wrong type, a `pairwise` predicate over
the wrong element type, an input of the wrong type and a `want` of the
wrong type on `expect.soft` with `@ts-expect-error`. TypeScript rejected
each of them on both majors.

### The name gate and CI

The spec of `src/vitest/api.ts` reads every member of chai's
`Assertion.prototype` chain and every own property of `expect` and
`expect.not` from the running vitest, before any case of the spec
registers a matcher. It fails when either list contains a TypeScript
name of an assertion that this library implements, or `rejectsWith`.
`expect.extend` adds each matcher's name to both lists: as a method of
the assertion, and as an asymmetric matcher on `expect`.

Each case of the adapter's spec that registers the matchers restores
chai's prototype, `expect`, `expect.not` and vitest's registries when it
ends. One vitest project then runs every spec without a setup file. The
corpus driver gains a third surface, `expect`: the matchers of the
table, each called on the seat of the corpus case. The spec of
`src/expect/matchers.ts` compares each matcher's outcome with the
failure of the function form for the same call. It states each chain
call apart from the table that places the subject, so a subject in the
wrong place fails the comparison.

CI runs the specs on vitest 4, the development dependency, and again on
vitest 5 in the job `runners`. The job `consumer` packs the library and
installs it beside vitest 4 or vitest 5 in an empty project. It compiles
the type probe of `tools/consumer` with `skipLibCheck` off, and runs one
test file whose setup file registers the matchers.

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
| A vitest major declares `Matchers` with other type parameters | Neither declaration compiles on that major | Each new shape is one more declaration file and entry point |

### Bounds

- `register` adds 49 methods to chai's `Assertion.prototype`, and 49
  asymmetric matchers each to `expect` and `expect.not`. Strict mode
  replaces 9 of vitest's methods.
- A matcher call runs one check against one `Recorder`, the work of the
  function form, inside vitest's wrapper. The check reads one stack of at
  least 100 frames for its call site.
- Shadow mode adds one structural comparison to each `toEqual` and
  `toStrictEqual` call. The comparison stops at a depth of 100. On a
  value of 20 records, a `toEqual` call took 14.4 µs without shadow mode
  and 18.0 µs with it on vitest 4.1.11. On 5.0.3 it took 13.7 µs and
  17.8 µs. Each figure is the median of five runs of 10,000 calls.
- The guard adds one captured stack to each call of an asynchronous
  matcher, and one `onTestFinished` hook to each test that starts one.

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

### F. Declarations that the entry points import

`src/vitest.ts` would import a declaration module in the vitest 5 shape.
A second entry point, `src/vitest4.ts`, would import one in the vitest
4.1 shape.

**Why not:** the library's own program would then contain both
declarations. TypeScript merges the declarations of `Matchers` only when
their type parameters agree. The library could not compile its own
source and specs against either major.

## Drawbacks

- The library gains 8 source files: `src/vitest/api.ts`, two declaration
  files and five modules of `src/expect/`. It gains 6 spec files, the
  consumer probes of `tools/consumer` and `tools/dist.ts`. `callSite` and
  the corpus driver change. CI runs the specs once more, on vitest 5.
- Every worker's chai `Assertion.prototype` gains 49 methods. A chai
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

## Unresolved and future work

- Shadow mode does not compare `toContainEqual` and
  `toHaveBeenCalledWith`, which use the same equality as `toEqual`.
- A reporter that summarises the shadow log is not proposed here.
- `expect.poll` with a registered matcher is not measured.
- Registering the matchers on the `expect` of Bun's `bun:test` is not
  proposed here.

## References

| What | Where |
|---|---|
| Vitest's guide to `expect.extend` and the `Matchers` interface | <https://vitest.dev/guide/extending-matchers> |
| `expect.extend` wraps each matcher with vitest's soft handling, installs it on chai's `Assertion` prototype, and defines an asymmetric matcher of the same name on `expect` | vitest 4.1.11: `@vitest/expect/dist/index.js`, lines 1146-1175 and 1867-1942; vitest 5.0.3: `dist/chunks/index.C4tKZ0yW.js`, lines 1936 and 2566-2590 |
| A matcher's `this.task` is the running test, and is unset outside one | vitest 4.1.11: `@vitest/expect/dist/index.js`, lines 1833-1851; vitest 5.0.3: `dist/chunks/index.C4tKZ0yW.js`, lines 2518-2547 |
| The context of a test registers a finished hook on that test, and refuses one inside a finished hook | vitest 4.1.11: `@vitest/runner/dist/chunk-artifact.js`, lines 2398-2401 and 2574-2589 |
| Vitest's `resolves` wraps each method of the assertion | vitest 4.1.11: `@vitest/expect/dist/index.js`, lines 1709-1745 |
| The `Matchers` and `Assertion` declarations | vitest 4.1.11: `@vitest/expect/dist/index.d.ts`, lines 181 and 635; vitest 5.0.3: `dist/chunks/config.d.BxjInJat.d.ts`, lines 1238-1241 and 1700-1703 |
| jest-dom registers 49 matchers through `expect.extend` | `@testing-library/jest-dom` 7.0.1: `vitest.js` and `dist/matchers.js` |
| Vitest's downloads by version in the last week | <https://api.npmjs.org/versions/vitest/last-week>, fetched 2026-10-01 |
| Vitest 5.0.0's publication date | `npm view vitest time`, run 2026-10-01 |
| Our measurements on vitest 4.1.11 and 5.0.3, Node 26.10.0 and TypeScript 7.0.2, 2026-10-01: registered matchers under `expect.soft`, `expect.assertions`, `context.expect`, `globals: true`, `resolves`, the default reporter and a custom reporter; shadow mode on a suite of six tests and on a failing `toEqual`; strict-mode refusals under `expect.soft`, `.not` and `resolves`; the await guard in six cases; the equality tester against `toMatchObject` and seven other cases; each declaration in this document on both majors with `skipLibCheck` off; the cost of `toEqual` with and without shadow mode | Scratch projects, one per vitest version |
| Our measurements on vitest 4.1.12 and 5.0.5, Node 26.12.0 and TypeScript 7.0.2, 2026-10-20: the library's specs on both majors, and a consumer project of each major that compiles the type probe and runs one test file | The jobs `runners` and `consumer` of CI, run locally |
