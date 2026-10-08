---
rfc: 0003
title: Definition 7.2.0 in TypeScript
author: Roy Klopper <roy.klopper@stealthscale.io>
status: Accepted
created: 2026-10-08
updated: 2026-10-08
discussion: none
supersedes: none
superseded-by: none
produces-adr: none
---

# RFC-0003: Definition 7.2.0 in TypeScript

## Summary

The library moves from definition 1.1.0 to 7.2.0 in one step. It gains the
68 assertions and 193 TypeScript names that the definition added since
1.1.0:

- the property engine, with its generators, its 40 property forms and its
  derived inputs
- the relation family and `byIdentity`
- the history seam and its three checks
- machines and the task scheduler
- trees of files, the file assertions and `golden.matchTree`
- call records, the failure record's accessors and the seat's `signal`
- `warmup` on the bench contract

The definition fixes the names, the rules and the vectors. This proposal
decides only what TypeScript must decide:

- **Bodies.** A property's body, a relation's callable, a task and a
  machine's action may each return a promise, and the library awaits it.
- **Records.** The seat fixture writes a test's records into vitest's JSON
  report, under the task meta's key `dokimi.assert`.
- **Numbers.** The engine computes on `bigint` wherever the definition
  uses 64 bits.
- **Tasks.** A task of the scheduler is an async function, and it ends its
  turn at `yield()` or when it settles.
- **Files.** The file helpers and assertions use Node's synchronous file
  API, and the golden directory moves to `testdata/golden`.
- **Node.** The minimum is Node 26, which provides `Temporal`.
- **The definition.** The definition gains a TypeScript skip on two
  corpus cases and on 34 fixture vectors, and the TypeScript overlay
  declines `steps.repeat` and limits `prop.fuzz`. These four changes make
  definition 7.2.1, which the library vendors.

## Motivation

The library vendors definition 1.1.0. It implements 42 of the definition's
110 assertions and 79 of its 272 TypeScript names. Its completeness gate
fails on every row that it neither implements nor declines, so the library
cannot vendor any later version until it implements the rest.

The shared vectors pin each addition: 430 property vectors, 80 history
vectors, 14 machine vectors and 57 file vectors, beside the corpus cases
that definitions 2.0.0 to 7.1.0 added to the assertions that the library
already has. The library runs none of them today. The Go library runs all
of them, so the two disagree wherever the library has not caught up:

- `length` counts UTF-16 code units, where the definition counts Unicode
  scalar values.
- `matches` accepts patterns outside the portable subset, such as a
  backreference.
- `contains` finds a NaN key in a map without `equateNans`.
- `rejects` returns a message, where the definition returns the failure
  records of the check.
- `isEmpty`, `isNotEmpty` and `matches` report fewer detail fields than
  the definition declares.

## Detailed design

### Components

| Component | Files | Responsibility |
|---|---|---|
| Typed literals | `src/record/literal.ts` | Encodes a value as the definition's typed literal |
| Call records | `src/record/call.ts`, `src/record/calls.ts`, `src/record/switch.ts` | Numbers calls, writes each record, and reads `DOKIMI_ASSERT_RECORD` once per process |
| Verdicts | `src/matcher/verdict.ts` | Reports a pass, a failure and a fault, and writes the call record of each |
| Failure record | `src/failure.ts` | The `Failure` class, with `want`, `got` and `caseFailure` |
| Seats | `src/seat.ts`, `src/matcher/seat.ts`, `src/vitest.ts` | `signal`, `signalOf`, `Recorder.withSignal`, `Recorder.records`, and the records of a test in its task meta |
| Equality and values | `src/matcher/compare.ts`, `src/matcher/value.ts`, `src/matcher/option.ts` | The rules of 2.0.0, 3.0.0, 5.2.0 and 7.1.0, and `byIdentity` |
| Portable patterns | `src/pattern/` | Parses the portable subset, for `matches` and `prop.stringMatching` |
| Relations | `src/matcher/relation.ts`, `src/check.ts`, `src/soft.ts` | The 14 relations on both surfaces |
| Property engine | `src/prop/` and `src/prop/engine/` | The public module `prop`, and the source, the decoder, the shrinker, coverage, tokens, the store, campaigns and shapes |
| Histories | `src/history/` | The public module `history`: the seam, specs, `concurrently` and the three checks |
| Machines | `src/stateful/` | The public module `stateful`: machines, their steps and the task scheduler |
| Files | `src/files/`, `src/golden.ts` | The public module `files`, and `golden.matchTree` |
| Bench | `src/bench.ts` | `warmup` |
| Conformance | `src/conformance/` | A driver for each vector family, and the corpus driver for the 7.2.1 corpus |

