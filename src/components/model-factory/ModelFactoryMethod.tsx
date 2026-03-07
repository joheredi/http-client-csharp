/**
 * Individual factory method component for C# model factory generation.
 *
 * Generates a single `public static ModelName MethodName(params...) { ... }`
 * method that creates a model instance from the full serialization constructor,
 * passing `null` for the `additionalBinaryDataProperties` parameter.
 *
 * Factory method parameters match the serialization constructor minus the
 * `additionalBinaryDataProperties` parameter and any discriminator properties
 * with fixed values. All parameters default to `= default` so callers only
 * specify the values they care about.
 *
 * Discriminator properties are excluded from the factory method signature when
 * the model has a fixed discriminator value (i.e., it is a derived model in a
 * discriminated hierarchy). The discriminator literal is hardcoded in the
 * constructor call instead of being exposed as a parameter.
 *
 * Collection parameters receive special treatment to match the legacy emitter:
 * - **Arrays**: Parameter type is `IEnumerable<T>` (broadest input interface).
 *   Null-coalesced with `new ChangeTrackingList<T>()`, then passed as
 *   `param.ToList()` to the constructor.
 * - **Dictionaries**: Parameter type stays `IDictionary<string, T>`.
 *   Null-coalesced with `new ChangeTrackingDictionary<string, T>()`,
 *   then passed as-is to the constructor.
 *
 * @example Generated output for a derived discriminated model:
 * ```csharp
 * public static Cat Cat(string name = default, int lives = default)
 * {
 *     return new Cat("cat", name, lives, additionalBinaryDataProperties: null);
 * }
 * ```
 *
 * @example Generated output for a model with collections:
 * ```csharp
 * public static Widget Widget(string name = default, IEnumerable<string> tags = default)
 * {
 *     tags ??= new ChangeTrackingList<string>();
 *
 *     return new Widget(name, tags.ToList(), additionalBinaryDataProperties: null);
 * }
 * ```
 *
 * @module
 */

import {
  Method,
  type ParameterProps,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import { code, type Children } from "@alloy-js/core";
import type {
  SdkConstantType,
  SdkModelPropertyType,
  SdkModelType,
} from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import {
  getCollectionValueType,
  isArrayCollection,
  isDictCollection,
} from "../../utils/collections.js";
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
  efCsharpRefkey,
  literalTypeRefkey,
  unknownModelRefkey,
} from "../../utils/refkey.js";
import { needsLiteralWrapperStruct } from "../literal-types/collect.js";
import {
  ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME,
  isBaseDiscriminatorOverride,
  isDerivedDiscriminatedModel,
  isModelAbstract,
} from "../models/ModelConstructors.js";
import { isDynamicModel } from "../models/DynamicModel.js";

/**
 * Props for the {@link ModelFactoryMethod} component.
 */
export interface ModelFactoryMethodProps {
  /** The TCGC SDK model type for which to generate a factory method. */
  type: SdkModelType;
}

/**
 * Returns the flat list of model properties in serialization constructor order.
 *
 * Mirrors the ordering logic of `computeSerializationCtorParams` but returns
 * the original `SdkModelPropertyType` objects instead of `ParameterProps`.
 * This is needed by the factory method to inspect each property's type
 * (e.g., to detect collections and apply type conversions).
 *
 * For derived discriminated models, recursively includes base model properties
 * first, then appends the derived model's own properties (excluding base
 * discriminator overrides, which are hardcoded by the derived constructor).
 *
 * Does NOT include the synthetic `additionalBinaryDataProperties` parameter —
 * that is always handled separately as `null` in the factory method's
 * constructor call.
 *
 * @param model - The TCGC SDK model type.
 * @returns Flat array of properties in serialization constructor parameter order.
 */
function computeSerializationProperties(
  model: SdkModelType,
): SdkModelPropertyType[] {
  if (model.baseModel) {
    const baseProps = computeSerializationProperties(model.baseModel);
    const ownProps = model.properties.filter(
      (p) => !isBaseDiscriminatorOverride(p),
    );
    return [...baseProps, ...ownProps];
  }
  return [...model.properties];
}

