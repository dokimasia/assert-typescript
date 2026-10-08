/**
 * The verdict of every assertion call: a pass, a failure or a fault.
 *
 * Each verdict writes the call's record when its seat records calls. A
 * failure then sends its record to a seat that takes records, and the
 * sentence rendered from it to any other seat. A fault ends the call
 * through the seat's `fail` on either surface, because the call checked
 * nothing and a test that ran on would meet the fault again.
 */

import { callSite, Failure, render, type Where } from "../failure.js";
import type { Call, Site } from "../record/call.js";
import { add, callsOf, Slot } from "../record/calls.js";
import { detail as literalOf } from "../record/literal.js";
import { reading } from "../record/switch.js";
import { Mode, report, type Seat, takesRecords } from "./seat.js";

/**
 * Returns the text of a fault.
 *
 * @param error - What ended the call.
 * @returns The message of an error, and the text of any other value.
 */
export function faultText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ends a call that reports no verdict with a fault, through the seat's
 * `fail`. It writes no call record. It may not return.
 *
 * @param seat - The seat of the call.
 * @param error - The fault.
 */
export function end(seat: Seat, error: unknown): void {
  seat.helper();
  seat.fail(faultText(error));
}

/**
 * A call of an assertion, which reports its verdict once.
 *
 * A call that runs a body, such as `eventually`, takes its number through
 * {@link Running.begin} before the calls of its body, and the seat of each
 * run of the body hands its calls to the slot.
 *
 * A call that awaits reads its call site when it starts, before its first
 * `await`: once an async function has awaited, the caller's frame has
 * left the stack.
 */
export class Running {
  /** The seat of the call. */
  readonly #seat: Seat;
  /** The slot of the call's record, for a recorded call that runs a body. */
  readonly #slot: Slot | undefined;
  /** Whether the call runs a body. */
  readonly #body: boolean;
  /** The call site that the call read when it started, or undefined to read it at the verdict. */
  readonly #where: Where | undefined;

  private constructor(
    seat: Seat,
    slot: Slot | undefined,
    body: boolean,
    where: Where | undefined,
  ) {
    this.#seat = seat;
    this.#slot = slot;
    this.#body = body;
    this.#where = where;
  }

  /**
   * Returns a call on seat that runs no body.
   *
   * @param seat - The seat of the call.
   * @param where - The call site, read when an awaiting call starts.
   * @returns The call.
   */
  static of(seat: Seat, where?: Where): Running {
    return new Running(seat, undefined, false, where);
  }

  /**
   * Starts a call on seat that runs a body. Its record takes its number
   * now, before the calls of its body.
   *
   * @param seat - The seat of the call.
   * @param where - The call site, read when the call starts.
   * @returns The call.
   */
  static begin(seat: Seat, where?: Where): Running {
    return new Running(seat, Slot.begin(seat), true, where);
  }

  /** The slot that the seats of the body's runs hand their calls to, for a recorded call. */
  get slot(): Slot | undefined {
    return this.#slot;
  }

