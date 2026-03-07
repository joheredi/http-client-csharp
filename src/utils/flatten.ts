/**
 * Property flattening utilities for ARM model generation.
 *
 * When a model property has `flatten: true` (from TCGC's `@flattenProperty`
 * decorator), the nested model's public properties are "promoted" to the
 * parent model as computed properties with getter/setter patterns. The
 * original property becomes an internal backing field.
 *
 * This is a common ARM pattern — for example, `ProxyResource<T>.properties`
 * is always flattened so users access `resource.Name` instead of
 * `resource.Properties.Name`.
 *
 * Key invariant: **serialization is unchanged**. The backing model
 * serializes/deserializes as a nested JSON object. Only the C# model class
 * API surface changes.
 *
 * @module
 */

import type {
  SdkModelPropertyType,
  SdkModelType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { isPropertyReadOnly } from "./property.js";

/**
 * Metadata for a single property that has been promoted from a nested
 * (flattened) model into its parent.
 *
 * Each entry describes how to generate the computed getter/setter on the
 * parent model and which backing property + inner property to delegate to.
 */
export interface FlattenedPropertyInfo {
  /** The inner model property being promoted (e.g., `SafeFlattenInner.selectionType`). */
  innerProperty: SdkModelPropertyType;

  /**
   * The backing property on the parent model (the property with `flatten: true`).
   * Used to generate the getter: `BackingProp is null ? default : BackingProp.InnerProp`.
   */
  backingProperty: SdkModelPropertyType;

  /**
   * The C# name prefix derived from the backing property name.
   * For safe-flatten (single public property), this is the backing property
   * name (e.g., "Inner"). For multi-property flatten, this is empty since
   * properties keep their own names.
   */
  namePrefix: string;

  /**
   * Whether this is a "safe flatten" — the inner model has exactly one public
   * property, so the setter creates a new instance:
   * `Inner = new SafeFlattenInner(value)`.
   */
  isSafeFlatten: boolean;

  /**
   * The wire path segments for this flattened property, used for [WirePath]
   * attribute generation. E.g., ["properties", "inner", "selectionType"].
   */
  wirePath: string[];
}

/**
 * Checks whether a model property should be flattened.
 *
 * A property is flattened when TCGC sets `flatten: true` on it, which happens
 * when `@flattenProperty` is applied (either directly or via ARM conventions
 * like `@@flattenProperty(ProxyResource.properties)`).
 *
 * @param property - The TCGC SDK model property.
 * @returns `true` if the property should be flattened.
 */
export function isFlattenedProperty(property: SdkModelPropertyType): boolean {
  return property.flatten === true;
}

/**
 * Checks whether a model type qualifies for "safe flatten".
 *
 * Safe flatten applies when a model has exactly one public, non-read-only
 * property. When flattened, the setter can create a new instance of the
 * inner model: `Inner = new InnerModel(value)`.
 *
 * This is a C# generator concept — TCGC doesn't set `flatten: true` for
 * safe-flatten. It's detected by analyzing the inner model's structure.
 *
 * @param model - The TCGC SDK model type to check.
 * @returns `true` if the model has exactly one public property (safe flatten candidate).
 */
export function isSafeFlattenCandidate(model: SdkModelType): boolean {
  const publicProps = model.properties.filter(
    (p) => !isPropertyReadOnly(p) && p.access !== "internal",
  );
  return publicProps.length === 1;
}

/**
 * Collects all properties that should be promoted from flattened properties
 * on a model.
 *
 * For each property with `flatten: true`, this function examines the inner
 * model type and collects its public properties as `FlattenedPropertyInfo`
 * entries. These describe how to render the computed getter/setter on the
 * parent model.
 *
 * @param model - The parent model containing flattened properties.
 * @returns Array of FlattenedPropertyInfo for all promoted properties.
 */
export function collectFlattenedProperties(
  model: SdkModelType,
): FlattenedPropertyInfo[] {
  const result: FlattenedPropertyInfo[] = [];

  for (const property of model.properties) {
    if (!isFlattenedProperty(property)) continue;

    const innerType = unwrapToModel(property.type);
    if (!innerType) continue;

    const safeFlatten = isSafeFlattenCandidate(innerType);
    const backingSerializedName = property.serializedName;

    for (const innerProp of innerType.properties) {
      // Only promote public, non-read-only properties
      if (innerProp.access === "internal") continue;

      // For safe-flatten, prefix with the backing property name
      // (e.g., "Inner" + "SelectionType" = "InnerSelectionType")
      // For regular flatten, no prefix — properties keep their own names
      const namePrefix = safeFlatten ? property.name : "";

      result.push({
        innerProperty: innerProp,
        backingProperty: property,
        namePrefix,
        isSafeFlatten: safeFlatten,
        wirePath: [backingSerializedName, innerProp.serializedName],
      });
    }
  }

  return result;
}

/**
 * Gets the flattened properties from a model that have `flatten: true`.
 *
 * @param model - The model to check for flattened properties.
 * @returns Array of properties that are flattened (should become internal backing fields).
 */
export function getFlattenBackingProperties(
  model: SdkModelType,
): SdkModelPropertyType[] {
  return model.properties.filter(isFlattenedProperty);
}

/**
 * Unwraps a type to its underlying SdkModelType, if it is one.
 *
 * Handles nullable wrappers by looking at the inner type.
 *
 * @param type - The SDK type to unwrap.
 * @returns The underlying SdkModelType, or undefined if not a model.
 */
function unwrapToModel(type: SdkType): SdkModelType | undefined {
  if (type.kind === "model") return type as SdkModelType;
  if (type.kind === "nullable") {
    const nullable = type as { type: SdkType };
    return unwrapToModel(nullable.type);
  }
  return undefined;
}
