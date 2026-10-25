// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the converters of the shapes whose TypeScript value is text. */

import { describe } from "vitest";
import { check } from "../../../src/index.js";
import { decimalOf, IP_ADDRESS, UUID } from "../../../src/prop/convert/text.js";
import { test as it } from "../../../src/vitest.js";
import { thrown } from "../../helpers.js";

/** Returns the bytes from 0 to 15. */
function sixteen(): Uint8Array {
  return Uint8Array.from({ length: 16 }, (_, i) => i);
}

describe("text", () => {
  describe("UUID", () => {
    it("converts 16 bytes to the grouped text in lowercase", ({ seat }) => {
      check.isEqualTo(
        seat,
        UUID.to(sixteen()),
        "00010203-0405-0607-0809-0a0b0c0d0e0f",
        "the text",
      );
    });

    it("converts the text in either case back to the bytes", ({ seat }) => {
      check.isEqualTo(
        seat,
        UUID.back("00010203-0405-0607-0809-0A0B0C0D0E0F"),
        sixteen(),
        "the bytes",
      );
    });

    it("refuses text that is no UUID", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => UUID.back("0001")),
        'prop: "0001" is no value of the uuid shape',
        "the refusal",
      );
    });
  });

  describe("IP_ADDRESS", () => {
    it("converts four bytes to dotted text", ({ seat }) => {
      check.isEqualTo(
        seat,
        IP_ADDRESS.to(Uint8Array.from([127, 0, 0, 1])),
        "127.0.0.1",
        "the dotted text",
      );
    });

    it("converts 16 bytes to the text with the longest run of zero groups as ::", ({
      seat,
    }) => {
      const bytes = new Uint8Array(16);
      bytes[15] = 1;

      check.isEqualTo(seat, IP_ADDRESS.to(bytes), "::1", "the loopback address");
    });

    it("converts dotted text and IPv6 text back to the bytes", ({ seat }) => {
      const loopback = new Uint8Array(16);
      loopback[15] = 1;

      check.isEqualTo(
        seat,
        [IP_ADDRESS.back("10.0.0.1"), IP_ADDRESS.back("::1")],
        [Uint8Array.from([10, 0, 0, 1]), loopback],
        "the bytes of each version",
      );
    });

    it("refuses dotted text with a byte above 255", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => IP_ADDRESS.back("256.0.0.1")),
        'prop: "256.0.0.1" is no value of the ip-address shape',
        "the refusal",
      );
    });

    it("refuses text that is no address", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => IP_ADDRESS.back("localhost")),
        'prop: "localhost" is no value of the ip-address shape',
        "the refusal",
      );
    });
  });

  describe("decimalOf", () => {
    it("converts an unscaled integer to text with scale digits after the point", ({
      seat,
    }) => {
      check.isEqualTo(
        seat,
        [decimalOf(2).to(-5n), decimalOf(0).to(42n)],
        ["-0.05", "42"],
        "the text of each scale",
      );
    });

    it("converts text back to the unscaled integer", ({ seat }) => {
      check.isEqualTo(
        seat,
        [decimalOf(2).back("-1.5"), decimalOf(2).back("3")],
        [-150n, 300n],
        "the unscaled integers",
      );
    });

    it("refuses text with more digits than the scale", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => decimalOf(1).back("1.25")),
        "prop: 1.25 has more digits than the scale of 1",
        "the refusal",
      );
    });

    it("refuses text that is no decimal", ({ seat }) => {
      check.isEqualTo(
        seat,
        thrown(() => decimalOf(1).back("1e3")),
        'prop: "1e3" is no value of the decimal shape',
        "the refusal",
      );
    });
  });
});