`src/index.ts` exports `prop`, `history`, `stateful` and `files` as
namespaces beside `check`, `soft`, `golden` and `bench`. The names
`prop.forAll`, `history.isLinearizable`, `stateful.steps` and
`files.equal` then read as the naming table states them.

### The definition: 7.2.1

The library cannot meet four parts of 7.2.0. The definition states a skip
or an overlay entry for each such part, so the four changes go to
assert-spec first, as definition 7.2.1:

| Change | Where | Reason |
|---|---|---|
| A `typescript` skip on `contains/an-int-does-not-match-a-float` and `permutation/an-int-does-not-match-a-float` | `corpus/contains.json`, `corpus/permutation.json` | JavaScript has one number type, so the int 1 and the float 1.0 are one value |
| A `typescript` skip on each of the 34 vectors of `corpus/prop/fixtures` | `corpus/prop/fixtures.yaml` | TypeScript erases its types, so it cannot read a type into a shape. It derives inputs from shape files alone, as the definition's table of type readers states |
| The overlay declines `steps.repeat`, and the naming table has no TypeScript name for it | `overlays/typescript.json`, `spec/naming.yaml` | The option repeats a concurrent section on threads, and the overlay offers only the section `tasks` |
| The overlay limits `prop.fuzz` | `overlays/typescript.json` | vitest has no fuzzer. Under vitest, `prop.fuzz` replays the stored cases and the seed files, as `go test` does without `-fuzz`. The target that it returns runs under a fuzzer that calls a function with bytes, such as Jazzer.js |

The vendored copy then comes from `main` of assert-spec at 7.2.1, and the
vendored `tools/spec-sync.sh` becomes 7.2.1's, which copies the corpus
files in subdirectories and `spec/zones.json`.

### Equality, values and the corpus

The rules that definitions 2.0.0 to 7.1.0 added to existing assertions:

- `length` counts the Unicode scalar values of a string. A string with a
  lone surrogate has no length.
- A map finds a key as the definition's equality compares keys. Without
  `equateNans`, no NaN key matches, and `-0` and `+0` are one key.
- `matches` reads the pattern through the parser of the portable subset in
  `src/pattern/`, and fails on a pattern outside it, with the parser's text
  in the field `reason`.
- `isEmpty` states `got` and `length`, and `length` is `null` for a value
  without a length. `isNotEmpty` states `got`.
- `completesWithin` fails when the duration has passed, without waiting
  for the subject to settle.
- A detail field that is absent states `null`. `honoursCancellation` and
  `honoursDeadline` state `got: null`, not `undefined`.
- `byIdentity()` compares a reference with `===` for one call of `equal`,
  `notEqual`, `contains` or `notContains`.

The corpus driver decodes every literal of the 7.2.1 corpus: `bytes`, a
list of `items`, a map of `entries`, integers written as decimal strings,
absent containers, named floats inside lists, `record`, `variant`,
`reference` and `tree`. It applies each case's `options`. It requires that
a failure's detail contain exactly the fields that the assertion declares,
and the completeness gate checks the arity of every function.

### The failure record

```ts
/** The failure record that a failing assertion reports, as the definition states it. */
export class Failure {
  /** The assertion's id, as the definition spells it. */
  readonly assertion: string;
  /** The caller's message. */
  readonly contract: string;
  /** The fields that the definition declares for the assertion. */
  readonly detail: Readonly<Record<string, unknown>>;
  /** Where the assertion was called, when it knows. */
  readonly where?: Where;

  /**
   * The detail's want. Undefined when the assertion does not declare a
   * want, and null when it declares one whose value is absent.
   */
  get want(): unknown;

  /** The detail's got, with the same rule as want. */
  get got(): unknown;

  /** The record of a property's failing case, and undefined for any other failure. */
  get caseFailure(): Failure | undefined;
}
```

