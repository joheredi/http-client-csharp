/**
 * Model property generation component for C# code output.
 *
 * Renders individual C# auto-properties inside model class declarations.
 * Each property gets the correct C# type (via TypeExpression with scalar
 * overrides), nullable suffix when appropriate, and XML doc comment from
 * the TypeSpec `@doc` decorator.
 *
 * @module
 */

import { Property } from "@alloy-js/csharp";
import type { SdkModelPropertyType } from "@azure-tools/typespec-client-generator-core";
import { UsageFlags } from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import {
  isCollectionType,
  isPropertyNullable,
  unwrapNullableType,
} from "../../utils/nullable.js";
import { isPropertyReadOnly } from "../../utils/property.js";

/**
 * Props for the {@link ModelProperty} component.
 */
export interface ModelPropertyProps {
  /** The TCGC SDK model property type representing a single property. */
  property: SdkModelPropertyType;
  /** Usage flags for the containing model (Input, Output, or both). */
  modelUsage: UsageFlags;
}

/**
 * Determines whether a model property should have a setter accessor.
 *
 * Follows the legacy emitter's PropertyProvider.PropertyHasSetter logic
 * (PropertyProvider.cs lines 192–235):
 *
 * - **Read-only properties**: get-only — visibility is [Read] only.
 * - **Output-only models**: get-only — properties are populated during
 *   deserialization and not modified by the user.
 * - **Input-only models, required properties**: get-only — the public
 *   constructor handles initialization.
 * - **Input-only models, optional properties**: get+set — the user sets
 *   values via object initializer syntax.
 * - **Collection properties**: get-only — mutation happens via the
 *   collection interface (Add, Remove), not by replacing the collection.
 *   Collections use ChangeTracking types for "not set" vs "empty" semantics.
 * - **Input+Output models, non-collection**: get+set — the user sets
 *   values for requests, and the server populates values in responses.
 *
 * @param property - The TCGC SDK model property.
 * @param modelUsage - The UsageFlags bitmap of the containing model.
 * @returns `true` if the property should include a setter.
 */
export function propertyHasSetter(
  property: SdkModelPropertyType,
  modelUsage: UsageFlags,
): boolean {
  const isInput = (modelUsage & UsageFlags.Input) !== 0;
  const isOutput = (modelUsage & UsageFlags.Output) !== 0;

  // Read-only properties (visibility: [Read] only) never have setters
  if (isPropertyReadOnly(property)) return false;

  // Output-only models: no setters (populated by deserialization)
  if (!isInput) return false;

  // Input-only: required properties don't have setters (constructor handles it)
  // Optional properties DO need setters for object initializer syntax
  if (isInput && !isOutput && !property.optional) return false;

  // Collections never have setters — mutation happens via collection interface
  if (isCollectionType(property.type)) return false;

  return true;
}

/**
 * Generates a C# auto-property for a model class member.
 *
 * Renders a public property with:
 * - The correct C# type via {@link TypeExpression} (with scalar overrides)
 * - Nullable suffix (`T?`) when the property is optional or explicitly nullable
 * - XML doc comment from the TypeSpec `@doc` decorator
 * - Get accessor (always present)
 * - Set accessor (only when the model is used for both input and output)
 *
 * @example Generated output for a required string property on an input+output model:
 * ```csharp
 * /// <summary> The widget name. </summary>
 * public string Name { get; set; }
 * ```
 *
 * @example Generated output for an optional int32 property on an output-only model:
 * ```csharp
 * /// <summary> The count. </summary>
 * public int? Count { get; }
 * ```
 */
export function ModelProperty(props: ModelPropertyProps) {
  const { property, modelUsage } = props;
  const nullable = isPropertyNullable(property);
  const type = unwrapNullableType(property.type);
  const hasSetter = propertyHasSetter(property, modelUsage);
  const doc = property.doc ?? property.summary;
  const formattedDoc = doc ? `<summary> ${doc} </summary>` : undefined;

  return (
    <Property
      public
      name={property.name}
      type={<TypeExpression type={type.__raw!} />}
      get
      set={hasSetter}
      nullable={nullable}
      doc={formattedDoc}
    />
  );
}
