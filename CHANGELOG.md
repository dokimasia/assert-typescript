# @dokimi/assert

## 0.3.0

### Minor Changes

- 7872743: **Breaking:** End the call of a property with the fault that ends a call in one of its cases.
- ec7341f: Implement definition 12.0.0 and write its version into every call record.
- 9a786ef: Implement definition 12.1.0 and write its version into every call record.
- d0b4007: Implement definition 12.2.0 and write its version into every call record.
- 7872743: Implement definition 13.0.0 and write its version into every call record.
- 9a786ef: Add `skip` to the seat of the check of `doesReject`, and end the call as skipped when the check skips before it fails.
- 9a786ef: Add the optional member `skip` to `Seat`.
- 9a786ef: Write the reason of every skip into the field `reason` of its call record.

## 0.2.0

### Minor Changes

- f152ae6: Add `Case.skip` to end the run of a property as skipped and skip a test of the vitest fixture.
- f152ae6: Implement definition 11.0.0 and write its version into every call record.

### Patch Changes

- 88c87b9: Declare `@jest/globals`, which the jest entry point imports, as an optional peer dependency.
- 0302427: Declare the members of `Seat` and `Clock` as property signatures.
