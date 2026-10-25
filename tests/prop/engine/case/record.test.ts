// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/**
 * The spec of the types of the parts of the record of a case. Its cases hold
 * at compile time: `npm run types` checks them, and vitest runs nothing that
 * can fail.
 */

import { describe, expectTypeOf, it } from "vitest";
import type { Request } from "../../../../src/prop/engine/case/providers.js";
import type {
  Drawn,
  Mark,
  Observer,
  Place,
  Span,
  Step,
  Where,
} from "../../../../src/prop/engine/case/record.js";
import type { Decoder } from "../../../../src/prop/engine/case.js";
import type { Value } from "../../../../src/prop/engine/choice.js";

describe("record", () => {
  describe("Observer", () => {
    it("takes the index, the request and the value of each choice", () => {
      expectTypeOf<Observer["step"]>().parameters.toEqualTypeOf<
        [index: number, request: Request, value: Value]
      >();
    });
  });

  describe("Step", () => {
    it("states an action, and a client and a drain mark that may be absent", () => {
      expectTypeOf<Step>().toEqualTypeOf<{
        readonly action: string;
        readonly client?: number | undefined;
        readonly drain?: boolean | undefined;
      }>();
    });
  });

  describe("Place", () => {
    it("states a part, and a position and an action that may be absent", () => {
      expectTypeOf<Place>().toEqualTypeOf<{
        readonly part: string;
        readonly position?: number | undefined;
        readonly action?: string | undefined;
      }>();
    });
  });

  describe("Where", () => {
    it("states the label of a draw and the place of a machine, each optional", () => {
      expectTypeOf<Where>().toEqualTypeOf<{
        readonly label?: string | undefined;
        readonly place?: Place | undefined;
      }>();
    });
  });

  describe("Span", () => {
    it("has an end that a case sets when the span closes", () => {
      expectTypeOf<Span>().toEqualTypeOf<{
        readonly label: string;
        readonly start: number;
        end: number;
        readonly depth: number;
        readonly parent: number | undefined;
      }>();
    });
  });

  describe("Drawn", () => {
    it("states the label, the value, the span and the generator of a draw", () => {
      expectTypeOf<Drawn>().toEqualTypeOf<{
        readonly label: string;
        readonly value: unknown;
        readonly span: number;
        readonly generator: Decoder;
      }>();
    });
  });

  describe("Mark", () => {
    it("states the lengths of the choices, the spans and the draws", () => {
      expectTypeOf<Mark>().toEqualTypeOf<{
        readonly choices: number;
        readonly spans: number;
        readonly draws: number;
      }>();
    });
  });
});
