/**
 * Model-level utility functions for C# code generation.
 *
 * These functions determine model-level characteristics that affect how
 * the C# type declaration is generated (class vs struct, etc.).
 *
 * @module
 */

import {
  type SdkModelType,
  UsageFlags,
} from "@azure-tools/typespec-client-generator-core";

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

/**
 * Determines whether a model is used exclusively for multipart form data
 * and should NOT have a model file generated.
 *
 * The legacy emitter does not generate model classes for types that are only
 * used as multipart request bodies (e.g., `MultiPartRequest`, `File`). These
 * types have `UsageFlags.MultipartFormData` set but lack `Json` or `Xml`
 * usage flags. Instead, multipart operations use raw `BinaryContent` parameters
 * and the `MultiPartFormDataBinaryContent` helper to build the request body.
 *
 * Models with BOTH multipart AND JSON/XML usage (e.g., a model used as a JSON
 * part in one operation and as a direct JSON body in another) are NOT excluded
 * — they still need model files for their JSON/XML serialization path.
 *
 * @param model - The TCGC SDK model type to check.
 * @returns `true` if the model is multipart-only and should not be generated.
 */
export function isMultipartOnlyModel(model: SdkModelType): boolean {
  const hasMultipart = (model.usage & UsageFlags.MultipartFormData) !== 0;
  const hasJsonOrXml = (model.usage & (UsageFlags.Json | UsageFlags.Xml)) !== 0;
  return hasMultipart && !hasJsonOrXml;
}
