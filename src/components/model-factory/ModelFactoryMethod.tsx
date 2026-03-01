/**
 * Individual factory method component for C# model factory generation.
 *
 * Generates a single `public static ModelName MethodName(params...) { return new ModelName(...); }`
 * method that creates a model instance from the full serialization constructor,
 * passing `null` for the `additionalBinaryDataProperties` parameter.
 *
 * Factory method parameters match the serialization constructor minus the
 * `additionalBinaryDataProperties` parameter. All parameters default to
 * `= default` so callers only specify the values they care about.
 *
 * In the constructor call, each parameter is passed by name except
 * `additionalBinaryDataProperties` which is always `null` (named argument).
 *
 * @example Generated output for a simple model `Widget { name: string; count: int32; }`:
 * ```csharp
 * public static Widget Widget(string name = default, int count = default)
 * {
 *     return new Widget(name, count, additionalBinaryDataProperties: null);
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
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { efCsharpRefkey } from "../../utils/refkey.js";
import {
  ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME,
  computeSerializationCtorParams,
} from "../models/ModelConstructors.js";

/**
 * Props for the {@link ModelFactoryMethod} component.
 */
export interface ModelFactoryMethodProps {
  /** The TCGC SDK model type for which to generate a factory method. */
  type: SdkModelType;
}

/**
 * Generates a static factory method for a single model type.
 *
 * The method signature uses the model class name for both the method name
 * and return type. Parameters are derived from the serialization constructor
 * (which includes ALL model properties) minus the `additionalBinaryDataProperties`
 * parameter. All parameters have `= default` so callers specify only what they need.
 *
 * The method body constructs a new instance via the serialization constructor,
 * passing all factory parameters through and using `additionalBinaryDataProperties: null`
 * as a named argument.
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the factory method declaration.
 */
export function ModelFactoryMethod(props: ModelFactoryMethodProps) {
  const namePolicy = useCSharpNamePolicy();

  // Compute the full serialization constructor parameter list.
  // For derived models, this recursively includes base model params.
  const allSerializationParams = computeSerializationCtorParams(
    props.type,
    namePolicy,
  );

  // Factory method params = serialization ctor params minus binary data.
  // All params get `= default` so callers only set what they need.
  const factoryParams: ParameterProps[] = allSerializationParams
    .filter(
      (p) => (p.name as string) !== ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME,
    )
    .map((p) => ({ ...p, default: "default" as Children }));

  // Build constructor arguments in the same order as the serialization
  // constructor. The binary data param becomes a named null argument.
  const ctorArgs: string[] = allSerializationParams.map((p) => {
    if ((p.name as string) === ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME) {
      return `${ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME}: null`;
    }
    return p.name as string;
  });

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
      {code`return new ${modelRefkey}(${ctorArgs.join(", ")});`}
    </Method>
  );
}
