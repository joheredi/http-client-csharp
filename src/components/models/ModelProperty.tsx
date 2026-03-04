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
import { renderCollectionPropertyType } from "../../utils/collection-type-expression.js";
import { ensureTrailingPeriod } from "../../utils/doc.js";
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
 * Determines whether a model property is a discriminator property.
 *
 * Discriminator properties identify the concrete type in a discriminated union
 * hierarchy. They are rendered with `internal` access and always have get+set
 * accessors, matching the legacy emitter's PropertyProvider.cs behavior where
 * discriminator properties use internal accessibility.
 *
 * @param property - The TCGC SDK model property.
 * @returns `true` if the property is marked as a discriminator.
 */
export function isDiscriminatorProperty(
  property: SdkModelPropertyType,
): boolean {
  return property.discriminator === true;
}

/**
 * Generates a C# auto-property for a model class member.
 *
 * Renders a property with the appropriate access modifier:
 * - **Discriminator properties**: `internal` with get+set — these identify the
 *   concrete type in a discriminated union and are managed by the serialization
 *   infrastructure, not exposed publicly.
 * - **Regular properties**: `public` with accessors determined by model usage.
 *
 * All properties include:
 * - The correct C# type via {@link TypeExpression} (with scalar overrides)
 * - Nullable suffix (`T?`) when the property is optional or explicitly nullable
 * - XML doc comment from the TypeSpec `@doc` decorator
 *
 * @example Generated output for a discriminator property:
 * ```csharp
 * internal string Kind { get; set; }
 * ```
 *
 * @example Generated output for a regular public property:
 * ```csharp
 * /// <summary> The widget name. </summary>
 * public string Name { get; set; }
 * ```
 */
export function ModelProperty(props: ModelPropertyProps) {
  const { property, modelUsage } = props;
  const nullable = isPropertyNullable(property);
  const type = unwrapNullableType(property.type);
  const isDiscriminator = isDiscriminatorProperty(property);
  const hasSetter = isDiscriminator
    ? true
    : propertyHasSetter(property, modelUsage);
  const doc = property.doc ?? property.summary;
  const formattedDoc = doc
    ? `<summary> ${ensureTrailingPeriod(doc)} </summary>`
    : undefined;

  // Collection types (arrays, dicts) render as IList<T>/IReadOnlyList<T> or
  // IDictionary<string,T>/IReadOnlyDictionary<string,T> instead of T[] or the
  // default IDictionary. Non-collections use TypeExpression directly.
  const isCollection = isCollectionType(property.type);
  const readOnly = isPropertyReadOnly(property);
  const typeExpr = isCollection ? (
    renderCollectionPropertyType(type, readOnly)
  ) : (
    <TypeExpression type={type.__raw!} />
  );

  return (
    <Property
      public={!isDiscriminator}
      internal={isDiscriminator}
      name={property.name}
      type={typeExpr}
      get
      set={hasSetter}
      nullable={nullable}
      doc={formattedDoc}
    />
  );
}
