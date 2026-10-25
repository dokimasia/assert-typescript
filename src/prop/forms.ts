// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The property forms: each runs an assertion on every case of a run, as
 * forAll runs a body, and fails the test with one record of the form's id,
 * `prop-` and the assertion's id. The record's detail has the fields of
 * prop-for-all, and its failure is the assertion's record of the minimal
 * case.
 *
 * A form over a function takes a function of the generated input where its
 * assertion takes the value that it examines. A form of a relation
 * generates the arguments that the relation takes: the input, a and b for
 * isCommutative, and a, b and c for isAssociative.
 *
 * Every form takes the generator of its input through the option using,
 * the options of a run, the relaxations of its assertion where the
 * assertion takes any, and the cases that example and examples state. Each
 * form returns a promise of its verdict, so await the call.
 */

export * from "./forms/behaviour.js";
export * from "./forms/contents.js";
export * from "./forms/relations.js";
export * from "./forms/values.js";
