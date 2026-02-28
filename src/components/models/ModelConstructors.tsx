/**
 * Model constructor generation component for C# code output.
 *
 * Generates two constructors for model classes:
 *
 * 1. **Public initialization constructor** — includes only required,
 *    non-readonly, non-literal properties as parameters. Reference-type
 *    parameters get `Argument.AssertNotNull` validation.
 *
 * 2. **Internal serialization constructor** — includes ALL properties
 *    plus the `additionalBinaryDataProperties` dictionary as parameters.
 *    No validation — just direct property assignment. Used by
 *    deserialization code to populate every field.
 *
 * Constructor accessibility for the public constructor matches the legacy
 * emitter's ModelProvider.cs (lines 600–604):
 * - Abstract models → `private protected`
 * - Input models → `public`
 * - Output-only models → `internal`
 *
 * The serialization constructor is always `internal` (ModelProvider.cs
 * line 707: `MethodSignatureModifiers.Internal`).
 *
 * @module
 */

import {
  Constructor,
  type ConstructorProps,
  computeModifiersPrefix,
  getAccessModifier,
  MethodScope,
  MethodSymbol,
  type ParameterProps,
  Parameters,
  useCSharpNamePolicy,
  useNamedTypeScope,
} from "@alloy-js/csharp";
import { Block, MemberDeclaration, MemberName } from "@alloy-js/core";
import type {
  SdkModelPropertyType,
  SdkModelType,
} from "@azure-tools/typespec-client-generator-core";
import { UsageFlags } from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import {
  isPropertyNullable,
  unwrapNullableType,
} from "../../utils/nullable.js";
import {
  getPropertyInitializerKind,
  isConstructorParameter,
  propertyRequiresNullCheck,
} from "../../utils/property.js";

/**
 * Props for the {@link ModelConstructors} component.
 */
export interface ModelConstructorsProps {
  /** The TCGC SDK model type representing a TypeSpec model. */
  type: SdkModelType;
}

/**
 * Determines whether a model should be abstract in C#.
 *
 * A model is abstract when it serves as the base of a discriminated union —
 * it has a discriminator property and one or more discriminated subtypes.
 * Abstract models cannot be instantiated directly; only derived types can.
 *
 * @param model - The TCGC SDK model type.
 * @returns `true` if the model has discriminated subtypes.
 */
export function isModelAbstract(model: SdkModelType): boolean {
  return (
    model.discriminatorProperty !== undefined &&
    model.discriminatedSubtypes !== undefined &&
    Object.keys(model.discriminatedSubtypes).length > 0
  );
}

/**
 * Computes the access modifiers for the public initialization constructor.
 *
 * Matches the legacy emitter's BuildConstructors accessibility logic
 * (ModelProvider.cs lines 600–604):
 * - Abstract models → `private protected` (only derived types can call it)
 * - Input models → `public` (users construct instances directly)
 * - Output-only models → `internal` (only deserialization constructs them)
 *
 * @param model - The TCGC SDK model type.
 * @returns An object with boolean flags for the appropriate access modifiers.
 */
export function getConstructorAccessModifiers(model: SdkModelType): {
  public?: boolean;
  internal?: boolean;
  private?: boolean;
  protected?: boolean;
} {
  if (isModelAbstract(model)) {
    return { private: true, protected: true };
  }

  const isInput = (model.usage & UsageFlags.Input) !== 0;
  if (isInput) {
    return { public: true };
  }

  return { internal: true };
}

/**
 * Builds the ParameterProps array for the constructor signature.
 *
 * Each constructor parameter corresponds to a required, non-readonly,
 * non-literal model property. The parameter type matches the property
 * type, including nullable suffix for explicitly nullable types.
 *
 * @param properties - The constructor parameter properties.
 * @param namePolicy - The C# naming policy for parameter name conversion.
 * @returns An array of ParameterProps for the Constructor component.
 */
function buildParameters(
  properties: SdkModelPropertyType[],
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): ParameterProps[] {
  return properties.map((p) => {
    const nullable = isPropertyNullable(p);
    const unwrapped = unwrapNullableType(p.type);
    const baseType = <TypeExpression type={unwrapped.__raw!} />;

    return {
      name: namePolicy.getName(p.name, "parameter"),
      type: nullable ? <>{baseType}?</> : baseType,
    };
  });
}

