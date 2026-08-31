# @dokimi/assert

Test assertions for TypeScript, defined by a language-neutral standard
and held to it on every run.

[![CI](https://github.com/dokimasia/assert-typescript/actions/workflows/ci.yml/badge.svg)](https://github.com/dokimasia/assert-typescript/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dokimi/assert)](https://www.npmjs.com/package/@dokimi/assert)
[![Node](https://img.shields.io/node/v/@dokimi/assert)](https://www.npmjs.com/package/@dokimi/assert)
[![Licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

```sh
npm install --save-dev @dokimi/assert
```

ESM only. Node 24 and up. No runtime dependencies.

- [Getting started](#getting-started)
- [Two surfaces](#two-surfaces) — stop at the first failure, or see them all
- [The assertions](#the-assertions) — every signature
- [Equality](#equality) — why `0` does not equal `false` here
- [Async and the forgotten await](#async-and-the-forgotten-await)
- [Golden files](#golden-files)
- [Without Vitest](#without-vitest)
- [The standard](#the-standard)

## Getting started

```ts
import { check } from "@dokimi/assert";
import { test } from "@dokimi/assert/vitest";

test("get", ({ seat }) => {
  const item = store.get("widget");

  check.isNotNil(seat, item, "get answers the stored item");
  check.equal(seat, item.name, "widget", "and the item is the one stored");
});
```

`test` is Vitest's own, extended with one fixture. Every assertion
takes the seat first and a message last. The message states the
contract under test and is the first line of the failure:

```text
AssertionFailed: and the item is the one stored: want "widget", got "gadget"
```

### What a seat is

The seat is where a failure goes. Assertions never call a test runner
and never throw on their own; they report to whatever seat they are
handed. That is what lets one assertion serve a real test, a benchmark,
and a test that checks the assertion itself.

You will normally use the fixture and not think about it. Three seats
exist, and the fixture hands you the first:

| Seat | `check` does | `soft` does |
|---|---|---|
| `Collector`, from the `seat` fixture | throws | collects, thrown when the test ends |
| `Standard` | throws | throws |
| `Recorder` | collects | collects |

Use `Standard` outside a test runner, where nothing owns the end of a
test. Use `Recorder` to read back what an assertion reported instead of
suffering it.

## Two surfaces

`check` stops at the first failure. `soft` records and carries on, so
one run shows every property that failed.

The name is Vitest's: `expect.soft` already means this in the ecosystem.
Calling it `expect` would shadow the global every test runner defines.

```ts
import { check, soft } from "@dokimi/assert";
import { test } from "@dokimi/assert/vitest";

test("reply", async ({ seat }) => {
  const reply = await client.fetch(url);

  check.equal(seat, reply.status, 200, "the request succeeds");

  soft.hasPrefix(seat, reply.body, "{", "the body is JSON");
  soft.length(seat, reply.items, 3, "every item comes back");
  soft.contains(seat, reply.headers, "etag", "the reply is cacheable");
});
```

If two of the three `soft` calls fail, both are reported together:

```text
AssertionFailed: 2 failures:
  1. every item comes back: expected length 3, got 2
  2. the reply is cacheable: {etag: ...} does not contain "etag"
```

Use `check` when nothing after it makes sense, and `soft` when each line
states an independent property.

## The assertions

Thirty-four on both surfaces, plus three for golden files and four on
the benchmark contract.

<!-- api-reference:start -->

Every assertion takes the seat first and the message last.
`check` and `soft` carry the same names and the same signatures;
only what happens on a failure differs.

**Equality** — Structural, and strict about types.

```ts
check.equal(seat: Seat, got: unknown, want: unknown, msg: string, ...options: Option[])
check.notEqual(seat: Seat, got: unknown, want: unknown, msg: string, ...options: Option[])
```

**Truth and absence** — `isNil` accepts null and undefined both, which is what nullish means.

```ts
check.isTrue(seat: Seat, condition: boolean, msg: string)
check.isFalse(seat: Seat, condition: boolean, msg: string)
check.isNil(seat: Seat, got: unknown, msg: string)
check.isNotNil(seat: Seat, got: unknown, msg: string)
```

**Size** — A string, an array, a Map, a Set or a plain object.

```ts
check.length(seat: Seat, got: unknown, want: number, msg: string)
check.isEmpty(seat: Seat, got: unknown, msg: string)
check.isNotEmpty(seat: Seat, got: unknown, msg: string)
```

**Containment** — What holding means follows the haystack.

```ts
check.contains(seat: Seat, haystack: unknown, needle: unknown, msg: string, ...options: Option[])
check.notContains(seat: Seat, haystack: unknown, needle: unknown, msg: string, ...options: Option[])
check.containsInOrder(seat: Seat, got: unknown, needles: readonly string[], msg: string)
```

**Text** — Strings.

```ts
check.hasPrefix(seat: Seat, got: unknown, prefix: string, msg: string)
check.hasSuffix(seat: Seat, got: unknown, suffix: string, msg: string)
check.matches(seat: Seat, got: unknown, pattern: string, msg: string)
```

**Numbers** — Where exact equality is the wrong question.

```ts
check.closeTo(seat: Seat, got: unknown, want: number, tolerance: number, msg: string)
check.inRange(seat: Seat, got: unknown, low: number, high: number, msg: string)
```

**Ordering** — Sorted, unique, and anything else that holds between neighbours.

```ts
check.pairwise<T>(seat: Seat, items: readonly T[], predicate: (earlier: T, later: T) => boolean, msg: string)
```

**Errors** — For code that hands an error back. Matching follows the chain of `cause`.

```ts
check.noError(seat: Seat, err: unknown, msg: string)
check.hasError(seat: Seat, err: unknown, msg: string)
check.errorIs(seat: Seat, err: unknown, target: unknown, msg: string)
check.errorIsNot(seat: Seat, err: unknown, target: unknown, msg: string)
check.errorAs<E>(seat: Seat, err: unknown, want: ErrorClass<E>, msg: string): E | undefined
```

**Throwing** — `throws` refuses a callable that answers a promise, since an unawaited rejection is not a throw.

```ts
check.throws(seat: Seat, fn: () => unknown, msg: string): unknown
check.doesNotThrow(seat: Seat, fn: () => unknown, msg: string)
check.rejectsWith(seat: Seat, fn: () => Promise<unknown>, msg: string): Promise<unknown>
```

**Cancellation** — AbortSignal is JavaScript's cancellation model. These answer promises, so await them.

```ts
check.honoursCancellation(seat: Seat, fn: Cancellable, msg: string): Promise<void>
check.honoursDeadline(seat: Seat, fn: Cancellable, msg: string): Promise<void>
check.completesWithin(seat: Seat, within: number, fn: () => unknown, msg: string): Promise<void>
check.nullHandleSafe(seat: Seat, fn: (signal: AbortSignal | undefined) => unknown, msg: string): Promise<void>
```

**Retrying** — For a condition something outside the test makes true. Both spend real time.

```ts
check.eventually(seat: Seat, timeout: number, interval: number, body: (trial: Seat) => void | Promise<void>, msg: string): Promise<void>
check.eventuallyTrue(seat: Seat, timeout: number, predicate: () => boolean | Promise<boolean>, msg: string): Promise<void>
```

**Concurrency** — Reads Node's active resources, so a timer or handle left open is a leak.

```ts
check.noTaskLeaks(seat: Seat, msg: string): () => void
```

**Purity** — What observe answers defines what nothing means.

```ts
check.isPure(seat: Seat, observe: () => unknown, fn: () => unknown, msg: string, ...options: Option[]): Promise<void>
```

**Testing an assertion** — On `check` only: `soft` cannot drive a check to failure, because it does not stop.

```ts
check.rejects(seat: Seat, msg: string, body: (inner: Recorder) => void): string
```

**Golden files** — recorded output, compared and rewritable.

```ts
golden.match(seat: Seat, name: string, got: string, update: boolean, ...scrubbers: Scrubber[])
golden.matchAt(seat: Seat, path: string, got: string, update: boolean, ...scrubbers: Scrubber[])
golden.matchJsonField(seat: Seat, path: string, field: string, got: string, update: boolean, ...scrubbers: Scrubber[])
golden.shouldUpdate(): boolean
golden.scrubTimestamps(): Scrubber
golden.scrubHashes(): Scrubber
golden.scrubRunIds(): Scrubber
golden.scrubJsonFields(...fields: string[]): Scrubber
```

**Benchmark ceilings** — chained onto one contract.

```ts
Contract.maxLatency(ms: number): this
Contract.maxMean(ms: number): this
Contract.loop(iterations: number, body: () => unknown): Promise<this>
Contract.check(): void
```

Each one carries a full doc comment: what it states, what every
argument means, the edge cases it decides, and a worked call.

<!-- api-reference:end -->

## Equality

`===` does not answer what the standard asks, and neither does a deep
equal that leans on it:

| Expression | `===` | Here |
|---|---|---|
| `0 === false` | `false` | not equal, and for the right reason |
| `[] === []` | `false` | equal |
| `new Map([["a",1]])` against the same | `false` | equal |
| `NaN === NaN` | `false` | not equal |
| `null` against `[]` | `false` | not equal |

Comparison is structural and reaches arrays, plain objects, `Map`,
`Set`, `Date`, `RegExp` and `Error`. Different shapes never compare, and
a cycle stops the walk rather than overflowing the stack.

An absent collection does not equal an empty one. Where that difference
does not matter, relax the comparison for one call:

```ts
import { equateEmpty, equateNans } from "@dokimi/assert";

check.equal(seat, reply.items, [], "no items came back", equateEmpty());
```

An option applies to the call it is passed to and nothing else. There is
no global setting, because a rule changed in one place and read in
another is how two tests come to mean different things.

## Async and the forgotten await

Seven assertions answer a promise. Forgetting to await one gives a green
test that asserted nothing, and TypeScript will not catch it: the value
was used, it was just used as a promise.

So the seat catches it. Anything started and never awaited is reported
when the test ends:

```text
AssertionFailed: 1 assertion(s) were never awaited, so they asserted nothing:
  - the worker stops when told
Add `await` to the call.
```

The cancellation assertions take an `AbortSignal`, which is what `fetch`,
the stream APIs and `events.once` all take:

```ts
test("cancellation", async ({ seat }) => {
  await check.honoursCancellation(
    seat,
    (signal) => worker.serve({ signal }),
    "the worker stops when told",
  );
});
```

## Golden files

```ts
import { golden } from "@dokimi/assert";

test("render", ({ seat }) => {
  golden.matchAt(
    seat,
    "testdata/report.txt",
    render(report),
    golden.shouldUpdate(),
    golden.scrubTimestamps(),
  );
});
```

Set `DOKIMI_ASSERT_UPDATE_GOLDEN=1` to rewrite the files. Read the diff
before you do. Scrubbers cover timestamps, hex digests, run ids and
named JSON fields, so a value that changes every run does not fail the
comparison.

## Without Vitest

The core has no runner dependency. Construct a seat and flush it where
your framework ends a test:

```ts
import { check, soft, Collector } from "@dokimi/assert";

const seat = new Collector();
try {
  check.equal(seat, got, want, "the reply matches");
  soft.hasPrefix(seat, got.id, "req_", "the id carries its prefix");
} finally {
  seat.flush();
}
```

`flush` throws what `soft` collected, and reports any async assertion
nobody awaited. Importing `@dokimi/assert/vitest` is what pulls Vitest
in; the main entry point never does.

## The standard

The assertions are defined in
[assert-spec](https://github.com/dokimasia/assert-spec), language-neutral
and implemented in several languages. This library vendors the
definition and holds itself to it:

- 87 corpus cases state what each assertion must report, run against
  both surfaces. They are the same cases every other implementation
  runs.
- A completeness gate checks every assertion is present under the name
  the naming table gives it.
- An overlay records what this language cannot supply, with the reason.

### Where TypeScript differs

Two assertions are declared divergent rather than implemented.
`bench.Contract.maxAllocs` and `maxBytes` state ceilings on allocation,
and V8 exposes no per-iteration allocation count. Bytes can only be read
as a heap-usage delta, which moves with whether the collector ran:
measuring one unchanged body six times gave 43, -3, 43, -10, -10 and -8
bytes per iteration. A ceiling set from one run would fail the next for
no reason, so the overlay records the gap instead of pretending.

`throws` refuses a callable that answers a promise. An unawaited
rejection is not a throw, and passing there would make the assertion lie
about what it checked. Use `rejectsWith` for a promise.

`isNil` accepts `null` and `undefined` both. The standard has one absent
value and JavaScript has two, so anything nullish counts.

## Development

```sh
npm install
npm run check       # lint, types, coverage, build
npm test
npm run fmt
npm run build
npm run spec-sync   # refresh the vendored definition
```

CI runs the gate on Node 24 and 26, then packs the library, installs it
into an empty project and imports it, because a package that typechecks
and does not install is still broken.

## Licence

MIT. See [LICENSE](LICENSE).