`rejects` returns the failure records of its check, in call order:

```ts
export function rejects(seat: Seat, msg: string, body: (check: Seat) => unknown): Promise<readonly Failure[]>;
```

The check ends at its first aborting failure, as a test does.

### Faults

An assertion that cannot run reports a fault: a spec whose function
throws, a malformed shape, a refused interval, or the switch
`DOKIMI_ASSERT_RECORD` set to a value that the definition does not
define. A fault ends the call with the verdict `error`. The seat receives
it through `fail`, and the call record states the error's text in the
field `error`.

### Call records

`DOKIMI_ASSERT_RECORD=1` records every assertion call. The library reads
the variable once per process and caches the reading under a
`Symbol.for` key of `globalThis`, because vitest can evaluate the module
once per test file.

A call record is a JSON object with the fields of the definition, in its
order: `definition`, `seq`, `parent`, `run`, `phase`, `assertion`,
`contract`, `verdict`, `aborting`, `where`, `detail` and `error`. An absent
field is left out, never written as `null`. `seq` counts from 1 in each
test, taken at the verdict. A call that runs a body takes its `seq` before
the calls of its body.

The encoder maps a JavaScript value to a typed literal:

| Value | Literal |
|---|---|
| `boolean`, `string`, `null` | `bool`, `string`, `null` |
| `undefined` | `null` |
| A `number` that `Number.isSafeInteger` accepts, other than `-0` | `int` |
| Any other `number`, NaN and the infinities included | `float` |
| `bigint` | `int`, as a decimal string beyond the safe range |
| `Uint8Array` | `bytes` |
| An array | `list` |
| `Map` | `map` |
| `Set` | `set` |
| A plain object | `record` |
| A `Temporal` value | its date or time literal |
| A function, an `Error`, an `AbortSignal`, a promise, and a value nested past the definition's depth | `opaque`, with its text |

The records of a test go where the overlay states: into the array under
the key `dokimi.assert` of the test's task meta. vitest's JSON reporter
writes that meta for each test. The fixture of `@dokimi/assert/vitest`
sets the array when it builds the test's `Collector`. Each verdict pushes
its record onto the array. vitest sends the task meta again after the
test function has returned, so the report also contains the records that
the fixture's teardown writes.

Test annotations cannot contain the records. An annotation throws once
the test function has returned.

A `Recorder` keeps its records whatever the switch states:

```ts
export class Recorder implements Seat {
  /** The call records of this recorder's calls, in the order of their seq, as JSON lines. */
  get records(): readonly string[];
}
```

A `Standard` seat, and a `Collector` that a test builds without the
fixture, do not write records.

### The signal of a seat

```ts
export interface Seat {
  helper(): void;
  fail(message: string): void;
  record(message: string): void;
  /** Aborts when the test that runs on this seat ends, where the seat states one. */
  readonly signal?: AbortSignal;
}

/** The seat's signal, or a signal that never aborts for a seat without one. */
export function signalOf(seat: Seat): AbortSignal;

export class Recorder implements Seat {
  /** Makes signal the signal of this recorder, and returns the recorder. */
  withSignal(signal: AbortSignal): this;
}
```

The fixture passes the test context's `signal` to the `Collector`. vitest
aborts it when the test times out and when the run is cancelled. The
check of `rejects` and each attempt of `eventually` receive a seat whose
signal is `AbortSignal.any([signalOf(seat), controller.signal])`. The
assertion aborts the controller when the body ends.

### Relations

The 14 relations are on `check` and `soft`. Each callable may return a
promise, so each relation that calls one returns a promise that the
forgotten-await guard tracks:

```ts
export function isIdempotent<I>(
  seat: Seat,
  call: (input: I) => unknown,
  input: I,
  observe: () => unknown,
  msg: string,
  ...options: Option[]
): Promise<void>;

export function isPermutation<T>(
  seat: Seat,
  got: readonly T[],
  want: readonly NoInfer<T>[],
  msg: string,
  ...options: Option[]
): void;
```

