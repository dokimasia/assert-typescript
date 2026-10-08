/**
 * The spec of the entry point of the package, and the completeness gate:
 * every assertion that the definition states is exported under the name
 * that the naming table gives TypeScript, with the definition's arity,
 * unless the overlay declines it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import {
  assertions,
  declinesRelaxation,
  declinesSurface,
  diverges,
  names,
  relaxationNames,
  surfaceNames,
} from "../src/conformance/index.js";
import * as index from "../src/index.js";
import { test as it } from "../src/vitest.js";

const { bench, check, files, golden, history, prop, soft, stateful } = index;

const ASSERTIONS = assertions();
const NAMES = names();

/** The modules that a qualified name of the naming table names. */
const MODULES: Record<string, unknown> = {
  bench,
  files,
  golden,
  history,
  prop,
  stateful,
};

/** The assertions that the recording surface does not export, with the reason. */
const CHECK_ONLY: Record<string, string> = {
  rejects: "drives a check to failure, which needs a seat that stops",
};

/**
 * Returns the member of owner at path, one segment at a time, or undefined.
 * A name such as `bench.Contract.maxLatency` ends at a method, which is on
 * the prototype of the class, so each step looks there too.
 */
function memberOf(owner: unknown, path: string): unknown {
  let current = owner;
  for (const part of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    const holder = current as Record<string, unknown>;
    current =
      holder[part] ??
      (typeof holder === "function"
        ? (holder as { prototype?: Record<string, unknown> }).prototype?.[part]
        : undefined);
  }
  return current;
}

/** Reports whether owner has the member at path. */
function present(owner: unknown, path: string): boolean {
  return memberOf(owner, path) !== undefined;
}

/**
 * Returns the arity of the function of an assertion, by the definition's
 * rule: the parameters that it declares before a rest parameter or a
 * default, without the seat. A method of the bench contract takes no seat.
 */
function arityOf(id: string): number {
  const { owner, member } = locate(id);
  const fn = memberOf(owner, member) as (...args: never[]) => unknown;
  return fn.length - (ASSERTIONS[id]?.package === "bench" ? 0 : 1);
}

/** The assertions whose arity in TypeScript differs from the definition's, with that arity and the reason. */
const ARITY_EXCUSED: Record<string, { arity: number; why: string }> = {
  "no-task-leaks": {
    arity: 1,
    why: "marks the scope with the call and the check that the call returns, and the definition counts the scope as an argument",
  },
};

/** Returns the module that an assertion is in, and its member name there. */
function locate(id: string): { owner: unknown; member: string } {
  const name = NAMES[id] as string;
  const pkg = ASSERTIONS[id]?.package ?? "";
  return {
    owner: pkg === "" ? check : MODULES[pkg],
    member: pkg === "" ? name : name.slice(pkg.length + 1),
  };
}

/** Reports whether the prototype of owner declares member, without calling a getter. */
function declares(owner: { prototype: object }, member: string): boolean {
  return Object.getOwnPropertyDescriptor(owner.prototype, member) !== undefined;
}

/** The classes that a row of a seat names, by surface id. */
const SEATS: Record<string, { prototype: object }> = {
  "standard-seat": index.Standard,
  "recorder-seat": index.Recorder,
  "collector-seat": index.Collector,
};

/** The classes whose members a row names, by the first segment of the row's id. */
const CLASSES: Record<string, { prototype: object }> = {
  ...SEATS,
  call: history.Call,
  case: prop.Case,
  entry: files.Entry,
  failure: index.Failure,
  generator: prop.Generator,
  history: history.History,
  scheduler: stateful.Scheduler,
};

/**
 * The class that a row of a clock names. The interface is erased at run
 * time, so its rows are checked on the class that implements it.
 */
const CLOCKS: Record<string, { prototype: object }> = {
  "controlled-clock": index.Controlled,
  "system-clock": index.System,
  "clock.now": index.Controlled,
  "clock.sleep": index.Controlled,
  "controlled-clock.advance": index.Controlled,
  "seat.clock": index.Recorder,
};

/**
 * The declaration file and the text of a type, whose row is checked
 * against the declarations that a consumer's editor reads, because a type
 * is erased at run time.
 */
