// Calls every matcher once on vitest's chain, and marks each call that
// the declarations must refuse. tsc compiles it, and nothing runs it.
import { expect } from "vitest";

export async function probe(): Promise<void> {
  expect(1).isEqualTo(1, "m");
  // @ts-expect-error: the want of isEqualTo has the type of the subject
  expect(1).isEqualTo("1", "m");
  expect(1).isNotEqualTo(2, "m");
  expect(true).isTrue("m");
  expect(false).isFalse("m");
  expect(null).isNil("m");
  expect(1).isNotNil("m");
  expect([1]).hasLength(1, "m");
  expect([]).isEmpty("m");
  expect([1]).isNotEmpty("m");
  expect([1]).doesContain(1, "m");
  expect([1]).doesNotContain(2, "m");
  expect("ab").containsInOrder(["a", "b"], "m");
  expect("ab").hasPrefix("a", "m");
  expect("ab").hasSuffix("b", "m");
  expect("ab").doesMatch("^a", "m");
  expect(1).isCloseTo(1, 0.5, "m");
  expect(1).inRange(0, 2, "m");
  expect([1, 2]).pairwise((a, b) => a < b, "m");
  // @ts-expect-error: the predicate of pairwise takes the elements of the subject
  expect([1, 2]).pairwise((a: string, b: string) => a < b, "m");
  expect(null).noError("m");
  expect(new Error("e")).hasError("m");
  expect(new Error("e")).errorIs(Error, "m");
  expect(new Error("e")).errorIsNot(TypeError, "m");
  expect(new Error("e")).errorAs(Error, "m");
  expect(() => {
    throw new Error("e");
  }).doesThrow("m");
  expect(() => 1).doesNotThrow("m");
  expect([1, 2]).isPermutation([2, 1], "m");
  await expect(() => undefined).doesReject("m");
  await expect(() => Promise.reject(new Error("e"))).rejectsWith("m");
  await expect((signal: AbortSignal) => Promise.resolve(signal)).honoursCancellation(
    "m",
  );
  await expect((signal: AbortSignal) => Promise.resolve(signal)).honoursDeadline("m");
  await expect(() => undefined).completesWithin(50, "m");
  await expect(() => undefined).nullHandleSafe("m");
  await expect(() => undefined).isPure(() => 0, "m");
  await expect(() => undefined).isNotPure(() => 0, "m");
  await expect(() => undefined).eventually(50, 10, "m");
  await expect(() => true).eventuallyTrue(50, "m");
  await expect(() => undefined).noTaskLeaks("m");
  await expect((x: number) => x).isIdempotent(1, () => 0, "m");
  // @ts-expect-error: the input of isIdempotent has the type of the parameter of the subject
  await expect((x: number) => x).isIdempotent("1", () => 0, "m");
  await expect((x: number) => x).accumulates(1, () => 0, "m");
  await expect((x: number) => x).isDeterministic(1, "m");
  await expect((a: number, b: number) => a + b).isCommutative(1, 2, "m");
  await expect((a: number, b: number) => a + b).isAssociative(1, 2, 3, "m");
  await expect((x: number) => String(x)).roundTrip((text) => Number(text), 1, "m");
  await expect(() => [1, 2]).hasStableOrder("m");
  await expect(() => [1, 2]).noDuplicates("m");
  await expect(() => 0).isMonotonic(() => undefined, 3, "m");
  await expect((x: number) => x).isTotal([1, 2], "m");
  await expect(() => undefined).failsAfterClose(() => undefined, Error, "m");
  await expect(() => undefined).isPoisoned(() => undefined, "m");
  await expect(Promise.resolve(1)).resolves.isEqualTo(1, "m");
  expect.soft(1).isEqualTo(1, "m");
  // @ts-expect-error: soft holds the want to the type of the subject as well
  expect.soft(1).isEqualTo("1", "m");
  expect(1).not.isEqualTo(2, "m");
}
