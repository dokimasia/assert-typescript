/**
 * Relaxations a caller applies to one comparison.
 *
 * An option applies to the call it is passed to and nothing else.
 * There is no global setting, because a comparison rule changed in one
 * place and read in another is how two tests come to mean different
 * things by the same assertion.
 *
 * ```ts
 * check.equal(seat, reply.items, [], "no items came back", equateEmpty());
 * ```
 */

export { byIdentity, equateEmpty, equateNans, type Option } from "./matcher/option.js";
