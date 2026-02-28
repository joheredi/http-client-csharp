/**
 * Refkey utilities for ensuring type declarations match emitter-framework references.
 *
 * The `TypeExpression` component from `@typespec/emitter-framework/csharp` resolves
 * type references using an internal `efRefkey(rawType)`, which prefixes alloy's
 * `refkey` with a well-known symbol (`Symbol.for("emitter-framework:csharp")`).
 * For our custom declarations (enums, models) to be resolvable by `TypeExpression`,
 * they must register the same prefixed refkey.
 *
 * This module re-creates the refkey derivation from the emitter-framework
 * (which is not publicly exported) to produce matching refkeys for declarations.
 *
 * @module
 */

import { refkey, type Refkey } from "@alloy-js/core";
import type { Type } from "@typespec/compiler";

/**
 * The well-known symbol prefix used by `@typespec/emitter-framework/csharp`
 * for its refkey derivation. Using `Symbol.for` ensures we get the exact same
 * Symbol instance as the emitter-framework, so our refkeys match theirs.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/for}
 */
const EF_CSHARP_PREFIX = Symbol.for("emitter-framework:csharp");

/**
 * Creates a refkey that matches what `TypeExpression` from the emitter-framework
 * uses when generating a `<Reference>` for the given TypeSpec type.
 *
 * Use this as the `refkey` prop on Alloy declaration components (`ClassDeclaration`,
 * `StructDeclaration`, `EnumDeclaration`) so that `TypeExpression` references
 * resolve correctly and generate proper `using` statements.
 *
 * @param rawType - The raw TypeSpec type (from `sdkType.__raw`).
 * @returns A refkey matching the emitter-framework's internal `efRefkey(rawType)`.
 */
export function efCsharpRefkey(rawType: Type): Refkey {
  return refkey(EF_CSHARP_PREFIX, rawType);
}

/**
 * Creates an array of refkeys for a type declaration that is resolvable by
 * both plain alloy `refkey()` calls and `TypeExpression` references.
 *
 * Returns `[userRefkey, efCsharpRefkey(rawType)]` where:
 * - `userRefkey` allows direct references via `refkey(sdkType)`
 * - `efCsharpRefkey(rawType)` matches the refkey that `TypeExpression` uses
 *
 * Use this for declarations that accept `Refkey | Refkey[]` (e.g., `EnumDeclaration`).
 * For declarations that only accept a single `Refkey` (e.g., `ClassDeclaration`,
 * `StructDeclaration`), use {@link efCsharpRefkey} directly.
 *
 * @param userRefkey - The refkey derived from the TCGC SDK type.
 * @param rawType - The raw TypeSpec type (from `sdkType.__raw`).
 * @returns An array of refkeys.
 */
export function declarationRefkeys(
  userRefkey: Refkey,
  rawType: Type | undefined,
): Refkey[] {
  if (rawType) {
    return [userRefkey, refkey(EF_CSHARP_PREFIX, rawType)];
  }
  return [userRefkey];
}
