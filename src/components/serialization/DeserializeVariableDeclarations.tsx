/**
 * Variable declarations for the JSON deserialization method.
 *
 * Generates local variable declarations at the top of the `DeserializeXxx`
 * method body, one for each serialization constructor parameter. These
 * variables are populated during the property matching loop (task 2.3.4–2.3.12)
 * and then passed to the serialization constructor (task 2.3.13).
 *
 * Variable initialization rules (matching legacy emitter's
 * GetPropertyVariableDeclarations in MrwSerializationTypeDefinition.cs):
 *
 * - **Regular properties** → `Type name = default;`
 * - **Discriminator properties** with a known string value →
 *   `string kind = "value";` (only for string-typed discriminators in derived models)
 * - **additionalBinaryDataProperties** →
 *   `IDictionary<string, BinaryData> additionalBinaryDataProperties = new ChangeTrackingDictionary<string, BinaryData>();`
 *
 * The variable order matches the serialization constructor parameter order:
 * for derived models, base model variables come first (including
 * additionalBinaryDataProperties), followed by the derived model's own
 * non-override properties.
 *
 * @example Generated output for a simple model `Widget { name: string; count: int32; }`:
 * ```csharp
 * string name = default;
 * int count = default;
 * IDictionary<string, BinaryData> additionalBinaryDataProperties = new ChangeTrackingDictionary<string, BinaryData>();
 * ```
 *
 * @example Generated output for a derived model `Dog extends Pet` with `kind: "dog"`:
 * ```csharp
 * string kind = "dog";
 * string name = default;
 * IDictionary<string, BinaryData> additionalBinaryDataProperties = new ChangeTrackingDictionary<string, BinaryData>();
 * string breed = default;
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import { type Children, code } from "@alloy-js/core";
import type {
  SdkConstantType,
  SdkModelPropertyType,
  SdkModelType,
} from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import { System } from "../../builtins/system.js";
import {
  getCollectionValueType,
  isDictCollection,
} from "../../utils/collections.js";
import { renderCollectionPropertyType } from "../../utils/collection-type-expression.js";
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
import { literalTypeRefkey } from "../../utils/refkey.js";
import { needsLiteralWrapperStruct } from "../literal-types/collect.js";
import {
  ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME,
  isBaseDiscriminatorOverride,
  isDerivedDiscriminatedModel,
} from "../models/ModelConstructors.js";
import {
  ADDITIONAL_PROPERTIES_PARAM_NAME,
  hasAdditionalProperties,
  renderAdditionalPropertiesValueType,
} from "../../utils/additional-properties.js";
import { isDynamicModel } from "../models/DynamicModel.js";

/**
 * Props for the {@link DeserializeVariableDeclarations} component.
 */
export interface DeserializeVariableDeclarationsProps {
  /** The TCGC SDK model type whose deserialization variables are being generated. */
  type: SdkModelType;
}

/**
 * Represents a single variable to declare in the deserialization method.
 * Either a model property variable, the synthetic additionalBinaryDataProperties,
 * or a typed additional properties dictionary.
 */
export type VariableInfo =
  | { kind: "property"; property: SdkModelPropertyType; modelName: string }
  | { kind: "additional-binary-data" }
  | { kind: "additional-properties"; model: SdkModelType }
  | { kind: "patch" };

/**
 * Computes the flat list of variables to declare, in the same order as
 * the serialization constructor parameters.
 *
 * For base/standalone models: all own properties + additionalBinaryDataProperties
 * (or typed additional properties if the model has `additionalProperties`).
 * For derived models (both discriminated and non-discriminated): base model
 * variables (recursive) + own non-override properties. This mirrors
 * `computeSerializationCtorParams` from ModelConstructors.tsx.
 *
 * @param model - The TCGC SDK model type.
 * @returns Ordered list of variable infos for declaration generation.
 */
export function computeVariableInfos(model: SdkModelType): VariableInfo[] {
  if (model.baseModel) {
    const baseInfos = computeVariableInfos(model.baseModel);
    const ownProps = model.properties.filter(
      (p) => !isBaseDiscriminatorOverride(p),
    );
    return [
      ...baseInfos,
      ...ownProps.map(
        (p): VariableInfo => ({
          kind: "property",
          property: p,
          modelName: model.name,
        }),
      ),
    ];
  }

  // Determine the trailing variable: typed additional properties, dynamic patch,
  // or raw binary data catch-all.
  let trailingVar: VariableInfo;
  if (isDynamicModel(model)) {
    trailingVar = { kind: "patch" };
  } else if (hasAdditionalProperties(model)) {
    trailingVar = { kind: "additional-properties", model };
  } else {
    trailingVar = { kind: "additional-binary-data" };
  }

  return [
    ...model.properties.map(
      (p): VariableInfo => ({
        kind: "property",
        property: p,
        modelName: model.name,
      }),
    ),
    trailingVar,
  ];
}

