/**
 * Rendering a value into a failure message.
 *
 * A failure is read by someone who cannot see the value, so the text
 * has to carry it. `String(value)` gives `[object Object]`, which says
 * nothing at all.
 */

import { expect, it } from "vitest";
import { show } from "../src/matcher/inspect.js";

it("quotes a string, so an empty one is visible", () => {
  expect(show("")).toBe('""');
  expect(show("hi")).toBe('"hi"');
});

it("names the two absent values apart", () => {
  expect(show(null)).toBe("null");
  expect(show(undefined)).toBe("undefined");
});

it("renders the numbers that have no ordinary spelling", () => {
  expect(show(Number.NaN)).toBe("NaN");
  expect(show(Number.POSITIVE_INFINITY)).toBe("Infinity");
  expect(show(-0)).toBe("0");
});

it("marks a bigint and a symbol as themselves", () => {
  expect(show(10n)).toBe("10n");
  expect(show(Symbol("tag"))).toBe("Symbol(tag)");
});

it("names a function, or says it has no name", () => {
  function named(): void {}
  expect(show(named)).toBe("[function named]");
  expect(show(() => undefined)).toContain("function");
});

it("shows the entries of a Map and a Set", () => {
  expect(show(new Map([["a", 1]]))).toBe('Map(1) {"a" => 1}');
  expect(show(new Set([1, 2]))).toBe("Set(2) {1, 2}");
});

it("renders a Date as an instant and a RegExp as itself", () => {
  expect(show(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
  expect(show(/x/g)).toBe("/x/g");
});

it("renders an Error as its name and message", () => {
  expect(show(new TypeError("boom"))).toBe("TypeError: boom");
});

it("renders a plain object's entries", () => {
  expect(show({ a: 1, b: "two" })).toBe('{a: 1, b: "two"}');
});

it("stops descending rather than printing a whole tree", () => {
  expect(show({ a: { b: { c: { d: 1 } } } })).toContain("…");
});

it("cuts a long value and marks the cut", () => {
  const long = show("x".repeat(500));

  expect(long.endsWith("…")).toBe(true);
  expect(long.length).toBeLessThan(250);
});

it("renders an array by rendering its items", () => {
  expect(show([1, "two", null])).toBe('[1, "two", null]');
});

it("renders a boolean and a plain number", () => {
  expect(show(true)).toBe("true");
  expect(show(1.5)).toBe("1.5");
});
