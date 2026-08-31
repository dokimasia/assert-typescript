/**
 * This library's surface, held to the definition.
 *
 * The completeness gate: every assertion the standard states must be
 * present under the name the naming table gives it, unless the overlay
 * declares this language cannot supply it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as bench from "../src/bench.js";
import * as check from "../src/check.js";
import {
  assertions,
  declinesRelaxation,
  declinesSurface,
  diverges,
  LANGUAGE,
  names,
  overlay,
  relaxationNames,
  surfaceNames,
  version,
} from "../src/conformance/index.js";
import * as golden from "../src/golden.js";
import * as option from "../src/option.js";
import * as seat from "../src/seat.js";
import * as soft from "../src/soft.js";

const ASSERTIONS = assertions();
const NAMES = names();

/** The modules a qualified name may name. */
const MODULES: Record<string, unknown> = { golden, bench };

/** Members the recording surface is not expected to carry, with why. */
const CHECK_ONLY: Record<string, string> = {
  rejects: "drives a check to failure, which needs a seat that stops",
};

/**
 * Answer whether a module carries a name, following one dot at a time.
 *
 * A name like `bench.Contract.maxLatency` ends at an instance method,
 * which lives on the prototype rather than on the class, so each step
 * looks there too.
 */
function present(owner: unknown, path: string): boolean {
  let current = owner;
  for (const part of path.split(".")) {
    if (current === null || current === undefined) return false;
    const holder = current as Record<string, unknown>;
    const next =
      holder[part] ??
      (typeof holder === "function"
        ? (holder as { prototype?: Record<string, unknown> }).prototype?.[part]
        : undefined);
    current = next;
  }
  return current !== undefined;
}

it("the vendored definition states assertions", () => {
  expect(Object.keys(ASSERTIONS).length).toBe(41);
});

it("every assertion has a TypeScript name", () => {
  const missing = Object.keys(ASSERTIONS).filter((id) => !(id in NAMES));
  expect(missing).toEqual([]);
});

/** Answer where an assertion should live, and under what member name. */
function locate(id: string): { owner: unknown; member: string } {
  const name = NAMES[id] as string;
  const pkg = ASSERTIONS[id]?.package ?? "";
  return {
    owner: pkg === "" ? check : MODULES[pkg],
    member: pkg === "" ? name : name.slice(pkg.length + 1),
  };
}

describe("every assertion is implemented", () => {
  const supplied = Object.keys(ASSERTIONS)
    .filter((id) => !diverges(id))
    .sort();

  for (const id of supplied) {
    it(id, () => {
      const { owner, member } = locate(id);
      expect(present(owner, member), `${id} is missing as ${NAMES[id]}`).toBe(true);
    });
  }
});

describe("a declared divergence is genuinely absent", () => {
  // An overlay entry for something the library does implement would be
  // a claimed gap that does not exist, which is worth catching too.
  const declared = Object.keys(ASSERTIONS)
    .filter((id) => diverges(id))
    .sort();

  it("the overlay declares something", () => {
    expect(declared.length).toBeGreaterThan(0);
  });

  for (const id of declared) {
    it(id, () => {
      const { owner, member } = locate(id);
      expect(present(owner, member), `${id} is declared but implemented`).toBe(false);
    });
  }
});

describe("an unqualified assertion is on both surfaces", () => {
  const rootIds = Object.keys(ASSERTIONS)
    .filter((id) => !ASSERTIONS[id]?.package)
    .sort();

  for (const id of rootIds) {
    it(id, () => {
      const name = NAMES[id] as string;
      if (name in CHECK_ONLY) {
        expect(name in soft, `${name}: ${CHECK_ONLY[name]}`).toBe(false);
        return;
      }
      expect(name in check, `${name} missing from check`).toBe(true);
      expect(name in soft, `${name} missing from soft`).toBe(true);
    });
  }
});

it("the two surfaces carry the same members", () => {
  const inCheck = Object.keys(check).filter((n) => !(n in CHECK_ONLY));
  expect(inCheck.sort()).toEqual(Object.keys(soft).sort());
});

it("the overlay extends the vendored version", () => {
  expect(overlay().extends).toBe(`spec://assertions@${version()}`);
});

