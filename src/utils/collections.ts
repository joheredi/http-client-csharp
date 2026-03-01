/**
 * Collection type utilities for C# code generation.
 *
 * Determines the correct C# collection interface for model properties and
 * constructor parameters based on usage direction (input vs output). The rules
 * match the legacy HTTP client C# emitter's 3-layer collection type system:
 *
 * 1. **TypeFactory.CreateCSharpType** — arrays start as `IList<T>`, dicts as
 *    `IDictionary<string, T>`.
 * 2. **CSharpType.GetOutputType** — read-only properties use `IReadOnlyList<T>`
 *    / `IReadOnlyDictionary<string, T>`.
 * 3. **CSharpType.GetInputType** — constructor parameters use `IEnumerable<T>`
 *    for arrays (the broadest input interface).
 *
 * See:
 * - TypeFactory.cs lines 122–129 (initial creation)
 * - CSharpType.cs lines 326–378 (GetInputType / GetOutputType)
 * - PropertyProvider.cs line 100 (`IsReadOnly ? OutputType : propertyType`)
 *
 * @module
 */

import type {
  SdkArrayType,
  SdkDictionaryType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { unwrapNullableType } from "./nullable.js";

/**
 * The C# collection interface variant used for model property declarations.
 *
 * - `"IList"` — mutable list interface for input/writable properties
 * - `"IReadOnlyList"` — immutable list interface for output/read-only properties
 * - `"IDictionary"` — mutable dictionary interface for input/writable properties
 * - `"IReadOnlyDictionary"` — immutable dictionary interface for output/read-only properties
 */
export type CollectionPropertyVariant =
  | "IList"
  | "IReadOnlyList"
  | "IDictionary"
  | "IReadOnlyDictionary";

/**
 * The C# collection interface variant used for constructor/method parameters.
 *
 * - `"IEnumerable"` — broadest input interface for array parameters
 * - `"IDictionary"` — dictionary parameters keep the same interface
 */
export type CollectionParameterVariant = "IEnumerable" | "IDictionary";

/**
 * Determines the C# collection interface for a model property declaration
 * based on whether the property is read-only.
 *
 * Matches the legacy emitter's PropertyProvider.cs line 100:
 * ```csharp
 * Type = inputProperty.IsReadOnly ? propertyType.OutputType : propertyType;
 * ```
 *
 * - **Writable properties** (isReadOnly=false): Use mutable interfaces that allow
 *   mutation through the collection API (Add, Remove, indexer assignment).
 *   - Array → `IList<T>`
 *   - Dict  → `IDictionary<string, T>`
 *
 * - **Read-only properties** (isReadOnly=true): Use immutable interfaces because
 *   the property is server-populated and users should not modify it.
 *   - Array → `IReadOnlyList<T>`
 *   - Dict  → `IReadOnlyDictionary<string, T>`
 *
 * @param type - An SDK type that must be a collection (array or dict). Nullable
 *   wrappers are unwrapped automatically.
 * @param isReadOnly - Whether the property is read-only (visibility = [Read] only).
 * @returns The C# collection interface name to use for the property type.
 * @throws Error if the type is not a collection after unwrapping nullable.
 */
export function getCollectionPropertyVariant(
  type: SdkType,
  isReadOnly: boolean,
): CollectionPropertyVariant {
  const unwrapped = unwrapNullableType(type);

  if (unwrapped.kind === "array") {
    return isReadOnly ? "IReadOnlyList" : "IList";
  }

  if (unwrapped.kind === "dict") {
    return isReadOnly ? "IReadOnlyDictionary" : "IDictionary";
  }

  throw new Error(
    `getCollectionPropertyVariant called with non-collection type: ${unwrapped.kind}`,
  );
}

/**
 * Determines the C# collection interface for a constructor or method parameter.
 *
 * Matches the legacy emitter's CSharpType.GetInputType (CSharpType.cs lines 326–345):
 * ```csharp
 * private CSharpType GetInputType()
 * {
 *     if (IsList)
 *         return new CSharpType(typeof(IEnumerable<>), ...);
 *     // Dictionary unchanged
 * }
 * ```
 *
 * - **Arrays** → `IEnumerable<T>`: The broadest input interface, allowing callers to
 *   pass any enumerable (List, array, LINQ query, etc.). The constructor body converts
 *   via `.ToList()`.
 * - **Dicts** → `IDictionary<string, T>`: Dictionary parameters keep the mutable
 *   interface. The constructor body converts via `.ToDictionary()`.
 *
 * @param type - An SDK type that must be a collection (array or dict). Nullable
 *   wrappers are unwrapped automatically.
 * @returns The C# collection interface name to use for the parameter type.
 * @throws Error if the type is not a collection after unwrapping nullable.
 */
export function getCollectionParameterVariant(
  type: SdkType,
): CollectionParameterVariant {
  const unwrapped = unwrapNullableType(type);

  if (unwrapped.kind === "array") {
    return "IEnumerable";
  }

  if (unwrapped.kind === "dict") {
    return "IDictionary";
  }

  throw new Error(
    `getCollectionParameterVariant called with non-collection type: ${unwrapped.kind}`,
  );
}

/**
 * Extracts the element/value type from a collection type.
 *
 * - For arrays: returns the element type (`SdkArrayType.valueType`)
 * - For dicts: returns the value type (`SdkDictionaryType.valueType`)
 *
 * The key type for dictionaries is always `string` in the HTTP client C# emitter,
 * so only the value type is extracted.
 *
 * @param type - An SDK type that must be a collection (array or dict). Nullable
 *   wrappers are unwrapped automatically.
 * @returns The inner element/value SDK type.
 * @throws Error if the type is not a collection after unwrapping nullable.
 */
export function getCollectionValueType(type: SdkType): SdkType {
  const unwrapped = unwrapNullableType(type);

  if (unwrapped.kind === "array") {
    return (unwrapped as SdkArrayType).valueType;
  }

  if (unwrapped.kind === "dict") {
    return (unwrapped as SdkDictionaryType).valueType;
  }

  throw new Error(
    `getCollectionValueType called with non-collection type: ${unwrapped.kind}`,
  );
}

/**
 * Checks whether an SDK type is an array collection (after unwrapping nullable).
 *
 * @param type - An SDK type, possibly wrapped in SdkNullableType.
 * @returns `true` if the unwrapped type is an array.
 */
export function isArrayCollection(type: SdkType): boolean {
  return unwrapNullableType(type).kind === "array";
}

/**
 * Checks whether an SDK type is a dictionary collection (after unwrapping nullable).
 *
 * @param type - An SDK type, possibly wrapped in SdkNullableType.
 * @returns `true` if the unwrapped type is a dictionary.
 */
export function isDictCollection(type: SdkType): boolean {
  return unwrapNullableType(type).kind === "dict";
}