- A throw or a rejection of a callable fails the relation, unless the
  relation requires a failure, as `failsAfterClose` and `isPoisoned` do.
- `observe` returns a copy. A projection that shares memory with the
  subject compares one object with itself.
- A relation reads its call site before its first `await`, so the record
  states `where`.
- `accumulates` reads a `number` or a `bigint`.
- `isMonotonic` reads numbers.
- `hasStableOrder` and `noDuplicates` read an iterable or an async
  iterable.
- `isPermutation` matches elements through a maximum bipartite matching.
  A greedy match fails under `equateEmpty`, which makes `null` equal both
  `[]` and `{}` while those two differ.

### The property engine

```ts
export function forAll(
  seat: Seat,
  contract: string,
  body: (c: Case) => void | Promise<void>,
  ...options: Option[]
): Promise<void>;

export class Case implements Seat {
  draw<T>(generator: Generator<T>, label: string): T;
  assume(condition: boolean): void;
  classify(label: string): void;
  note(message: string): void;
  rand(): () => bigint;
  observe(fingerprint: bigint): void;
  cleanup(fn: () => void | Promise<void>): void;
  readonly signal: AbortSignal;
  history(): History;
  target(label: string, score: number): void;
}

export class Generator<T> {
  map<U>(f: (value: T) => U): Generator<U>;
  filter(keep: (value: T) => boolean): Generator<T>;
  bind<U>(f: (value: T) => Generator<U>): Generator<U>;
}
```

The generators:

```ts
export function integer(lo: number, hi: number): Generator<number>;
export function integer(lo: bigint, hi: bigint): Generator<bigint>;
export function float(lo: number, hi: number, ...options: FloatOption[]): Generator<number>;
export function boolean(...options: BooleanOption[]): Generator<boolean>;
export function just<T>(value: T): Generator<T>;
export function sampledFrom<T>(...values: readonly T[]): Generator<T>;
export function oneOf<T>(...generators: readonly Generator<T>[]): Generator<T>;
export function optional<T>(of: Generator<T>): Generator<T | undefined>;
export function list<T>(of: Generator<T>, ...options: ListOption[]): Generator<T[]>;
export function dict<K, V>(keys: Generator<K>, values: Generator<V>, ...options: SizeOption[]): Generator<Map<K, V>>;
export function string(...options: StringOption[]): Generator<string>;
export function bytes(...options: SizeOption[]): Generator<Uint8Array>;
export function duration(lo: Temporal.Duration, hi: Temporal.Duration): Generator<Temporal.Duration>;
export function permutation<T>(...values: readonly T[]): Generator<T[]>;
export function stringMatching(pattern: string): Generator<string>;
export function recursive<T>(
  base: Generator<T>,
  extend: (self: Generator<T>) => Generator<T>,
  ...options: RecursiveOption[]
): Generator<T>;
export function composite<T>(f: (c: Case) => T): Generator<T>;
```

A property form takes functions of the input, the assertion's other
arguments and the message. Its input's generator comes through `using`,
because TypeScript has no type to key a generator by:

```ts
export function equal<T, U>(
  seat: Seat,
  got: (input: T) => U,
  want: (input: T) => U,
  msg: string,
  ...options: FormOption[]
): Promise<void>;

await prop.inRange(seat, (o: Order) => total(o), 0, Number.MAX_SAFE_INTEGER,
  "a total is never negative", prop.using(prop.ofShape<Order>(orderShape)));
```

The 33 function forms and the 6 relation forms follow the same pattern.
`prop.maxAllocs` and `prop.maxAllocsWithSetup` remain declined, as their
assertions are.

Derived inputs are keyed by the name of a shape definition, because
TypeScript erases the type that Go keys them by:

```ts
export function using<T>(generator: Generator<T>): FormOption;
export function register<T>(name: string, generator: Generator<T>): void;
export function registerValues<T>(name: string, ...values: readonly T[]): void;
export function registerVariants(name: string, variants: Readonly<Record<string, string | undefined>>): void;
export function of<T>(name: string): Generator<T>;
export function shapeOf(name: string): string;
export function ofShape<T>(text: string): Generator<T>;
export function example<T>(...values: readonly T[]): FormOption;
export function examples<T>(...values: readonly T[]): FormOption;
```

