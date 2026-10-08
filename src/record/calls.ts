/**
 * The call records of one test, one recorder or one run of a body.
 *
 * A seat of this library has its calls, and {@link callsOf} finds them:
 *
 * - The calls of a test write each record through the test's sink, while
 *   the switch is on.
 * - The calls of a recorder keep each record, whatever the switch
 *   states, and {@link lines} returns them.
 * - The calls of one run of a body keep its records unnumbered, until the
 *   call that ran the body takes them through {@link Slot.take}.
 *
 * A call that runs a body takes its number through {@link Slot.begin},
 * before the calls of its body, and writes its record through
 * {@link Slot.write} when it ends.
 */

import { type Call, encodeCall, type Phase } from "./call.js";

/** What a set of calls does with a record. */
type State = "off" | "keeping" | "writing" | "running";

/** Where the calls of a test write a record: its number, and its line of JSON. */
export type Sink = (seq: number, line: string) => void;

/** One call among the calls of its test. */
interface Entry {
  /** The record, once the call has ended. */
  call: Call | undefined;
  /** The entry of the call whose body this call ran in. */
  parent: Entry | undefined;
  /** The run of the parent's body that this call ran in. */
  run: number;
  /** The phase of that run, for a call in a property's case. */
  phase: Phase | undefined;
  /** How many steps the walk of the run's case had made at the call's verdict. */
  steps: number;
  /** The call's number, and 0 until a test's or a recorder's calls number it. */
  seq: number;
  /** The calls that keep the entry now. */
  home: Calls | undefined;
}

/** The calls of a seat. A new set of calls records nothing. */
export class Calls {
  /** What the calls do with a record. */
  state: State = "off";
  /** The number of the last record numbered. */
  next = 0;
  /** The encoded records of a recorder, by their number less one. */
  kept: string[] = [];
  /** Where the calls of a test write. */
  sink: Sink | undefined;
  /** The calls of a run, in the order of their verdicts. */
  entries: Entry[] = [];
  /** How many steps the walk of the run's case has made, for a run that a property cuts. */
  position: (() => number) | undefined;

  /** Puts e among the calls: numbered and written when they keep or write, kept otherwise. */
  add(e: Entry): void {
    e.home = this;
    if (this.state === "running") {
      e.steps = this.position?.() ?? 0;
      this.entries.push(e);
      return;
    }
    if (this.state === "off") return;
    this.next += 1;
    e.seq = this.next;
    if (e.call !== undefined) this.emit(e);
  }

  /** Writes the record of e, a numbered entry whose call has ended. */
  emit(e: Entry): void {
    const call = e.call as Call;
    const line = encodeCall(call, {
      seq: e.seq,
      ...(e.parent === undefined
        ? {}
        : {
            parent: e.parent.seq,
            run: e.run,
            ...(e.phase === undefined ? {} : { phase: e.phase }),
          }),
    });
    if (this.state === "writing") {
      this.sink?.(e.seq, line);
      return;
    }
    while (this.kept.length < e.seq) this.kept.push("");
    this.kept[e.seq - 1] = line;
  }
}

/** The calls of each seat of this library. */
const SEATS = new WeakMap<object, Calls>();

/**
 * Returns the calls of seat, and registers new ones for a seat that has
 * none.
 *
 * @param seat - A seat of this library.
 * @returns Its calls.
 */
export function own(seat: object): Calls {
  let calls = SEATS.get(seat);
  if (calls === undefined) {
    calls = new Calls();
    SEATS.set(seat, calls);
  }
  return calls;
}

/**
 * Returns the calls that keep the record of a call on seat, and undefined
 * when the call is not recorded: for a seat that is no seat of this
 * library, and for one whose calls record nothing.
 *
 * @param seat - The seat of the call.
 * @returns The calls, or undefined.
 */
export function callsOf(seat: object): Calls | undefined {
  const calls = SEATS.get(seat);
  return calls === undefined || calls.state === "off" ? undefined : calls;
}

/**
 * Makes calls the calls of a recorder, which keep the record of every
 * call, numbered from 1. It drops what they kept before.
 *
 * @param calls - The calls of a recorder.
 */
