/** The record a failing assertion reports, and the sentence it renders to. */

import { describe, expect, it } from "vitest";
import { type Failure, render } from "../src/failure.js";
import { check } from "../src/index.js";
import { Recorder } from "../src/seat.js";

describe("render", () => {
  it("answers the contract alone when nothing is carried", () => {
    const held: Failure = {
      assertion: "true",
      contract: "the flag is set",
      detail: {},
    };

    expect(render(held)).toBe("the flag is set");
  });

  it("says want before got", () => {
    const held: Failure = {
      assertion: "length",
      contract: "every item comes back",
      detail: { got: 2, want: 3 },
    };

    expect(render(held)).toBe("every item comes back: want 3, got 2");
  });

  it("puts a field it does not know after the ones it does", () => {
    const held: Failure = {
      assertion: "made-up",
      contract: "the contract",
      detail: { zebra: 1, got: 2, apple: 3 },
    };

    expect(render(held)).toBe("the contract: got 2, apple 3, zebra 1");
  });

  it("quotes text so an empty string is visible", () => {
    const held: Failure = {
      assertion: "has-prefix",
      contract: "the line names the method",
      detail: { got: "", prefix: "GET " },
    };

    expect(render(held)).toBe('the line names the method: got "", prefix "GET "');
  });
});

describe("a reported failure", () => {
  it("carries the call site the assertion was written on", () => {
    const seat = new Recorder();
    check.equal(seat, 1, 2, "the values match");

    const where = seat.failures[0]?.where;
    expect(where, "the record carries a call site").toBeDefined();
    expect(where?.file).toContain("failure.test.ts");
    expect(where?.line).toBeGreaterThan(0);
  });
});
