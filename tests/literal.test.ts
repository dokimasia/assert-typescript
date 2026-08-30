/**
 * Turning a corpus case's typed literals into native values.
 *
 * The refusals matter most. A literal this cannot decode has to stop
 * the run, because the alternative is a case that quietly becomes an
 * empty list and passes having tested nothing.
 */

import { expect, it } from "vitest";
import { decode } from "../src/conformance/literal.js";

it("decodes the scalars", () => {
  expect(decode({ type: "null" })).toBe(null);
  expect(decode({ type: "bool", value: true })).toBe(true);
  expect(decode({ type: "int", value: 42 })).toBe(42);
  expect(decode({ type: "float", value: 1.5 })).toBe(1.5);
  expect(decode({ type: "string", value: "hi" })).toBe("hi");
});

it("decodes the floats JSON cannot spell", () => {
  expect(decode({ type: "float", value: "NaN" })).toBeNaN();
  expect(decode({ type: "float", value: "Inf" })).toBe(Number.POSITIVE_INFINITY);
  expect(decode({ type: "float", value: "-Inf" })).toBe(Number.NEGATIVE_INFINITY);
});

it("refuses a float it does not recognise", () => {
  expect(() => decode({ type: "float", value: "huge" })).toThrow("unknown float");
});

it("refuses a type the encoding does not define", () => {
  expect(() => decode({ type: "decimal", value: 1 })).toThrow("unknown literal type");
});

it("decodes a list, and a null one", () => {
  expect(decode({ type: "list", of: "int", value: [1, 2] })).toEqual([1, 2]);
  expect(decode({ type: "list", of: "int", value: null })).toBe(null);
});

it("refuses a list with no element type", () => {
  // An empty list would decode without ever reading `of`, so a gap in
  // the encoding would pass unnoticed exactly where nothing else
  // catches it.
  expect(() => decode({ type: "list", value: [] })).toThrow("states no of");
});

it("refuses a list whose element type is not a scalar", () => {
  expect(() => decode({ type: "list", of: "list", value: [] })).toThrow(
    "which is not a scalar",
  );
});

it("refuses a list whose value is not an array", () => {
  expect(() => decode({ type: "list", of: "int", value: 1 })).toThrow("not an array");
});

it("decodes a map into a Map, which keeps its key types", () => {
  const decoded = decode({ type: "map", key: "string", of: "int", value: { a: 1 } });

  expect(decoded).toBeInstanceOf(Map);
  expect((decoded as Map<string, number>).get("a")).toBe(1);
});

it("decodes a null map", () => {
  expect(decode({ type: "map", key: "string", of: "int", value: null })).toBe(null);
});

it("refuses a map with no key type", () => {
  expect(() => decode({ type: "map", of: "int", value: {} })).toThrow("states no key");
});

it("refuses a map whose value is not an object", () => {
  expect(() => decode({ type: "map", key: "string", of: "int", value: [1] })).toThrow(
    "not an object",
  );
});
