/**
 * Individual factory method component for C# model factory generation.
 *
 * Generates a single `public static ModelName MethodName(params...) { ... }`
 * method that creates a model instance from the full serialization constructor,
 * passing `null` for the `additionalBinaryDataProperties` parameter.
 *
 * Factory method parameters match the serialization constructor minus the
 * `additionalBinaryDataProperties` parameter. All parameters default to
 * `= default` so callers only specify the values they care about.
 *
 * Collection parameters receive special treatment to match the legacy emitter:
 * - **Arrays**: Parameter type is `IEnumerable<T>` (broadest input interface).
 *   Null-coalesced with `new ChangeTrackingList<T>()`, then passed as
 *   `param.ToList()` to the constructor.
 * - **Dictionaries**: Parameter type stays `IDictionary<string, T>`.
 *   Null-coalesced with `new ChangeTrackingDictionary<string, T>()`,
 *   then passed as-is to the constructor.
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
  SdkModelPropertyType,
  SdkModelType,
} from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import {
  getCollectionValueType,
  isArrayCollection,
  isDictCollection,
} from "../../utils/collections.js";
import {
  isCollectionType,
  isPropertyNullable,
  unwrapNullableType,
} from "../../utils/nullable.js";
import { efCsharpRefkey } from "../../utils/refkey.js";
import {
  ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME,
  isBaseDiscriminatorOverride,
  isDerivedDiscriminatedModel,
} from "../models/ModelConstructors.js";

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
  if (isDerivedDiscriminatedModel(model)) {
    const baseProps = computeSerializationProperties(model.baseModel!);
    const ownProps = model.properties.filter(
      (p) => !isBaseDiscriminatorOverride(p),
    );
    return [...baseProps, ...ownProps];
  }
  return [...model.properties];
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

  // Three parallel data structures built from the property list:
  // 1. factoryParams — the method signature parameters
  // 2. collectionInits — metadata for null-coalescing lines
  // 3. ctorArgs — the arguments passed to `new ModelType(...)`
  const factoryParams: ParameterProps[] = [];
  const collectionInits: CollectionInitInfo[] = [];
  const ctorArgs: string[] = [];

  for (const p of allProperties) {
    const paramName = namePolicy.getName(p.name, "parameter");
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
      ctorArgs.push(`${paramName}.ToList()`);
    } else if (isDictCollection(p.type)) {
      // Dict → keep IDictionary type, ChangeTrackingDictionary init, pass as-is
      const valueType = getCollectionValueType(p.type);
      const unwrappedVT = unwrapNullableType(valueType);
      const isVTNullable = valueType.kind === "nullable";
      const vtExpr = <TypeExpression type={unwrappedVT.__raw!} />;
      const valueTypeExpr: Children = isVTNullable ? <>{vtExpr}?</> : vtExpr;

      // Use TypeExpression for the full dict type to get correct rendering
      const baseType = <TypeExpression type={unwrapped.__raw!} />;
      factoryParams.push({
        name: paramName,
        type: nullable ? <>{baseType}?</> : baseType,
        default: "default" as Children,
      });

      collectionInits.push({ paramName, isArray: false, valueTypeExpr });
      ctorArgs.push(paramName);
    } else {
      // Non-collection — standard TypeExpression for the type
      const baseType = <TypeExpression type={unwrapped.__raw!} />;
      factoryParams.push({
        name: paramName,
        type: nullable ? <>{baseType}?</> : baseType,
        default: "default" as Children,
      });

      ctorArgs.push(paramName);
    }
  }

  // Always pass null for additionalBinaryDataProperties as a named argument
  ctorArgs.push(`${ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME}: null`);

  // Use refkey for the model type in the `new` expression so Alloy
  // auto-generates `using` directives when the model is in a sub-namespace.
  const modelRefkey = efCsharpRefkey(props.type.__raw!);
  const returnType = <TypeExpression type={props.type.__raw!} />;

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
      {code`return new ${modelRefkey}(${ctorArgs.join(", ")});`}
    </Method>
  );
}