  /**
   * Reports that the call passed.
   *
   * @param mode - The surface of the call.
   * @param assertion - The canonical id.
   * @param contract - The caller's message.
   */
  pass(mode: Mode, assertion: string, contract: string): void {
    if (!this.#switched()) return;
    this.#write({
      assertion,
      contract,
      verdict: "pass",
      aborting: mode === Mode.Fatal,
    });
  }

  /**
   * Reports that the call failed with detail, which contains exactly the
   * fields that the assertion declares. Under {@link Mode.Fatal} it may
   * not return.
   *
   * @param mode - The surface of the call.
   * @param assertion - The canonical id.
   * @param contract - The caller's message.
   * @param detail - The fields that the assertion declares.
   */
  fail(
    mode: Mode,
    assertion: string,
    contract: string,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.#seat.helper();
    if (!this.#switched()) return;
    const where = this.#where ?? callSite();
    this.#write(
      {
        assertion,
        contract,
        verdict: "fail",
        aborting: mode === Mode.Fatal,
        ...(where === undefined ? {} : { where }),
      },
      detail,
    );
    this.#report(mode, new Failure(assertion, contract, detail, where));
  }

  /**
   * Reports that the call ended without a verdict, because error refused
   * an argument or the environment. It ends the call through the seat's
   * `fail` on either surface, and may not return.
   *
   * @param mode - The surface of the call.
   * @param assertion - The canonical id.
   * @param contract - The caller's message.
   * @param error - The fault.
   */
  fault(mode: Mode, assertion: string, contract: string, error: unknown): void {
    this.#seat.helper();
    if (!this.#switched()) return;
    this.#write({
      assertion,
      contract,
      verdict: "error",
      aborting: mode === Mode.Fatal,
      error: faultText(error),
    });
    end(this.#seat, error);
  }

  /**
   * Reports that a property passed, at where. The call's record states
   * run, the detail of the property's run.
   *
   * @param mode - The surface of the call.
   * @param assertion - The canonical id.
   * @param contract - The caller's message.
   * @param where - The call site of the property.
   * @param run - The detail of the run, as JSON values.
   */
  passRun(
    mode: Mode,
    assertion: string,
    contract: string,
    where: Site | undefined,
    run: Readonly<Record<string, unknown>>,
  ): void {
    if (!this.#switched()) return;
    this.#write(
      {
        assertion,
        contract,
        verdict: "pass",
        aborting: mode === Mode.Fatal,
        ...(where === undefined ? {} : { where }),
      },
      undefined,
      run,
    );
  }

  /**
   * Reports that a call failed with the record failure, whose call record
   * states run in place of the typed literals of the record's detail: the
   * detail of a property's run, or the tree literals of a comparison of
   * trees, which no typed literal of a value states.
   *
   * @param mode - The surface of the call.
   * @param failure - The record of the failure.
   * @param run - The detail of the call record, as JSON values.
   */
  failRun(mode: Mode, failure: Failure, run: Readonly<Record<string, unknown>>): void {
    this.#seat.helper();
    if (!this.#switched()) return;
    this.#write(
      {
        assertion: failure.assertion,
        contract: failure.contract,
        verdict: "fail",
        aborting: mode === Mode.Fatal,
        ...(failure.where === undefined ? {} : { where: failure.where }),
      },
      undefined,
      run,
    );
    this.#report(mode, failure);
  }

  /** Sends failure to a seat that takes records, and its sentence to any other. */
  #report(mode: Mode, failure: Failure): void {
    const seat = this.#seat;
    seat.helper();
    if (takesRecords(seat)) {
      seat.report(failure, mode === Mode.Fatal);
      return;
    }
    report(seat, mode, render(failure));
  }

  /**
   * Reports whether the process's switch of recording states a value.
   * When it does not, the call ends with the switch's fault.
   */
  #switched(): boolean {
    const read = reading();
    if ("fault" in read) {
      end(this.#seat, read.fault);
      return false;
    }
    return true;
  }

  /**
   * Writes the call's record into the slot of a call that runs a body,
   * and into the calls of the seat for any other call. A failure's record
   * states the typed literal of each field of detail, and a property's the
   * run. A call that is not recorded builds nothing.
   */
  #write(
    call: Call,
    detail?: Readonly<Record<string, unknown>>,
    run?: Readonly<Record<string, unknown>>,
  ): void {
    const calls = this.#body ? undefined : callsOf(this.#seat);
    if (this.#body ? this.#slot === undefined : calls === undefined) return;

    const where = call.where ?? this.#where ?? callSite();
    const stated =
      run ??
      (detail === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(detail).map(([name, value]) => [name, literalOf(value)]),
          ));
    const record: Call = {
      ...call,
      ...(where === undefined ? {} : { where }),
      ...(stated === undefined ? {} : { detail: stated }),
    };
    if (this.#slot !== undefined) {
      this.#slot.write(record);
      return;
    }
    add(calls as NonNullable<typeof calls>, record);
  }
}

/**
 * Reports that a call on seat passed.
 *
 * @param seat - The seat of the call.
 * @param mode - The surface of the call.
 * @param assertion - The canonical id.
 * @param contract - The caller's message.
 */
export function pass(
  seat: Seat,
  mode: Mode,
  assertion: string,
  contract: string,
): void {
  Running.of(seat).pass(mode, assertion, contract);
}

/**
 * Reports that a call on seat failed with detail. Under
 * {@link Mode.Fatal} it may not return.
 *
 * @param seat - The seat of the call.
 * @param mode - The surface of the call.
 * @param assertion - The canonical id.
 * @param contract - The caller's message.
 * @param detail - The fields that the assertion declares.
 */
export function fail(
  seat: Seat,
  mode: Mode,
  assertion: string,
  contract: string,
  detail: Readonly<Record<string, unknown>> = {},
): void {
  seat.helper();
  Running.of(seat).fail(mode, assertion, contract, detail);
}

/**
 * Reports that a call on seat ended with a fault. It may not return.
 *
 * @param seat - The seat of the call.
 * @param mode - The surface of the call.
 * @param assertion - The canonical id.
 * @param contract - The caller's message.
 * @param error - The fault.
 */
export function fault(
  seat: Seat,
  mode: Mode,
  assertion: string,
  contract: string,
  error: unknown,
): void {
  seat.helper();
  Running.of(seat).fault(mode, assertion, contract, error);
}