/**
 * Builds `Argument.AssertNotNull` validation lines for the constructor body.
 *
 * Only required, non-nullable, non-collection reference-type parameters
 * need null validation. Value types (int, bool, etc.) cannot be null
 * and don't need checks. Collections use ChangeTracking initialization
 * instead of null checks.
 *
 * @param properties - The constructor parameter properties.
 * @param namePolicy - The C# naming policy for parameter name conversion.
 * @returns An array of C# statements like `Argument.AssertNotNull(name, nameof(name));`.
 */
function buildNullChecks(
  properties: SdkModelPropertyType[],
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): string[] {
  return properties
    .filter((p) => propertyRequiresNullCheck(p))
    .map((p) => {
      const paramName = namePolicy.getName(p.name, "parameter");
      return `Argument.AssertNotNull(${paramName}, nameof(${paramName}));`;
    });
}

/**
 * Builds property assignment lines for the constructor body.
 *
 * Iterates all model properties and generates the appropriate initialization:
 * - Constructor parameters (required scalars/refs) → direct assignment
 * - Required collections → `.ToList()` / `.ToDictionary()` (deferred to task 1.1.3)
 * - Optional collections → ChangeTracking initialization (deferred to tasks 5.1.3/5.1.4)
 * - Optional non-collections → no initialization (remain default/null)
 * - Read-only / literal properties → skipped (not assigned in public constructor)
 *
 * @param allProperties - All properties on the model.
 * @param ctorParams - Properties that are constructor parameters.
 * @param namePolicy - The C# naming policy.
 * @returns An array of C# assignment statements.
 */
function buildAssignments(
  allProperties: SdkModelPropertyType[],
  ctorParams: SdkModelPropertyType[],
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): string[] {
  const ctorParamSet = new Set(ctorParams);
  const lines: string[] = [];

  for (const p of allProperties) {
    const kind = getPropertyInitializerKind(p);
    const propName = namePolicy.getName(p.name, "class-property");

    if (kind === "direct-assign" && ctorParamSet.has(p)) {
      const paramName = namePolicy.getName(p.name, "parameter");
      lines.push(`${propName} = ${paramName};`);
    }
    // to-list and to-dict require collection type utilities (task 1.1.3)
    // change-tracking-list and change-tracking-dict require builtins (tasks 5.1.3/5.1.4)
    // These initializations will be added by future tasks.
  }

  return lines;
}

/**
 * Private field name for the additional binary data properties storage.
 *
 * Matches the legacy emitter's `AdditionalPropertiesHelper.AdditionalBinaryDataPropsFieldName`.
 * This field stores any JSON properties not mapped to known model properties,
 * enabling round-trip serialization fidelity.
 */
export const ADDITIONAL_BINARY_DATA_PROPS_FIELD_NAME =
  "_additionalBinaryDataProperties";

/**
 * Parameter name for additional binary data properties in the serialization constructor.
 *
 * Matches the legacy emitter's convention where the field name with the
 * leading underscore removed becomes the parameter name.
 */
export const ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME =
  "additionalBinaryDataProperties";

/**
 * Builds the ParameterProps array for the serialization constructor signature.
 *
 * Includes ALL model properties as parameters (no filtering — required,
 * optional, read-only, and constant properties are all included) because
 * the deserialization code needs to populate every field. The
 * `additionalBinaryDataProperties` parameter is appended as the last
 * parameter.
 *
 * Matches the legacy emitter's `BuildConstructorParameters(false)` logic
 * (ModelProvider.cs lines 1058–1061): no properties are excluded.
 *
 * @param properties - All properties on the model.
 * @param namePolicy - The C# naming policy for parameter name conversion.
 * @returns An array of ParameterProps for the Constructor component.
 */
function buildSerializationParameters(
  properties: SdkModelPropertyType[],
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): ParameterProps[] {
  const propParams = properties.map((p) => {
    const nullable = isPropertyNullable(p);
    const unwrapped = unwrapNullableType(p.type);
    const baseType = <TypeExpression type={unwrapped.__raw!} />;

    return {
      name: namePolicy.getName(p.name, "parameter"),
      type: nullable ? <>{baseType}?</> : baseType,
    };
  });

  propParams.push({
    name: ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME,
    type: "IDictionary<string, BinaryData>",
  });

  return propParams;
}

/**
 * Builds direct property assignment lines for the serialization constructor body.
 *
 * Every property gets a direct `Property = parameter;` assignment with no
 * validation, no collection conversion, and no null checks. The serialization
 * constructor trusts that the deserialization code provides correctly typed
 * values. The `_additionalBinaryDataProperties` field is assigned last.
 *
 * Matches the legacy emitter's `GetPropertyInitializers(false)` logic
 * (ModelProvider.cs lines 1099–1119): all properties assigned directly
 * from their parameters plus raw data field assignment.
 *
 * @param properties - All properties on the model.
 * @param namePolicy - The C# naming policy for parameter name conversion.
 * @returns An array of C# direct assignment statements.
 */
