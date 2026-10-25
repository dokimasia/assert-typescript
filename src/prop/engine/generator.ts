// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The generators, decoded from a case.
 *
 * A generator's decode asks the case for its choices in a fixed order and
 * returns the value that they decode to. The order of the requests, their
 * bounds, which of them decide structure, and the spans around them are
 * the definition's. Two implementations that agree on them decode the same
 * value from the same choices.
 *
 * Every generator but a map decodes inside a span labelled with its id. A
 * map makes its source's choices and opens no span of its own. A list and a
 * dict decode their elements as collection.collect states, each in a span
 * that starts at the element's continue flag.
 */

export * from "./generator/base.js";
export * from "./generator/collections.js";
export * from "./generator/scalars.js";
