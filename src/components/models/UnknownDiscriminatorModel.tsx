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
import { efCsharpRefkey } from "../../utils/refkey.js";
import {
  ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME,
  buildSerializationParameters,
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

  // Constructor parameters match the base model's serialization constructor:
  // all base properties + additionalBinaryDataProperties
  const parameters = buildSerializationParameters(
    props.type.properties,
    namePolicy,
  );

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
  const parts: string[] = [];

  for (const p of baseModel.properties) {
    const paramName = namePolicy.getName(p.name, "parameter");
    if (p.discriminator) {
      // Apply null-guard based on discriminator type
      if (baseModel.discriminatorProperty?.type.kind === "enum") {
        // Enum (struct) discriminators can't be null, so check for default value.
        // The "unknown" string literal is implicitly converted to the extensible
        // enum type via its implicit operator.
        parts.push(`${paramName} != default ? ${paramName} : "unknown"`);
      } else {
        // String discriminators use null-coalescing
        parts.push(`${paramName} ?? "unknown"`);
      }
    } else {
      parts.push(paramName);
    }
  }

  // additionalBinaryDataProperties is always the last parameter
  parts.push(ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME);

  return parts.join(", ");
}