it("the overlay is this language's", () => {
  expect(overlay().language).toBe(LANGUAGE);
});

it("every divergence states a stance and a reason", () => {
  for (const d of overlay().diverge) {
    expect(d.stance.trim(), `${d.id} has no stance`).not.toBe("");
    expect(d.why.trim(), `${d.id} has no reason`).not.toBe("");
  }
});

it("the overlay diverges only on assertions the standard states", () => {
  for (const d of overlay().diverge) {
    expect(d.id in ASSERTIONS, `${d.id} is not a defined assertion`).toBe(true);
  }
});

describe("every relaxation is offered or declined", () => {
  const relaxations = relaxationNames();

  it("the definition states relaxations", () => {
    expect(Object.keys(relaxations).length).toBeGreaterThan(0);
  });

  for (const [id, name] of Object.entries(relaxations)) {
    it(`${id} is answered one way`, () => {
      const declined = declinesRelaxation(id);

      // Named and declined is a contradiction; neither is a silent gap.
      expect(name !== "" && declined, `${id}: named and declined`).toBe(false);
      expect(name !== "" || declined, `${id}: neither named nor declined`).toBe(true);
      if (name !== "") {
        expect(
          typeof (option as Record<string, unknown>)[name],
          `${id}: ${name} is named and not exported`,
        ).toBe("function");
      }
    });
  }
});

describe("every surface id is offered or declined", () => {
  const surface = surfaceNames();

  it("the surface table states something", () => {
    expect(Object.keys(surface).length).toBeGreaterThan(0);
  });

  /** The classes a seat row resolves to, by id. */
  const Seats: Record<string, { prototype: object }> = {
    "standard-seat": seat.Standard,
    "recorder-seat": seat.Recorder,
    "collector-seat": seat.Collector,
  };

  /**
   * A type is erased at run time, so its row is checked against the
   * declaration file a consumer's editor reads.
   */
  const Declared: Record<string, { file: string; holds: string }> = {
    seat: { file: "seat.d.ts", holds: "export type { Seat }" },
    scrubber: { file: "golden.d.ts", holds: "export type Scrubber" },
  };

  /** A member is looked up, never invoked: a getter would run. */
  function carries(owner: { prototype: object }, member: string): boolean {
    return Object.getOwnPropertyDescriptor(owner.prototype, member) !== undefined;
  }

  for (const [sid, name] of Object.entries(surface)) {
    it(`${sid} is answered one way`, () => {
      const declined = declinesSurface(sid);
      expect(name !== "" && declined, `${sid}: named and declined`).toBe(false);
      expect(name !== "" || declined, `${sid}: neither named nor declined`).toBe(true);
      if (name === "") return;

      const leaf = name.split(".").pop() as string;

      if (sid in Declared) {
        const where = Declared[sid] as { file: string; holds: string };
        const declarations = readFileSync(
          join(import.meta.dirname, "../dist", where.file),
          "utf8",
        );
        expect(declarations, `${sid}: ${name} is named and not declared`).toContain(
          where.holds,
        );
        return;
      }
      if (sid in Seats) {
        expect(Seats[sid], `${sid}: ${name} is named and not exported`).toBeTypeOf(
          "function",
        );
        return;
      }
      if (sid === "contract") {
        expect(bench.Contract, `${sid}: ${name} is named and not exported`).toBeTypeOf(
          "function",
        );
        return;
      }
      if (sid.startsWith("contract.")) {
        expect(
          carries(bench.Contract, leaf),
          `${sid}: ${name} is named and not implemented`,
        ).toBe(true);
        return;
      }
      if (name.startsWith("golden.")) {
        expect(
          (golden as Record<string, unknown>)[leaf],
          `${sid}: ${name} is named and not exported`,
        ).toBeDefined();
        return;
      }
      // A member of a seat. The seat's own three are checked on every
      // class; a reader member on the class its id names.
      const owners = sid.startsWith("seat.")
        ? Object.values(Seats)
        : [Seats[sid.split(".")[0] as string] as { prototype: object }];
      for (const owner of owners) {
        expect(
          carries(owner, leaf),
          `${sid}: ${name} is named and not implemented`,
        ).toBe(true);
      }
    });
  }
});
