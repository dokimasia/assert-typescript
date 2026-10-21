// Calls matchers on the global expect of @types/jest, and marks each call
// that the declarations must refuse. tsc compiles it, and nothing runs it.
import "@dokimi/assert/jest";

export async function probe(): Promise<void> {
  expect(1).isEqualTo(1, "m");
  // @ts-expect-error: the want of isEqualTo has the type of the subject
  expect(1).isEqualTo("1", "m");
  expect([1, 2]).pairwise((a, b) => a < b, "m");
  await expect(() => undefined).completesWithin(50, "m");
  await expect(Promise.resolve(1)).resolves.isEqualTo(1, "m");
  expect.soft(1).isEqualTo(1, "m");
  // @ts-expect-error: soft holds the want to the type of the subject as well
  expect.soft(1).isEqualTo("1", "m");
}
