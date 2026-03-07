/**
 * Literal type wrapper struct serialization file component.
 *
 * Generates a C# serialization partial struct file for a numeric literal type
 * wrapper. The file contains a single `internal` method that returns the
 * underlying `_value` field for JSON serialization.
 *
 * This component is only used for **numeric** literal types (int32, int64,
 * float32, float64). **String** literal types do not need a serialization file
 * because they use `ToString()` for serialization.
 *
 * @example Generated output for a float32 literal type:
 * ```csharp
 * public readonly partial struct ThingOptionalLiteralFloat
 * {
 *     internal float ToSerialSingle() => _value;
 * }
 * ```
 *
 * @module
 */

import {
  Namespace,
  SourceFile,
  StructDeclaration,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import { namekey } from "@alloy-js/core";
import type { SdkConstantType } from "@azure-tools/typespec-client-generator-core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * C# type information for numeric literal backing types.
 */
interface CSharpNumericTypeInfo {
  /** The C# keyword for the type (e.g., "float", "int"). */
  keyword: string;
  /** The .NET framework type name used in the method name suffix (e.g., "Single", "Int32"). */
  frameworkName: string;
}

/**
 * Maps a TCGC numeric scalar kind to its corresponding C# type keyword and
 * .NET framework type name.
 *
 * @param kind - The TCGC scalar kind (e.g., "float32", "int32").
 * @returns The C# type keyword and framework name.
 * @throws Error if the kind is not a supported numeric type.
 */
function getCSharpNumericTypeInfo(kind: string): CSharpNumericTypeInfo {
  switch (kind) {
    case "float32":
      return { keyword: "float", frameworkName: "Single" };
    case "float64":
      return { keyword: "double", frameworkName: "Double" };
    case "int32":
      return { keyword: "int", frameworkName: "Int32" };
    case "int64":
      return { keyword: "long", frameworkName: "Int64" };
    default:
      throw new Error(`Unsupported numeric literal value type kind: ${kind}`);
  }
}

/**
 * Props for the {@link LiteralTypeSerializationFile} component.
 */
export interface LiteralTypeSerializationFileProps {
  /** The TCGC SDK constant type representing a numeric literal value. */
  type: SdkConstantType;
  /** The namespace for the generated struct. */
  namespace: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates a C# serialization partial struct file for a numeric literal type wrapper.
 *
 * The file is output to `src/Generated/Models/{StructName}.Serialization.cs` and
 * contains a `public readonly partial struct` with a single `internal` method:
 *
 * - `ToSerial{FrameworkName}()`: Returns the underlying `_value` field, allowing
 *   the serialization layer to write the numeric value to JSON.
 *
 * @see LiteralTypeFile for the main literal type struct declaration.
 */
export function LiteralTypeSerializationFile(
  props: LiteralTypeSerializationFileProps,
) {
  const header = getLicenseHeader(props.options);
  const namePolicy = useCSharpNamePolicy();
  const structName = namePolicy.getName(props.type.name, "enum");
  const typeInfo = getCSharpNumericTypeInfo(props.type.valueType.kind);

  // Use namekey with ignoreNameConflict to prevent Alloy's symbol deduplication.
  // The main literal type file (LiteralTypeFile.tsx) already declares a
  // StructDeclaration with the same name — without this flag, Alloy would
  // rename this partial declaration with a "_2" suffix.
  const partialName = namekey(structName, { ignoreNameConflict: true });

  return (
    <SourceFile path={`src/Generated/Models/${structName}.Serialization.cs`}>
      {header}
      {"\n\n"}
      <Namespace name={props.namespace}>
        {`/// <summary></summary>\n`}
        <StructDeclaration
          public
          readonly
          partial
          name={partialName as unknown as string}
        >
          {`internal ${typeInfo.keyword} ToSerial${typeInfo.frameworkName}() => _value;`}
        </StructDeclaration>
      </Namespace>
    </SourceFile>
  );
}
