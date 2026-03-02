/**
 * Unknown discriminator variant generation component for C# code output.
 *
 * For every abstract discriminated base model, the C# SDK generates an
 * internal `Unknown{BaseName}` class. This class serves as the fallback
 * deserialization target when a JSON payload contains a discriminator value
 * that doesn't match any known derived type.
 *
 * The Unknown variant:
 * - Is `internal partial` (not user-instantiable)
 * - Inherits from the abstract base model
 * - Has a single internal constructor that takes the base model's full
 *   serialization parameter set
 * - Null-guards the discriminator parameter:
 *   - String discriminators: `kind ?? "unknown"`
 *   - Enum discriminators: `kind != default ? kind : "unknown"`
 * - Has no own properties (all data is in the base class)
 *
 * @example Generated output for UnknownBird:
 * ```csharp
 * internal partial class UnknownBird : Bird
 * {
 *     internal UnknownBird(string kind, int wingspan,
 *         IDictionary<string, BinaryData> additionalBinaryDataProperties)
 *         : base(kind ?? "unknown", wingspan, additionalBinaryDataProperties)
 *     {
 *     }
 * }
 * ```
 *
 * @module
 */

import {
  ClassDeclaration,
  Namespace,
  SourceFile,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import type { Children } from "@alloy-js/core";
import type { SdkModelType } from "@azure-tools/typespec-client-generator-core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import { efCsharpRefkey, unknownModelRefkey } from "../../utils/refkey.js";
import {
  computeSerializationCtorParams,
  isBaseDiscriminatorOverride,
  OverloadConstructor,
} from "./ModelConstructors.js";

/**
 * Props for the {@link UnknownDiscriminatorModelFile} component.
 */
export interface UnknownDiscriminatorModelFileProps {
  /** The abstract base model of the discriminated hierarchy. */
  type: SdkModelType;
  /** Resolved emitter options for the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates a C# source file for the Unknown discriminator variant class.
 *
 * Given an abstract discriminated base model (e.g., Bird with subtypes Eagle,
 * Sparrow), this component generates the `Unknown{BaseName}` fallback class
 * (e.g., UnknownBird). The legacy emitter generates this class for every
 * abstract base with discriminated subtypes.
 *
 * The generated class has a single internal constructor whose parameters
 * match the base model's serialization constructor. The constructor chains
 * to the base with a null-guard on the discriminator parameter.
 *
 * @param props - Component props containing the abstract base model type.
 */
export function UnknownDiscriminatorModelFile(
  props: UnknownDiscriminatorModelFileProps,
) {
  const header = getLicenseHeader(props.options);
  const namePolicy = useCSharpNamePolicy();
  const baseName = namePolicy.getName(props.type.name, "class");
  const unknownName = `Unknown${baseName}`;

  // Constructor parameters match the model's full serialization parameter set,
  // computed recursively to get the correct parameter ordering.
  const parameters = computeSerializationCtorParams(props.type, namePolicy);

  // Build base initializer with discriminator null-guard
  const baseInitializer = buildUnknownBaseInitializer(props.type, namePolicy);

  return (
    <SourceFile path={`src/Generated/Models/${unknownName}.cs`}>
      {header}
      {"\n\n"}
      <Namespace name={props.type.namespace}>
        <ClassDeclaration
          internal
          partial
          name={unknownName}
          refkey={unknownModelRefkey(props.type.__raw!)}
          baseType={efCsharpRefkey(props.type.__raw!)}
        >
          <OverloadConstructor
            internal
            parameters={parameters}
            baseInitializer={baseInitializer}
          />
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

/**
 * Builds the `: base(...)` initializer content for the Unknown variant constructor.
 *
 * Iterates through the base model's properties and the additionalBinaryDataProperties
 * parameter, passing each through to the base constructor. The discriminator
 * parameter is wrapped with a null-guard:
 *
 * - String discriminators: `kind ?? "unknown"` (null-coalescing)
 * - Enum discriminators: `kind != default ? kind : "unknown"` (default check,
 *   works because extensible enums are structs with implicit string conversion)
 *
 * All non-discriminator parameters are passed through as-is.
 *
 * @param baseModel - The abstract discriminated base model.
 * @param namePolicy - The C# naming policy for parameter name conversion.
 * @returns A string expression for the base initializer content.
 */
function buildUnknownBaseInitializer(
  baseModel: SdkModelType,
  namePolicy: ReturnType<typeof useCSharpNamePolicy>,
): Children {
  // Compute the base model's serialization ctor params (correct ordering)
  const serParams = computeSerializationCtorParams(baseModel, namePolicy);

  // Collect all discriminator property names (non-override) from the hierarchy
  // to determine which params need null-guards
  const discParamNames = new Set<string>();
  let current: SdkModelType | undefined = baseModel;
  while (current) {
    for (const p of current.properties) {
      if (p.discriminator && !isBaseDiscriminatorOverride(p)) {
        discParamNames.add(namePolicy.getName(p.name, "parameter"));
      }
    }
    current = current.baseModel;
  }

  // Determine the discriminator type for null-guard style
  const isEnumDiscriminator =
    baseModel.discriminatorProperty?.type.kind === "enum";

  const parts: string[] = serParams.map((param) => {
    const paramName = param.name as string;
    if (discParamNames.has(paramName)) {
      if (isEnumDiscriminator) {
        return `${paramName} != default ? ${paramName} : "unknown"`;
      }
      return `${paramName} ?? "unknown"`;
    }
    return paramName;
  });

  return parts.join(", ");
}
