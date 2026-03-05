/**
 * Required/optional property analysis utilities for C# model generation.
 *
 * These functions determine how model properties should behave in constructors
 * and property declarations based on their required/optional status. They
 * encapsulate the logic from the legacy emitter's PropertyProvider.cs and
 * ModelProvider.GetPropertyInitializers.
 *
 * Key rules (matching legacy emitter):
 * - Required non-nullable reference types need Argument.AssertNotNull in constructors
 * - Optional collections initialize to ChangeTrackingList/ChangeTrackingDictionary
 * - Required collections use .ToList()/.ToDictionary() from IEnumerable parameter
 * - Optional scalars get no explicit initialization (remain default/null)
 * - Properties named the same as their enclosing class get a "Property" suffix (CS0542)
 *
 * @module
 */

import type {
  SdkModelPropertyType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { Visibility } from "@typespec/http";
import {
  isCollectionType,
  isPropertyNullable,
  unwrapNullableType,
} from "./nullable.js";

/**
 * TCGC type kinds that map to C# reference types.
 *
 * Reference types can be null at runtime and require `Argument.AssertNotNull`
 * validation when they are required constructor parameters. Value types
 * (int, bool, DateTimeOffset, etc.) cannot be null and don't need validation.
 */
const CSHARP_REFERENCE_TYPE_KINDS = new Set<string>([
  "string", // System.String (class)
  "model", // Generated model classes
  "bytes", // System.BinaryData (class)
  "url", // System.Uri (class)
  "unknown", // System.BinaryData (class)
]);

/**
 * Determines whether an SDK type maps to a C# reference type.
 *
 * Reference types can be null at runtime, so required parameters of these
 * types need `Argument.AssertNotNull` validation in constructors. Collection
 * types (arrays, dictionaries) are also reference types but are handled
 * separately through ChangeTracking initialization.
 *
 * @param type - An SDK type from TCGC.
 * @returns `true` if the type maps to a C# reference type (class, not struct).
 */
export function isCSharpReferenceType(type: SdkType): boolean {
  const unwrapped = unwrapNullableType(type);
  return CSHARP_REFERENCE_TYPE_KINDS.has(unwrapped.kind);
}

/**
 * Determines whether a model property is read-only.
 *
 * A property is read-only when its visibility array contains only
 * `Visibility.Read`. This means the property is populated by the server
 * during deserialization and cannot be set by the user.
 *
 * Read-only properties never have setters and are not constructor parameters.
 *
 * @param property - An SDK model property from TCGC.
 * @returns `true` if the property is read-only (visibility = [Read] only).
 */
export function isPropertyReadOnly(property: SdkModelPropertyType): boolean {
  return (
    property.visibility !== undefined &&
    property.visibility.length === 1 &&
    property.visibility[0] === Visibility.Read
  );
}

/**
 * Determines whether a property should be a parameter in the public model
 * constructor.
 *
 * Matches the legacy emitter's AddInitializationParameterForCtor logic
 * (ModelProvider.cs lines 1048–1056):
 * - Required non-readonly, non-literal properties are constructor parameters
 * - For structs, all non-readonly properties are constructor parameters
 *
 * @param property - An SDK model property from TCGC.
 * @param isStruct - Whether the containing model is a struct (not a class).
 * @returns `true` if the property should appear as a constructor parameter.
 */
export function isConstructorParameter(
  property: SdkModelPropertyType,
  isStruct: boolean = false,
): boolean {
  if (isPropertyReadOnly(property)) return false;
  if (isStruct) return true;
  if (property.optional) return false;
  // Literal constants with values don't need constructor params
  if (property.type.kind === "constant") return false;
  return true;
}

/**
 * Determines whether a required property needs `Argument.AssertNotNull`
 * validation in the constructor.
 *
 * Only required, non-nullable, non-collection reference types need null
 * validation. Value types cannot be null, collections use ChangeTracking
 * initialization, and nullable types explicitly allow null.
 *
 * @param property - An SDK model property from TCGC.
 * @returns `true` if the property should be validated with `Argument.AssertNotNull`.
 */
export function propertyRequiresNullCheck(
  property: SdkModelPropertyType,
): boolean {
  if (property.optional) return false;
  if (isPropertyNullable(property)) return false;
  if (isCollectionType(property.type)) return false;
  return isCSharpReferenceType(property.type);
}

/**
 * Represents how a property should be initialized in a model constructor.
 *
 * - `"change-tracking-list"` — `new ChangeTrackingList<T>()` for optional lists
 * - `"change-tracking-dict"` — `new ChangeTrackingDictionary<K,V>()` for optional dicts
 * - `"to-list"` — `parameter.ToList()` for required list collections
 * - `"to-dict"` — `parameter.ToDictionary()` for required dict collections
 * - `"direct-assign"` — `this.Property = parameter` for required scalars/references
 * - `"none"` — no initialization needed (optional non-collections remain default/null)
 */
export type PropertyInitializerKind =
  | "change-tracking-list"
  | "change-tracking-dict"
  | "to-list"
  | "to-dict"
  | "direct-assign"
  | "none";

/**
 * Determines what kind of initialization a property needs in the public
 * model constructor.
 *
 * Matches the legacy emitter's CreatePropertyAssignmentStatement logic
 * (ModelProvider.cs lines 1125–1180):
 *
 * - **Optional collections** → ChangeTracking types to differentiate
 *   "not set" from "empty"
 * - **Required collections** → `.ToList()` / `.ToDictionary()` conversion
 *   from the IEnumerable constructor parameter
 * - **Required non-collections** → direct assignment from constructor parameter
 * - **Optional non-collections** → no initialization (remains default/null)
 *
 * @param property - An SDK model property from TCGC.
 * @returns The kind of initialization needed for this property.
 */
export function getPropertyInitializerKind(
  property: SdkModelPropertyType,
): PropertyInitializerKind {
  const isCollection = isCollectionType(property.type);
  const unwrapped = unwrapNullableType(property.type);

  if (property.optional && isCollection) {
    return unwrapped.kind === "dict"
      ? "change-tracking-dict"
      : "change-tracking-list";
  }

  if (!property.optional && isCollection) {
    return unwrapped.kind === "dict" ? "to-dict" : "to-list";
  }

  if (!property.optional) {
    return "direct-assign";
  }

  return "none";
}

/**
 * Resolves a model property name to avoid CS0542 (member names cannot be the
 * same as their enclosing type).
 *
 * When a property's raw TCGC name matches the model's raw TCGC name, appends
 * a "Property" suffix to the property name. This matches the legacy emitter's
 * PropertyProvider.cs behavior (lines 104–106):
 *
 * ```csharp
 * Name = inputProperty.Name == enclosingType.Name
 *     ? $"{inputProperty.Name.ToIdentifierName()}Property"
 *     : inputProperty.Name.ToIdentifierName();
 * ```
 *
 * The comparison uses raw TCGC names (before naming policy transformation).
 * The returned name is then passed through the C# naming policy as usual.
 *
 * @param propertyName - The raw TCGC property name.
 * @param modelName - The raw TCGC model name (enclosing type name).
 * @returns The property name, with "Property" suffix if it collides with the model name.
 */
export function resolvePropertyName(
  propertyName: string,
  modelName: string,
): string {
  if (propertyName === modelName) {
    return propertyName + "Property";
  }
  return propertyName;
}
