// Registers the matchers in shadow mode, with the log that the spec names.
require("../../../../dist/cjs/jest.js").register({
  mode: "shadow",
  log: process.env.DOKIMI_SHADOW_LOG,
});
