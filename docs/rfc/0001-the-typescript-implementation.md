---
rfc: 0001
title: The TypeScript assertion library
author: Roy Klopper <roy.klopper@stealthscale.io>
status: Accepted
created: 2026-08-30
updated: 2026-08-30
discussion: none
supersedes: none
superseded-by: none
produces-adr: none
---

# RFC-0001: The TypeScript assertion library

## Summary

`@dokimi/assert` implements the standardized assertion set in
TypeScript. It reads the definition, runs the corpus against both
surfaces, and declares the two assertions it cannot supply. This
records what TypeScript does differently from the other
implementations, and why each difference is forced rather than chosen.

## Motivation

The standard exists so the same test means the same thing in every
language. That only holds if each implementation is held to it, and if
the places it cannot comply are written down rather than quietly
skipped.

TypeScript pushes hardest on that, because JavaScript disagrees with
the standard in more places than Go or Python do. It has two absent
values where the standard has one. It has one number type where the
standard has two. Its equality operator says two objects with the same
fields are different. And a promise nobody awaits is a way to skip an
assertion that no type checker reports.

## Detailed design

### Modules

```
@dokimi/assert            check, soft, seats, options, rejects
@dokimi/assert/vitest     the seat fixture
@dokimi/assert/conformance  this library checked against the standard
```

The core has no runner dependency. Importing the Vitest entry point is
what pulls Vitest in, so a project on another runner constructs a seat
itself.

### check and soft, not check and expect

Every test runner defines a global called `expect`. Naming the
recording surface `expect` would shadow it in any file importing both,
and a reader would have to know which one a call meant.

`soft` is the word the ecosystem already uses: `expect.soft` in Vitest
records a failure and carries on, which is exactly this surface. It is
borrowed rather than invented.

### The seat, and three of them

```ts
interface Seat {
  helper(): void;
  fail(message: string): void;
  record(message: string): void;
}
```

An interface rather than a base class, so anything with the three
methods is a seat.

Which seat a test holds decides what each surface does:

| Seat | `check` | `soft` |
|---|---|---|
| `Collector` | throws | collects, thrown when the test ends |
| `Standard` | throws | throws |
| `Recorder` | collects | collects |

`Standard.record` throws rather than dropping the failure: a recorded
failure needs somewhere to report at the end, and a bare seat has no
end to report at.

`Collector` is what a real test wants, and it is why the adapter
exists. Something has to throw what it collected once the body is done,
and only the runner knows when that is. Vitest's `test.extend` gives a
fixture that runs after the body, which is where `flush` goes.

### Cancellation is AbortSignal

Go states cancellation with a `context.Context` in every signature.
JavaScript's equivalent is `AbortSignal`: `fetch` takes one, so do the
stream APIs, `events.once` and `setTimeout`. A subject that can be
cancelled at all takes one.

So `honoursCancellation` hands the subject a signal that is already
aborted and requires it to reject with a cancellation. Rejecting with
something else fails: the subject failed for its own reasons and
happened to do so in time, which is not the same as honouring the
signal.

`nullHandleSafe` passes `undefined` in place of the signal. Rejecting
with an error of its own passes; dereferencing the missing signal is
what fails, and that is what a caller hits by accident.

### The forgotten await

Seven assertions answer a promise. A caller who forgets to await one
gets a green test that asserted nothing, and TypeScript reports
nothing: the value was used, it was simply used as a promise.

Tracking whether the work is still running does not catch it. A test
body that awaits anything at all lets a dropped assertion settle, and
on an aborting seat its failure was thrown inside a promise nobody
holds, so the evidence is gone before the test ends.

What is tracked instead is whether the caller ever took the result. The
returned promise notes when `then` is called, which is what `await`,
`.then`, `.catch` and `.finally` all do, and `flush` reports anything
never touched.

That requires a `Promise` subclass. `await` on a plain promise takes a
fast path that reads internal slots and never calls a patched `then`;
subclassing takes that path away.

### Equality

`===` answers a different question, and so does a deep equal built on
it. The comparison here is structural and reaches arrays, plain
objects, `Map`, `Set`, `Date`, `RegExp` and `Error`. Different shapes
never compare, and a cycle stops the walk rather than overflowing.

Two of the standard's equality rules need no work in JavaScript that
they need in Python. `0` does not equal `false` under `===`, and `null`
does not equal `[]`. The rule that does need care is NaN, which `===`
already says is unequal to itself and which a naive `Object.is` would
reverse.

The standard says values of different types never compare. JavaScript
has one number type, so `1` and `1.0` are the same value and no corpus
case can tell them apart. Nothing in the corpus asks it to: every case
mixing int and float is a numeric assertion where both pass.

### What the corpus reaches

Seventy cases across seventeen assertions, run against both surfaces.
The other twenty-four take a callable, a signal or a timeout, and no
corpus file can hold one, so they are covered by tests here and by the
completeness gate.

### Two assertions are declared, not implemented

`bench.Contract.maxAllocs` and `maxBytes` state ceilings on allocation
per iteration. V8 exposes no per-iteration allocation count, and bytes
can only be read as a heap-usage delta that moves with whether the
collector ran. Measuring one unchanged body six times gave 43, -3, 43,
-10, -10 and -8 bytes per iteration.

A ceiling set from one of those runs fails the next for no reason, so
implementing them would ship an assertion that flakes. The overlay
records the gap with that measurement as the reason, which is what the
mechanism is for: a gap nobody could close and a gap nobody got to look
identical until someone writes down which it is.

This is the first overlay in the standard with anything in it.

### rejectsWith is an addition

The standard states `throws` for a callable that raises. In JavaScript
a rejected promise is a different mechanism, and `throws` cannot cover
it: the assertion would have to answer a promise, which is a different
signature.

So `throws` refuses a callable that answers a promise rather than
passing it, and `rejectsWith` is the asynchronous counterpart. It is
the one member on either surface the naming table does not name.

## Alternatives considered

### A. Name the recording surface `expect`

Matches Python exactly. Rejected because it collides with the global
every runner defines, and the collision is silent: both are callable
and both are about assertions.

### B. Ship a runner-agnostic core with no adapter

Rejected because the recording surface does not work without something
that runs at the end of a test. A library that ships `soft` and no way
to report what it collected has shipped half a feature.

### C. Implement the allocation ceilings from heap deltas

Rejected on the measurement above. An assertion that fails at random is
worse than one that is absent, because the absent one is recorded and
the flaky one teaches people to rerun the suite.

### D. Use TypeScript's compiler API for the README reference

Rejected because TypeScript 7 moved that API under `unstable`. The
emitted declarations are stable, are what a consumer's editor reads,
and need no parser.

## Drawbacks

The forgotten-await guard costs a `Promise` subclass and a register
keyed by seat. That is about 90 lines, and it only reports for seats
that get flushed, so a `Recorder` used directly is not covered.

`soft` is a third name for a concept the other implementations call
`expect`. Someone moving between the libraries has to learn it.

Two assertions are absent. A team relying on allocation ceilings in Go
cannot port those tests.

## Unresolved and future work

Adapters for other runners are not proposed here. What Vitest gives and
a bare runner does not is a hook that runs after the test body, and any
runner with one can have an adapter of a dozen lines.

## References

- The standard, its corpus and the overlay format:
  <https://github.com/dokimasia/assert-spec>
- `AbortSignal`, WHATWG DOM Standard section 3.2:
  <https://dom.spec.whatwg.org/#interface-AbortSignal>
- Vitest's soft assertions:
  <https://vitest.dev/api/expect.html#soft>
