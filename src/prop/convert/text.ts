// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The converters of the shapes whose TypeScript value is text: uuid,
 * ip-address and decimal.
 */

import { type Converter, refuse } from "./converter.js";

/** The text of a UUID, and of an IPv4 address. */
const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4_TEXT =
  /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
const DECIMAL_TEXT = /^(-?)(\d+)(?:\.(\d+))?$/;

/** The five groups of the 32 hexadecimal digits of a UUID. */
const UUID_GROUPS = /^(.{8})(.{4})(.{4})(.{4})(.{12})$/;

/** A digit other than 0. */
const NONZERO = /[^0]/;

/** The radix of the groups of an IPv6 address. */
const HEX_RADIX = 16;

/** The 16-bit groups of an IPv6 address. */
const IPV6_GROUPS = 8;

/** The bytes of an IPv4 address. */
const IPV4_BYTES = 4;

/** The largest value of a byte of an IPv4 address. */
const OCTET_MAX = 255;

/** Returns the text of an IPv6 address, as RFC 5952 states it: the longest run of two or more zero groups, the first of equal runs, as `::`. */
function ipv6Text(bytes: Uint8Array): string {
  const groups = Array.from(
    { length: 8 },
    (_, i) => ((bytes[2 * i] as number) << 8) | (bytes[2 * i + 1] as number),
  );
  let [start, length] = [-1, 1];
  for (let i = 0; i < IPV6_GROUPS; i += 1) {
    let end = i;
    while (end < IPV6_GROUPS && groups[end] === 0) {
      end += 1;
    }
    if (end - i > length) {
      [start, length] = [i, end - i];
    }
  }
  const text = groups.map((group) => group.toString(HEX_RADIX));
  if (start < 0) {
    return text.join(":");
  }
  return `${text.slice(0, start).join(":")}::${text.slice(start + length).join(":")}`;
}

/** Returns the 16 bytes of an IPv6 address that the URL parser accepts, and undefined for other text. */
function ipv6Bytes(text: string): Uint8Array | undefined {
  let host: string;
  try {
    host = new URL(`http://[${text}]`).hostname;
  } catch {
    return undefined;
  }
  const [head, tail] = host.slice(1, -1).split("::") as [string, string?];
  const groupsOf = (part: string | undefined): number[] =>
    part === undefined || part === ""
      ? []
      : part.split(":").map((group) => Number.parseInt(group, 16));
  const first = groupsOf(head);
  const last = groupsOf(tail);
  const groups = [
    ...first,
    ...new Array<number>(IPV6_GROUPS - first.length - last.length).fill(0),
    ...last,
  ];
  return Uint8Array.from(groups.flatMap((group) => [group >> 8, group & 0xff]));
}

/** The converter of a UUID. */
export const UUID: Converter = {
  to: (value) => {
    const hex = Buffer.from(value as Uint8Array).toString("hex");
    return hex.replace(UUID_GROUPS, "$1-$2-$3-$4-$5");
  },
  back: (value) => {
    if (value instanceof Uint8Array) {
      return value;
    }
    if (typeof value !== "string" || !UUID_TEXT.test(value)) {
      refuse(value, "uuid");
    }
    return Uint8Array.from(Buffer.from(value.replaceAll("-", ""), "hex"));
  },
};

/** The converter of an IP address. */
export const IP_ADDRESS: Converter = {
  to: (value) => {
    const bytes = value as Uint8Array;
    return bytes.length === IPV4_BYTES ? bytes.join(".") : ipv6Text(bytes);
  },
  back: (value) => {
    if (value instanceof Uint8Array) {
      return value;
    }
    if (typeof value !== "string") {
      refuse(value, "ip-address");
    }
    const dotted = IPV4_TEXT.exec(value);
    if (dotted !== null) {
      const octets = dotted.slice(1).map(Number);
      if (octets.every((octet) => octet <= OCTET_MAX)) {
        return Uint8Array.from(octets);
      }
      refuse(value, "ip-address");
    }
    return ipv6Bytes(value) ?? refuse(value, "ip-address");
  },
};

/** Returns the converter of a decimal of scale digits after the point. */
export function decimalOf(scale: number): Converter {
  return {
    to: (value) => {
      const unscaled = value as bigint;
      const digits = (unscaled < 0n ? -unscaled : unscaled)
        .toString()
        .padStart(scale + 1, "0");
      const sign = unscaled < 0n ? "-" : "";
      if (scale === 0) {
        return `${sign}${digits}`;
      }
      return `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
    },
    back: (value) => {
      if (typeof value === "bigint") {
        return value;
      }
      const parts = typeof value === "string" ? DECIMAL_TEXT.exec(value) : null;
      if (parts === null) {
        refuse(value, "decimal");
      }
      const [, sign, integral, fraction = ""] = parts as unknown as [
        string,
        string,
        string,
        string?,
      ];
      if (NONZERO.test(fraction.slice(scale))) {
        throw new RangeError(
          `prop: ${value} has more digits than the scale of ${scale}`,
        );
      }
      const magnitude = BigInt(integral + fraction.slice(0, scale).padEnd(scale, "0"));
      return sign === "-" ? -magnitude : magnitude;
    },
  };
}
