/**
 * Utility functions for models with additional properties (AdditionalProperties).
 *
 * Additional properties arise from TypeSpec `extends Record<T>` or `...Record<T>`
 * patterns. TCGC represents them as `SdkModelType.additionalProperties: SdkType`.
 * The emitter generates a typed `IDictionary<string, T> AdditionalProperties`
 * property on the C# model, replacing the raw `_additionalBinaryDataProperties`
 * catch-all used by models without typed additional properties.
 *
 * @module
 */

import type { Children } from "@alloy-js/core";
import type {
  SdkModelType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { System } from "../builtins/system.js";
import { unwrapNullableType } from "./nullable.js";
import { SCALAR_TO_CSHARP } from "./type-mapping.js";

/**
 * Property name used for the typed additional properties dictionary in generated C# models.
 *
 * Matches the legacy emitter's `AdditionalPropertiesHelper.AdditionalPropertiesPropName`.
 */
export const ADDITIONAL_PROPERTIES_PROP_NAME = "AdditionalProperties";

/**
 * Parameter name used in the serialization constructor for the typed
 * additional properties dictionary.
 */
export const ADDITIONAL_PROPERTIES_PARAM_NAME = "additionalProperties";

/**
 * Checks whether a model defines typed additional properties.
 *
 * Returns true when the TCGC model has an `additionalProperties` type set,
 * indicating that the model extends or spreads a `Record<T>` type.
 *
 * @param model - The TCGC SDK model type.
 * @returns `true` if the model has typed additional properties.
 */
export function hasAdditionalProperties(model: SdkModelType): boolean {
  return model.additionalProperties !== undefined;
}

/**
 * Checks whether a model (or any ancestor) defines typed additional properties.
 *
 * Walks up the inheritance chain to find the first model that defines
 * `additionalProperties`. This is needed because the property and field
 * are declared on the model that defines them (typically the root), and
 * derived models inherit them.
 *
 * @param model - The TCGC SDK model type.
 * @returns `true` if the model or any ancestor has typed additional properties.
 */
export function hasInheritedAdditionalProperties(model: SdkModelType): boolean {
  if (model.additionalProperties !== undefined) return true;
  if (model.baseModel) return hasInheritedAdditionalProperties(model.baseModel);
  return false;
}

/**
 * Gets the model in the hierarchy that defines additional properties.
 *
 * Walks up the inheritance chain to find the defining model.
 * Returns undefined if no model in the hierarchy defines additional properties.
 *
 * @param model - The TCGC SDK model type.
 * @returns The model that defines `additionalProperties`, or undefined.
 */
export function getAdditionalPropertiesDefiningModel(
  model: SdkModelType,
): SdkModelType | undefined {
  if (model.additionalProperties !== undefined) return model;
  if (model.baseModel)
    return getAdditionalPropertiesDefiningModel(model.baseModel);
  return undefined;
}

/**
 * Set of TCGC scalar kinds that map directly to C# primitive types
 * in additional properties dictionaries. All other types (model, array,
 * union, unknown) use `BinaryData` instead.
 *
 * The legacy emitter only uses typed dictionaries for simple scalar types.
 * Complex types (models, arrays, unions) are stored as `BinaryData` because
 * they require ModelReaderWriter for round-trip serialization.
 */
const SIMPLE_SCALAR_KINDS = new Set([
  "string",
  "boolean",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "float32",
  "float64",
  "decimal",
  "decimal128",
  "integer",
  "safeint",
  "numeric",
  "float",
]);

/**
 * Renders the C# type expression for the additional properties value type.
 *
 * Maps the TCGC `SdkType` to a C# type suitable for use in
 * `IDictionary<string, T>` declarations.
 *
 * The legacy emitter only uses typed dictionaries for simple scalar types
 * (float, string, int, bool, etc.). Complex types (model, union, unknown)
 * are represented as `BinaryData`. Array types use `BinaryData[]`.
 *
 * @param type - The TCGC SDK type representing the additional properties value type.
 * @returns A JSX/Children element rendering the C# type.
 */
export function renderAdditionalPropertiesValueType(type: SdkType): Children {
  const unwrapped = unwrapNullableType(type);

  // Simple scalar types get typed dictionaries
  if (SIMPLE_SCALAR_KINDS.has(unwrapped.kind)) {
    if (unwrapped.__raw) {
      return <TypeExpression type={unwrapped.__raw} />;
    }
    const csharpType = SCALAR_TO_CSHARP.get(unwrapped.kind);
    if (csharpType) return csharpType;
  }

  // Array types use BinaryData[] (each element is serialized to BinaryData)
  if (unwrapped.kind === "array") {
    return <>{System.BinaryData}[]</>;
  }

  // All other complex types (model, union, unknown, etc.) → BinaryData
  return System.BinaryData;
}

/**
 * Checks whether the additional properties value type uses `BinaryData`.
 *
 * Returns true for all non-simple-scalar, non-array types (unknown, model, union).
 *
 * @param type - The TCGC SDK type representing the additional properties value type.
 * @returns `true` if the value type maps to `BinaryData`.
 */
export function isAdditionalPropertiesBinaryData(type: SdkType): boolean {
  const unwrapped = unwrapNullableType(type);
  return !SIMPLE_SCALAR_KINDS.has(unwrapped.kind) && unwrapped.kind !== "array";
}

/**
 * Checks whether the additional properties value type is an array.
 *
 * Array additional properties use `BinaryData[]` as the value type and
 * need special serialization (WriteStartArray/WriteEndArray) and
 * deserialization (EnumerateArray) patterns.
 *
 * @param type - The TCGC SDK type representing the additional properties value type.
 * @returns `true` if the value type is an array.
 */
export function isAdditionalPropertiesArray(type: SdkType): boolean {
  const unwrapped = unwrapNullableType(type);
  return unwrapped.kind === "array";
}