`registerVariants` maps each variant's name to the name of its payload's
shape, or to `undefined` for a variant without a payload. `ofShape`
resolves a reference to a registered name. A registration after the first
property of a test file has started throws, because vitest isolates each
test file and the definition scopes a registration to the test process.
`shapeOf` throws for a name that `register` gave a generator without a
shape.

#### The rules of a run

- **A body.** The engine awaits a body that returns a promise, and runs one
  that returns nothing without awaiting. Each case runs alone, as the
  overlay's limit on `prop.workers` states.
- **The end of a case.** `assume`, a repeated label and a fatal failure
  throw a signal of the engine and set a flag on the case. Every later
  call of the case throws the signal again, so a `catch` in the body cannot
  continue the case.
- **Cleanup and cancellation.** The case's `signal` derives from
  `signalOf(seat)` through `AbortSignal.any`. The engine aborts it when the
  body ends, and then awaits the cleanups, last first, after any kind of
  end. A failing cleanup does not stop the cleanups after it. A run whose
  seat's signal aborts stops between cases and does not write a store
  entry.
- **Numbers.** The source is SFC64 on `bigint`, and choices, seeds and
  tokens are `bigint`. A `number` integer is a choice within the safe range,
  and `integer(lo, hi)` refuses `number` bounds outside it.
- **Floats.** Width 32 rounds through `Math.fround`. NaN is written as the
  bits `0x7FF8000000000000` and not through `Math.sqrt(-1)`.
- **Text.** A string generator iterates by code point and never produces a
  lone surrogate. A token decodes through strict base64url, which refuses
  `+`, `/` and padding.
- **Dates.** A date or time shape decodes to a `Temporal` value.
- **The store.** A run stores its failures under
  `testdata/prop/<file>/<describe titles>/<title>/`, where `<file>` is the
  test file's path relative to the project root, resolved against the
  working directory, as `golden.match` resolves its files. The store's
  path escapes each character that cannot appear in a file name.
- **Variables.** A run that is not hermetic reads
  `DOKIMI_ASSERT_PROP_SEED`, `DOKIMI_ASSERT_PROP_PROFILE`,
  `DOKIMI_ASSERT_PROP_BUDGET` and `DOKIMI_ASSERT_PROP_REPLAY`. A run in a
  process whose environment contains `DOKIMI_MUTATE_MUTANT` takes its seed
  from its contract, and does not run a campaign or write a store entry.
- **Its report.** `prop.forAll` aborts only, so it reports through
  `reportFailure` in fatal mode. The text of a counterexample renders a
  `bigint` as its digits.

`prop.fuzz` replays the stored cases and the seed files on the seat, and
returns a target for a fuzzer:

```ts
export function fuzz(
  seat: Seat,
  contract: string,
  body: (c: Case) => void | Promise<void>,
  ...options: Option[]
): Promise<(data: Uint8Array) => Promise<void>>;
```

The library does not depend on Jazzer.js. A suite that fuzzes exports the
target to its fuzzer.

### Histories

```ts
export class History {
  invoke(client: number, operation: string, args: readonly unknown[], ...keys: unknown[]): Call;
  events(): readonly Event[];
}

export class Call {
  ok(output: unknown): void;
  fail(error: unknown): void;
  unknown(error: unknown): void;
}

export interface Operation {
  readonly name: string;
  readonly args: readonly unknown[];
  readonly known: boolean;
  readonly output: unknown;
  returned(value: unknown): boolean;
}

export interface Spec<S> {
  initial(): S;
  next(state: S, op: Operation): readonly S[];
  /** Compares two states. The library's equality when absent. */
  equal?(a: S, b: S): boolean;
  /** A text that two equal states share, for the search's memo. A canonical text when absent. */
  key?(state: S): string;
}

export function specFrom(factory: () => (operation: string, args: readonly unknown[]) => unknown): Spec<readonly Operation[]>;
export function fromIntervals(entries: readonly Interval[]): History;
export function concurrently(
  clients: number,
  within: number,
  body: (client: number) => unknown,
): Promise<readonly Outcome[]>;

export function isLinearizable<S>(seat: Seat, history: History, spec: Spec<S>, msg: string, ...options: Option[]): void;
export function isSerializable(seat: Seat, history: History, msg: string): void;
export function hasSnapshotIsolation(seat: Seat, history: History, msg: string): void;
```

