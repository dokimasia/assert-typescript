"use strict";
// The fixture suites of tests/jest.test.ts, which runs jest on them as a
// consumer's suite runs. Each project registers the matchers in one mode
// from its setup file, except names, which registers nothing.

/** Returns the project named name, whose setup file is in its directory. */
function project(name, setup) {
  return {
    displayName: name,
    rootDir: __dirname,
    testMatch: [`<rootDir>/${name}/*.fixture.cjs`],
    setupFilesAfterEnv: setup ? [`<rootDir>/${name}/setup.cjs`] : [],
  };
}

module.exports = {
  projects: [
    project("allow", true),
    project("shadow", true),
    project("strict", true),
    project("names", false),
  ],
};
