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

ESM only. Node 26 and up. No runtime dependencies.

- [Getting started](#getting-started)
- [Two surfaces](#two-surfaces) — stop at the first failure, or see them all
- [The assertions](#the-assertions) — every signature
- [Equality](#equality) — why `0` does not equal `false` here
- [Async and the forgotten await](#async-and-the-forgotten-await)
- [Golden files](#golden-files)
- [Trees of files](#trees-of-files)
- [Properties](#properties) — generated inputs, shrunk counterexamples
- [Histories](#histories) — linearizability and isolation
- [Machines](#machines) — the steps of a case over a subject
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
  1. every item comes back: want 3, got 2
  2. the reply is cacheable: haystack {content-type: "application/json"}, needle "etag"
```

Use `check` when nothing after it makes sense, and `soft` when each line
states an independent property.

## The assertions

Both surfaces have the same 48 assertions, and `check` also has
`rejects`. The `files` module adds nine, the `golden` module four, and the
benchmark contract two ceilings. The `prop` module adds `forAll` and 37
property forms, and the `history` module adds three checks.

<!-- api-reference:start -->

Every assertion takes the seat first and the message last.
`check` and `soft` carry the same names and the same signatures;
only what happens on a failure differs.

**Equality** — Structural, and strict about types.

```ts
check.equal<T>(seat: Seat, got: T, want: NoInfer<T>, msg: string, ...options: Option[])
check.notEqual<T>(seat: Seat, got: T, want: NoInfer<T>, msg: string, ...options: Option[])
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
check.completesWithin(seat: Seat, within: number, fn: (signal: AbortSignal) => unknown, msg: string): Promise<void>
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
check.isNotPure(seat: Seat, observe: () => unknown, fn: () => unknown, msg: string, ...options: Option[]): Promise<void>
```

**Relations** — Properties of a subject across its calls. A callable may return a promise. Every relation but isPermutation returns one, so await it.

```ts
check.isIdempotent<I>(seat: Seat, call: (input: I) => unknown, input: I, observe: () => unknown, msg: string, ...options: Option[]): Promise<void>
check.accumulates<I>(seat: Seat, call: (input: I) => unknown, input: I, observe: () => Count | Promise<Count>, msg: string): Promise<void>
check.isDeterministic<I>(seat: Seat, call: (input: I) => unknown, input: I, msg: string, ...options: Option[]): Promise<void>
check.isCommutative<T>(seat: Seat, combine: (a: T, b: T) => unknown, a: T, b: T, msg: string, ...options: Option[]): Promise<void>
check.isAssociative<T>(seat: Seat, combine: (a: T, b: T) => T | Promise<T>, a: T, b: T, c: T, msg: string, ...options: Option[]): Promise<void>
check.roundTrip<I, E>(seat: Seat, forward: (input: I) => E | Promise<E>, inverse: (encoded: E) => I | Promise<I>, input: I, msg: string, ...options: Option[]): Promise<void>
check.hasStableOrder<T>(seat: Seat, iterate: () => Sequence<T> | Promise<Sequence<T>>, msg: string, ...options: Option[]): Promise<void>
check.noDuplicates<T>(seat: Seat, iterate: () => Sequence<T> | Promise<Sequence<T>>, msg: string, ...options: Option[]): Promise<void>
check.isMonotonic(seat: Seat, observe: () => number | Promise<number>, advance: () => unknown, steps: number, msg: string): Promise<void>
check.isTotal<I>(seat: Seat, call: (input: I) => unknown, domain: Iterable<I>, msg: string): Promise<void>
check.failsAfterClose(seat: Seat, close: () => unknown, call: () => unknown, sentinel: unknown, msg: string): Promise<void>
check.isPoisoned(seat: Seat, induce: () => unknown, observe: () => unknown, msg: string): Promise<void>
check.isPermutation<T>(seat: Seat, got: readonly T[], want: readonly NoInfer<T>[], msg: string, ...options: Option[])
```

**Testing an assertion** — On `check` only: `soft` cannot drive a check to failure, because it does not stop.

```ts
check.rejects(seat: Seat, msg: string, body: (check: Seat) => unknown): Promise<readonly Failure[]>
```

**Golden files** — recorded output, compared and rewritable.

```ts
golden.match(seat: Seat, name: string, got: string, update: boolean, ...scrubbers: Scrubber[])
golden.matchAt(seat: Seat, path: string, got: string, update: boolean, ...scrubbers: Scrubber[])
golden.matchJsonField(seat: Seat, path: string, field: string, got: string, update: boolean, ...scrubbers: Scrubber[])
golden.matchTree(seat: Seat, name: string, dir: string, update: boolean, ...scrubbers: Scrubber[])
golden.shouldUpdate(): boolean
golden.scrubTimestamps(): Scrubber
golden.scrubHashes(): Scrubber
golden.scrubRunIds(): Scrubber
golden.scrubJsonFields(...fields: string[]): Scrubber
```

**Trees of files** — a workspace for a test, and the assertions about the files that the code under test leaves. Each stops the test on a failure.

```ts
files.workspace(seat: Seat & Cleanups, tree: Tree): string
files.write(seat: Seat, dir: string, tree: Tree)
files.read(seat: Seat, path: string): string
files.text(content: string): Entry
files.bytes(content: Uint8Array): Entry
files.executable(content: string): Entry
files.directory(): Entry
files.link(target: string): Entry
files.equal(seat: Seat, dir: string, want: Tree, msg: string)
files.contains(seat: Seat, dir: string, want: Tree, msg: string)
files.unchanged(seat: Seat, dir: string, fn: () => unknown, msg: string): Promise<void>
files.absent(seat: Seat, path: string, msg: string)
files.isFile(seat: Seat, path: string, msg: string)
files.isDir(seat: Seat, path: string, msg: string)
files.linksTo(seat: Seat, path: string, target: string, msg: string)
files.hasContent(seat: Seat, path: string, want: string | Uint8Array, msg: string)
files.hasMode(seat: Seat, path: string, want: number, msg: string)
Entry.withMode(mode: number): Entry
```

**Benchmark ceilings** — chained onto one contract.

```ts
Contract.warmup(iterations: number): this
Contract.maxLatency(ms: number): this
Contract.maxMean(ms: number): this
Contract.measuring<T>(iterations: number, setup: () => T | Promise<T>, body: (input: T) => unknown): Promise<this>
Contract.loop(iterations: number, body: () => unknown): Promise<this>
Contract.check(): void
```

**Properties** — The body of a property draws its inputs from its case. A run shrinks a failing case to a minimal counterexample, and states the token that replays it. Each returns a promise, so await it.

```ts
prop.forAll(seat: Seat, contract: string, body: (c: Case) => void | Promise<void>, ...options: Option[]): Promise<void>
prop.fuzz(seat: Seat, contract: string, body: (c: Case) => void | Promise<void>, ...options: Option[]): Promise<Target>
Case.draw<T>(generator: Generator<T>, label: string): T
Case.assume(condition: boolean): void
Case.classify(label: string): void
Case.note(message: string): void
Case.rand(): () => bigint
Case.observe(fingerprint: bigint): void
Case.cleanup(fn: () => void | Promise<void>): void
Case.history(): History
Case.target(label: string, score: number): void
```

**Property forms** — Each form states an assertion of a function of a generated input, and generates the input from the generator of `prop.using`.

```ts
prop.equal<T, U>(seat: Seat, got: (input: T) => U, want: (input: T) => U, msg: string, ...options: FormOption[]): Promise<void>
prop.notEqual<T, U>(seat: Seat, got: (input: T) => U, want: (input: T) => U, msg: string, ...options: FormOption[]): Promise<void>
prop.isTrue<T>(seat: Seat, condition: (input: T) => boolean, msg: string, ...options: FormOption[]): Promise<void>
prop.isFalse<T>(seat: Seat, condition: (input: T) => boolean, msg: string, ...options: FormOption[]): Promise<void>
prop.isNil<T>(seat: Seat, got: (input: T) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.isNotNil<T>(seat: Seat, got: (input: T) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.length<T>(seat: Seat, got: (input: T) => unknown, want: number, msg: string, ...options: FormOption[]): Promise<void>
prop.isEmpty<T>(seat: Seat, got: (input: T) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.isNotEmpty<T>(seat: Seat, got: (input: T) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.contains<T>(seat: Seat, got: (input: T) => unknown, needle: unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.notContains<T>(seat: Seat, got: (input: T) => unknown, needle: unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.containsInOrder<T>(seat: Seat, got: (input: T) => unknown, needles: readonly string[], msg: string, ...options: FormOption[]): Promise<void>
prop.isPermutation<T, E>(seat: Seat, got: (input: T) => readonly E[], want: (input: T) => readonly E[], msg: string, ...options: FormOption[]): Promise<void>
prop.hasPrefix<T>(seat: Seat, got: (input: T) => unknown, prefix: string, msg: string, ...options: FormOption[]): Promise<void>
prop.hasSuffix<T>(seat: Seat, got: (input: T) => unknown, suffix: string, msg: string, ...options: FormOption[]): Promise<void>
prop.matches<T>(seat: Seat, got: (input: T) => unknown, pattern: string, msg: string, ...options: FormOption[]): Promise<void>
prop.closeTo<T>(seat: Seat, got: (input: T) => unknown, want: number, tolerance: number, msg: string, ...options: FormOption[]): Promise<void>
prop.inRange<T>(seat: Seat, got: (input: T) => unknown, low: number, high: number, msg: string, ...options: FormOption[]): Promise<void>
prop.pairwise<T, E>(seat: Seat, got: (input: T) => readonly E[], predicate: (earlier: E, later: E) => boolean, msg: string, ...options: FormOption[]): Promise<void>
prop.noError<T>(seat: Seat, fn: (input: T) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.hasError<T>(seat: Seat, fn: (input: T) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.errorIs<T>(seat: Seat, fn: (input: T) => unknown, target: unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.errorIsNot<T>(seat: Seat, fn: (input: T) => unknown, target: unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.errorAs<T, E>(seat: Seat, fn: (input: T) => unknown, want: ErrorClass<E>, msg: string, ...options: FormOption[]): Promise<void>
prop.throws<T>(seat: Seat, fn: (input: T) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.doesNotThrow<T>(seat: Seat, fn: (input: T) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.isPure<T>(seat: Seat, observe: () => unknown, fn: (input: T) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.isNotPure<T>(seat: Seat, observe: () => unknown, fn: (input: T) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.nullHandleSafe<T>(seat: Seat, fn: (signal: AbortSignal | undefined, input: T) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.honoursCancellation<T>(seat: Seat, fn: (signal: AbortSignal, input: T) => Promise<unknown>, msg: string, ...options: FormOption[]): Promise<void>
prop.honoursDeadline<T>(seat: Seat, fn: (signal: AbortSignal, input: T) => Promise<unknown>, msg: string, ...options: FormOption[]): Promise<void>
prop.isIdempotent<I>(seat: Seat, call: (input: I) => unknown, observe: () => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.accumulates<I>(seat: Seat, call: (input: I) => unknown, observe: () => Count | Promise<Count>, msg: string, ...options: FormOption[]): Promise<void>
prop.isDeterministic<I>(seat: Seat, call: (input: I) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.isCommutative<T>(seat: Seat, combine: (a: T, b: T) => unknown, msg: string, ...options: FormOption[]): Promise<void>
prop.isAssociative<T>(seat: Seat, combine: (a: T, b: T) => T | Promise<T>, msg: string, ...options: FormOption[]): Promise<void>
prop.roundTrip<I, E>(seat: Seat, forward: (input: I) => E | Promise<E>, inverse: (encoded: E) => I | Promise<I>, msg: string, ...options: FormOption[]): Promise<void>
```

**Generators** — Each value is decoded from the choices of the case, so a value shrinks as its choices do.

```ts
prop.integer(lo: number, hi: number): Generator<number>
prop.integer(lo: bigint, hi: bigint): Generator<bigint>
prop.float(lo: number, hi: number, ...options: FloatOption[]): Generator<number>
prop.boolean(...options: BooleanOption[]): Generator<boolean>
prop.just<T>(value: T): Generator<T>
prop.sampledFrom<T>(...values: readonly T[]): Generator<T>
prop.oneOf<T>(...generators: readonly Generator<T>[]): Generator<T>
prop.optional<T>(of: Generator<T>): Generator<T | undefined>
prop.list<T>(of: Generator<T>, ...options: ListOption[]): Generator<T[]>
prop.dict<K, V>(keys: Generator<K>, values: Generator<V>, ...options: SizeOption[]): Generator<Map<K, V>>
prop.string(...options: StringOption[]): Generator<string>
prop.bytes(...options: SizeOption[]): Generator<Uint8Array>
prop.duration(lo: Temporal.Duration, hi: Temporal.Duration): Generator<Temporal.Duration>
prop.permutation<T>(...values: readonly T[]): Generator<T[]>
prop.stringMatching(pattern: string): Generator<string>
prop.recursive<T>(base: Generator<T>, extend: (self: Generator<T>) => Generator<T>, ...options: RecursiveOption[]): Generator<T>
prop.composite<T>(f: (c: Case) => T): Generator<T>
Generator.map<U>(f: (value: T) => U): Generator<U>
Generator.filter(keep: (value: T) => boolean): Generator<T>
Generator.bind<U>(f: (value: T) => Generator<U>): Generator<U>
```

**Shapes and registrations** — A shape file states the type of an input, from which a generator is derived.

```ts
prop.of<T>(name: string): Generator<T>
prop.ofShape<T>(text: string): Generator<T>
prop.shapeOf(name: string): string
prop.register<T>(name: string, generator: Generator<T>)
prop.registerValues<T>(name: string, ...values: readonly T[])
prop.registerVariants(name: string, variants: Readonly<Record<string, string | undefined>>)
```

**Property options** — The settings of a run. A later option overrides an earlier one of the same setting.

```ts
prop.cases(n: number): Option
prop.seed(s: bigint | number): Option
prop.replay(token: string): Option
prop.require(label: string, share: number): Option
prop.shrink(runs: number): Option
prop.shrinkTime(ms: number): Option
prop.maxChoices(n: number): Option
prop.store(dir: string): Option
prop.explain(enabled: boolean): Option
prop.workers(n: number): Option
prop.hermetic(): Option
prop.draws(entries: string): Option
prop.using<T>(generator: Generator<T>): FormOption
prop.example<T>(...values: readonly T[]): FormOption
prop.examples<T>(...values: readonly T[]): FormOption
```

**Histories** — the calls that the clients of a subject make, checked against a sequential specification or for an isolation level.

```ts
History.invoke(client: number, operation: string, args: readonly unknown[], ...keys: unknown[]): Call
History.events(): readonly Event[]
Call.ok(output: unknown): void
Call.fail(error: unknown): void
Call.unknown(error: unknown): void
history.fromIntervals(entries: readonly Interval[]): History
history.concurrently(clients: number, within: number, body: (client: number) => unknown): Promise<readonly Outcome[]>
history.specFrom(factory: () => (operation: string, args: readonly unknown[]) => unknown): Spec<readonly Operation[]>
history.isLinearizable<S>(seat: Seat, history: History, spec: Spec<S>, msg: string, ...options: Option[])
history.isSerializable(seat: Seat, history: History, msg: string)
history.hasSnapshotIsolation(seat: Seat, history: History, msg: string)
history.budget(steps: number): Option
history.memoLimit(bits: number): Option
history.timeLimit(ms: number): Option
history.workers(n: number): Option
```

**Machines** — the steps of a case over a subject, and the task scheduler that releases its tasks in an order that the case decides.

```ts
stateful.steps<S>(c: Case, machine: Machine<S>, ...options: Option[]): Promise<void>
stateful.mean(n: number): Option
stateful.max(n: number): Option
stateful.swarm(on: boolean): Option
stateful.clients(n: number): Option
stateful.concurrent(n: number): Option
stateful.tasks(scheduler: Scheduler): Option
stateful.uniform(): Strategy
stateful.pct(depth: number): Strategy
Scheduler.spawn(task: () => Promise<void>): void
Scheduler.yield(): Promise<void>
Scheduler.run(): Promise<void>
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

These assertions return a promise:

- `rejects` and `rejectsWith`
- `honoursCancellation`, `honoursDeadline`, `completesWithin` and
  `nullHandleSafe`
- `isPure`, `eventually` and `eventuallyTrue`
- the relations `isIdempotent`, `accumulates`, `isDeterministic`,
  `isCommutative`, `isAssociative`, `roundTrip`, `hasStableOrder`,
  `noDuplicates`, `isMonotonic`, `isTotal`, `isNotPure`,
  `failsAfterClose` and `isPoisoned`
- `files.unchanged`, whose callable may return a promise
- `prop.forAll`, `prop.fuzz` and every property form

Forgetting to await one gives a green test that asserted nothing, and
TypeScript will not catch it: the value was used, it was just used as a
promise.

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

`golden.matchTree` compares a directory of output with a golden tree
under `testdata/golden`. Git records one permission bit of a file, the
owner's execute bit, and the comparison reads that bit alone. An update
makes the golden tree equal the output and deletes every entry that the
output lacks. Keep the inputs of a test outside the golden tree for that
reason.

## Trees of files

`files.workspace` writes a tree into a directory of the test's own. The
fixture removes the directory when the test ends. The assertions of the
`files` module compare the tree that the code under test leaves with a
wanted tree, or check the entry at one path:

```ts
import { check, files } from "@dokimi/assert";
import { test } from "@dokimi/assert/vitest";

test("rename", ({ seat }) => {
  const dir = files.workspace(seat, {
    "go.mod": files.text("module example.com/a\n"),
    "a/a.go": files.text("package a\n\nfunc Old() {}\n"),
    "keys/id": files.text("secret\n").withMode(0o600),
  });

  check.noError(seat, rename(dir, "a.Old", "New"), "the rename succeeds");

  files.equal(seat, dir, {
    "go.mod": files.text("module example.com/a\n"),
    "a/a.go": files.text("package a\n\nfunc New() {}\n"),
    "keys/id": files.text("secret\n").withMode(0o600),
  }, "the rename rewrites the declaration");
});
```

Where a tree states no mode, a workspace sets 0644 on a file and 0755 on
an executable file and on a directory, whatever the umask. A comparison
reads a mode only where the wanted tree states one. Elsewhere it reads
the owner's execute bit of a file. Content compares as bytes. A failure
lists the wanted entries and the entries read at the first 64 paths that
differ, with the number of those paths. Windows does not record
permission bits, so a comparison there ignores modes, and
`files.hasMode` ends the call with a fault.

## Properties

A property states a contract for every input of a generator. The body
draws each input from its case. The case is a seat, so every assertion
of this library works on it:

```ts
import { check, prop } from "@dokimi/assert";
import { test } from "@dokimi/assert/vitest";

test("reverse", async ({ seat }) => {
  await prop.forAll(seat, "a reversed list starts with its first element", (c) => {
    const xs = c.draw(prop.list(prop.integer(0, 9)), "xs");
    check.equal(c, xs.toReversed()[0], xs[0], "the reverse starts with the first element");
  });
});
```

A run generates 100 cases. The property above fails for any list of two
different elements, and the run shrinks the case that failed to the
smallest such list, `[0, 1]`. The failure states the counterexample and
the token that replays it, through `prop.replay` or the variable
`DOKIMI_ASSERT_PROP_REPLAY`. The store of the test, under
`testdata/prop`, keeps each counterexample, and the next run replays it
first.

A property form states one assertion for every input, such as
`prop.equal` of two functions of the input. `prop.using` states the
generator of the input, because TypeScript erases the types that another
language derives an input from. `prop.ofShape` derives a generator from
the text of a shape file instead.

## Histories

A history records the calls that the clients of a subject make. A check
decides whether the calls fit a sequential specification, or whether a
history of transactions meets an isolation level:

```ts
import { history } from "@dokimi/assert";
import { test } from "@dokimi/assert/vitest";

const REGISTER: history.Spec<unknown> = {
  initial: () => null,
  next: (state, op) =>
    op.name === "write" ? [op.args[0]] : op.returned(state) ? [state] : [],
};

test("register", ({ seat }) => {
  const calls = new history.History();
  calls.invoke(0, "write", [1], "x").ok(null);
  calls.invoke(1, "read", [], "x").ok(null);

  history.isLinearizable(seat, calls, REGISTER, "the register is linearizable");
});
```

The read misses the write that completed before it. The failure states
the longest order of calls that the specification accepts, and the call
that it rejects there:

```text
AssertionFailed: the register is linearizable: violated in the partition of "x"
    steps 2, partitions 1, calls 2, concurrency 1
    linearized: call 0 write(1) → null
    states: 1
    rejected: call 2 read() → null
```

A call completes as ok, as failed or as unknown. The check leaves out a
failed call, which takes no effect, and lets a call whose outcome is
unknown take effect at some later point, or never. Calls that share a key
form one partition, and the check searches each partition on its own.
`history.concurrently` starts clients together, and
`history.fromIntervals` builds a history from a log of timed calls.
`history.isSerializable` and `history.hasSnapshotIsolation` check a
history of list-append transactions.

## Machines

A machine lists the actions of a subject and states its sequential
specification. `stateful.steps` takes the steps of a case over the
subject, and checks the history of the steps after each one. Every
decision is a choice of the case, so a failing case shrinks to the steps
that the failure needs. A concurrent section runs its clients as tasks
of a scheduler, whose releases are choices of the case too, so a race
replays and shrinks:

```ts
import { history, prop, stateful } from "@dokimi/assert";
import { test } from "@dokimi/assert/vitest";

const COUNTER: history.Spec<number> = {
  initial: () => 0,
  next: (state, op) => (op.returned(state + 1) ? [state + 1] : []),
};

test("counter", async ({ seat }) => {
  await prop.forAll(seat, "the counter counts every increment", async (c) => {
    const scheduler = new stateful.Scheduler(c, stateful.uniform());
    let count = 0;
    await stateful.steps(
      c,
      {
        spec: COUNTER,
        actions: [
          {
            name: "increment",
            run: async (c, client) => {
              const call = c.history().invoke(client, "increment", []);
              const read = count;
              await scheduler.yield();
              count = read + 1;
              call.ok(count);
            },
          },
        ],
      },
      stateful.clients(2),
      stateful.tasks(scheduler),
    );
  });
});
```

The increment reads the count, yields to the scheduler, and then writes
the count plus one, so two clients can both return 1. The counterexample
lists the two steps of the race:

```text
  step increment on client 1
  step increment on client 2
```

A task marks each point where another task may run with
`await scheduler.yield()`, because a library cannot intercept a native
`await`.

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

- 195 corpus cases state what each assertion must report, run against
  both surfaces, with the call record of each call. They are the same
  cases every other implementation runs.
- 430 property vectors, 80 history vectors, 14 machine vectors and 57
  file vectors pin the property engine, the history checks, machines and
  the assertions of files.
- A completeness gate checks that every assertion is present under the
  name that the naming table gives it, with the definition's arity.
- An overlay records what this language cannot supply, with the reason.

### Where TypeScript differs

Six assertions are declared divergent rather than implemented.
`maxAllocs` and `maxAllocsWithSetup` on a call, their property forms
`prop.maxAllocs` and `prop.maxAllocsWithSetup`, and
`bench.Contract.maxAllocs` and `maxBytes` on a benchmark iteration state
ceilings on allocation, and V8 exposes no allocation count. Bytes can
only be read as a heap-usage delta, which moves with whether the
collector ran: measuring one unchanged body six times gave 43, -3, 43,
-10, -10 and -8 bytes per iteration. A ceiling set from one run would
fail the next for no reason, so the overlay records the gap instead of
pretending.

`throws` refuses a callable that answers a promise. An unawaited
rejection is not a throw, and passing there would make the assertion lie
about what it checked. Use `rejectsWith` for a promise.

`isNil` accepts `null` and `undefined` both. The standard has one absent
value and JavaScript has two, so anything nullish counts.

A concurrent section of a machine runs its clients as tasks of the
scheduler, because the runtime has one thread. `stateful.clients` of 2 or
more requires `stateful.tasks`, and no option repeats a section on
threads. `prop.workers` runs one case at a time, and `history.workers`
searches one partition at a time.

Under Vitest, `prop.fuzz` replays the stored cases of the property,
because Vitest has no fuzzer. It returns the target that a fuzzer such as
Jazzer.js runs on its byte inputs.

## Development

```sh
npm install
npm run check       # lint, types, coverage, build
npm test
npm run fmt
npm run build
npm run spec-sync   # refresh the vendored definition
```

CI runs the gate on Node 26 on Linux, then packs the library, installs it
into an empty project and imports it, because a package that typechecks
and does not install is still broken. It runs the tests on Windows and
macOS as well.

## Licence

MIT. See [LICENSE](LICENSE).