- `next` is synchronous. A spec describes a sequential object, and the
  search calls `next` once per state.
- `concurrently` releases all clients at once through one promise, waits
  `within` milliseconds on the platform clock, and returns each client's
  outcome. A client whose body throws or rejects fails the call after the
  wait, as a panic does in Go.
- `fromIntervals` takes integer times as `number` or `bigint`, and orders
  them by comparison, never by subtraction. It throws a `RangeError` that
  names the entry it refuses.
- The search keeps its sets of calls in `bigint` bit sets and its memo
  under string keys. Each sort of numbers passes a numeric comparator,
  because the default sort compares text. `timeLimit` reads the clock
  inside the search loop.
- A spec function that throws ends the check with a fault.
- The overlay limits `history.workers`: the search runs one partition at
  a time.

### Machines and the task scheduler

```ts
export interface Machine<S> {
  readonly spec: Spec<S>;
  readonly actions: readonly Action<S>[];
  invariant?(c: Case, state: S): void;
  settle?(c: Case, state: S): void | Promise<void>;
}

export interface Action<S> {
  readonly name: string;
  /** How often the action is chosen. 1 when absent or 0. */
  readonly weight?: number;
  readonly drain?: boolean;
  enabled?(state: S): boolean;
  input?(c: Case, state: S): unknown;
  run(c: Case, client: number, input: unknown): void | Promise<void>;
}

export function steps<S>(c: Case, machine: Machine<S>, ...options: Option[]): Promise<void>;

export class Scheduler {
  constructor(c: Case, strategy: Strategy);
  spawn(task: () => Promise<void>): void;
  yield(): Promise<void>;
  run(): Promise<void>;
}

export function uniform(): Strategy;
export function pct(depth: number): Strategy;
```

- A task is an async function. A library cannot intercept a native
  `await`, so a task states each point where another task may run with
  `await scheduler.yield()`. A task's turn ends at `yield()` or when the
  task settles.
- A second `yield()` within one turn is a fault, because it means a task
  did not await the first.
- A task that awaits a promise of a task that `run()` has not released
  stops the run. The documentation of `Scheduler` states this.
- `clients(n)` with n of 2 or more requires `tasks(scheduler)`, because the
  overlay does not offer threads.

### Trees of files and golden trees

```ts
export type Tree = Readonly<Record<string, Entry>>;

export class Entry {
  /** The same entry with the nine permission bits mode. */
  withMode(mode: number): Entry;
}

export function text(content: string): Entry;
export function bytes(content: Uint8Array): Entry;
export function executable(content: string): Entry;
export function directory(): Entry;
export function link(target: string): Entry;

export function workspace(seat: Seat & Cleanups, tree: Tree): string;
export function write(seat: Seat, dir: string, tree: Tree): void;
export function read(seat: Seat, path: string): string;

export function equal(seat: Seat, dir: string, want: Tree, msg: string): void;
export function contains(seat: Seat, dir: string, want: Tree, msg: string): void;
export function unchanged(seat: Seat, dir: string, fn: () => unknown, msg: string): Promise<void>;
export function absent(seat: Seat, path: string, msg: string): void;
export function isFile(seat: Seat, path: string, msg: string): void;
export function isDir(seat: Seat, path: string, msg: string): void;
export function linksTo(seat: Seat, path: string, target: string, msg: string): void;
export function hasContent(seat: Seat, path: string, want: string | Uint8Array, msg: string): void;
export function hasMode(seat: Seat, path: string, want: number, msg: string): void;
```

```ts
// golden
export function matchTree(seat: Seat, name: string, dir: string, update: boolean, ...scrubbers: Scrubber[]): void;
```

