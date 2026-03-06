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
  type AccessModifiers,
  type ConstructorProps,
  computeModifiersPrefix,
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
  code,
  MemberDeclaration,
  MemberName,
} from "@alloy-js/core";
import type {
  SdkModelPropertyType,
  SdkModelType,
} from "@azure-tools/typespec-client-generator-core";
import { UsageFlags } from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import { System } from "../../builtins/system.js";
import {
  renderCollectionParameterType,
  renderCollectionPropertyType,
} from "../../utils/collection-type-expression.js";
import {
  isCollectionType,
  isPropertyNullable,
  unwrapNullableType,
} from "../../utils/nullable.js";
import {
  getPropertyInitializerKind,
  isConstructorParameter,
  isPropertyReadOnly,
  propertyRequiresNullCheck,
  resolvePropertyName,
} from "../../utils/property.js";
import { ensureTrailingPeriod, formatDocLines } from "../../utils/doc.js";
import { argumentRefkey, efCsharpRefkey } from "../../utils/refkey.js";
import { hasDynamicModelProperties, isDynamicModel } from "./DynamicModel.js";

/**
 * Computes the access modifier string in C# canonical order.
 *
 * The Alloy framework's `getAccessModifier` iterates modifiers in
 * `["public", "protected", "private", ...]` order, producing
 * `"protected private"` when both flags are set. C# canonical order
 * is `"private protected"` (private before protected). This function
 * handles compound access modifiers correctly.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/access-modifiers
 */
function getCSharpAccessModifier(props: AccessModifiers): string {
  const parts: string[] = [];
  if (props.public) parts.push("public");
  if (props.private) parts.push("private");
  if (props.protected) parts.push("protected");
  if (props.internal) parts.push("internal");
  if (props.file) parts.push("file");
  return parts.join(" ");
}

/**
 * Props for the {@link ModelConstructors} component.
 */
export interface ModelConstructorsProps {
  /** The TCGC SDK model type representing a TypeSpec model. */
  type: SdkModelType;
  /** Whether the model is a struct. Structs include all non-readonly properties in the constructor. */
  isStruct?: boolean;
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
    Object.keys(model.discriminatedSubtypes).length > 0 &&
    model.discriminatorValue === undefined
  );
}

/**
 * Determines whether a model has discriminated subtypes.
 *
 * Unlike {@link isModelAbstract}, this returns true for ANY model that is a
 * discriminated parent — including intermediate models that have both a
 * discriminator value AND discriminated subtypes. Used to decide whether an
 * `Unknown{BaseName}` fallback class should be generated.
 *
 * @param model - The TCGC SDK model type.
 * @returns `true` if the model has discriminated subtypes.
 */
