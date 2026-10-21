// Seven calls of jest's equality matchers. Three of them get another
// verdict from the standard's equality, and one fails in jest.
const { expect, test } = require("@jest/globals");

test("agrees on equal records", () => {
  expect({ a: 1 }).toEqual({ a: 1 });
});

test("disagrees on a field that is undefined", () => {
  expect({ a: undefined, b: 1 }).toEqual({ b: 1 });
});

test("disagrees on negative zero", () => {
  expect(-0).not.toEqual(0);
});

test("disagrees on NaN", () => {
  expect([Number.NaN]).toEqual([Number.NaN]);
});

test("agrees on a class under toStrictEqual", () => {
  expect(new Map([["a", 1]])).toStrictEqual(new Map([["a", 1]]));
});

test("skips an asymmetric matcher", () => {
  expect({ at: new Date(0) }).toEqual({ at: expect.any(Date) });
});

test("fails a call that both fail", () => {
  expect(1).toEqual(2);
});