/**
 * Represents a serialization property paired with its declaring model name.
 * Used for CS0542 collision detection in factory method parameter naming.
 */
interface SerializationPropertyInfo {
  property: SdkModelPropertyType;
  modelName: string;
}

/**
 * Computes serialization properties with their declaring model names.
 */
function computeSerializationPropertyInfos(
  model: SdkModelType,
): SerializationPropertyInfo[] {
  if (model.baseModel) {
    const baseInfos = computeSerializationPropertyInfos(model.baseModel);
    const ownProps = model.properties.filter(
      (p) => !isBaseDiscriminatorOverride(p),
    );
    return [
      ...baseInfos,
      ...ownProps.map((p) => ({ property: p, modelName: model.name })),
    ];
  }
  return model.properties.map((p) => ({ property: p, modelName: model.name }));
}

/**
 * Resolves the C# literal expression for a discriminator property on a derived model.
 *
 * Walks up the model hierarchy to find which ancestor declares the given property
 * as its `discriminatorProperty`. The derived model at that level provides the
 * fixed discriminator value (via `discriminatorValue` and its own property override).
 *
 * Handles both string discriminators (`"cat"`) and enum discriminators
 * (`PetKind.Cat`) by inspecting the override property's type.
 *
 * For multi-level hierarchies (e.g., Pet → Fish → Shark where both Pet and Fish
 * have discriminators), this correctly maps each discriminator property to the
 * value from the appropriate level: Fish provides Pet's discriminator value,
 * and Shark provides Fish's discriminator value.
 *
 * @param property - A discriminator property from the serialization constructor params.
 * @param model - The derived model being processed by the factory method.
 * @param namePolicy - The C# naming policy for enum member name conversion.
 * @returns The C# literal expression as Children, or undefined if no fixed value exists.
 */
function getDiscriminatorLiteral(
  property: SdkModelPropertyType,
  model: SdkModelType,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): Children | undefined {
  let current: SdkModelType | undefined = model;
  while (current) {
    if (
      current.baseModel?.discriminatorProperty?.name === property.name &&
      current.discriminatorValue !== undefined
    ) {
      // This model provides a fixed value for the base's discriminator property.
      // Find the override property on this model to determine the literal type.
      const override = current.properties.find(
        (p) => p.discriminator && p.name === property.name,
      );
      if (override?.type.kind === "enumvalue") {
        // Enum discriminator: compose EnumType.MemberName using refkey
        // so Alloy auto-generates the correct `using` directive.
        const enumTypeRefkey = efCsharpRefkey(override.type.enumType.__raw!);
        const memberName = namePolicy.getName(
          override.type.name,
          "enum-member",
        );
        return (
          <>
            {enumTypeRefkey}.{memberName}
          </>
        );
      }
      // String discriminator: use the model's discriminatorValue as a C# string literal.
      return `"${current.discriminatorValue}"`;
    }
    current = current.baseModel;
  }
  return undefined;
}

/**
 * Returns the number of properties on the root (top-most) model in the
 * inheritance hierarchy. This count determines where
 * `additionalBinaryDataProperties` is positioned in the serialization
 * constructor's parameter list.
 *
 * In the legacy emitter, `additionalBinaryDataProperties` always follows the
 * root model's own properties and precedes any intermediate/derived model
 * properties — regardless of hierarchy depth.
 *
 * @param model - Any model in an inheritance hierarchy.
 * @returns The property count of the root ancestor model.
 */
function getRootModelPropertyCount(model: SdkModelType): number {
  let current = model;
  while (current.baseModel) {
    current = current.baseModel;
  }
  return current.properties.length;
}

/**
 * Metadata collected for each collection parameter in the factory method.
 *
 * Used to generate the null-coalescing initialization statements that appear
 * before the return statement in the method body.
 */
interface CollectionInitInfo {
  /** The C# parameter name (camelCase). */
  paramName: string;
  /** Whether this is an array collection (true) or dictionary (false). */
  isArray: boolean;
  /** JSX element rendering the collection's value/element type (e.g., `string`, `Widget`). */
  valueTypeExpr: Children;
}

