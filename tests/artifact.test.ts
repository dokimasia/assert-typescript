// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the records of other kinds in the artifact of a test. */

import { describe } from "vitest";
import { attach, CALL_KIND, writeRecord } from "../src/artifact.js";
import { check } from "../src/index.js";
import { Collector, Recorder, Standard } from "../src/seat.js";
import { test as it } from "../src/vitest.js";

/** The reason of a fault for a kind outside the pattern. */
const PATTERN = String.raw`does not match dokimi\.[a-z][a-z0-9-]*`;

/** The fault of a record that is not one JSON object. */
const NOT_AN_OBJECT = "writeRecord: record: the record is not one JSON object";

describe("artifact", () => {
  describe("CALL_KIND", () => {
    it("is the kind dokimi.assert", ({ seat }) => {
      check.isEqualTo(seat, CALL_KIND, "dokimi.assert", "the kind of the call records");
    });
  });

  describe("attach", () => {
    it("makes writeRecord push the records of the seat onto the meta", ({ seat }) => {
      const tool = new Collector();
      const meta: Record<string, unknown> = {};
      attach(tool, meta);
      writeRecord(tool, "dokimi.suite", '{"seed":"7"}');

      check.isEqualTo(
        seat,
        meta,
        { "dokimi.suite": [{ seed: "7" }] },
        "the meta has the record",
      );
    });
  });

  describe("writeRecord", () => {
    it("keeps the records of each kind in order under the kind", ({ seat }) => {
      const tool = new Collector();
      const meta: Record<string, unknown> = {};
      attach(tool, meta);
      writeRecord(tool, "dokimi.suite", '{"a":1}');
      writeRecord(tool, "dokimi.trace", '{"b":2}');
      writeRecord(tool, "dokimi.suite", ' \n{"c":3}');

      check.isEqualTo(
        seat,
        meta,
        { "dokimi.suite": [{ a: 1 }, { c: 3 }], "dokimi.trace": [{ b: 2 }] },
        "each kind has its records in order",
      );
    });

    it("accepts a kind with each boundary character of the pattern", ({ seat }) => {
      const recorder = new Recorder();
      writeRecord(recorder, "dokimi.zaz-09", "{}");

      check.isEmpty(seat, recorder.faults, "the kind matches the pattern");
    });

    it("does not write on a recorder", ({ seat }) => {
      const recorder = new Recorder();
      writeRecord(recorder, "dokimi.suite", '{"seed":"7"}');

      check.isEqualTo(
        seat,
        [recorder.failed, recorder.faults, recorder.records],
        [false, [], []],
        "the recorder neither fails nor keeps a record",
      );
    });

    const tests = [
      { name: "a kind without the prefix dokimi.", kind: "suite", record: "{}" },
      { name: "a kind that ends after the prefix", kind: "dokimi.", record: "{}" },
      { name: "a kind that starts with a digit", kind: "dokimi.1suite", record: "{}" },
      { name: "a kind that starts with a brace", kind: "dokimi.{suite", record: "{}" },
      { name: "a kind with a brace", kind: "dokimi.su{te", record: "{}" },
      { name: "a kind with a capital letter", kind: "dokimi.suIte", record: "{}" },
      { name: "a kind with a second dot", kind: "dokimi.suite.x", record: "{}" },
    ];
    for (const tt of tests) {
      it(`ends the call with a fault for ${tt.name}`, ({ seat }) => {
        const recorder = new Recorder();
        writeRecord(recorder, tt.kind, tt.record);

        check.isEqualTo(
          seat,
          recorder.faults.map((fault) => fault.message),
          [`writeRecord: kind: ${JSON.stringify(tt.kind)} ${PATTERN}`],
          "the recorder keeps the fault of the kind",
        );
      });
    }

    it("ends the call with a fault for the kind of the call records", ({ seat }) => {
      const recorder = new Recorder();
      writeRecord(recorder, "dokimi.assert", "{}");

      check.isEqualTo(
        seat,
        recorder.faults.map((fault) => fault.message),
        ["writeRecord: kind: dokimi.assert is the kind of the call records of assert"],
        "the recorder keeps the fault of the kind",
      );
    });

    const records = [
      { name: "a record that is a JSON array", record: "[{}]" },
      { name: "a record that is not JSON", record: '{"seed":' },
      { name: "a record of two objects", record: "{} {}" },
      { name: "a record that is null", record: "null" },
    ];
    for (const tt of records) {
      it(`ends the call with a fault for ${tt.name}`, ({ seat }) => {
        const recorder = new Recorder();
        writeRecord(recorder, "dokimi.suite", tt.record);

        check.isEqualTo(
          seat,
          recorder.faults.map((fault) => fault.message),
          [NOT_AN_OBJECT],
          "the recorder keeps the fault of the record",
        );
      });
    }

    it("does not write a refused record onto the meta", ({ seat }) => {
      const tool = new Recorder();
      const meta: Record<string, unknown> = {};
      attach(tool, meta);
      writeRecord(tool, "dokimi.suite", "[]");

      check.isEqualTo(seat, meta, {}, "the meta has no record");
    });

    it("throws the fault on a standard seat", ({ seat }) => {
      const thrown = check.doesThrow(
        seat,
        () => writeRecord(new Standard(), "dokimi.suite", "[]"),
        "a standard seat does not take faults",
      );

      check.isEqualTo(
        seat,
        (thrown as Error).message,
        NOT_AN_OBJECT,
        "the fault states the record",
      );
    });
  });
});
