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
 * For derived discriminated models, both constructors chain to the base
 * class constructor via `: base(...)`. The public constructor passes the
 * discriminator literal (string or enum member), while the serialization
 * constructor passes through base parameters including the discriminator.
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
import {
  Block,
  type Children,
  MemberDeclaration,
  MemberName,
} from "@alloy-js/core";
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
import { efCsharpRefkey } from "../../utils/refkey.js";

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
 * Determines whether a model is a derived type in a discriminated hierarchy.
 *
 * A derived discriminated model has both a base model and a discriminator
 * value, indicating it's a concrete variant of a discriminated union.
 * These models need `: base(discriminatorValue, ...)` constructor chaining.
 *
 * @param model - The TCGC SDK model type.
 * @returns `true` if the model has a base model and a discriminator value.
 */
export function isDerivedDiscriminatedModel(model: SdkModelType): boolean {
  return (
    model.baseModel !== undefined && model.discriminatorValue !== undefined
  );
}

/**
 * Finds the discriminator property override on a derived model.
 *
 * In TCGC, when a derived model overrides the discriminator property
 * (e.g., `kind: "cat"` or `kind: PetKind.cat`), that property appears
 * in the derived model's own properties array. Its type will be either
 * `"constant"` (for string discriminators) or `"enumvalue"` (for enum
 * discriminators, after TCGC maps constant → enumvalue).
 *
 * @param model - The derived TCGC SDK model type.
 * @returns The discriminator property override, or undefined if not found.
 */
function findOwnDiscriminatorProperty(
  model: SdkModelType,
): SdkModelPropertyType | undefined {
  return model.properties.find((p) => p.discriminator);
}

/**
 * Builds the C# expression for a discriminator literal value.
 *
 * For string discriminators (e.g., `kind: "eagle"`), produces a C# string
 * literal like `"eagle"`. For enum discriminators (e.g., `kind: DogKind.Golden`),
 * produces a composite reference: the enum type refkey (resolved by Alloy to
 * the type name) followed by `.MemberName` (using C# naming policy).
 *
 * @param model - The derived model with a discriminator value.
 * @param namePolicy - The C# naming policy for name conversion.
 * @returns A Children expression representing the discriminator literal.
 */
function buildDiscriminatorLiteral(
  model: SdkModelType,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): Children {
  const discriminatorProp = findOwnDiscriminatorProperty(model);

  // For enum discriminators, TCGC maps the constant to an enumvalue type.
  // Compose EnumType.MemberName using the enum type's refkey + member name.
  if (discriminatorProp && discriminatorProp.type.kind === "enumvalue") {
    const enumValue = discriminatorProp.type;
    const enumTypeRefkey = efCsharpRefkey(enumValue.enumType.__raw!);
    const memberName = namePolicy.getName(enumValue.name, "enum-member");
    return (
      <>
        {enumTypeRefkey}.{memberName}
      </>
    );
  }

  // For string discriminators, use a C# string literal.
  return `"${model.discriminatorValue}"`;
}

/**
 * Collects the non-discriminator public constructor parameters from a base model.
 *
 * These are the required, non-readonly, non-literal, non-discriminator
 * properties from the base model that should appear in the derived model's
 * public constructor (and be passed through to the base constructor call).
 *
 * @param baseModel - The base model in a discriminated hierarchy.
 * @returns Array of base model properties that are public constructor parameters.
 */
