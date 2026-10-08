/** The spec of the case of a property's body. */

import { describe } from "vitest";
import { Controlled } from "../../src/clock.js";
import { Failure } from "../../src/failure.js";
import type { History } from "../../src/history/history.js";
import { check } from "../../src/index.js";
import {
  Case,
  caseOf,
  execute,
  type Failing,
  type Location,
  onEngine,
} from "../../src/prop/case.js";
import {
  Case as Engine,
  Failed,
  Rejected,
  Replaying,
} from "../../src/prop/engine/case.js";
import { TraceError } from "../../src/prop/engine/trace.js";
import { Diverged, Repeated } from "../../src/prop/engine/tree.js";
import { drive } from "../../src/prop/engine/work.js";
import { integer } from "../../src/prop/generators.js";
import { Recorder } from "../../src/seat.js";
import { test as it } from "../../src/vitest.js";

/** The call site of the property of the cases. */
const SITE = { file: "/work/tests/total.test.ts", line: 4 };

/** The location of the records of a case that locates them by the caller's frame. */
const FREE: Location = { site: SITE, pinned: false };

/** Returns a case on a recorder whose engine case replays integer choices. */
function caseOn(
  location: Location = FREE,
  ...values: bigint[]
): { c: Case; engine: Engine } {
  const engine = new Engine(
    new Replaying(values.map((value) => ({ kind: "integer", value }))),
  );
  return { c: new Case(engine, new Recorder(), undefined, location), engine };
}

/** Returns what the case throws when body runs on it, or undefined when it passes. */
async function ending(c: Case, body: (c: Case) => unknown): Promise<unknown> {
  try {
    await drive(execute(c, body));
  } catch (err) {
    return err;
  }
  return undefined;
}

/** Returns the record of a failure that a case ended with. */
function recordOf(thrown: unknown): Failing {
  return (thrown as Failed).record as Failing;
}

