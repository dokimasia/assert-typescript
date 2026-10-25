"use strict";
// The calls that strict mode refuses, and two that it keeps.
const { expect, test } = require("@jest/globals");

test("refuses toEqual", () => {
  expect(1).toEqual(1);
});

test("refuses toEqual under .not", () => {
  expect(1).not.toEqual(2);
});

test("refuses toEqual under resolves", async () => {
  await expect(Promise.resolve(1)).resolves.toEqual(1);
});

test("refuses toHaveLength under .not", () => {
  expect([1]).not.toHaveLength(2);
});

test("refuses toThrow", () => {
  expect(() => {
    throw new Error("no");
  }).toThrow();
});

test("keeps toBe", () => {
  expect(1).toBe(1);
});

test("adds no toThrowError where jest defines none", () => {
  const defined = require("jest/package.json").version.startsWith("29.");
  expect(typeof expect(1).toThrowError).toBe(defined ? "function" : "undefined");
});

test("keeps toMatchObject", () => {
  expect({ a: 1, b: 2 }).toMatchObject({ a: 1 });
});
