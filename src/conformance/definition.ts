/**
 * Reading the definition this library is held to.
 *
 * The files are vendored rather than fetched, so a build is
 * reproducible and a test run needs no network. `npm run spec-sync`
 * refreshes them.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** This language's column in the naming table. */
export const LANGUAGE = "typescript";

/** Where the vendored definition sits, relative to this module. */
const SPEC = join(dirname(fileURLToPath(import.meta.url)), "spec");

/** What one assertion's entry in the definition states. */
export interface AssertionSpec {
  /** How many arguments the function form takes, message included and the seat left out. */
  readonly arity: number;
  /** What the assertion states. */
  readonly summary: string;
  /** The subpackage it is in, absent for the root namespace. */
  readonly package?: string;
  /** The fields that its failure record contains, and no others. */
  readonly detail_fields: readonly string[];
  /** The relaxations that it accepts. */
  readonly relaxations?: readonly string[];
}

/** One language's declared inability to supply an assertion. */
export interface Divergence {
  /** The assertion's canonical id. */
  readonly id: string;
  /** Whether the gap is blocked or merely open. */
  readonly stance: string;
  /** Why the library cannot supply it. */
  readonly why: string;
  /** What would close the gap, when anything would. */
  readonly remedy?: string;
}

/** This language's overlay: what it cannot supply, and why. */
export interface Overlay {
  /** The definition version this overlay was written against. */
  readonly extends: string;
  /** The language it speaks for. */
  readonly language: string;
  /** Every assertion this language does not supply. */
  readonly diverge: readonly Divergence[];
}

/** Read one file from the vendored definition. */
function read(name: string): unknown {
  return JSON.parse(readFileSync(join(SPEC, name), "utf8"));
}

/**
 * Answer the assertion table.
 *
 * @returns Every assertion the standard states, by canonical id.
 */
export function assertions(): Record<string, AssertionSpec> {
  return (read("assertions.json") as { assertions: Record<string, AssertionSpec> })
    .assertions;
}

/**
 * Answer each assertion mapped to the name this language uses.
 *
 * @returns The naming table's TypeScript column.
 */
export function names(): Record<string, string> {
  const table = (
    read("naming.json") as { names: Record<string, Record<string, string>> }
  ).names;
  return Object.fromEntries(
    Object.entries(table).map(([id, entry]) => [id, entry[LANGUAGE] as string]),
  );
}

/**
 * Answer the definition version this library implements.
 *
 * @returns The version, as the VERSION file states it.
 */
export function version(): string {
  return readFileSync(join(SPEC, "VERSION"), "utf8").trim();
}

/**
 * Answer this language's declared divergences.
 *
 * Every assertion the standard states is required. A library that
 * cannot supply one says so here, with the reason, so a gap nobody
 * could close and a gap nobody got to are told apart.
 *
 * @returns The overlay, as vendored.
 */
export function overlay(): Overlay {
  return read("overlay.json") as Overlay;
}

/**
 * Each relaxation the definition states, with this language's name.
 *
 * @returns Relaxation id to the name a caller types.
 */
export function relaxationNames(): Record<string, string> {
  const stated = (read("assertions.json") as { relaxations: Record<string, unknown> })
    .relaxations;
  const named = (
    read("naming.json") as { relaxations: Record<string, Record<string, string>> }
  ).relaxations;
  return Object.fromEntries(
    Object.keys(stated).map((id) => [
      id,
      (named[id] as Record<string, string>)[LANGUAGE] as string,
    ]),
  );
}

/**
 * Every surface id, with this language's name for it.
 *
 * An id the table gives TypeScript no name for maps to the empty
 * string, which is what an overlay declining it looks like.
 *
 * @returns Surface id to the name a caller types, across the types,
 *   members and helpers sections.
 */
export function surfaceNames(): Record<string, string> {
  const table = (
    read("naming.json") as {
      surface: Record<string, Record<string, Record<string, string>>>;
    }
  ).surface;

  const mapped: Record<string, string> = {};
  for (const section of ["types", "members", "helpers"]) {
    const rows = table[section] as Record<string, Record<string, string>>;
    for (const [sid, perLanguage] of Object.entries(rows)) {
      mapped[sid] = perLanguage[LANGUAGE] ?? "";
    }
  }
  return mapped;
}

/**
 * Reports whether a list section of the overlay has an entry of id. A
 * section that the overlay leaves out has none.
 */
function lists(section: "diverge" | "surface" | "relaxations", id: string): boolean {
  const entries = (
    overlay() as unknown as Record<string, { id: string }[] | undefined>
  )[section];
  return (entries ?? []).some((entry) => entry.id === id);
}

/**
 * Whether the overlay declines a surface id.
 *
 * @param surfaceId - The id, as the surface table states it.
 * @returns True when the overlay declares it not offered.
 */
export function declinesSurface(surfaceId: string): boolean {
  return lists("surface", surfaceId);
}

/**
 * Whether the overlay declines a relaxation.
 *
 * @param relaxation - The canonical relaxation id.
 * @returns True when the overlay declares it not offered.
 */
export function declinesRelaxation(relaxation: string): boolean {
  return lists("relaxations", relaxation);
}

/**
 * Whether the overlay excuses an assertion from being implemented.
 *
 * @param assertion The assertion's canonical id.
 * @returns True when the overlay declares a divergence for it.
 */
export function diverges(assertion: string): boolean {
  return lists("diverge", assertion);
}