function getBasePublicCtorParams(
  baseModel: SdkModelType,
): SdkModelPropertyType[] {
  return baseModel.properties.filter(
    (p) => isConstructorParameter(p) && !p.discriminator,
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
export function buildSerializationParameters(
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
 * values.
 *
 * When `includeAdditionalBinaryData` is true (default), the
 * `_additionalBinaryDataProperties` field is assigned last.
 * For derived models, this should be false since the base class handles it.
 *
 * Matches the legacy emitter's `GetPropertyInitializers(false)` logic
 * (ModelProvider.cs lines 1099–1119): all properties assigned directly
 * from their parameters plus raw data field assignment.
 *
 * @param properties - All properties on the model.
 * @param namePolicy - The C# naming policy for parameter name conversion.
 * @param includeAdditionalBinaryData - Whether to append the additionalBinaryDataProperties assignment.
 * @returns An array of C# direct assignment statements.
 */
function buildSerializationAssignments(
  properties: SdkModelPropertyType[],
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
  includeAdditionalBinaryData: boolean = true,
): string[] {
  const lines: string[] = [];

  for (const p of properties) {
    const propName = namePolicy.getName(p.name, "class-property");
    const paramName = namePolicy.getName(p.name, "parameter");
    lines.push(`${propName} = ${paramName};`);
  }

  if (includeAdditionalBinaryData) {
    lines.push(
      `${ADDITIONAL_BINARY_DATA_PROPS_FIELD_NAME} = ${ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME};`,
    );
  }

  return lines;
}

/**
 * Extended constructor props with optional base constructor initializer.
 *
 * Adds support for `: base(...)` constructor chaining used by derived
 * discriminated models.
 */
export interface ModelConstructorProps extends ConstructorProps {
  /** Content rendered inside `: base(...)`. When provided, the constructor chains to the base class. */
  baseInitializer?: Children;
}

/**
 * A constructor component that allows name overloading and base class chaining.
 *
 * The standard `<Constructor>` from `@alloy-js/csharp` creates a MethodSymbol
 * that triggers name deduplication when multiple constructors exist in the same
 * class (e.g., public + serialization). This variant sets
 * `ignoreNameConflict: true` on the symbol, allowing two constructors with the
 * same name (the class name) to coexist — which is valid C# constructor
 * overloading.
 *
 * When `baseInitializer` is provided, renders `: base(initializer)` between
 * the parameter list and the constructor body block.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/constructors
 */
export function OverloadConstructor(props: ModelConstructorProps) {
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
        {props.baseInitializer !== undefined && (
          <> : base({props.baseInitializer})</>
        )}
        <Block newline>{props.children}</Block>
      </MethodScope>
    </MemberDeclaration>
  );
}

/**
 * Generates constructors for a C# model class, including base class
 * constructor chaining for derived discriminated models.
 *
 * For base/non-derived models, produces:
 * - A public/internal/private-protected initialization constructor
 * - An internal serialization constructor
 *
 * For derived discriminated models (e.g., Eagle extends Bird), produces:
 * - A public constructor that chains to base with the discriminator literal:
 *   `public Eagle(int wingspan) : base("eagle", wingspan) { ... }`
 * - A serialization constructor that chains to base with all base params:
 *   `internal Eagle(string kind, int wingspan, IDictionary<...> ..., IList<Bird> friends) : base(kind, wingspan, ...) { ... }`
 *
 * @example Generated output for a derived model with string discriminator:
 * ```csharp
 * public Eagle(int wingspan) : base("eagle", wingspan)
 * {
 * }
 *
 * internal Eagle(string kind, int wingspan, IDictionary<string, BinaryData> additionalBinaryDataProperties, IList<Bird> friends)
 *     : base(kind, wingspan, additionalBinaryDataProperties)
 * {
 *     Friends = friends;
 * }
 * ```
 */
export function ModelConstructors(props: ModelConstructorsProps) {
  const { type } = props;
  const namePolicy = useCSharpNamePolicy();

  if (isDerivedDiscriminatedModel(type)) {
    return <DerivedModelConstructors type={type} namePolicy={namePolicy} />;
  }

  return <BaseModelConstructors type={type} namePolicy={namePolicy} />;
}

/**
 * Generates constructors for non-derived (base or standalone) model classes.
 *
 * This is the original constructor generation logic for models that are NOT
 * derived discriminated types.
 */
function BaseModelConstructors(props: {
  type: SdkModelType;
  namePolicy: ReturnType<typeof useCSharpNamePolicy>;
}) {
  const { type, namePolicy } = props;

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

/**
 * Generates constructors for derived discriminated model classes.
 *
 * Derived models chain both constructors to the base class:
 *
 * **Public constructor:**
 * - Parameters: base model's non-discriminator ctor params + own ctor params
 * - Base call: `: base(discriminatorLiteral, ...baseParamPassthroughs)`
 * - Body: null checks and assignments for own properties only
 *
 * **Serialization constructor:**
 * - Parameters: base model's serialization params + own properties
 * - Base call: `: base(...baseSerializationParamPassthroughs)`
 * - Body: assignments for own properties only (base handles its own)
 *
 * The discriminator is never exposed as a public constructor parameter.
 * Instead, the literal value (string or enum member) is hardcoded in
 * the base call.
 */
function DerivedModelConstructors(props: {
  type: SdkModelType;
  namePolicy: ReturnType<typeof useCSharpNamePolicy>;
}) {
  const { type, namePolicy } = props;
  const baseModel = type.baseModel!;

  // Filter out the discriminator override from own properties — it's inherited
  // from the base model and should not appear in derived model's constructor
  // params, serialization params, or property declarations.
  const ownProperties = type.properties.filter((p) => !p.discriminator);

  // === Public initialization constructor ===
  const accessModifiers = getConstructorAccessModifiers(type);

  // Collect base model's non-discriminator ctor params
  const baseCtorParams = getBasePublicCtorParams(baseModel);
  // Collect own ctor params (discriminator already filtered out)
  const ownCtorParams = ownProperties.filter((p) => isConstructorParameter(p));

  // Combined parameter list: base params first, then own params
  const allCtorParams = [...baseCtorParams, ...ownCtorParams];
  const parameters = buildParameters(allCtorParams, namePolicy);

  // Null checks only for own params (base ctor handles its own)
  const nullChecks = buildNullChecks(ownCtorParams, namePolicy);
  // Assignments only for own properties (discriminator excluded)
  const assignments = buildAssignments(
    ownProperties,
    ownCtorParams,
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
  const publicBody = bodyParts.join("\n");

  // Build public ctor base initializer: base(discriminatorLiteral, ...baseParamNames)
  const discriminatorLiteral = buildDiscriminatorLiteral(type, namePolicy);
  const baseParamNames = baseCtorParams.map((p) =>
    namePolicy.getName(p.name, "parameter"),
  );
  const publicBaseInit = buildBaseInitializerContent(
    discriminatorLiteral,
    baseParamNames,
  );

  // === Internal serialization constructor ===
  // Base serialization params: all base properties + additionalBinaryDataProperties
  const baseSerializationParams = buildSerializationParameters(
    baseModel.properties,
    namePolicy,
  );
  // Own serialization params: own non-discriminator properties only
  const ownSerializationParams = buildParameters(ownProperties, namePolicy);

  const serializationParams = [
    ...baseSerializationParams,
    ...ownSerializationParams,
  ];

  // Build serialization ctor base initializer: base(...allBaseSerializationParamNames)
  const baseSerializationParamNames = baseSerializationParams.map(
    (p) => p.name as string,
  );
  const serializationBaseInit = baseSerializationParamNames.join(", ");

  // Serialization body: only own (non-discriminator) property assignments
  const serializationAssignments = buildSerializationAssignments(
    ownProperties,
    namePolicy,
    false,
  );
  const serializationBody = serializationAssignments.join("\n");

  return (
    <>
      <OverloadConstructor
        {...accessModifiers}
        parameters={parameters}
        baseInitializer={publicBaseInit}
      >
        {publicBody}
      </OverloadConstructor>
      {"\n\n"}
      <OverloadConstructor
        internal
        parameters={serializationParams}
        baseInitializer={serializationBaseInit}
      >
        {serializationBody}
      </OverloadConstructor>
    </>
  );
}

/**
 * Builds the content for a `: base(...)` initializer.
 *
 * Combines the discriminator literal expression with the base parameter
 * names into a comma-separated argument list suitable for rendering
 * inside `base(...)`.
 *
 * @param discriminator - The discriminator literal expression (string or JSX).
 * @param paramNames - Names of base constructor parameters to pass through.
 * @returns Children content for the baseInitializer prop.
 */
function buildBaseInitializerContent(
  discriminator: Children,
  paramNames: string[],
): Children {
  const trailing = paramNames.length > 0 ? ", " + paramNames.join(", ") : "";
  return (
    <>
      {discriminator}
      {trailing}
    </>
  );
}
