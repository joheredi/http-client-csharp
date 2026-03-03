/**
 * Return statement for the JSON deserialization method.
 *
 * Generates the `return new ModelName(param1, param2, ..., additionalBinaryDataProperties);`
 * statement at the end of the `DeserializeXxx` method body. This is the final
 * statement after the variable declarations (task 2.3.3) and the property matching
 * loop (task 2.3.4–2.3.12).
 *
 * The constructor call passes all deserialized local variables to the internal
 * serialization constructor in the same order as the constructor parameters.
 * The variable names match those declared by {@link DeserializeVariableDeclarations}.
 *
 * @example Generated output for a simple model `Widget { name: string; count: int32; }`:
 * ```csharp
 * return new Widget(name, count, additionalBinaryDataProperties);
 * ```
 *
 * @example Generated output for a derived model `Dog extends Pet` with `kind: "dog"`:
 * ```csharp
 * return new Dog(kind, name, additionalBinaryDataProperties, trained, breed);
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import { ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME } from "../models/ModelConstructors.js";
import { computeVariableInfos } from "./DeserializeVariableDeclarations.js";

/**
 * Props for the {@link DeserializeReturnStatement} component.
 */
export interface DeserializeReturnStatementProps {
  /** The TCGC SDK model type whose deserialization return statement is being generated. */
  type: SdkModelType;
}

/**
 * Generates the `return new ModelName(...)` statement for the `DeserializeXxx`
 * method, constructing the model from the deserialized local variables.
 *
 * Uses the same variable ordering as {@link DeserializeVariableDeclarations}
 * via the shared `computeVariableInfos` function. Each variable info maps to
 * a constructor argument name: property variables use the C# parameter name
 * policy, and the synthetic `additionalBinaryDataProperties` uses its constant
 * name.
 *
 * @param props - The component props containing the model type.
 * @returns JSX element rendering the return statement.
 */
export function DeserializeReturnStatement(
  props: DeserializeReturnStatementProps,
) {
  const namePolicy = useCSharpNamePolicy();
  const modelName = namePolicy.getName(props.type.name, "class");
  const variableInfos = computeVariableInfos(props.type);

  const paramNames = variableInfos.map((info) => {
    if (info.kind === "additional-binary-data") {
      return ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME;
    }
    if (info.kind === "patch") {
      return "patch";
    }
    return namePolicy.getName(info.property.name, "parameter");
  });

  return <>{`\n    return new ${modelName}(${paramNames.join(", ")});`}</>;
}
