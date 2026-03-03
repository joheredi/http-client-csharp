/**
 * Collection type expression rendering utilities for C# code generation.
 *
 * Renders the correct C# collection interface for model properties and
 * constructor parameters. For arrays, this replaces the default `T[]` from
 * TypeExpression with `IList<T>`, `IReadOnlyList<T>`, or `IEnumerable<T>`
 * depending on usage context. For dictionaries, writable properties use
 * `IDictionary<string, T>` and read-only properties use
 * `IReadOnlyDictionary<string, T>`.
 *
 * Handles nested collections recursively — e.g., `string[][]` renders as
 * `IList<IList<string>>` for a writable property.
 *
 * @module
 */

import type { Children } from "@alloy-js/core";
import { code } from "@alloy-js/core";
import type {
  SdkArrayType,
  SdkDictionaryType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { SystemCollectionsGeneric } from "../builtins/system-collections-generic.js";
import { unwrapNullableType } from "./nullable.js";

/**
 * Renders a C# type expression for a collection type used as a model property.
 *
 * Matches the legacy emitter's PropertyProvider type selection logic:
 * - Writable array → `IList<ElementType>`
 * - Read-only array → `IReadOnlyList<ElementType>`
 * - Writable dict → `IDictionary<string, ValueType>`
 * - Read-only dict → `IReadOnlyDictionary<string, ValueType>`
 *
 * For non-collection types, falls through to `TypeExpression`.
 * Handles nested collections recursively.
 *
 * @param type - An SDK type, possibly a collection.
 * @param isReadOnly - Whether the property is read-only (determines mutable vs immutable interface).
 * @returns A Children expression for the C# type.
 */
export function renderCollectionPropertyType(
  type: SdkType,
  isReadOnly: boolean,
): Children {
  const unwrapped = unwrapNullableType(type);

  if (unwrapped.kind === "array") {
    const elementType = (unwrapped as SdkArrayType).valueType;
    const elementExpr = renderCollectionPropertyType(elementType, isReadOnly);
    const variant = isReadOnly
      ? SystemCollectionsGeneric.IReadOnlyList
      : SystemCollectionsGeneric.IList;
    return code`${variant}<${elementExpr}>`;
  }

  if (unwrapped.kind === "dict") {
    const valueType = (unwrapped as SdkDictionaryType).valueType;
    const valueExpr = renderCollectionPropertyType(valueType, isReadOnly);
    const variant = isReadOnly
      ? SystemCollectionsGeneric.IReadOnlyDictionary
      : SystemCollectionsGeneric.IDictionary;
    return code`${variant}<string, ${valueExpr}>`;
  }

  // Non-collection: delegate to TypeExpression
  return <TypeExpression type={unwrapped.__raw!} />;
}

/**
 * Renders a C# type expression for a collection type used as a public
 * constructor parameter.
 *
 * Matches the legacy emitter's CSharpType.GetInputType logic:
 * - Array → `IEnumerable<ElementType>` (broadest input interface)
 * - Dict → `IDictionary<string, ValueType>` (unchanged from property type)
 *
 * For non-collection types, falls through to `TypeExpression`.
 * Inner nested collection elements use `IList` (property variant), matching
 * the legacy emitter where only the outermost collection parameter uses
 * IEnumerable.
 *
 * @param type - An SDK type, possibly a collection.
 * @returns A Children expression for the C# type.
 */
export function renderCollectionParameterType(type: SdkType): Children {
  const unwrapped = unwrapNullableType(type);

  if (unwrapped.kind === "array") {
    const elementType = (unwrapped as SdkArrayType).valueType;
    // Inner elements use IList (property variant), not IEnumerable
    const elementExpr = renderCollectionPropertyType(elementType, false);
    return code`${SystemCollectionsGeneric.IEnumerable}<${elementExpr}>`;
  }

  if (unwrapped.kind === "dict") {
    const valueType = (unwrapped as SdkDictionaryType).valueType;
    const valueExpr = renderCollectionPropertyType(valueType, false);
    return code`${SystemCollectionsGeneric.IDictionary}<string, ${valueExpr}>`;
  }

  // Non-collection: delegate to TypeExpression
  return <TypeExpression type={unwrapped.__raw!} />;
}