describe("case", () => {
  describe("new Case", () => {
    it("returns a case whose signal aborts when the seat's signal aborts", ({
      seat,
    }) => {
      const controller = new AbortController();
      const c = new Case(
        new Engine(new Replaying([])),
        new Recorder().withSignal(controller.signal),
        undefined,
        FREE,
      );
      controller.abort();

      check.isTrue(seat, c.signal.aborted, "the case's signal aborts");
    });
  });

  describe("Case.helper", () => {
    it("returns without a record", async ({ seat }) => {
      const { c } = caseOn();

      check.isNil(seat, await ending(c, (one) => one.helper()), "the case passes");
    });
  });

  describe("Case.fail", () => {
    it("ends the case with a record of the message at this file's frame", async ({
      seat,
    }) => {
      const { c } = caseOn();
      let after = false;
      const thrown = await ending(c, (one) => {
        one.fail("it broke");
        after = true;
      });
      const { failure, identity } = recordOf(thrown);

      check.equal(
        seat,
        [failure.assertion, failure.contract, after],
        ["", "it broke", false],
        "the message ends the case",
      );
      check.hasSuffix(
        seat,
        identity.where?.file,
        "case.test.ts",
        "the frame is this file's",
      );
    });

    it("keeps a record of a pinned case at the call site of the property", async ({
      seat,
    }) => {
      const { c } = caseOn({ site: SITE, pinned: true });

      check.equal(
        seat,
        recordOf(await ending(c, (one) => one.fail("it broke"))).failure.where,
        SITE,
        "the call site",
      );
    });
  });

  describe("Case.record", () => {
    it("fails the case with the first message once the body ends", async ({ seat }) => {
      const { c } = caseOn();
      let after = false;
      const thrown = await ending(c, (one) => {
        one.record("first");
        one.record("second");
        after = true;
      });

      check.equal(
        seat,
        [recordOf(thrown).failure.contract, after],
        ["first", true],
        "the first record fails the case",
      );
    });

    it("keeps a record of a pinned case at the call site of the property", async ({
      seat,
    }) => {
      const { c } = caseOn({ site: SITE, pinned: true });

      check.equal(
        seat,
        recordOf(await ending(c, (one) => one.record("x"))).failure.where,
        SITE,
        "the call site",
      );
    });

    it("keeps a record that no frame of the caller's code made at the call site of the property", async ({
      seat,
    }) => {
      const { c } = caseOn();
      const thrown = await ending(c, async (one) => {
        queueMicrotask(one.record.bind(one, "late"));
        await Promise.resolve();
      });

      check.equal(seat, recordOf(thrown).failure.where, SITE, "the call site");
    });
  });

  describe("Case.report", () => {
    it("ends the case at an aborting record", async ({ seat }) => {
      const { c } = caseOn();
      const record = new Failure(
        "equal",
        "the totals agree",
        {},
        { file: "/w/a.ts", line: 2 },
      );
      let after = false;
      const thrown = await ending(c, (one) => {
        one.report(record, true);
        after = true;
      });

      check.equal(
        seat,
        [recordOf(thrown).failure, after],
        [record, false],
        "the record ends the case",
      );
    });

    it("lets the body run on past a recording record", async ({ seat }) => {
      const { c } = caseOn();
      const record = new Failure("equal", "c", {});
      let after = false;
      const thrown = await ending(c, (one) => {
        one.report(record, false);
        after = true;
      });

      check.equal(
        seat,
        [recordOf(thrown).failure, after],
        [record, true],
        "the case fails when the body ends",
      );
    });

    it("keeps the record of a pinned case at the call site of the property", async ({
      seat,
    }) => {
      const { c } = caseOn({ site: SITE, pinned: true });
      const record = new Failure(
        "equal",
        "c",
        { want: 1 },
        { file: "/w/a.ts", line: 2 },
      );
      const { failure } = recordOf(await ending(c, (one) => one.report(record, true)));

      check.equal(
        seat,
        [failure.assertion, failure.contract, failure.detail, failure.where],
        ["equal", "c", { want: 1 }, SITE],
        "the record at the call site",
      );
    });
  });

  describe("Case.clock", () => {
    it("returns the clock of the property's seat", ({ seat }) => {
      const clock = new Controlled();
      const c = new Case(
        new Engine(new Replaying([])),
        new Recorder().withClock(clock),
        undefined,
        FREE,
      );

      check.isTrue(seat, c.clock() === clock, "the seat's clock");
    });
  });

  describe("Case.draw", () => {
    it("returns the value that the engine records under the label", async ({
      seat,
    }) => {
      const { c, engine } = caseOn(FREE, 7n);
      let drawn: unknown;
      await ending(c, (one) => {
        drawn = one.draw(integer(0, 9), "x");
      });

      check.equal(seat, [drawn, engine.draws[0]?.label], [7, "x"], "the draw");
    });

    it("raises the signal of a draw again at every later call", async ({ seat }) => {
      const { c } = caseOn();
      const thrown: unknown[] = [];
      const ended = await ending(c, (one) => {
        try {
          one.draw(
            integer(0, 9).filter(() => false),
            "never",
          );
        } catch (err) {
          thrown.push(err);
        }
        try {
          one.note("too late");
        } catch (err) {
          thrown.push(err);
        }
      });

      check.isTrue(
        seat,
        ended instanceof Rejected &&
          thrown.length === 2 &&
          thrown.every((err) => err === ended),
        "the rejection is raised again",
      );
    });

    it("throws an error of the generator that is no signal", async ({ seat }) => {
      const { c } = caseOn(FREE, 1n);
      const broken = integer(0, 9).map(() => {
        throw new RangeError("the map refuses");
      });
      const thrown = await ending(c, (one) => one.draw(broken, "x"));

      check.equal(
        seat,
        recordOf(thrown).failure.contract,
        "the map refuses",
        "the error fails the case",
      );
    });
  });

  describe("Case.assume", () => {
    it("rejects the case for a false condition", async ({ seat }) => {
      const { c } = caseOn();

      check.isTrue(
        seat,
        (await ending(c, (one) => one.assume(false))) instanceof Rejected,
        "the case is rejected",
      );
    });

    it("lets the body run on for a true condition", async ({ seat }) => {
      const { c } = caseOn();

      check.isNil(seat, await ending(c, (one) => one.assume(true)), "the case passes");
    });
  });

  describe("Case.classify", () => {
    it("counts the case under the label", async ({ seat }) => {
      const { c, engine } = caseOn();
      await ending(c, (one) => one.classify("even"));

      check.equal(seat, [...engine.labels], ["even"], "the label");
    });
  });

  describe("Case.note", () => {
    it("attaches the message to the case", async ({ seat }) => {
      const { c, engine } = caseOn();
      await ending(c, (one) => one.note("saw 7"));

      check.equal(seat, engine.notes, ["saw 7"], "the note");
    });
  });

  describe("Case.rand", () => {
    it("returns a source whose values are integer choices of the case", async ({
      seat,
    }) => {
      const { c, engine } = caseOn(FREE, 5n, 2n ** 64n - 1n);
      let values: bigint[] = [];
      await ending(c, (one) => {
        const next = one.rand();
        values = [next(), next()];
      });

      check.equal(
        seat,
        [values, engine.choices.length],
        [[5n, 2n ** 64n - 1n], 2],
        "two choices",
      );
    });

    it("ends the case at a value past the cap on choices", async ({ seat }) => {
      const engine = new Engine(new Replaying([]), 1);
      const c = new Case(engine, new Recorder(), undefined, FREE);
      const thrown = await ending(c, (one) => {
        const next = one.rand();
        next();
        next();
      });

      check.isTrue(seat, thrown instanceof Rejected, "the case is rejected");
    });
  });

  describe("Case.observe", () => {
    it("records the fingerprint", async ({ seat }) => {
      const { c, engine } = caseOn();
      await ending(c, (one) => one.observe(42n));

      check.equal(seat, engine.fingerprints, [42n], "the fingerprint");
    });
  });

  describe("Case.history", () => {
    it("returns one empty history for every call of a case", async ({ seat }) => {
      const { c } = caseOn();
      let histories: History[] = [];
      await ending(c, (one) => {
        histories = [one.history(), one.history()];
      });

      check.equal(
        seat,
        [histories[0] === histories[1], histories[0]?.events()],
        [true, []],
        "the same empty history",
      );
    });

    it("raises the signal of an ended case again", async ({ seat }) => {
      const { c } = caseOn();
      let raised: unknown;
      const ended = await ending(c, (one) => {
        try {
          one.assume(false);
        } catch {
          // The body catches the rejection and calls on.
        }
        try {
          one.history();
        } catch (err) {
          raised = err;
        }
      });

      check.isTrue(seat, raised === ended, "the rejection");
    });
  });

  describe("Case.target", () => {
    it("records the higher of two scores of a label", async ({ seat }) => {
      const { c, engine } = caseOn();
      await ending(c, (one) => {
        one.target("depth", 3);
        one.target("depth", 2);
      });

      check.equal(seat, engine.targets, new Map([["depth", 3]]), "the higher score");
    });
  });

  describe("Case.cleanup", () => {
    it("awaits the cleanups after the body in reverse order of registration", async ({
      seat,
    }) => {
      const { c } = caseOn();
      const order: string[] = [];
      await ending(c, (one) => {
        one.cleanup(() => {
          order.push("first");
        });
        one.cleanup(async () => {
          await Promise.resolve();
          order.push("second");
        });
        order.push("body");
      });

      check.equal(seat, order, ["body", "second", "first"], "the order");
    });

    it("runs a cleanup that a cleanup registers before the case ends", async ({
      seat,
    }) => {
      const { c } = caseOn();
      const order: string[] = [];
      await ending(c, (one) => {
        one.cleanup(() => {
          order.push("outer");
          one.cleanup(() => {
            order.push("inner");
          });
        });
      });

      check.equal(seat, order, ["outer", "inner"], "the nested cleanup runs");
    });

    it("runs the remaining cleanups after a cleanup that fails the case", async ({
      seat,
    }) => {
      const { c } = caseOn();
      let ran = false;
      const thrown = await ending(c, (one) => {
        one.cleanup(() => {
          ran = true;
        });
        one.cleanup(() => {
          throw new TypeError("the cleanup broke");
        });
      });

      check.equal(
        seat,
        [recordOf(thrown).failure.contract, ran],
        ["the cleanup broke", true],
        "the failure and the run",
      );
    });

    it("aborts the case's signal before the cleanups run", async ({ seat }) => {
      const { c } = caseOn();
      let aborted = false;
      await ending(c, (one) => {
        one.cleanup(() => {
          aborted = one.signal.aborted;
        });
      });

      check.isTrue(seat, aborted, "the signal is aborted in the cleanup");
    });
  });

  describe("caseOf", () => {
    it("returns the case of an engine case that a body runs on", ({ seat }) => {
      const { c, engine } = caseOn();

      check.isTrue(seat, caseOf(engine) === c, "the case");
    });

    it("returns a case of a seat that throws for an engine case of no body", async ({
      seat,
    }) => {
      const c = caseOf(new Engine(new Replaying([])));

      check.equal(
        seat,
        (await ending(c, (one) => one.fail("x"))) instanceof Failed,
        true,
        "the case fails",
      );
    });
  });

  describe("onEngine", () => {
    it("returns what fn returns on the engine's record of the case", ({ seat }) => {
      const { c, engine } = caseOn();

      check.isTrue(seat, onEngine(c, (e) => e) === engine, "the engine case");
    });

    it("throws the signal that ended the case", ({ seat }) => {
      const { c } = caseOn();
      check.throws(seat, () => c.assume(false), "the case is rejected");
      const err = check.throws(seat, () => onEngine(c, () => 1), "the signal again");

      check.errorIs(seat, err, Rejected, "the rejection");
    });

    it("ends the case with a signal that fn throws", ({ seat }) => {
      const { c } = caseOn();
      check.throws(
        seat,
        () =>
          onEngine(c, () => {
            throw new Rejected();
          }),
        "the signal passes",
      );
      const err = check.throws(seat, () => c.note("later"), "the signal again");

      check.errorIs(seat, err, Rejected, "the rejection");
    });

    it("leaves the case running after an error that is no signal", ({ seat }) => {
      const { c } = caseOn();
      check.throws(
        seat,
        () =>
          onEngine(c, () => {
            throw new TypeError("bad");
          }),
        "the error passes",
      );

      check.doesNotThrow(seat, () => c.note("later"), "the case runs on");
    });
  });

  describe("execute", () => {
    it("returns for an async body that passes", async ({ seat }) => {
      const { c } = caseOn();

      check.isNil(seat, await ending(c, async () => undefined), "the case passes");
    });

    it("ends the case with the record of a raised error at the frame that raised it", async ({
      seat,
    }) => {
      const { c } = caseOn();
      const { failure, identity } = recordOf(
        await ending(c, () => {
          throw new TypeError("bad input");
        }),
      );

      check.equal(
        seat,
        [failure.assertion, failure.contract, failure.detail["error"], identity.error],
        ["", "bad input", "TypeError", "TypeError"],
        "the record of the error",
      );
      check.hasSuffix(
        seat,
        identity.where?.file,
        "case.test.ts",
        "the frame is this file's",
      );
    });

    it("ends the case with the record of a rejected promise", async ({ seat }) => {
      const { c } = caseOn();
      const thrown = await ending(c, () => Promise.reject(new RangeError("late")));

      check.equal(
        seat,
        recordOf(thrown).failure.contract,
        "late",
        "the rejection fails the case",
      );
    });

    it("locates the record of a raised value that is no error at the property's call site", async ({
      seat,
    }) => {
      const { c } = caseOn();
      const { failure, identity } = recordOf(
        await ending(c, () => {
          throw "a string";
        }),
      );

      check.equal(
        seat,
        [failure.contract, failure.detail, identity],
        ["a string", { error: "string", stack: "" }, { error: "string", where: SITE }],
        "the record of the value",
      );
    });

    it("throws the failure of a case that a later assumption rejects", async ({
      seat,
    }) => {
      const { c } = caseOn();
      const thrown = await ending(c, (one) => {
        one.record("first");
        one.assume(false);
      });

      check.equal(
        seat,
        recordOf(thrown).failure.contract,
        "first",
        "the failure has priority",
      );
    });

    const tests = [
      { name: "a repeat of a tested case", give: () => new Repeated() },
      { name: "a divergence", give: () => new Diverged(0, undefined, undefined) },
      {
        name: "an entry that a trace cannot follow",
        give: () => new TraceError(0, "x", "label"),
      },
    ];
    for (const tt of tests) {
      it(`throws the signal of ${tt.name} over an earlier failure`, async ({
        seat,
      }) => {
        const { c } = caseOn();
        const signal = tt.give();
        const thrown = await ending(c, (one) => {
          one.record("a failure first");
          throw signal;
        });

        check.isTrue(seat, thrown === signal, "the signal");
      });
    }
  });
});