export function keep(calls: Calls): void {
  Object.assign(calls, {
    state: "keeping",
    next: 0,
    kept: [],
    sink: undefined,
    entries: [],
    position: undefined,
  });
}

/**
 * Makes calls the calls of a test, which write each record through sink,
 * numbered from 1.
 *
 * @param calls - The calls of a test's seat.
 * @param sink - Where each record goes.
 */
export function write(calls: Calls, sink: Sink): void {
  Object.assign(calls, { state: "writing", next: 0, kept: [], sink, entries: [] });
}

/**
 * Returns the records that a recorder's calls keep, one line of JSON
 * each, in the order of their numbers. A call that is still running a
 * body has no line yet.
 *
 * @param calls - The calls of a recorder.
 * @returns A fresh array of the lines.
 */
export function lines(calls: Calls): string[] {
  return calls.kept.filter((line) => line !== "");
}

/**
 * Adds call to calls: numbered and written, or kept until the call that
 * ran the body of calls takes it.
 *
 * @param calls - The calls of the call's seat.
 * @param call - The call's record.
 */
export function add(calls: Calls, call: Call): void {
  calls.add({
    call,
    parent: undefined,
    run: 0,
    phase: undefined,
    steps: 0,
    seq: 0,
    home: undefined,
  });
}

/**
 * Makes body the calls of one run of the body of the call that slot
 * started. An undefined slot, the slot of a call that is not recorded,
 * makes body record nothing.
 *
 * @param body - The calls of the body's seat.
 * @param slot - The slot of the call that runs the body.
 * @param position - How many steps the walk of the run's case has made,
 *   for a run whose calls {@link cut} can drop.
 */
export function run(
  body: Calls,
  slot: Slot | undefined,
  position?: () => number,
): void {
  Object.assign(body, {
    state: slot === undefined ? "off" : "running",
    next: 0,
    kept: [],
    sink: undefined,
    entries: [],
    position: slot === undefined ? undefined : position,
  });
}

/**
 * Drops the records of the calls that the run of body made at its walk's
 * step steps and after it: the calls that a run on one worker does not
 * make, because the case stops at that step there.
 *
 * @param body - The calls of a run.
 * @param steps - The step at which the case stops.
 */
export function cut(body: Calls, steps: number): void {
  body.entries = body.entries.filter((e) => e.steps < steps);
}

/**
 * A call that runs a body: it took its number before the calls of its
 * body, and writes its record when it ends.
 */
export class Slot {
  /** The slot's place among the calls that keep its record. */
  readonly #entry: Entry;
  /** The runs of the body taken so far. */
  #runs = 0;

  private constructor(entry: Entry) {
    this.#entry = entry;
  }

  /**
   * Starts the record of a call on seat that runs a body: the call takes
   * its number now, before the calls of its body.
   *
   * @param seat - The seat of the call.
   * @returns The slot, or undefined when the call is not recorded.
   */
  static begin(seat: object): Slot | undefined {
    const calls = callsOf(seat);
    if (calls === undefined) return undefined;
    const entry: Entry = {
      call: undefined,
      parent: undefined,
      run: 0,
      phase: undefined,
      steps: 0,
      seq: 0,
      home: undefined,
    };
    calls.add(entry);
    return new Slot(entry);
  }

  /**
   * Takes the next run of the slot's body, whose calls body keeps, and
   * moves them to the calls that keep the slot: each with the slot's call
   * as its parent, the run's number and its phase. A call of a body inside
   * the run keeps its own parent. body is empty afterwards.
   *
   * @param body - The calls of the run.
   * @param phase - The phase of the run, for a property's case.
   */
  take(body: Calls, phase?: Phase): void {
    const entries = body.entries;
    body.entries = [];
    this.#runs += 1;
    const home = this.#entry.home as Calls;
    for (const e of entries) {
      if (e.parent === undefined) {
        e.parent = this.#entry;
        e.run = this.#runs;
        e.phase = phase;
      }
      home.add(e);
    }
  }

  /**
   * Ends the slot's call with its record, which the calls that keep the
   * slot write under the number that the call took when it began.
   *
   * @param call - The call's record.
   */
  write(call: Call): void {
    this.#entry.call = call;
    const home = this.#entry.home as Calls;
    if (this.#entry.seq !== 0) home.emit(this.#entry);
  }
}
