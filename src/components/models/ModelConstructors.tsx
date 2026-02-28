/**
 * Model constructor generation component for C# code output.
 *
 * Generates the public initialization constructor for model classes.
 * The constructor includes only required, non-readonly, non-literal
 * properties as parameters. Reference-type parameters get
 * `Argument.AssertNotNull` validation.
 *
 * Constructor accessibility matches the legacy emitter's ModelProvider.cs
 * (lines 600–604):
 * - Abstract models → `private protected`
 * - Input models → `public`
 * - Output-only models → `internal`
 *
 * @module
 */

import {
  Constructor,
  type ParameterProps,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
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
 * ```
 */
export function ModelConstructors(props: ModelConstructorsProps) {
  const { type } = props;
  const namePolicy = useCSharpNamePolicy();
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

  return (
    <Constructor {...accessModifiers} parameters={parameters}>
      {body}
    </Constructor>
  );
}