- The helpers and the assertions use Node's synchronous file API, so they
  return `void` and do not need the await guard. `unchanged` returns a
  tracked promise, because its callable may be async.
- `Cleanups` is `{ cleanup(fn: () => void): void }`. The fixture's
  `Collector` and `prop.Case` offer it, and the fixture runs the cleanups
  after the test, also after a failed one. The core does not import
  vitest.
- After writing a file, a write sets the file's mode with `chmodSync`.
  Directories get their modes after their entries, so the umask does not
  decide a mode. Node has no open relative to a directory, so each entry is
  created with the flag `wx`, after `lstatSync` has read every parent.
- Content compares as bytes. A failure states it as text when it is valid
  UTF-8, and as bytes otherwise. `text` refuses a string with a lone
  surrogate. Paths sort by `Buffer.compare` of their UTF-8 bytes.
- On Windows, a mode is not recorded, so `hasMode` faults and the
  conformance driver skips the vectors with a mode, as the definition
  permits. A link's target converts back from the backslashes and the
  `\\?\` prefix that Node writes there.
- `golden.match` and `golden.matchTree` resolve a name against
  `testdata/golden`, relative to the working directory. An update makes the
  golden directory equal the tree and deletes every entry the tree lacks,
  so the golden directory must not contain a test's input fixtures.
- The conformance driver changes the working directory for each golden
  vector, so the library's vitest configuration runs the test files in the
  pool `forks`.

### Bench

```ts
export class Contract {
  /** Runs iterations untimed before the measurement. */
  warmup(iterations: number): this;
}
```

`warmup` throws a `RangeError` for a count that is not a non-negative
integer, and for a contract that has run its body. In `measuring`, the
contract builds and consumes one input for each warm-up iteration before it
builds the measured inputs. The contract reads time from `clockOf(seat)`,
and `check` reports every ceiling that the run crossed.

### Tests and CI

- **Drivers.** A driver for each vector family runs every vector of 7.2.1
  against both surfaces where an assertion has both.
- **The completeness gate.** The gate expects 110 assertions, reads the
  four new modules, and checks every function's arity.
- **Coverage.** The coverage thresholds become 100% for lines, functions,
  branches and statements.
- **Umask.** The file tests run under the umasks 022, 027 and 077.
- **CI.** CI runs Node 26 on Linux, and adds a job each on Windows and
  macOS. `package.json` states `"node": ">=26"`.

### What fails, and where

| Event | Effect | Response |
|---|---|---|
| A test leaves an async relation, form or `files.unchanged` unawaited | The test receives no verdict | The forgotten-await guard reports it when the test ends |
| A body catches the engine's signal | The case continues past its end | Every later call of the case throws the signal again |
| A task awaits a task that `run()` has not released | `run()` waits forever | The test's timeout ends it. The documentation of `Scheduler` states the rule |
| A test runs on Node 24 | `Temporal` is undefined | `package.json` refuses Node 24. A shape with a date throws a `TypeError` that names `Temporal` |
| A suite fuzzes under vitest | No fuzzer runs | `prop.fuzz` replays the stored cases and the seed files, as the overlay states |
| A spec function throws | The search cannot continue | The check ends with a fault |
| A golden directory contains input fixtures | An update deletes them | The documentation of `golden.matchTree` states the rule |
| A test runs on Windows | A mode is not recorded | `hasMode` faults, and the driver skips the mode vectors |

### Bounds

- The search of `isLinearizable` stops at the budget of 10,000,000 steps
  per partition, at its memo limit and at its time limit.
- A property stops shrinking at 2,000 runs or 30 seconds. vitest's default
  test timeout is 5,000 ms. A suite whose properties shrink for longer sets
  `testTimeout`.
- The engine runs one case at a time, and the history search one partition
  at a time.

## Alternatives considered

### A. One definition version at a time

The library would vendor each version from 1.2.0 to 7.2.0, one after
another, and pass the gate at each.

**Why not:** CI fails a change that vendors a copy other than `main` of
assert-spec. An intermediate version would pass CI only if assert-spec
tagged each version and CI compared the copy with the tag. Each step would
also build code that a later version changes, such as `rejects`.

### B. fast-check as the engine

The forms and `forAll` would wrap fast-check.

**Why not:** the definition fixes the source, the decoding of each
generator, the shrink passes and the token. fast-check has its own, so it
would produce other inputs from the same seed and other counterexamples,
and fail the 430 property vectors.

### C. Async bodies only

Every body would be async, and the engine would await every case.

**Why not:** a synchronous body would cost an await per case, and a test
whose subject is synchronous would gain nothing. Awaiting only a returned
promise keeps both.

### D. Records in test annotations

The records would be test annotations, which vitest's reporters print.

**Why not:** an annotation throws once the test function has returned, and
the records of a test's last calls are written during its teardown.
vitest's JUnit report also states annotations and no task meta. The
overlay names the task meta for that reason.

### E. Worker threads

`prop.workers`, `history.workers` and concurrent sections would run on
worker threads.

**Why not:** a spec, a body and an action are functions, and the
structured clone that passes a message to a worker refuses a function. The
overlay limits both `workers` and offers only the section `tasks`.

### F. The asynchronous file API

The file helpers and assertions would use `fs.promises`.

**Why not:** every helper and assertion would return a promise, and a test
that forgets one `await` would lose its verdict. The synchronous API needs
no guard, and `golden` already uses it.

### G. Node 24 with a `Temporal` polyfill

The library would keep Node 24 and depend on a polyfill.

**Why not:** the polyfill would be the library's first runtime dependency.
Node 24 enters maintenance on 2026-10-20, and Node 26 becomes the LTS line
on 2026-10-28.

## Drawbacks

- **Size.** Go needed 21,002 source lines for its property engine, 6,008
  for histories and machines, about 3,100 for files and relations, and about
  2,900 for records and literals. The TypeScript work is likely between
  23,000 and 30,000 source lines, with about as many test lines.
- **Node 26.** A project on Node 24 cannot use the library.
- **Changes for callers.** `rejects` returns failure records instead of a
  message, `Failure` becomes a class, `golden.match` moves to
  `testdata/golden`, `matches` refuses patterns outside the portable
  subset, and `length` counts Unicode scalar values.
- **The definition.** Definition 7.2.1 contains 36 TypeScript skips and two
  overlay entries. A TypeScript property cannot run on a type without a
  shape file.
- **The engine's cost.** The engine computes on `bigint`. Nobody has
  measured that cost against a version on 32-bit halves.
- **Records.** Only the fixture of `@dokimi/assert/vitest` writes a test's
  records into a report.
- **Mutation testing.** dokimasia has a mutation engine for Go alone, so
  coverage is the only measure of the TypeScript tests.

## References

| What | Where |
|---|---|
| The definition, its corpus, its vectors and the overlay format | <https://github.com/dokimasia/assert-spec> |
| The table of type readers, and TypeScript's derivation from shape files | assert-spec RFC-0011, "Reading a type into a shape" |
| The call record and its encoding | assert-spec `spec/recording.md` and `spec/encoding.md` |
| The skips and limits that a language declares | assert-spec `spec/conformance.md`, "A corpus case the language cannot run" |
| The TypeScript overlay at 7.2.0 | assert-spec `overlays/typescript.json` |
| vitest sends a test's task meta with each update, and its JSON reporter writes it | vitest 4.1.11: `@vitest/runner/dist/chunk-artifact.js`, lines 2858-2866, and `vitest/dist/chunks/index.UpGiHP7g.js`, lines 3559-3584 |
| An annotation throws once the test has left its run state | vitest 4.1.11: `@vitest/runner/dist/chunk-artifact.js`, lines 2368-2371 |
| `AbortSignal.any` | <https://dom.spec.whatwg.org/#dom-abortsignal-any> |
| Node's release schedule | <https://github.com/nodejs/Release/blob/main/schedule.json>, fetched 2026-10-08 |
| Jazzer.js and its open request for vitest support | <https://github.com/CodeIntelligenceTesting/jazzer.js>, issue 343 |
| Go's implementation of the same definition | <https://github.com/dokimasia/assert-go>, RFC-0002 to RFC-0016 |
