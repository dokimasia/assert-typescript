// The configuration of the consumer project of tools/consumer/run.sh, in
// jest's default CommonJS mode.
module.exports = {
  testMatch: ["<rootDir>/probe.test.cjs"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.cjs"],
};
