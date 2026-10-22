---
rfc: 0006
title: Definition 10.0.0 in TypeScript
author: Roy Klopper <roy.klopper@stealthscale.io>
status: Accepted
created: 2026-10-22
updated: 2026-10-22
discussion: none
depends-on: assert-spec RFC-0033, assert-spec RFC-0034, assert-spec RFC-0035, assert-spec RFC-0036
supersedes: none
superseded-by: none
produces-adr: none
---

<!--
  ~ Copyright Dokimasia B.V. 2026
  ~ SPDX-License-Identifier: MIT
-->

# RFC-0006: Definition 10.0.0 in TypeScript

## Summary

The library moves from definition 9.0.0 to 10.0.0. These changes of the
definition apply to TypeScript:

- **Faults through the seat.** A seat may state `reportFault`. The library
  passes each fault of its own to that member, and throws the fault for a
  seat without it. `fault` ends the call of a helper the same way, and a
  `Recorder` keeps each fault in `faults`.
- **A check that ends with a fault.** `doesReject` ends with the fault
  that ends its check.
- **The values of a seed.** `prop.values` returns the values of a
  generator for a seed.
- **Whether a run checks allocation ceilings.** `allocsChecked` returns
  false and the reason.

The definition also counts an allocation ceiling ten times at most. That
change does not apply, because the overlay declares `max-allocs` absent.
The overlay limits `prop.using` to the property forms, so a run of
`forAll` and `fuzz` still refuses the option.

## Motivation

The completeness gate fails on every row of the naming table that the
library neither offers nor declines. Definition 10.0.0 adds the rows
`seat.report-fault`, `recorder-seat.faults`, `fault`, `allocs-checked` and
`prop.values`, so the library cannot vendor 10.0.0 without them.

## Detailed design

### The seat

```ts
interface Seat {
  /**
   * Receives a fault. ending is true for an error that ends the call
   * without a verdict, and false for one that the call notes and runs on
   * past.
   */
  reportFault?(fault: Error, ending: boolean): void;
}
```

| Fault | A seat with `reportFault` | A seat without it |
|---|---|---|
| A fault that ends the call | `reportFault(fault, true)` | The library throws the fault |
| A fault that the call notes | `reportFault(fault, false)` | `console.warn` of the fault's message |

The library passes a fault that is not an `Error` to the seat as an
`Error` whose message is its text. A `Standard` and a `Collector` seat state no
`reportFault`, so a fault of the library stops their test with the fault
itself, in place of an `AssertionFailed` with its text. A `Recorder`
keeps the fault, and fails with its text as before.

### The helper

```ts
/**
 * Ends the call of a helper with error, a fault. It passes error to
 * seat.reportFault with ending true, and throws error for a seat without
 * the member. It does not write a call record.
 */
export function fault(seat: Seat, error: Error): void;
```

### The recorder

```ts
class Recorder {
  /** Keeps fault. A fault with ending true fails the recorder with its message. */
  reportFault(fault: Error, ending: boolean): void;
  /** Every fault that arrived through reportFault, in call order. */
  get faults(): readonly Error[];
}
```

### A check that ends with a fault

The seat of the check that `doesReject` drives states `reportFault`:

- A fault with `ending` true ends the check, and the seat keeps it.
- A noted fault passes to the seat of `doesReject` as a noted fault.

`doesReject` ends its call with a kept fault. Its call record states the
verdict `error`, and `doesReject` passes the fault to its own seat as
`fault` passes it. The promise resolves to an empty list on a seat that
takes the fault, and rejects with the fault on any other seat.

The seat of an attempt of `eventually` states `reportFault` as well, and
an ending fault fails the attempt. The text of the fault through `fail`
failed it in the same way before.

### The values of a seed

```ts
/**
 * Returns n values of generator for seed: the values of the random cases
 * of seed, in order, without the cases that the generator rejects.
 *
 * @throws RangeError for an n that is no whole number of 0 or more, and
 *   for a seed outside [0, 2^64).
 * @throws Error when the generator rejects more than 10n cases.
 */
export function values<T>(generator: Generator<T>, seed: bigint | number, n: number): T[];
```

Case k decodes from the source of seed + k, as the runner of the
generation vectors decodes it.

### Whether a run checks allocation ceilings

```ts
/** Returns false and the reason: V8 does not expose an allocation count. */
export function allocsChecked(): { readonly checked: boolean; readonly reason: string };
```

### Version

Every call record and store entry states `"definition": "10.0.0"`.

## Alternatives considered

### A. The text of a fault through fail

The library would keep sending the text of a fault through `fail` of a
seat without `reportFault`.

**Why not:** the definition states that the library throws the fault for
such a seat. A test that runs on a `Standard` seat would otherwise see an
`AssertionFailed` for a fault, and could not tell a fault from a failure.

### B. A reportFault on every seat of the library

`Standard` and `Collector` would state `reportFault`, and throw the fault
in it.

**Why not:** the outcome is the throw of the library for a seat without
the member. A seat of a caller's own needs that throw in any case.

## Drawbacks

- A test that expects an `AssertionFailed` for a fault of the library now
  receives the fault itself.
- `allocsChecked` always returns false.
- A `doesReject` whose check ended with a fault passed before, and now
  ends with the fault.

## References

| What | Where |
|---|---|
| The member, the helper and the recorder | assert-spec RFC-0033, "Faults through the seat" |
| A check that ends with a fault | assert-spec RFC-0034, "A check that ends with a fault" |
| The values of a seed | assert-spec RFC-0035, "The values of a generator for a seed" |
| Whether a run checks allocation ceilings | assert-spec RFC-0036, "Whether a run checks allocation ceilings" |
