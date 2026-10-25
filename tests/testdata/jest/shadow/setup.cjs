"use strict";
// Registers the matchers in shadow mode, with the log that the spec names.
const { env } = require("node:process");

require("../../../../dist/cjs/jest.js").register({
  mode: "shadow",
  log: env.DOKIMI_SHADOW_LOG,
});