/**
 * Generates local variable declarations for all serialization constructor
 * parameters in the `DeserializeXxx` method.
 *
 * Each model property gets a variable declaration with its C# type and
 * a default initializer. The `additionalBinaryDataProperties` dictionary
 * is always initialized with a `ChangeTrackingDictionary` instance to
 * accumulate unknown JSON properties during deserialization.
 *
 * For derived discriminated models with string discriminators, the
 * discriminator variable is initialized to the model's known discriminator
 * literal value (e.g., `string kind = "dog";`) rather than `default`.
 * This matches the legacy emitter's GetPropertyVariableDeclarations logic
 * which only applies literal initialization when the discriminator property
 * type is a framework type (i.e., string, not an enum).
 *
 * @param props - The component props containing the model type.
 * @returns JSX fragment with variable declaration statements.
 */
export function DeserializeVariableDeclarations(
  props: DeserializeVariableDeclarationsProps,
) {
  const namePolicy = useCSharpNamePolicy();
  const model = props.type;
  const variableInfos = computeVariableInfos(model);

  return (
    <>
      {variableInfos.map((info) => {
        if (info.kind === "additional-binary-data") {
          return (
            <>
              {"\n    "}
              {code`${SystemCollectionsGeneric.IDictionary}<string, ${System.BinaryData}> ${ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME} = new ChangeTrackingDictionary<string, ${System.BinaryData}>();`}
            </>
          );
        }

        if (info.kind === "patch") {
          return (
            <>
              {"\n"}
              {
                "#pragma warning disable SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates.\n"
              }
              {"    "}
              {code`${SystemClientModelPrimitives.JsonPatch} patch = new ${SystemClientModelPrimitives.JsonPatch}(data is null ? ReadOnlyMemory<byte>.Empty : data.ToMemory());`}
              {"\n"}
              {
                "#pragma warning restore SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates."
              }
            </>
          );
        }

        if (info.kind === "additional-properties") {
          const valueTypeExpr = renderAdditionalPropertiesValueType(
            info.model.additionalProperties!,
          );
          return (
            <>
              {"\n    "}
              {code`${SystemCollectionsGeneric.IDictionary}<string, ${valueTypeExpr}> ${ADDITIONAL_PROPERTIES_PARAM_NAME} = new ${SystemCollectionsGeneric.Dictionary}<string, ${valueTypeExpr}>();`}
            </>
          );
        }

        const p = info.property;
        const varName = namePolicy.getName(
          resolvePropertyName(p.name, info.modelName),
          "parameter",
        );
        const nullable = isPropertyNullable(p);
        const unwrapped = unwrapNullableType(p.type);

        // For string discriminators in derived models, initialize to the known
        // discriminator literal instead of default. Matches the legacy emitter's
        // check: property.IsDiscriminator && _model.DiscriminatorValue != null
        // && property.Type.IsFrameworkType (i.e., string, not enum).
        const isStringDiscriminator =
          p.discriminator === true &&
          model.discriminatorValue !== undefined &&
          unwrapped.kind === "string";

        // Compute the type expression for the variable declaration.
        // Literal wrapper types use the wrapper struct refkey so the variable
        // type matches the property type (e.g., FloatLiteralPropertyProperty?
        // instead of double?). The implicit conversion from the raw primitive
        // (returned by GetSingle/GetInt32/etc.) handles the assignment.
        // Optional @encode("string") numeric properties use `object` to hold
        // the raw JSON string value.
        const isOptionalStringEncodedNumeric =
          nullable && isStringEncodedNumeric(p.type);
        const isLiteralWrapper =
          unwrapped.kind === "constant" &&
          needsLiteralWrapperStruct(unwrapped, nullable);
        const typeExpr = isOptionalStringEncodedNumeric ? (
          ("object" as Children)
        ) : isCollectionType(unwrapped) ? (
          renderCollectionPropertyType(unwrapped, isPropertyReadOnly(p))
        ) : isLiteralWrapper ? (
          literalTypeRefkey(unwrapped as SdkConstantType)
        ) : (
          <TypeExpression type={unwrapped.__raw!} />
        );

        // Suppress nullable suffix for object type override (already nullable)
        const effectiveNullable = isOptionalStringEncodedNumeric
          ? false
          : nullable;

        // Compute the initializer expression. Optional collections use
        // ChangeTrackingList/Dictionary so that Optional.IsCollectionDefined()
        // correctly returns false (undefined) when the property is absent from
        // JSON, and the collection is non-null for safe .Count access.
        let initializerExpr: Children;
        if (isStringDiscriminator) {
          initializerExpr = `"${model.discriminatorValue}"`;
        } else if (p.optional && isCollectionType(unwrapped)) {
          const valueType = getCollectionValueType(p.type);
          const vtUnwrapped = unwrapNullableType(valueType);
          const isVTNullable = valueType.kind === "nullable";
          const vtExpr = <TypeExpression type={vtUnwrapped.__raw!} />;
          const valueTypeExpr: Children = isVTNullable ? (
            <>{vtExpr}?</>
          ) : (
            vtExpr
          );
          initializerExpr = isDictCollection(p.type)
            ? code`new ChangeTrackingDictionary<string, ${valueTypeExpr}>()`
            : code`new ChangeTrackingList<${valueTypeExpr}>()`;
        } else {
          initializerExpr = "default";
        }

        return (
          <>
            {"\n    "}
            {typeExpr}
            {effectiveNullable ? "?" : ""}
            {` ${varName} = `}
            {initializerExpr}
            {";"}
          </>
        );
      })}
    </>
  );
}