/**
 * Generates a static factory method for a single model type.
 *
 * Works directly with the model's `SdkModelPropertyType` objects (via
 * {@link computeSerializationProperties}) so it can inspect each property's
 * type to apply collection-specific transformations:
 *
 * 1. **Parameter types**: Arrays use `IEnumerable<T>` instead of `IList<T>`;
 *    dictionaries keep `IDictionary<string, T>`; scalars use TypeExpression.
 * 2. **Null-coalescing**: Collection parameters get
 *    `param ??= new ChangeTrackingList<T>()` (arrays) or
 *    `param ??= new ChangeTrackingDictionary<string, T>()` (dicts).
 * 3. **Constructor arguments**: Array params become `param.ToList()`;
 *    all others pass through as the parameter name.
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the factory method declaration.
 */
export function ModelFactoryMethod(props: ModelFactoryMethodProps) {
  const namePolicy = useCSharpNamePolicy();

  // Get all properties in serialization constructor order (base first, then own).
  // This gives us access to the SdkType for collection detection.
  const allProperties = computeSerializationProperties(props.type);
  const allPropertyInfos = computeSerializationPropertyInfos(props.type);

  // Compute the position at which additionalBinaryDataProperties must be
  // inserted in the constructor call. In the serialization constructor,
  // additionalBinaryDataProperties always appears after the ROOT model's
  // properties — not after the immediate parent's properties. For example:
  //   Pet:     [name, additionalBinaryData]
  //   Cat:     [name, additionalBinaryData, age]
  //   Siamese: [name, additionalBinaryData, age, smart]
  // The root model (Pet) has 1 property, so additionalBinaryData is at index 1
  // for ALL descendants, regardless of inheritance depth.
  const rootPropertyCount = getRootModelPropertyCount(props.type);
  const basePropertyCount = props.type.baseModel
    ? rootPropertyCount
    : allProperties.length;

  // Three parallel data structures built from the property list:
  // 1. factoryParams — the method signature parameters
  // 2. collectionInits — metadata for null-coalescing lines
  // 3. ctorArgs — the arguments passed to `new ModelType(...)`.
  //    Uses Children[] (not string[]) to support enum discriminator refkeys.
  const factoryParams: ParameterProps[] = [];
  const collectionInits: CollectionInitInfo[] = [];
  const ctorArgs: Children[] = [];

  // Track how many constructor args have been pushed to insert
  // additionalBinaryDataProperties at the right position.
  let ctorArgIndex = 0;

  for (let i = 0; i < allProperties.length; i++) {
    const p = allProperties[i];
    const { modelName } = allPropertyInfos[i];
    const paramName = namePolicy.getName(
      resolvePropertyName(p.name, modelName),
      "parameter",
    );

    // Insert additionalBinaryDataProperties at the boundary between base and own props.
    if (ctorArgIndex === basePropertyCount) {
      if (isDynamicModel(props.type)) {
        ctorArgs.push("default");
      } else {
        ctorArgs.push("null");
      }
      ctorArgIndex++;
    }

    // Discriminator properties with fixed values are excluded from factory
    // method parameters. Instead, the discriminator literal is injected
    // directly into the constructor call.
    if (p.discriminator) {
      const literal = getDiscriminatorLiteral(p, props.type, namePolicy);
      if (literal !== undefined) {
        ctorArgs.push(literal);
        ctorArgIndex++;
        continue;
      }
    }

    const nullable = isPropertyNullable(p);
    const unwrapped = unwrapNullableType(p.type);

    if (isArrayCollection(p.type)) {
      // Array → IEnumerable<T> parameter, ChangeTrackingList<T> init, .ToList() arg
      const valueType = getCollectionValueType(p.type);
      const unwrappedVT = unwrapNullableType(valueType);
      const isVTNullable = valueType.kind === "nullable";
      const vtExpr = <TypeExpression type={unwrappedVT.__raw!} />;
      const valueTypeExpr: Children = isVTNullable ? <>{vtExpr}?</> : vtExpr;

      factoryParams.push({
        name: paramName,
        type: code`IEnumerable<${valueTypeExpr}>`,
        default: "default" as Children,
      });

      collectionInits.push({ paramName, isArray: true, valueTypeExpr });
      ctorArgs.push(`${paramName}.ToArray()`);
      ctorArgIndex++;
    } else if (isDictCollection(p.type)) {
      // Dict → use matching collection type (IDictionary or IReadOnlyDictionary
      // depending on property access), ChangeTrackingDictionary init, pass as-is
      const valueType = getCollectionValueType(p.type);
      const unwrappedVT = unwrapNullableType(valueType);
      const isVTNullable = valueType.kind === "nullable";
      const vtExpr = <TypeExpression type={unwrappedVT.__raw!} />;
      const valueTypeExpr: Children = isVTNullable ? <>{vtExpr}?</> : vtExpr;

      // Use renderCollectionPropertyType to match the constructor parameter type,
      // respecting IReadOnlyDictionary for read-only properties
      const baseType = renderCollectionPropertyType(
        unwrapped,
        isPropertyReadOnly(p),
      );
      factoryParams.push({
        name: paramName,
        type: nullable ? <>{baseType}?</> : baseType,
        default: "default" as Children,
      });

      collectionInits.push({ paramName, isArray: false, valueTypeExpr });
      ctorArgs.push(paramName);
      ctorArgIndex++;
    } else {
      // Non-collection — use literal wrapper struct refkey for literal types
      // that need wrapper structs, standard TypeExpression for other types
      const isLiteralWrapper =
        unwrapped.kind === "constant" &&
        needsLiteralWrapperStruct(unwrapped, nullable);
      const baseType = isLiteralWrapper ? (
        literalTypeRefkey(unwrapped as SdkConstantType)
      ) : (
        <TypeExpression type={unwrapped.__raw!} />
      );
      factoryParams.push({
        name: paramName,
        type: nullable ? <>{baseType}?</> : baseType,
        default: "default" as Children,
      });

      ctorArgs.push(paramName);
      ctorArgIndex++;
    }
  }

  // If additionalBinaryDataProperties wasn't inserted during the loop
  // (root models where basePropertyCount === allProperties.length and
  // all properties have been processed), append it now.
  if (ctorArgIndex === basePropertyCount) {
    if (isDynamicModel(props.type)) {
      ctorArgs.push("default");
    } else {
      ctorArgs.push("null");
    }
  }

  // For abstract models, the factory method instantiates the Unknown variant
  // instead of the abstract class itself. The method name and return type still
  // use the abstract model's identity, but `new UnknownBird(...)` replaces
  // `new Bird(...)`. This matches the legacy emitter's ModelFactoryProvider
  // behavior where abstract models delegate to their Unknown derived model.
  const isAbstract = isModelAbstract(props.type);
  const instantiationRefkey = isAbstract
    ? unknownModelRefkey(props.type.__raw!)
    : efCsharpRefkey(props.type.__raw!);
  const returnType = <TypeExpression type={props.type.__raw!} />;

  // Join ctorArgs with ", " separator. Uses flatMap instead of .join() because
  // ctorArgs may contain JSX Children (e.g., enum discriminator refkeys).
  const ctorArgsExpr = ctorArgs.flatMap((arg, i) =>
    i === 0 ? [arg] : [", ", arg],
  );

  return (
    <Method
      public
      static
      name={props.type.name}
      returns={returnType}
      parameters={factoryParams}
    >
      {collectionInits.map((init) =>
        init.isArray
          ? code`${init.paramName} ??= new ChangeTrackingList<${init.valueTypeExpr}>();\n`
          : code`${init.paramName} ??= new ChangeTrackingDictionary<string, ${init.valueTypeExpr}>();\n`,
      )}
      {collectionInits.length > 0 && "\n"}
      {code`return new ${instantiationRefkey}(${ctorArgsExpr});`}
    </Method>
  );
}