const DECLARED: Record<string, { file: string; text: string }> = {
  seat: { file: "seat.d.ts", text: "export type { Cleanups, Seat }" },
  clock: { file: "clock.d.ts", text: "interface Clock" },
  failure: { file: "failure.d.ts", text: "class Failure" },
  where: { file: "failure.d.ts", text: "interface Where" },
  "failure.assertion": { file: "failure.d.ts", text: "assertion: string" },
  "failure.contract": { file: "failure.d.ts", text: "contract: string" },
  "failure.detail": { file: "failure.d.ts", text: "detail: Readonly" },
  "seat.report": { file: "seat.d.ts", text: "report(" },
  "seat.cancellation": {
    file: "matcher/seat.d.ts",
    text: "readonly signal?: AbortSignal",
  },
  "case.cancellation": { file: "prop/case.d.ts", text: "readonly signal: AbortSignal" },
  scrubber: { file: "golden.d.ts", text: "export type Scrubber" },
  tree: { file: "files/tree.d.ts", text: "export type Tree" },
  event: { file: "history/event.d.ts", text: "export type Event = " },
  outcome: { file: "history/concurrently.d.ts", text: "export interface Outcome {" },
  operation: { file: "history/spec.d.ts", text: "export interface Operation {" },
  "operation.args": {
    file: "history/spec.d.ts",
    text: "readonly args: readonly unknown[]",
  },
  "operation.known": { file: "history/spec.d.ts", text: "readonly known: boolean" },
  "operation.name": { file: "history/spec.d.ts", text: "readonly name: string" },
  "operation.output": { file: "history/spec.d.ts", text: "readonly output: unknown" },
  "operation.returned": {
    file: "history/spec.d.ts",
    text: "returned(value: unknown): boolean",
  },
  spec: { file: "history/spec.d.ts", text: "export interface Spec<S> {" },
  "spec.equal": { file: "history/spec.d.ts", text: "equal?(a: S, b: S): boolean" },
  "spec.initial": { file: "history/spec.d.ts", text: "initial(): S" },
  "spec.next": {
    file: "history/spec.d.ts",
    text: "next(state: S, op: Operation): readonly S[]",
  },
  machine: { file: "stateful/machine.d.ts", text: "export interface Machine<S> {" },
  "machine.spec": {
    file: "stateful/machine.d.ts",
    text: "readonly spec?: Spec<S> | undefined",
  },
  "machine.actions": {
    file: "stateful/machine.d.ts",
    text: "readonly actions: readonly Action<S>[]",
  },
  "machine.invariant": {
    file: "stateful/machine.d.ts",
    text: "invariant?(c: Case, state: S): void",
  },
  "machine.settle": {
    file: "stateful/machine.d.ts",
    text: "settle?(c: Case, state: S): void | Promise<void>",
  },
  action: { file: "stateful/machine.d.ts", text: "export interface Action<S> {" },
  "action.name": { file: "stateful/machine.d.ts", text: "readonly name: string" },
  "action.weight": {
    file: "stateful/machine.d.ts",
    text: "readonly weight?: number | undefined",
  },
  "action.drain": {
    file: "stateful/machine.d.ts",
    text: "readonly drain?: boolean | undefined",
  },
  "action.enabled": {
    file: "stateful/machine.d.ts",
    text: "enabled?(state: S): boolean",
  },
  "action.input": {
    file: "stateful/machine.d.ts",
    text: "input?(c: Case, state: S): unknown",
  },
  "action.run": {
    file: "stateful/machine.d.ts",
    text: "run(c: Case, client: number, input: unknown): void | Promise<void>",
  },
};

/** Returns the emitted declarations of a module. */
function declarations(file: string): string {
  return readFileSync(join(import.meta.dirname, "../dist", file), "utf8");
}

/** Reports whether the row sid, offered under name, is exported or declared. */
function offers(sid: string, name: string): boolean {
  const leaf = name.split(".").pop() as string;
  const clock = CLOCKS[sid];
  if (clock !== undefined) {
    return sid.includes(".") ? declares(clock, leaf) : typeof clock === "function";
  }
  const declared = DECLARED[sid];
  if (declared !== undefined)
    return declarations(declared.file).includes(declared.text);
  if (sid in SEATS) return typeof SEATS[sid] === "function";
  // A constructor, such as `new History()`, is the class of its row.
  if (name.startsWith("new "))
    return typeof CLASSES[sid.split(".")[0] as string] === "function";
  if (sid === "contract") return typeof bench.Contract === "function";
  if (sid.startsWith("contract.")) return declares(bench.Contract, leaf);
  // A helper is a name of the entry point, such as signalOf or
  // golden.shouldUpdate.
  if (present(index, name)) return true;
  // A member of a class. The members of every seat are checked on each
  // seat, and any other member on the class that its id names.
  const owners = sid.startsWith("seat.")
    ? Object.values(SEATS)
    : [CLASSES[sid.split(".")[0] as string]];
  return owners.every((owner) => owner !== undefined && declares(owner, leaf));
}

