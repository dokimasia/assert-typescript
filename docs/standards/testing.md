# Testing

A test specifies behaviour that a caller can observe. Every rule in
this document applies to every module of the package, the internal ones
included. A change brings each test file that it touches up to these
rules.

## Black-box tests

- A test imports a module and calls only what the module exports.
- A module does not export a name for its tests alone. Such an export
  declares an API that only the tests can call.
- An internal module's API is what it exports to the rest of the
  package. Its tests are black-box tests of that API.
- A test does not read a member that a module's types keep private,
  through a cast or otherwise.

## One spec per source file

- A source file `src/a/b.ts` has its spec `tests/a/b.test.ts`. The spec
  tests the behaviour that `b.ts` implements, through the module's
  exports.
- The tests of one source file's behaviour are all in its spec.
- Every source file has a spec. The spec of a module that re-exports
  names checks the names that the module exports.
- npm publishes `README.md` with the package, and `tests/readme.test.ts`
  is its spec. It runs the README's examples, and it compares the README's
  counts and its API reference with the code.
- A test file without a file of its name does not exist, except
  `tests/helpers.ts`.
- The scripts under `tools/` are not part of the package and have no
  spec.

## Helpers

- `tests/helpers.ts` contains the helpers, types and fixtures that more
  than one spec uses.
- A helper that one spec uses is declared in that spec.

## Names

- The outer `describe` of a spec is named after the module, as the name
  of its source file spells it: `describe("calls", …)` in
  `tests/record/calls.test.ts`.
- A `describe` of the second level is named after the export under
  test. A function is named as `encode`, a method or a getter as
  `Recorder.flush`, and a constructor as `new Recorder`. A case about
  the module as a whole, such as the names that it exports, is directly
  inside the outer `describe`.
- Each `it` inside it is one case, and its name states one behaviour.
  The name starts with a verb in the third person, then states the
  result and the condition, as `returns the int literal of a safe
  integer`. Together with the name of its `describe`, it reads as a
  sentence.
- A case's name is one clause, without a second clause after "and" or
  after a comma. It never starts with "should", and it never contains
  "test", "correctly", "properly" or "as expected".
- A table of cases is an array named `tests`, and each case is `tt`.
  Besides the case's `name`, its fields start with `give` and `want`.
  The spec declares one `it` for each case, and the case's name is the
  name of the `it`.

## Determinism and isolation

- vitest runs each spec in a worker of its own, so the specs run in
  parallel and do not share module state. The cases of one spec run in
  order.
- A case that changes state of the whole process restores the state
  before it ends. Examples are an environment variable, the reading of
  `DOKIMI_ASSERT_RECORD`, and the working directory.
- A run is the same on every machine. Seeds are fixed, and no result
  depends on the local time zone.
- A case whose subject waits, retries or measures gives the seat a
  `Controlled` clock, so the case does not spend real time. A case whose
  subject reads the platform clock sets a ceiling of 0 for a body that
  sleeps.
- A test waits on a promise or a signal, never on a sleep.
- A test writes files in a workspace of `files.workspace`, which the
  fixture removes, or under a directory that it creates in `os.tmpdir()`
  and removes with `onTestFinished`. No test calls the network.
- A case that checks the modes that a write sets runs under the umasks
  0o022, 0o027 and 0o077. A case that needs a permission to cause an
  error is skipped on Windows and for root, where no permission does.
- A case that changes the working directory restores it when it ends.
  vitest runs the specs in the pool `forks`, because a worker thread
  cannot change its working directory.

## Coverage

- The black-box tests cover 100% of the statements, branches, functions
  and lines of every module under `src/`.
- Code that no black-box test can execute is dead code or a missing
  test. Delete the code, or write the test that executes it.
- No file is excluded from coverage, no line has an ignore comment of a
  coverage tool, and no threshold is lower than 100%.

## Mutation

- dokimasia has a mutation engine for Go alone, so coverage is the only
  measure of these tests.
- A new check proves by the construction of its test that it can fail.
  The test asserts the field or the error that separates the failure
  from its neighbours. A gate, a validator and a comparison of the
  conformance runner are such checks.

## Benchmarks and allocation ceilings

- No spec measures an export of the package. V8 does not expose an
  allocation counter per iteration, so the overlay declines the
  definition's allocation ceilings. A latency ceiling of the package's
  own code would depend on the machine.

## Fuzzing

- A function that decodes bytes or text from outside the program has a
  fuzz target in its spec, a property of `prop.fuzz`. The decoders of
  typed literals, tokens, store entries, JSON text and shape files, and
  the parser of patterns, are such functions.
- vitest replays every stored case of a target. A fuzzing campaign runs
  on demand, with a fuzzer that the campaign installs, because the
  package depends on none.

## Verdicts

- The specs of `src/matcher/`, of the surfaces `src/check.ts` and
  `src/soft.ts`, of the seats in `src/seat.ts`, of the fixture in
  `src/vitest.ts`, of the corpus in `src/conformance/corpus.ts`, and of
  the vectors in `src/conformance/vector.ts`, `src/conformance/files.ts`,
  `src/conformance/prop/vectors.ts`, `src/conformance/history/vectors.ts`
  and `src/conformance/stateful/vectors.ts` use vitest's `expect` alone.
  These modules compare the values, decide the verdict, and deliver it to
  the test, so a defect in them could pass a test that is written with
  the library.
- The verdicts of the corpus compare a value with `canonical` of
  `src/conformance/literal.ts`. The verdicts of the vectors compare JSON
  with `sameJson` of the same module: the JSON of a call record or of the
  events of a history, or the outputs that the property engine computes.
  Neither uses the library's comparison.
- Every other test uses the library's assertions on the seat that the
  fixture of `src/vitest.ts` supplies.
- A test compares the values that the library reports: a failure's
  record in `Recorder.failures`, a call record in `Recorder.records`,
  and the text of a fault. It compares a failure's sentence only where
  the sentence is the subject: in the specs of `render`, of the seats and
  of the README, and on a seat that takes no records.

## Test data

- Test data is stored under a `testdata` directory beside the spec that
  reads it, as `tests/pattern/testdata/verdicts.json`.
- Each entry of `tests/pattern/testdata/verdicts.json` is the verdict of
  the definition's reference parser, `tools/prop/pattern.py` of
  assert-spec, on the entry's pattern.
- A golden file is stored under `testdata/golden` of the project, where
  `golden.match` resolves a name. `DOKIMI_ASSERT_UPDATE_GOLDEN=1`
  rewrites it.
- The vendored definition is stored under `src/conformance/spec`.
  `npm run spec:sync` refreshes it, and nobody edits it by hand.

## Enforcement

A tool checks a rule wherever one can. Review checks every other rule.

| Rule | Checked by |
|---|---|
| Formatting and lint | `biome`, through `npm run lint` |
| 100% coverage of every module | The thresholds of `vitest.config.ts`, through `npm run coverage` |
| The public names match the definition's naming table | The completeness gate in `tests/index.test.ts` |
| The README matches the code | `tests/readme.test.ts` |
| Every other rule of this document | Review |
