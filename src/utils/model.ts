/**
 * Model-level utility functions for C# code generation.
 *
 * These functions determine model-level characteristics that affect how
 * the C# type declaration is generated (class vs struct, etc.).
 *
 * @module
 */

import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";

/**
 * Determines whether a model should be generated as a C# `readonly struct`
 * instead of a `class`.
 *
 * Struct models differ from class models in several ways:
 * - Declaration: `public readonly partial struct X` (no base type, no abstract)
 * - Constructor: ALL non-readonly properties are constructor parameters
 *   (not just required ones)
 * - Raw data field: `private readonly` (not `private protected readonly`)
 *
 * Currently, TCGC's `SdkModelType` does not expose a `modelAsStruct` property.
 * This function checks for the property dynamically, enabling forward
 * compatibility when TCGC adds struct support. Until then, all models are
 * generated as classes.
 *
 * @see Legacy emitter: ModelProvider.cs lines 206–211
 * @param model - The TCGC SDK model type.
 * @returns `true` if the model should be generated as a struct.
 */
export function isModelStruct(model: SdkModelType): boolean {
  return (model as unknown as Record<string, unknown>).modelAsStruct === true;
}
