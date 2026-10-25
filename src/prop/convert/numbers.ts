// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The converters of the shapes whose TypeScript value is a number: an int of
 * 8, 16 or 32 bits, and an offset.
 */

import { type Converter, refuse } from "./converter.js";

/** The widest int, in bits, whose TypeScript value is a number. */
export const SMALL_INT_WIDTH = 32;

/** The converter of an int of 8, 16 or 32 bits, whose TypeScript value is a number. */
export const SMALL_INT: Converter = {
  to: (value) => Number(value),
  back: (value) => {
    if (typeof value === "bigint") {
      return value;
    }
    if (!Number.isSafeInteger(value)) {
      refuse(value, "int");
    }
    return BigInt(value as number);
  },
};

/** The converter of an offset, whose TypeScript value is the seconds east of UTC. */
export const OFFSET: Converter = {
  to: (value) => Number(value),
  back: (value) => {
    if (typeof value === "bigint") {
      return value;
    }
    if (!Number.isSafeInteger(value)) {
      refuse(value, "offset");
    }
    return BigInt(value as number);
  },
};
