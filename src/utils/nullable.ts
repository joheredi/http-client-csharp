/**
 * Nullable type utilities for C# code generation.
 *
 * Determines whether a model property should be rendered with the `?` nullable
 * suffix in generated C# code. The rules match the legacy HTTP client C# emitter's
 * PropertyProvider.cs (lines 86–88):
 *
 * 1. **Optional non-collection types → nullable (`T?`).** When a property is optional,
 *    the C# type gets `?` to represent the missing-value case. Value types become
 *    `Nullable<T>`; reference types get `?` (no-op under `#nullable disable` but
 *    consistent with the legacy output).
 * 2. **Required types → never nullable.** A required property always has a value.
 * 3. **Collections → never nullable.** Arrays and dictionaries use `ChangeTrackingList`
 *    / `ChangeTrackingDictionary` for "undefined" semantics instead of null.
 * 4. **Explicitly nullable types (`SdkNullableType`) that aren't collections → nullable.**
 *    When TCGC wraps a type in `SdkNullableType`, it means the TypeSpec type
 *    explicitly allows `null` (e.g., `prop: string | null`).
 *
 * @module
 */

import type { SdkType } from "@azure-tools/typespec-client-generator-core";

/**
 * Checks whether an SDK type is a collection type (array or dictionary).
 *
 * Collection types are never nullable in the C# HTTP client emitter; instead,
 * the emitter uses `ChangeTrackingList<T>` / `ChangeTrackingDictionary<K,V>`
 * to represent the difference between "not set" and "empty".
 *
 * @param type - An SDK type from TCGC.
 * @returns `true` if the type is an array or dictionary (after unwrapping nullable).
 */
export function isCollectionType(type: SdkType): boolean {
  const unwrapped = unwrapNullableType(type);
  return unwrapped.kind === "array" || unwrapped.kind === "dict";
}

/**
 * Unwraps an `SdkNullableType` wrapper to get the inner type.
 *
 * TCGC represents explicitly nullable types (e.g., `string | null`) by wrapping
 * the underlying type in `SdkNullableType`. This function strips that wrapper so
 * that `TypeExpression` renders the base type without double-applying `?`.
 *
 * Returns the type unchanged if it is not an `SdkNullableType`.
 *
 * @param type - An SDK type from TCGC, possibly an `SdkNullableType` wrapper.
 * @returns The inner type if nullable, or the original type unchanged.
 */
export function unwrapNullableType(type: SdkType): SdkType {
  return type.kind === "nullable" ? type.type : type;
}

/**
 * Determines whether a model property should be rendered as nullable (`T?`) in C#.
 *
 * Matches the legacy emitter's rule from PropertyProvider.cs lines 86–88:
 * ```csharp
 * if (!inputProperty.IsRequired && !propertyType.IsCollection)
 * {
 *     propertyType = propertyType.WithNullable(true);
 * }
 * ```
 *
 * In TCGC terms:
 * - `!IsRequired` → `property.optional === true`
 * - `IsCollection` → type (after unwrapping nullable) is `"array"` or `"dict"`
 *
 * Additionally, if the type is explicitly `SdkNullableType` (meaning the TypeSpec
 * definition includes `| null`), the property is nullable even if required — unless
 * it's a collection.
 *
 * @param property - An object with `type` (SdkType) and `optional` (boolean) fields.
 *   Accepts `SdkModelPropertyType` and similar property-like structures.
 * @returns `true` if the property should be rendered with `?` in C#.
 *
 * @example
 * ```ts
 * // Optional int → nullable (int?)
 * isPropertyNullable({ type: intType, optional: true });  // true
 *
 * // Required string → not nullable
 * isPropertyNullable({ type: stringType, optional: false });  // false
 *
 * // Optional array → not nullable (collections are never nullable)
 * isPropertyNullable({ type: arrayType, optional: true });  // false
 *
 * // Required but explicitly nullable (string | null) → nullable
 * isPropertyNullable({ type: nullableStringType, optional: false });  // true
 * ```
 */
export function isPropertyNullable(property: {
  type: SdkType;
  optional: boolean;
}): boolean {
  // Collections are never nullable, regardless of optionality or explicit nullability
  if (isCollectionType(property.type)) {
    return false;
  }

  // Explicitly nullable types (SdkNullableType wrapper) are always nullable
  if (property.type.kind === "nullable") {
    return true;
  }

  // Optional non-collection types are nullable
  return property.optional;
}