function buildSerializationAssignments(
  properties: SdkModelPropertyType[],
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): string[] {
  const lines: string[] = [];

  for (const p of properties) {
    const propName = namePolicy.getName(p.name, "class-property");
    const paramName = namePolicy.getName(p.name, "parameter");
    lines.push(`${propName} = ${paramName};`);
  }

  lines.push(
    `${ADDITIONAL_BINARY_DATA_PROPS_FIELD_NAME} = ${ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME};`,
  );

  return lines;
}

/**
 * A constructor component that allows name overloading.
 *
 * The standard `<Constructor>` from `@alloy-js/csharp` creates a MethodSymbol
 * that triggers name deduplication when multiple constructors exist in the same
 * class (e.g., public + serialization). This variant sets
 * `ignoreNameConflict: true` on the symbol, allowing two constructors with the
 * same name (the class name) to coexist — which is valid C# constructor
 * overloading.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/constructors
 */
function OverloadConstructor(props: ConstructorProps) {
  const scope = useNamedTypeScope();
  const name = scope.ownerSymbol.name;
  const ctorSymbol = new MethodSymbol(name, scope.members, "constructor", {
    refkeys: props.refkey,
    ignoreNameConflict: true,
  });
  const modifiers = computeModifiersPrefix([getAccessModifier(props)]);

  return (
    <MemberDeclaration symbol={ctorSymbol}>
      <MethodScope>
        {modifiers}
        <MemberName />
        <Parameters parameters={props.parameters} />
        <Block newline>{props.children}</Block>
      </MethodScope>
    </MemberDeclaration>
  );
}

/**
 * Generates the public initialization constructor for a C# model class.
 *
 * This component produces a constructor whose:
 * - **Access level** depends on the model type:
 *   - `public` for input models (users construct instances)
 *   - `internal` for output-only models (only deserialization constructs them)
 *   - `private protected` for abstract models (only derived types can call)
 * - **Parameters** include only required, non-readonly, non-literal properties
 * - **Body** contains:
 *   1. `Argument.AssertNotNull` calls for non-nullable reference type parameters
 *   2. Property assignments from constructor parameters
 *
 * @example Generated output for a model with required string and int properties:
 * ```csharp
 * public Widget(string name, int count)
 * {
 *     Argument.AssertNotNull(name, nameof(name));
 *
 *     Name = name;
 *     Count = count;
 * }
 *
 * internal Widget(string name, int count, IDictionary<string, BinaryData> additionalBinaryDataProperties)
 * {
 *     Name = name;
 *     Count = count;
 *     _additionalBinaryDataProperties = additionalBinaryDataProperties;
 * }
 * ```
 */
export function ModelConstructors(props: ModelConstructorsProps) {
  const { type } = props;
  const namePolicy = useCSharpNamePolicy();

  // === Public initialization constructor ===
  const accessModifiers = getConstructorAccessModifiers(type);

  const ctorParamProps = type.properties.filter((p) =>
    isConstructorParameter(p),
  );

  const parameters = buildParameters(ctorParamProps, namePolicy);
  const nullChecks = buildNullChecks(ctorParamProps, namePolicy);
  const assignments = buildAssignments(
    type.properties,
    ctorParamProps,
    namePolicy,
  );

  const bodyParts: string[] = [];
  if (nullChecks.length > 0) {
    bodyParts.push(nullChecks.join("\n"));
  }
  if (nullChecks.length > 0 && assignments.length > 0) {
    bodyParts.push("");
  }
  if (assignments.length > 0) {
    bodyParts.push(assignments.join("\n"));
  }

  const body = bodyParts.join("\n");

  // === Internal serialization constructor ===
  const serializationParams = buildSerializationParameters(
    type.properties,
    namePolicy,
  );
  const serializationAssignments = buildSerializationAssignments(
    type.properties,
    namePolicy,
  );
  const serializationBody = serializationAssignments.join("\n");

  return (
    <>
      <Constructor {...accessModifiers} parameters={parameters}>
        {body}
      </Constructor>
      {"\n\n"}
      <OverloadConstructor internal parameters={serializationParams}>
        {serializationBody}
      </OverloadConstructor>
    </>
  );
}
