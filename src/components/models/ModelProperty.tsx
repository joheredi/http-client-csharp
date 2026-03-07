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

import { Attribute, Property, useCSharpNamePolicy } from "@alloy-js/csharp";
import type { Children } from "@alloy-js/core";
import { code } from "@alloy-js/core";
import { wirePathAttributeRefkey } from "../infrastructure/WirePathAttributeFile.js";
import type {
  SdkConstantType,
  SdkEnumValueType,
  SdkModelPropertyType,
} from "@azure-tools/typespec-client-generator-core";
import { UsageFlags } from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { renderCollectionPropertyType } from "../../utils/collection-type-expression.js";
import { ensureTrailingPeriod } from "../../utils/doc.js";
import {
  isCollectionType,
  isPropertyNullable,
  isStringEncodedNumeric,
  unwrapNullableType,
} from "../../utils/nullable.js";
import {
  isPropertyReadOnly,
  resolvePropertyName,
} from "../../utils/property.js";
import { efCsharpRefkey, literalTypeRefkey } from "../../utils/refkey.js";
import { needsLiteralWrapperStruct } from "../literal-types/collect.js";
import { formatCSharpConstant } from "../models/ModelConstructors.js";

/**
 * Props for the {@link ModelProperty} component.
 */
export interface ModelPropertyProps {
  /** The TCGC SDK model property type representing a single property. */
  property: SdkModelPropertyType;
  /** Usage flags for the containing model (Input, Output, or both). */
  modelUsage: UsageFlags;
  /** The raw TCGC name of the enclosing model, used for CS0542 collision detection. */
  modelName: string;
  /**
   * When true, forces the property to render with `internal` access modifier
   * regardless of its normal access level. Used for flattened backing properties
   * whose public API is provided by computed FlattenedProperty components.
   */
  forceInternal?: boolean;
  /**
   * When set, emits a `[WirePath("...")]` attribute on this property with the
   * given value as the wire path string. Only used when the
   * `enable-wire-path-attribute` emitter option is true.
   */
  wirePathValue?: string;
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
  const {
    property,
    modelUsage,
    modelName,
    forceInternal = false,
    wirePathValue,
  } = props;
  let nullable = isPropertyNullable(property);
  const type = unwrapNullableType(property.type);
  const isDiscriminator = isDiscriminatorProperty(property);
  const hasSetter = isDiscriminator
    ? true
    : propertyHasSetter(property, modelUsage);
  const doc = property.doc ?? property.summary;
  const formattedDoc = doc
    ? `<summary> ${ensureTrailingPeriod(doc)} </summary>`
    : undefined;

  // Resolve property name to avoid CS0542 (member name same as enclosing type)
  const effectiveName = resolvePropertyName(property.name, modelName);

  // Optional numeric properties with @encode("string") use `object` type in C#.
  // The wire value is a JSON string, and the object type allows holding the raw
  // string value. Required @encode("string") numerics keep their native type
  // with transparent encode/decode during serialization.
  const isOptionalStringEncodedNumeric =
    nullable && isStringEncodedNumeric(property.type);

  // Collection types (arrays, dicts) render as IList<T>/IReadOnlyList<T> or
  // IDictionary<string,T>/IReadOnlyDictionary<string,T> instead of T[] or the
  // default IDictionary. Non-collections use TypeExpression directly.
  // Literal type wrapper structs use a refkey to the generated struct declaration
  // instead of TypeExpression, since TypeExpression would resolve to the primitive type.
  const isCollection = isCollectionType(property.type);
  const readOnly = isPropertyReadOnly(property);
  const isLiteralWrapper = needsLiteralWrapperStruct(type, nullable);
  const typeExpr = isOptionalStringEncodedNumeric ? (
    ("object" as Children)
  ) : isCollection ? (
    renderCollectionPropertyType(type, readOnly)
  ) : isLiteralWrapper ? (
    literalTypeRefkey(type as SdkConstantType)
  ) : (
    <TypeExpression type={type.__raw!} />
  );

  // When the property type is overridden to `object` (reference type),
  // suppress the nullable `?` suffix since `object` is already nullable.
  if (isOptionalStringEncodedNumeric) {
    nullable = false;
  }

  // Constant/literal properties get a property initializer so their value
  // is always correct without explicit constructor initialization.
  // This matches the legacy emitter where literal properties are expression-bodied
  // members returning a fixed value (e.g., `public bool Property => true;`).
  const initializer = getPropertyInitializer(property, modelUsage);

  // Build the [WirePath("...")] attribute when enabled.
  // This annotates the property with its HTTP wire-format path for ARM SDKs
  // that reflect on model properties at runtime.
  const wirePathAttr = wirePathValue
    ? [
        <Attribute
          name={wirePathAttributeRefkey}
          args={[`"${wirePathValue}"`]}
        />,
      ]
    : undefined;

  // When forceInternal is true, the property is a flattened backing field
  // (its public API is provided by computed FlattenedProperty components).
  // Override the access modifier to internal and always include a setter.
  const isInternal = isDiscriminator || forceInternal;

  return (
    <Property
      public={!isInternal}
      internal={isInternal}
      name={effectiveName}
      type={typeExpr}
      get
      set={forceInternal ? true : hasSetter}
      nullable={nullable}
      doc={formattedDoc}
      initializer={initializer}
      attributes={wirePathAttr}
    />
  );
}

/**
 * Computes a property initializer for constant and enum value literal properties
 * on input models.
 *
 * Constant properties (e.g., `contentType: "application/json"`) and enum value
 * literals (e.g., `property: ExtendedEnum.EnumValue2`) have fixed values. For
 * input models (where users create instances via the public constructor), the
 * property initializer ensures the correct value is always present — even when
 * the property is not a constructor parameter.
 *
 * Output-only models skip initializers because instances are only created via
 * the internal serialization constructor, which always sets all properties.
 *
 * @param property - The TCGC SDK model property.
 * @param modelUsage - The UsageFlags bitmap of the containing model.
 * @returns A Children expression for the initializer, or undefined.
 */
function getPropertyInitializer(
  property: SdkModelPropertyType,
  modelUsage: UsageFlags,
): Children | undefined {
  const isInput = (modelUsage & UsageFlags.Input) !== 0;
  if (!isInput) return undefined;

  const namePolicy = useCSharpNamePolicy();
  const type = unwrapNullableType(property.type);

  if (type.kind === "constant") {
    return formatCSharpConstant(type as SdkConstantType);
  }

  if (type.kind === "enumvalue") {
    const enumValue = type as SdkEnumValueType;
    const enumTypeRefkey = efCsharpRefkey(enumValue.enumType.__raw!);
    const memberName = namePolicy.getName(enumValue.name, "enum-member");
    return code`${enumTypeRefkey}.${memberName}`;
  }

  return undefined;
}
