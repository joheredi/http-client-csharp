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
import { code } from "@alloy-js/core";
import type {
  SdkModelPropertyType,
  SdkModelType,
} from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import { System } from "../../builtins/system.js";
import { renderCollectionPropertyType } from "../../utils/collection-type-expression.js";
import {
  isCollectionType,
  isPropertyNullable,
  unwrapNullableType,
} from "../../utils/nullable.js";
import {
  isPropertyReadOnly,
  resolvePropertyName,
} from "../../utils/property.js";
import {
  ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME,
  isBaseDiscriminatorOverride,
  isDerivedDiscriminatedModel,
} from "../models/ModelConstructors.js";
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
 * Either a model property variable or the synthetic additionalBinaryDataProperties.
 */
export type VariableInfo =
  | { kind: "property"; property: SdkModelPropertyType; modelName: string }
  | { kind: "additional-binary-data" }
  | { kind: "patch" };

/**
 * Computes the flat list of variables to declare, in the same order as
 * the serialization constructor parameters.
 *
 * For base/standalone models: all own properties + additionalBinaryDataProperties.
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

  return [
    ...model.properties.map(
      (p): VariableInfo => ({
        kind: "property",
        property: p,
        modelName: model.name,
      }),
    ),
    isDynamicModel(model)
      ? { kind: "patch" as const }
      : { kind: "additional-binary-data" as const },
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

        const initializer = isStringDiscriminator
          ? `"${model.discriminatorValue}"`
          : "default";

        return (
          <>
            {"\n    "}
            {isCollectionType(unwrapped) ? (
              renderCollectionPropertyType(unwrapped, isPropertyReadOnly(p))
            ) : (
              <TypeExpression type={unwrapped.__raw!} />
            )}
            {nullable ? "?" : ""}
            {` ${varName} = ${initializer};`}
          </>
        );
      })}
    </>
  );
}
