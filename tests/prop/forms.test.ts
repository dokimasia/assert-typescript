// Copyright Dokimasia B.V. 2026
// SPDX-License-Identifier: MIT

/** The spec of the module of the property forms. */

import { describe } from "vitest";
import { check } from "../../src/index.js";
import { compareText } from "../../src/order.js";
import { FORMS } from "../../src/prop/form.js";
import * as behaviour from "../../src/prop/forms/behaviour.js";
import * as contents from "../../src/prop/forms/contents.js";
import * as relations from "../../src/prop/forms/relations.js";
import * as values from "../../src/prop/forms/values.js";
import * as forms from "../../src/prop/forms.js";
import { test as it } from "../../src/vitest.js";

describe("forms", () => {
  it("exports a form for each form of the table of forms", ({ seat }) => {
    check.isEqualTo(
      seat,
      Object.keys(forms).sort(compareText),
      Object.keys(FORMS).sort(compareText),
      "the 37 forms",
    );
  });

  it("exports the forms of the modules behaviour, contents, relations and values", ({
    seat,
  }) => {
    check.isEqualTo(
      seat,
      { ...forms },
      { ...behaviour, ...contents, ...relations, ...values },
      "the forms of the four modules",
    );
  });
});