describe("index", () => {
  it("exports the names of the entry point of the package", ({ seat }) => {
    check.equal(
      seat,
      Object.keys(index).sort(),
      [
        "AssertionFailed",
        "Collector",
        "Controlled",
        "Failure",
        "Recorder",
        "Standard",
        "System",
        "bench",
        "byIdentity",
        "check",
        "equateEmpty",
        "equateNans",
        "files",
        "golden",
        "history",
        "prop",
        "rejects",
        "signalOf",
        "soft",
        "stateful",
      ],
      "the entry point exports these names",
    );
  });

  it("checks the 110 assertions of the definition", ({ seat }) => {
    check.length(seat, Object.keys(ASSERTIONS), 110, "the definition states 110");
  });

  for (const id of Object.keys(ASSERTIONS)
    .filter((one) => !diverges(one))
    .sort()) {
    it(`exports the assertion ${id} under its name`, ({ seat }) => {
      const { owner, member } = locate(id);

      check.isTrue(seat, present(owner, member), `${id} is exported as ${NAMES[id]}`);
    });

    it(`exports the assertion ${id} with the definition's arity`, ({ seat }) => {
      check.equal(
        seat,
        arityOf(id),
        ARITY_EXCUSED[id]?.arity ?? (ASSERTIONS[id]?.arity as number),
        `${NAMES[id]} takes the arguments that the definition counts`,
      );
    });
  }

  for (const [id, excuse] of Object.entries(ARITY_EXCUSED)) {
    it(`excuses the arity of ${id} for a difference from the definition`, ({
      seat,
    }) => {
      check.notEqual(
        seat,
        excuse.arity,
        ASSERTIONS[id]?.arity as number,
        `${id} differs from the definition, because TypeScript ${excuse.why}`,
      );
    });
  }

  const declined = Object.keys(ASSERTIONS)
    .filter((one) => diverges(one))
    .sort();

  it("checks at least one assertion that the overlay declines", ({ seat }) => {
    check.isNotEmpty(seat, declined, "the overlay declines an assertion");
  });

  for (const id of declined) {
    it(`exports no member for the declined assertion ${id}`, ({ seat }) => {
      const { owner, member } = locate(id);

      check.isFalse(seat, present(owner, member), `${id} is declined and exported`);
    });
  }

  for (const id of Object.keys(ASSERTIONS)
    .filter((one) => !ASSERTIONS[one]?.package)
    .sort()) {
    const name = NAMES[id] as string;
    if (diverges(id)) {
      it(`exports the declined assertion ${id} on neither surface`, ({ seat }) => {
        check.isFalse(seat, name in check || name in soft, `${name} is declined`);
      });
    } else if (name in CHECK_ONLY) {
      it(`exports the assertion ${id} on check alone`, ({ seat }) => {
        check.isFalse(seat, name in soft, `${name}: ${CHECK_ONLY[name]}`);
      });
    } else {
      it(`exports the assertion ${id} on both surfaces`, ({ seat }) => {
        check.isTrue(
          seat,
          name in check && name in soft,
          `${name} is on check and soft`,
        );
      });

      it(`exports the assertion ${id} on soft with the arity of check`, ({ seat }) => {
        const length = (surface: object) =>
          (memberOf(surface, name) as (...args: never[]) => unknown).length;

        check.equal(
          seat,
          length(soft),
          length(check),
          `${name} takes one set of arguments`,
        );
      });
    }
  }

  it("exports the same assertions on both surfaces besides rejects", ({ seat }) => {
    check.equal(
      seat,
      Object.keys(check)
        .filter((name) => !(name in CHECK_ONLY))
        .sort(),
      Object.keys(soft).sort(),
      "the surfaces have the same members",
    );
  });

  const relaxations = relaxationNames();

  it("checks at least one relaxation of the definition", ({ seat }) => {
    check.isNotEmpty(seat, relaxations, "the definition states a relaxation");
  });

  for (const [id, name] of Object.entries(relaxations)) {
    it(`offers or declines the relaxation ${id}`, ({ seat }) => {
      check.isTrue(
        seat,
        (name !== "") !== declinesRelaxation(id),
        `${id} is named or declined, and not both`,
      );
      if (name !== "") {
        check.equal(
          seat,
          typeof (index as Record<string, unknown>)[name],
          "function",
          `${id} is exported as ${name}`,
        );
      }
    });
  }

  const surface = surfaceNames();

  it("checks at least one surface id of the definition", ({ seat }) => {
    check.isNotEmpty(seat, surface, "the definition states a surface id");
  });

  for (const [sid, name] of Object.entries(surface)) {
    it(`offers or declines the surface id ${sid}`, ({ seat }) => {
      check.isTrue(
        seat,
        (name !== "") !== declinesSurface(sid),
        `${sid} is named or declined, and not both`,
      );
      if (name !== "") {
        check.isTrue(seat, offers(sid, name), `${sid} is offered as ${name}`);
      }
    });
  }
});