export function hasDiscriminatedSubtypes(model: SdkModelType): boolean {
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
 * Determines whether a model is a derived type (has a base model).
 *
 * This covers both discriminated derived models (with discriminator value)
 * and non-discriminated derived models (plain inheritance without
 * polymorphism). Both cases need `: base(...)` constructor chaining and
 * should only assign their own properties in the constructor body.
 *
 * @param model - The TCGC SDK model type.
 * @returns `true` if the model has a base model.
 */
export function isDerivedModel(model: SdkModelType): boolean {
  return model.baseModel !== undefined;
}

/**
 * Determines whether a model property is a base discriminator override.
 *
 * A base discriminator override is a property that sets the discriminator value
 * to a constant literal (e.g., `kind: "eagle"` or `kind: PetKind.eagle`).
 * These properties should be filtered from the derived model's own constructor
 * parameters and property declarations because they are inherited from the
 * base class and hardcoded in the base constructor call.
 *
 * Contrast with a model's OWN discriminator property (e.g., Shark's `sharktype: string`)
 * which has a non-constant type and should be kept as a constructor parameter
 * and property declaration.
 *
 * @param property - The TCGC SDK model property.
 * @returns `true` if the property is a discriminator override with a constant value.
 */
export function isBaseDiscriminatorOverride(
  property: SdkModelPropertyType,
): boolean {
  return (
    property.discriminator === true &&
    (property.type.kind === "constant" || property.type.kind === "enumvalue")
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
 * Computes the ordered public constructor parameter list for a model.
 *
 * For base/standalone models: all `isConstructorParameter` properties in definition order.
 * For derived models (both discriminated and non-discriminated):
 *   [ancestor non-discriminator params] + [own non-override ctor params].
 *
 * This is needed to build correct `: base(...)` calls that match the base model's
 * constructor parameter order — important for both discriminated hierarchies
 * (where the discriminator parameter isn't always first) and non-discriminated
 * inheritance (where base model params must be passed through).
 *
 * @param model - The TCGC SDK model type.
 * @returns The model's public ctor params in the order they appear in the signature.
 */
export function computePublicCtorParams(
  model: SdkModelType,
): SdkModelPropertyType[] {
  if (model.baseModel) {
    const baseParams = collectBaseNonDiscCtorParams(model);
    const ownParams = model.properties.filter(
      (p) => !isBaseDiscriminatorOverride(p) && isConstructorParameter(p),
    );
    return [...baseParams, ...ownParams];
  }
  return model.properties.filter((p) => isConstructorParameter(p));
}

/**
 * Collects non-discriminator ctor params from the entire base hierarchy.
 *
 * Walks the base model chain from root to immediate parent, computing each
 * ancestor's public ctor params and filtering out the discriminator property
 * (which gets hardcoded in the base call).
 *
 * @param model - The derived model whose ancestors to walk.
 * @returns Flattened array of base ctor params in root-to-parent order.
 */
function collectBaseNonDiscCtorParams(
  model: SdkModelType,
): SdkModelPropertyType[] {
  const base = model.baseModel;
  if (!base) return [];

  const baseCtorParams = computePublicCtorParams(base);
  // Filter out the base model's own discriminator property — the derived model
  // hardcodes its value instead of passing it as a parameter.
  return baseCtorParams.filter((p) => {
    if (base.discriminatorProperty && p === base.discriminatorProperty) {
      return false;
    }
    return true;
  });
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
  modelName: string,
): ParameterProps[] {
  return properties.map((p) => {
    const nullable = isPropertyNullable(p);
    const unwrapped = unwrapNullableType(p.type);
    // Collection types use IEnumerable<T> for public constructor params
    // (the broadest input interface), non-collections use TypeExpression.
    const baseType = isCollectionType(p.type) ? (
      renderCollectionParameterType(unwrapped)
    ) : (
      <TypeExpression type={unwrapped.__raw!} />
    );

    return {
      name: namePolicy.getName(
        resolvePropertyName(p.name, modelName),
        "parameter",
      ),
      type: nullable ? <>{baseType}?</> : baseType,
    };
  });
}

/**
 * Builds `Argument.AssertNotNull` validation elements for the constructor body.
 *
 * Only required, non-nullable, non-collection reference-type parameters
 * need null validation. Value types (int, bool, etc.) cannot be null
 * and don't need checks. Collections use ChangeTracking initialization
 * instead of null checks.
 *
 * Returns Alloy `code` template elements (not plain strings) so that the
 * `Argument` class is referenced via its refkey. This enables Alloy to
 * automatically generate `using` directives when the model is in a different
 * namespace from the `Argument` helper class (e.g., Azure.Core.Foundations
 * vs the root namespace).
 *
 * @param properties - The constructor parameter properties.
 * @param namePolicy - The C# naming policy for parameter name conversion.
 * @returns An array of Alloy Children elements rendering `Argument.AssertNotNull(name, nameof(name));`.
 */
function buildNullChecks(
  properties: SdkModelPropertyType[],
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
  modelName: string,
): Children[] {
  return properties
    .filter((p) => propertyRequiresNullCheck(p))
    .map((p) => {
      const paramName = namePolicy.getName(
        resolvePropertyName(p.name, modelName),
        "parameter",
      );
      return code`${argumentRefkey()}.AssertNotNull(${paramName}, nameof(${paramName}));`;
    });
}

/**
 * Renders the public constructor body as JSX children, combining null-check
 * elements (Alloy `code` template results with refkeys) and assignment strings.
 *
 * This function exists because null checks use `code` template elements
 * (not plain strings) to reference the `Argument` class via its refkey,
 * enabling automatic `using` directive generation for cross-namespace
 * scenarios. Plain string `.join("\n")` cannot be used on Alloy Children.
 *
 * @param nullChecks - Alloy Children elements for `Argument.AssertNotNull` calls.
 * @param assignments - Plain string assignment statements.
 * @returns JSX children to pass to `<OverloadConstructor>`.
 */
function renderPublicCtorBody(
  nullChecks: Children[],
  assignments: string[],
): Children {
  return (
    <>
      {nullChecks.map((check, i) => (
        <>
          {i > 0 && "\n"}
          {check}
        </>
      ))}
      {nullChecks.length > 0 && assignments.length > 0 && "\n\n"}
      {assignments.length > 0 && assignments.join("\n")}
    </>
  );
}

/**
 * Builds property assignment lines for the constructor body.
 *
 * Iterates all model properties and generates the appropriate initialization:
 * - Constructor parameters (required scalars/refs) → direct assignment
 * - Required collections (arrays) → `.ToList()` conversion from IEnumerable parameter
 * - Required collections (dicts) → direct assignment (both sides are IDictionary)
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
  modelName: string,
): string[] {
  const ctorParamSet = new Set(ctorParams);
  const lines: string[] = [];

  for (const p of allProperties) {
    const kind = getPropertyInitializerKind(p);
    const effectiveName = resolvePropertyName(p.name, modelName);
    const propName = namePolicy.getName(effectiveName, "class-property");

    if (kind === "direct-assign" && ctorParamSet.has(p)) {
      const paramName = namePolicy.getName(effectiveName, "parameter");
      lines.push(`${propName} = ${paramName};`);
    } else if (kind === "to-list" && ctorParamSet.has(p)) {
      // Required array properties: convert from IEnumerable<T> parameter to
      // IList<T> property via .ToList(). Requires `using System.Linq;`.
      const paramName = namePolicy.getName(effectiveName, "parameter");
      lines.push(`${propName} = ${paramName}.ToList();`);
    } else if (kind === "to-dict" && ctorParamSet.has(p)) {
      // Required dictionary properties: the public constructor parameter and
      // property type are both IDictionary<string, T>, so direct assignment works.
      const paramName = namePolicy.getName(effectiveName, "parameter");
      lines.push(`${propName} = ${paramName};`);
    }
    // change-tracking-list and change-tracking-dict require builtins (tasks 5.1.3/5.1.4)
    // These initializations will be added by future tasks.
  }

  return lines;
}

/**
 * Determines whether a model's constructor generates `.ToList()` conversions,
 * which requires `using System.Linq;` in the source file.
 *
 * Returns true when any non-inherited constructor parameter property is a
 * required array (kind `"to-list"`). Derived discriminated models only check
 * their own (non-override) properties since base class properties are
 * assigned in the base constructor.
 *
 * @param model - The TCGC SDK model type.
 * @param isStruct - Whether the model is a struct.
 * @returns `true` if the model file needs `using System.Linq;`.
 */
export function modelNeedsLinqImport(
  model: SdkModelType,
  isStruct: boolean = false,
): boolean {
  const properties = isDerivedDiscriminatedModel(model)
    ? model.properties.filter((p) => !isBaseDiscriminatorOverride(p))
    : model.properties;
  return properties.some(
    (p) =>
      isConstructorParameter(p, isStruct) &&
      getPropertyInitializerKind(p) === "to-list",
  );
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
/**
 * Builds ParameterProps using property-level types (IList/IReadOnlyList for
 * arrays, IDictionary/IReadOnlyDictionary for dicts). Used by both
 * buildSerializationParameters and computeSerializationCtorParams.
 */
function buildPropertyTypeParameters(
  properties: SdkModelPropertyType[],
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
  modelName: string,
): ParameterProps[] {
  return properties.map((p) => {
    const nullable = isPropertyNullable(p);
    const unwrapped = unwrapNullableType(p.type);
    // Serialization constructor uses property types: IList<T>/IReadOnlyList<T>
    // for arrays, IDictionary/IReadOnlyDictionary for dicts.
    const baseType = isCollectionType(p.type) ? (
      renderCollectionPropertyType(unwrapped, isPropertyReadOnly(p))
    ) : (
      <TypeExpression type={unwrapped.__raw!} />
    );

    return {
      name: namePolicy.getName(
        resolvePropertyName(p.name, modelName),
        "parameter",
      ),
      type: nullable ? <>{baseType}?</> : baseType,
    };
  });
}

export function buildSerializationParameters(
  properties: SdkModelPropertyType[],
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
  isDynamic: boolean = false,
  modelName: string = "",
): ParameterProps[] {
  const propParams = buildPropertyTypeParameters(
    properties,
    namePolicy,
    modelName,
  );

  if (isDynamic) {
    propParams.push({
      name: "patch",
      type: SystemClientModelPrimitives.JsonPatch,
      in: true,
    });
  } else {
    propParams.push({
      name: ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME,
      type: (
        <>
          {SystemCollectionsGeneric.IDictionary}
          {"<string, "}
          {System.BinaryData}
          {">"}
        </>
      ),
    });
  }

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
  isDynamic: boolean = false,
  hasNestedDynamicProps: boolean = false,
  modelName: string = "",
): string[] {
  const lines: string[] = [];

  for (const p of properties) {
    const effectiveName = resolvePropertyName(p.name, modelName);
    const propName = namePolicy.getName(effectiveName, "class-property");
    const paramName = namePolicy.getName(effectiveName, "parameter");
    lines.push(`${propName} = ${paramName};`);
  }

  if (includeAdditionalBinaryData) {
    if (isDynamic) {
      lines.push("_patch = patch;");
      if (hasNestedDynamicProps) {
        lines.push("_patch.SetPropagators(PropagateSet, PropagateGet);");
      }
    } else {
      lines.push(
        `${ADDITIONAL_BINARY_DATA_PROPS_FIELD_NAME} = ${ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME};`,
      );
    }
  }

  return lines;
}

/**
 * Recursively computes the full serialization constructor parameter list for a model.
 *
 * For base/standalone models: all own properties + additionalBinaryDataProperties.
 * For derived models (both discriminated and non-discriminated):
 *   base's serialization params (recursive) + own non-override properties.
 *
 * This correctly positions `additionalBinaryDataProperties` between the root model's
 * properties and intermediate/derived model properties, matching the legacy emitter's
 * serialization constructor parameter order.
 *
 * @example For Fish → Shark → SawShark (discriminated):
 * - Fish: [kind, age, additionalBinaryData]
 * - Shark: [kind, age, additionalBinaryData, sharktype]
 * - SawShark: [kind, age, additionalBinaryData, sharktype] (no own props)
 *
 * @example For Pet → Cat → Siamese (non-discriminated):
 * - Pet: [name, additionalBinaryData]
 * - Cat: [name, additionalBinaryData, age]
 * - Siamese: [name, additionalBinaryData, age, smart]
 *
 * @param model - The TCGC SDK model type.
 * @param namePolicy - The C# naming policy for parameter name conversion.
 * @returns An array of ParameterProps for the serialization constructor.
 */
export function computeSerializationCtorParams(
  model: SdkModelType,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): ParameterProps[] {
  if (model.baseModel) {
    const baseParams = computeSerializationCtorParams(
      model.baseModel,
      namePolicy,
    );
    const ownProps = model.properties.filter(
      (p) => !isBaseDiscriminatorOverride(p),
    );
    const ownParams = buildPropertyTypeParameters(
      ownProps,
      namePolicy,
      model.name,
    );
    return [...baseParams, ...ownParams];
  }
  return buildSerializationParameters(
    model.properties,
    namePolicy,
    isDynamicModel(model),
    model.name,
  );
}

/**
 */
export interface ModelConstructorProps extends ConstructorProps {
  /** Content rendered inside `: base(...)`. When provided, the constructor chains to the base class. */
  baseInitializer?: Children;
  /** Content rendered inside `: this(...)`. When provided, the constructor chains to another constructor on the same class. */
  thisInitializer?: Children;
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
  const modifiers = computeModifiersPrefix([getCSharpAccessModifier(props)]);

  return (
    <MemberDeclaration symbol={ctorSymbol}>
      <MethodScope>
        {modifiers}
        <MemberName />
        <Parameters parameters={props.parameters} />
        {props.baseInitializer !== undefined && (
          <> : base({props.baseInitializer})</>
        )}
        {props.thisInitializer !== undefined && (
          <> : this({props.thisInitializer})</>
        )}
        {props.children != null ? (
          <Block newline>{props.children}</Block>
        ) : (
          <>{"\n{\n}"}</>
        )}
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
  const { type, isStruct = false } = props;
  const namePolicy = useCSharpNamePolicy();

  if (type.baseModel) {
    return <DerivedModelConstructors type={type} namePolicy={namePolicy} />;
  }

  return (
    <BaseModelConstructors
      type={type}
      namePolicy={namePolicy}
      isStruct={isStruct}
    />
  );
}

/**
 * Lightweight parameter doc info, decoupled from SdkModelPropertyType so it
 * can represent synthetic parameters like `additionalBinaryDataProperties`.
 */
interface ParamDocInfo {
  /** The C# parameter name (already converted via namePolicy). */
  name: string;
  /** Raw doc text from TypeSpec, or undefined if no doc is available. */
  doc?: string;
}

/**
 * Converts SDK model properties to ParamDocInfo using the naming policy.
 *
 * @param params - SDK model properties to convert.
 * @param namePolicy - C# naming policy for parameter name conversion.
 */
function toParamDocInfos(
  params: SdkModelPropertyType[],
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
  modelName: string,
): ParamDocInfo[] {
  return params.map((p) => ({
    name: namePolicy.getName(
      resolvePropertyName(p.name, modelName),
      "parameter",
    ),
    doc: p.doc ?? p.summary,
  }));
}

/**
 * Collects parameter doc info for a serialization constructor, recursively
 * walking the base model hierarchy.
 *
 * Mirrors the parameter ordering of {@link computeSerializationCtorParams}:
 * for derived models, base serialization params come first (including
 * `additionalBinaryDataProperties` after the root's properties), then
 * own (non-override) properties.
 *
 * @param model - The model whose serialization ctor params to document.
 * @param namePolicy - C# naming policy for parameter name conversion.
 * @returns Ordered array of ParamDocInfo matching the serialization ctor signature.
 */
function collectSerializationParamDocs(
  model: SdkModelType,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): ParamDocInfo[] {
  if (model.baseModel) {
    const baseDocs = collectSerializationParamDocs(model.baseModel, namePolicy);
    const ownProps = model.properties.filter(
      (p) => !isBaseDiscriminatorOverride(p),
    );
    return [...baseDocs, ...toParamDocInfos(ownProps, namePolicy, model.name)];
  }

  // Root model: all properties + trailing additionalBinaryDataProperties or patch
  const propDocs = toParamDocInfos(model.properties, namePolicy, model.name);
  const isDynamic = isDynamicModel(model);
  if (isDynamic) {
    propDocs.push({
      name: "patch",
      doc: "Tracks changes to the model.",
    });
  } else {
    propDocs.push({
      name: ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME,
      doc: "Keeps track of any properties unknown to the library.",
    });
  }
  return propDocs;
}

/**
 * Builds XML doc comment lines for a model constructor.
 *
 * Produces `/// <summary>`, `/// <param>`, and optionally `/// <exception>` lines
 * matching the legacy emitter's golden output format.
 *
 * For the public/internal initialization constructor:
 * - Summary: `Initializes a new instance of <see cref="ClassName"/>.`
 * - Param docs from TypeSpec property `doc`/`summary`
 * - Exception doc listing which params throw `ArgumentNullException`
 *
 * For the internal serialization constructor:
 * - Same summary and param docs (including `additionalBinaryDataProperties`)
 * - No exception doc (deserialization trusts caller values)
 *
 * @param className - The C# class name for `<see cref="..."/>`.
 * @param paramDocs - Ordered parameter doc entries matching the constructor signature.
 * @param exceptionParamNames - Parameter names that get `ArgumentNullException` docs.
 * @returns Array of doc comment strings, formatted for JSX rendering.
 */
function buildConstructorXmlDoc(
  className: string,
  paramDocs: ParamDocInfo[],
  exceptionParamNames: string[] = [],
): string[] {
  const lines: string[] = [];

  // Summary line
  lines.push(
    `/// <summary> Initializes a new instance of <see cref="${className}"/>. </summary>`,
  );

  // Parameter docs — each property has a doc/summary from TypeSpec
  for (const p of paramDocs) {
    const docContent = p.doc
      ? ` ${formatDocLines(ensureTrailingPeriod(p.doc))} `
      : "";
    lines.push(`/// <param name="${p.name}">${docContent}</param>`);
  }

  // Exception doc — only when there are assertable params
  if (exceptionParamNames.length > 0) {
    const refs = exceptionParamNames.map(
      (name) => `<paramref name="${name}"/>`,
    );
    lines.push(
      `/// <exception cref="ArgumentNullException"> ${joinWithOr(refs)} is null. </exception>`,
    );
  }

  // First line has no leading \n; subsequent lines are prefixed with \n
  return lines.map((line, i) => (i === 0 ? line : `\n${line}`));
}

/**
 * Joins items with commas and "or" before the last item.
 *
 * Used for XML doc exception messages listing multiple parameter names.
 *
 * @example
 * - 1 item: "A"
 * - 2 items: "A or B"
 * - 3+ items: "A, B or C"
 */
function joinWithOr(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return items.slice(0, -1).join(", ") + " or " + items[items.length - 1];
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
  isStruct?: boolean;
}) {
  const { type, namePolicy, isStruct = false } = props;

  // === Public initialization constructor ===
  const accessModifiers = getConstructorAccessModifiers(type);

  const ctorParamProps = type.properties.filter((p) =>
    isConstructorParameter(p, isStruct),
  );

  const parameters = buildParameters(ctorParamProps, namePolicy, type.name);
  // Abstract base models skip null checks — derived classes validate before
  // calling base(). This matches the legacy emitter's golden output where
  // private protected constructors have no Argument.AssertNotNull calls.
  const nullChecks = isModelAbstract(type)
    ? []
    : buildNullChecks(ctorParamProps, namePolicy, type.name);
  const assignments = buildAssignments(
    type.properties,
    ctorParamProps,
    namePolicy,
    type.name,
  );

  const body = renderPublicCtorBody(nullChecks, assignments);

  // === Doc comments for public constructor ===
  const className = namePolicy.getName(type.name, "class");
  const assertableParams = isModelAbstract(type)
    ? []
    : ctorParamProps.filter((p) => propertyRequiresNullCheck(p));
  const publicCtorDoc = buildConstructorXmlDoc(
    className,
    toParamDocInfos(ctorParamProps, namePolicy, type.name),
    assertableParams.map((p) =>
      namePolicy.getName(resolvePropertyName(p.name, type.name), "parameter"),
    ),
  );

  // === Internal serialization constructor ===
  const isDynamic = isDynamicModel(type);
  const hasNestedDynamic =
    isDynamic && hasDynamicModelProperties(type, namePolicy);
  const serializationParams = buildSerializationParameters(
    type.properties,
    namePolicy,
    isDynamic,
    type.name,
  );
  const serializationAssignments = buildSerializationAssignments(
    type.properties,
    namePolicy,
    true,
    isDynamic,
    hasNestedDynamic,
    type.name,
  );
  const serializationBody = serializationAssignments.join("\n");

  // === Doc comments for serialization constructor ===
  const serializationCtorDoc = buildConstructorXmlDoc(
    className,
    collectSerializationParamDocs(type, namePolicy),
  );

  return (
    <>
      {publicCtorDoc}
      {"\n"}
      <OverloadConstructor {...accessModifiers} parameters={parameters}>
        {body}
      </OverloadConstructor>
      {"\n\n"}
      {serializationCtorDoc}
      {"\n"}
      {isDynamic &&
        "#pragma warning disable SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates.\n"}
      <OverloadConstructor internal parameters={serializationParams}>
        {serializationBody}
      </OverloadConstructor>
      {isDynamic &&
        "\n#pragma warning restore SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates."}
    </>
  );
}

/**
 * Generates constructors for derived model classes, both discriminated
 * and non-discriminated.
 *
 * Derived models chain both constructors to the base class. Walks the full
 * inheritance hierarchy to collect parameters (not just the immediate base).
 *
 * **Public constructor:**
 * - Parameters: all ancestor non-discriminator ctor params + own ctor params
 * - Base call: arguments matching the base model's ctor param order, with
 *   the discriminator position replaced by the discriminator literal
 *   (discriminated only); for non-discriminated, all base params passed through
 * - Body: null checks and assignments for own properties only
 *   (for discriminated, null checks cover all params since base is abstract)
 *
 * **Serialization constructor:**
 * - Parameters: all ancestor properties + additionalBinaryData + own properties
 * - Base call: pass-through all base serialization param names
 * - Body: assignments for own properties only (base handles its own)
 *
 * For nested discriminator hierarchies (e.g., Fish → Shark → SawShark where
 * Shark introduces its own "sharktype" discriminator), the base call correctly
 * places the discriminator literal at the position matching the base model's
 * constructor parameter order.
 *
 * For non-discriminated hierarchies (e.g., Pet → Cat → Siamese), the base
 * call simply passes through all base ctor param names. The base constructor
 * validates its own params, so the derived constructor only validates its
 * own reference-type params.
 */
function DerivedModelConstructors(props: {
  type: SdkModelType;
  namePolicy: ReturnType<typeof useCSharpNamePolicy>;
}) {
  const { type, namePolicy } = props;
  const baseModel = type.baseModel!;
  const isDiscriminated = isDerivedDiscriminatedModel(type);

  // Filter out only base discriminator overrides (constants like kind: "eagle").
  // Keep the model's own discriminator property (like Shark's sharktype: string).
  // For non-discriminated models, isBaseDiscriminatorOverride is always false, so
  // all properties are kept.
  const ownProperties = type.properties.filter(
    (p) => !isBaseDiscriminatorOverride(p),
  );

  // === Public initialization constructor ===
  const accessModifiers = getConstructorAccessModifiers(type);

  // Walk the full base hierarchy for constructor params
  const baseCtorParams = collectBaseNonDiscCtorParams(type);
  // Collect own ctor params (base disc overrides already filtered)
  const ownCtorParams = ownProperties.filter((p) => isConstructorParameter(p));

  // Combined parameter list: base params first, then own params
  const allCtorParams = [...baseCtorParams, ...ownCtorParams];
  const parameters = buildParameters(allCtorParams, namePolicy, type.name);

  // For discriminated models, validate ALL params (inherited + own) — the base
  // class's private protected ctor does NOT validate, so the derived public
  // ctor is responsible for validating all reference-type params.
  // For non-discriminated models, validate only OWN params — the base class's
  // public/internal ctor already validates its own params via the `: base(...)`
  // chain.
  const paramsToValidate = isDiscriminated ? allCtorParams : ownCtorParams;
  const nullChecks = buildNullChecks(paramsToValidate, namePolicy, type.name);
  // Assignments only for own properties
  const assignments = buildAssignments(
    ownProperties,
    ownCtorParams,
    namePolicy,
    type.name,
  );

  const publicBody = renderPublicCtorBody(nullChecks, assignments);

  // Build public ctor base initializer.
  // For discriminated models: substitute discriminator literal at the discriminator position.
  // For non-discriminated models: pass through all base ctor param names.
  let publicBaseInit: Children;
  if (isDiscriminated) {
    const discriminatorLiteral = buildDiscriminatorLiteral(type, namePolicy);
    publicBaseInit = buildPublicBaseInitializer(
      baseModel,
      discriminatorLiteral,
      namePolicy,
    );
  } else {
    const baseParamNames = computePublicCtorParams(baseModel).map((p) =>
      namePolicy.getName(
        resolvePropertyName(p.name, baseModel.name),
        "parameter",
      ),
    );
    publicBaseInit = baseParamNames.join(", ");
  }

  // === Internal serialization constructor ===
  // Compute serialization params recursively: base's serialization params + own props.
  // This correctly positions additionalBinaryDataProperties between base and own params.
  const baseSerializationCtorParams = computeSerializationCtorParams(
    baseModel,
    namePolicy,
  );
  const ownSerializationParams = buildPropertyTypeParameters(
    ownProperties,
    namePolicy,
    type.name,
  );

  const serializationParams = [
    ...baseSerializationCtorParams,
    ...ownSerializationParams,
  ];

  // Build serialization ctor base initializer: pass all base serialization param names
  const baseSerializationParamNames = baseSerializationCtorParams.map(
    (p) => p.name as string,
  );
  const serializationBaseInit = baseSerializationParamNames.join(", ");

  // Serialization body: only own property assignments
  const serializationAssignments = buildSerializationAssignments(
    ownProperties,
    namePolicy,
    false,
    false,
    false,
    type.name,
  );
  const serializationBody = serializationAssignments.join("\n");

  // === Doc comments ===
  const className = namePolicy.getName(type.name, "class");
  // Exception doc params match the null-check scope (all vs own).
  const assertableParams = paramsToValidate
    .filter((p) => propertyRequiresNullCheck(p))
    .map((p) =>
      namePolicy.getName(resolvePropertyName(p.name, type.name), "parameter"),
    );
  const publicCtorDoc = buildConstructorXmlDoc(
    className,
    toParamDocInfos(allCtorParams, namePolicy, type.name),
    assertableParams,
  );
  const serializationCtorDoc = buildConstructorXmlDoc(
    className,
    collectSerializationParamDocs(type, namePolicy),
  );

  return (
    <>
      {publicCtorDoc}
      {"\n"}
      <OverloadConstructor
        {...accessModifiers}
        parameters={parameters}
        baseInitializer={publicBaseInit}
      >
        {publicBody}
      </OverloadConstructor>
      {"\n\n"}
      {serializationCtorDoc}
      {"\n"}
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
 * Builds the public constructor base initializer by matching the base model's
 * constructor parameter order.
 *
 * Iterates the base model's public ctor params (computed recursively) and
 * substitutes the discriminator literal at the position of the base model's
 * own discriminator property. All other positions are pass-through parameter names.
 *
 * This correctly handles nested discriminator hierarchies where the discriminator
 * isn't the first parameter (e.g., Shark(int age, string sharktype) where age
 * precedes the discriminator).
 *
 * @param baseModel - The immediate base model.
 * @param discriminatorLiteral - The literal expression for the discriminator value.
 * @param namePolicy - The C# naming policy for parameter name conversion.
 * @returns Children content for the baseInitializer prop.
 */
function buildPublicBaseInitializer(
  baseModel: SdkModelType,
  discriminatorLiteral: Children,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): Children {
  const baseCtorParams = computePublicCtorParams(baseModel);
  const parts: (string | Children)[] = [];

  for (const param of baseCtorParams) {
    if (
      baseModel.discriminatorProperty &&
      param === baseModel.discriminatorProperty
    ) {
      // This is the base model's own discriminator — substitute the literal
      parts.push(discriminatorLiteral);
    } else {
      // Regular parameter — pass through
      parts.push(
        namePolicy.getName(
          resolvePropertyName(param.name, baseModel.name),
          "parameter",
        ),
      );
    }
  }

  // If no params found (shouldn't happen for discriminated models),
  // fall back to just the discriminator literal
  if (parts.length === 0) {
    return discriminatorLiteral;
  }

  // Build a combined Children expression with comma separators
  return (
    <>
      {parts.map((part, i) => (
        <>
          {i > 0 ? ", " : ""}
          {part}
        </>
      ))}
    </>
  );
}
