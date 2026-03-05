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
import type { SdkConstantType } from "@azure-tools/typespec-client-generator-core";
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
 * Well-known symbol prefix for Unknown discriminator model refkeys.
 *
 * Used to create deterministic refkeys for emitter-synthesized `Unknown{BaseName}`
 * classes. Both the class declaration (in UnknownDiscriminatorModel.tsx) and the
 * factory method (in ModelFactoryMethod.tsx) use this to produce matching refkeys
 * so Alloy can resolve cross-file references and auto-generate `using` directives.
 */
const UNKNOWN_MODEL_PREFIX = Symbol.for("http-client-csharp:unknown-model");

/**
 * Well-known symbol prefix for the ModelReaderWriterContext-derived class refkey.
 *
 * There is exactly one context class per emitter run (e.g., `SampleTypeSpecContext`).
 * Both the declaration (in ModelReaderWriterContextFile.tsx) and references from
 * serialization code (PersistableModelWriteCore) use this constant to produce a
 * matching refkey, enabling Alloy to resolve the reference and auto-generate
 * `using` directives when the context class is in a different namespace.
 */
const MRW_CONTEXT_PREFIX = Symbol.for("http-client-csharp:mrw-context");

/**
 * Creates a refkey for the Unknown discriminator variant of an abstract base model.
 *
 * Given the raw TypeSpec type of the abstract base model, produces a deterministic
 * refkey that matches between the Unknown class declaration and any references to it
 * (e.g., in factory methods). This enables Alloy's automatic `using` directive
 * generation when the factory method is in a different namespace.
 *
 * @param baseModelRawType - The raw TypeSpec type of the abstract base model
 *   (from `sdkModelType.__raw`).
 * @returns A refkey for the `Unknown{BaseName}` class.
 */
export function unknownModelRefkey(baseModelRawType: Type): Refkey {
  return refkey(UNKNOWN_MODEL_PREFIX, baseModelRawType);
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

/**
 * Well-known symbol prefix for the `Argument` internal static helper class.
 *
 * The `Argument` class provides parameter validation methods (`AssertNotNull`,
 * `AssertNotNullOrEmpty`, etc.) used by model constructors and client methods.
 * Using a stable refkey allows Alloy to automatically generate `using` directives
 * when the reference site is in a different namespace from the declaration.
 */
const ARGUMENT_PREFIX = Symbol.for("http-client-csharp:argument");

/**
 * Creates the refkey for the `Argument` internal helper class.
 *
 * This refkey is registered on the `ClassDeclaration` in `ArgumentFile.tsx`
 * and referenced via `code` templates in `ModelConstructors.tsx` (and other
 * components that emit `Argument.AssertNotNull` calls). When the referencing
 * code is in a different namespace, Alloy automatically adds the required
 * `using` directive.
 *
 * @returns A stable refkey for the `Argument` class.
 */
export function argumentRefkey(): Refkey {
  return refkey(ARGUMENT_PREFIX);
}

/**
 * Well-known symbol prefix for literal type wrapper struct refkeys.
 *
 * Used to create deterministic refkeys for emitter-synthesized literal type
 * wrapper structs (e.g., `ThingOptionalLiteralFloat`). Both the struct
 * declaration (in LiteralTypeFile.tsx) and property type references
 * (in ModelProperty.tsx) use this constant to produce matching refkeys,
 * enabling Alloy to resolve cross-file references and auto-generate
 * `using` directives.
 */
const LITERAL_TYPE_PREFIX = Symbol.for("http-client-csharp:literal-type");

/**
 * Creates a refkey for a literal type wrapper struct.
 *
 * Given the TCGC constant type, produces a deterministic refkey that matches
 * between the struct declaration and any property type references. This enables
 * Alloy's automatic `using` directive generation when the wrapper struct is in
 * a different namespace from the model that references it.
 *
 * @param constantType - The TCGC SdkConstantType representing the literal value.
 * @returns A stable refkey for the wrapper struct declaration.
 */
export function literalTypeRefkey(constantType: SdkConstantType): Refkey {
  return refkey(LITERAL_TYPE_PREFIX, constantType);
}

/**
 * Creates the refkey for the single ModelReaderWriterContext-derived class
 * generated per emitter run (e.g., `SampleTypeSpecContext`).
 *
 * This refkey is deterministic: every call returns the same value because the
 * underlying symbol is created with `Symbol.for`. It is used in two places:
 * - {@link ../components/infrastructure/ModelReaderWriterContextFile} assigns it
 *   to the `ClassDeclaration` so the class is discoverable.
 * - {@link ../components/serialization/PersistableModelWriteCore} references it
 *   to emit `{ContextClass}.Default` as the third argument to
 *   `ModelReaderWriter.Write`.
 *
 * @returns A stable refkey for the context class.
 */
export function modelReaderWriterContextRefkey(): Refkey {
  return refkey(MRW_CONTEXT_PREFIX);
}
