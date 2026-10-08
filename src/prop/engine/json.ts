/**
 * Strict JSON, as a store file must be: one JSON text that repeats no name
 * within an object and nests at most a given number of levels.
 *
 * An integer, a number without a fraction and without an exponent, reads as
 * a bigint, and any other number as a number, so a reader tells 1 from 1.0
 * as every language's JSON reader does.
 */

/** A JSON text that is malformed, repeats a name, or nests too deep. */
export class JsonError extends Error {
  /**
   * Returns the error of a text.
   *
   * @param message - What is wrong with the text.
   */
  constructor(message: string) {
    super(message);
    this.name = "JsonError";
  }
}

/** The escapes of a JSON string, by the character after the backslash. */
const ESCAPES: ReadonlyMap<string, string> = new Map([
  ['"', '"'],
  ["\\", "\\"],
  ["/", "/"],
  ["b", "\b"],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
]);

/** A number of the JSON grammar. */
const NUMBER = /-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/y;

/** The reader of one text. */
class Reader {
  readonly #text: string;
  readonly #maxDepth: number;
  #at = 0;

  constructor(text: string, maxDepth: number) {
    this.#text = text;
    this.#maxDepth = maxDepth;
  }

  /** Throws the error of what is wrong at the current position. */
  #fail(what: string): never {
    throw new JsonError(`prop: the JSON at ${this.#at}: ${what}`);
  }

  /** Moves past whitespace. */
  #skip(): void {
    while (
      " \t\n\r".includes(this.#text.charAt(this.#at)) &&
      this.#at < this.#text.length
    ) {
      this.#at += 1;
    }
  }

  /** Reads the whole text as one value. */
  document(): unknown {
    const value = this.#value(1);
    this.#skip();
    if (this.#at !== this.#text.length)
      this.#fail("the text continues after its value");
    return value;
  }

  /** Reads one value at depth, the level that an object or an array there takes. */
  #value(depth: number): unknown {
    this.#skip();
    const char = this.#text.charAt(this.#at);
    if (char === "{" || char === "[") {
      if (depth > this.#maxDepth)
        this.#fail(`the value nests past ${this.#maxDepth} levels`);
      return char === "{" ? this.#object(depth) : this.#array(depth);
    }
    if (char === '"') return this.#string();
    for (const [word, value] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (this.#text.startsWith(word, this.#at)) {
        this.#at += word.length;
        return value;
      }
    }
    return this.#number();
  }

  /** Reads an object, which repeats no name. */
  #object(depth: number): Record<string, unknown> {
    this.#at += 1;
    const object: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    this.#skip();
    if (this.#text.charAt(this.#at) === "}") {
      this.#at += 1;
      return object;
    }
    for (;;) {
      this.#skip();
      if (this.#text.charAt(this.#at) !== '"')
        this.#fail("an object states a name that is no string");
      const name = this.#string();
      if (Object.hasOwn(object, name))
        this.#fail(`an object repeats the name ${JSON.stringify(name)}`);
      this.#skip();
      if (this.#text.charAt(this.#at) !== ":")
        this.#fail("a name is not followed by a colon");
      this.#at += 1;
      object[name] = this.#value(depth + 1);
      this.#skip();
      const next = this.#text.charAt(this.#at);
      this.#at += 1;
      if (next === "}") return object;
      if (next !== ",") this.#fail("an object is not closed");
    }
  }

  /** Reads an array. */
  #array(depth: number): unknown[] {
    this.#at += 1;
    const array: unknown[] = [];
    this.#skip();
    if (this.#text.charAt(this.#at) === "]") {
      this.#at += 1;
      return array;
    }
    for (;;) {
      array.push(this.#value(depth + 1));
      this.#skip();
      const next = this.#text.charAt(this.#at);
      this.#at += 1;
      if (next === "]") return array;
      if (next !== ",") this.#fail("an array is not closed");
    }
  }

  /** Reads a string. */
  #string(): string {
    this.#at += 1;
    let out = "";
    for (;;) {
      const char = this.#text.charAt(this.#at);
      if (this.#at >= this.#text.length) this.#fail("a string is not closed");
      this.#at += 1;
      if (char === '"') return out;
      if (char < " ") this.#fail("a string contains a control character");
      out += char === "\\" ? this.#escaped() : char;
    }
  }

  /** Reads the escape after a backslash, and returns the character that it states. */
  #escaped(): string {
    const marker = this.#text.charAt(this.#at);
    this.#at += 1;
    if (marker === "u") {
      const hex = this.#text.slice(this.#at, this.#at + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex))
        this.#fail("a string states a malformed escape");
      this.#at += 4;
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    const unescaped = ESCAPES.get(marker);
    if (unescaped === undefined) this.#fail("a string states a malformed escape");
    return unescaped;
  }

  /** Reads a number: a bigint for an integer, and a number otherwise. */
  #number(): bigint | number {
    NUMBER.lastIndex = this.#at;
    const match = NUMBER.exec(this.#text);
    if (match === null) this.#fail("no value starts here");
    this.#at += match[0].length;
    if (match[1] === undefined && match[2] === undefined) return BigInt(match[0]);
    return Number(match[0]);
  }
}

/**
 * Returns the value of a strict JSON text: objects without a prototype and
 * with no repeated name, integers as bigints, and other numbers as numbers.
 *
 * @param text - The text.
 * @param maxDepth - The most levels of objects and arrays, the outermost
 *   being the first.
 * @returns The value.
 * @throws JsonError for a text that is no JSON, repeats a name within an
 *   object, or nests past maxDepth levels.
 */
export function parse(text: string, maxDepth: number): unknown {
  return new Reader(text, maxDepth).document();
}
