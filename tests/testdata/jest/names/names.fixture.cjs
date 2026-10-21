// Writes the names of jest's chain and of the properties of jest's expect,
// with nothing registered, to the file that the spec names.
const { writeFileSync } = require("node:fs");
const { expect, test } = require("@jest/globals");

/** Returns the names of the members of target and of its prototypes. */
function membersOf(target) {
  const names = [];
  for (let at = target; at !== null; at = Object.getPrototypeOf(at)) {
    names.push(...Object.getOwnPropertyNames(at));
  }
  return names;
}

test("writes the names of jest's expect", () => {
  const chain = expect(undefined);
  writeFileSync(
    process.env.DOKIMI_NAMES_FILE,
    JSON.stringify({
      chain: [
        ...membersOf(chain),
        ...membersOf(chain.not),
        ...membersOf(chain.resolves),
        ...membersOf(chain.rejects),
      ],
      expect: [
        ...Object.getOwnPropertyNames(expect),
        ...Object.getOwnPropertyNames(expect.not),
      ],
    }),
  );
});
