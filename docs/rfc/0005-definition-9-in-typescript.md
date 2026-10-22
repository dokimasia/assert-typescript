---
rfc: 0005
title: Definition 9.0.0 in TypeScript
author: Roy Klopper <roy.klopper@stealthscale.io>
status: Accepted
created: 2026-10-20
updated: 2026-10-22
discussion: none
depends-on: assert-spec RFC-0013, assert-spec RFC-0031
supersedes: none
superseded-by: none
produces-adr: none
---

<!--
  ~ Copyright Dokimasia B.V. 2026
  ~ SPDX-License-Identifier: MIT
-->

# RFC-0005: Definition 9.0.0 in TypeScript

## Summary

The library moves from definition 8.0.0 to 9.0.0. Definition 8.1.0 adds
the property option `around`, and 9.0.0 renames nine TypeScript names of
assertions. The definition leaves two choices to each language:

- **The wrapper.** `prop.around` takes a function of `run` alone, because
  the environments of TypeScript take no test. `run` returns a promise
  that settles after the body and its cleanups end, and never rejects.
- **The names.** The function forms of `check` and `soft` take the names
  of 9.0.0, and so do the property forms. Every record states the
  definition 9.0.0.

```ts
await prop.forAll(seat, "a retry waits for its backoff", body, prop.around(async (run) => {
  vi.useFakeTimers();
  try {
    await run();
  } finally {
    vi.useRealTimers();
  }
}));
```

## Motivation

The completeness gate fails on every row of the naming table that the
library neither offers nor declines. Definition 9.0.0 has the row
`prop.around` and the nine renamed rows, so the library cannot vendor
9.0.0 without them.

vitest's fake timers replace the timer functions until `useRealTimers`.
A property whose body waits on a timer runs every case under one set of
fake timers when the test enters them around the whole property. A timer
that one case leaves then fires during the cases after it. A wrapper
that enters the fake timers for each run gives each run timers of its
own.

## Detailed design

### The option

```ts
/**
 * A wrapper of the runs of a property's body. It calls run once inside an
 * environment that it chooses, and settles after the promise of run
 * settles. That promise settles after the body and its cleanups end, and it
 * never rejects.
 */
export type Wrapper = (run: () => Promise<void>) => void | Promise<void>;

/** Runs each run of the body inside wrapper. Given more than once, the last wrapper applies. */
export function around(wrapper: Wrapper): Option;
```

`prop.forAll`, `prop.fuzz` and every property form take the option. The
wrapper runs every run of the body: the case of `draws`, each stored
case, each generated case, each shrink candidate, each filling that
explains a draw, each case of a campaign, the case of `replay` and the
case of each fuzz input. The engine's own work runs outside it, such as
the store, the shrinker's choice of the next candidate and the limit of
`shrinkTime`.

`run` takes no test, so the signal of each case derives from the signal
of the property's seat, as it does without the option.

### The verdict and the faults

The case's verdict comes from the body's records. The promise of `run`
resolves for a failing case too. A wrapper that awaits `run` inside
`try` and `finally` cannot change the verdict.

| Wrapper | Effect |
|---|---|
| Returns without calling `run` | The call ends with the fault `around: the wrapper returned without calling run` |
| Calls `run` a second time | The second call runs nothing, and the call ends with the fault `around: the wrapper called run more than once` |
| Throws, or returns a promise that rejects | The call ends with the fault `around: the wrapper threw`, with the error's text after it |
| Returns before the promise of `run` settles | The engine waits for the body and its cleanups before the next case |
| Calls `run` after it settled | The call runs nothing |

### The names

Definition 9.0.0 renames nine assertions in TypeScript. The function
forms, the soft forms and the property forms take the new names, and the
old names are gone:

| Id | 8.0.0 | 9.0.0 |
|---|---|---|
| `equal` | `equal` | `isEqualTo` |
| `not-equal` | `notEqual` | `isNotEqualTo` |
| `contains` | `contains` | `doesContain` |
| `not-contains` | `notContains` | `doesNotContain` |
| `length` | `length` | `hasLength` |
| `matches` | `matches` | `doesMatch` |
| `close-to` | `closeTo` | `isCloseTo` |
| `throws` | `throws` | `doesThrow` |
| `rejects` | `rejects` | `doesReject` |

That is 26 exported functions of `check` and `soft`, and the eight
property forms `prop.isEqualTo`, `prop.isNotEqualTo`, `prop.hasLength`,
`prop.doesContain`, `prop.doesNotContain`, `prop.doesMatch`,
`prop.isCloseTo` and `prop.doesThrow`. The ids, the records and the
sentences do not change.

### Version

The library vendors definition 9.0.0, and every call record and store
entry states `"definition": "9.0.0"`.

## Alternatives considered

### A. A wrapper of Go's type

Go's wrapper is `func(t *testing.T, run func(*testing.T))`, the type of
`synctest.Test`. A TypeScript wrapper would take the test's context and
hand `run` a context.

**Why not:** vitest's and jest's environments, such as the fake timers,
take no test. A context would be one more argument that no environment
reads. A seat that is no test, such as a `Recorder`, has no context to
hand over.

### B. A `run` that rejects for a failing case

`run` would reject with the case's failure. A body that fails throws in
the same way.

**Why not:** a wrapper that awaits `run` without `try` would then reject.
The engine would read the rejection as a fault of the wrapper. The
definition requires that the verdict come from the body's records, and a
`run` that resolves keeps it there.

### C. A wrapper's error as the case's failure

An error that the wrapper throws would fail the case. An error of the
body fails it in the same way.

**Why not:** an error of the wrapper comes from the environment and not
from the subject. A failing case shrinks, and a shrink of a case that
fails in its environment searches for an input that the error does not
depend on.

## Drawbacks

- Each run of the body under the option costs a call of the wrapper and
  one more promise.
- A wrapper that never settles stalls the run, because the engine waits
  for it.
- The renames break every caller of the 26 functions and the eight forms.
  No release contains the old names.

## References

| What | Where |
|---|---|
| The option and its rules | assert-spec RFC-0031, "A wrapper around each run of a property" |
| The renamed TypeScript names | assert-spec RFC-0013, "TypeScript names free on vitest's expect" |
| vitest's fake timers | The declarations of `VitestUtils` in vitest 4.1.11 |
