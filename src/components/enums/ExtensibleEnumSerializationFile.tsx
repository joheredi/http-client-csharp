import {
  Namespace,
  SourceFile,
  StructDeclaration,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import type { SdkEnumType } from "@azure-tools/typespec-client-generator-core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * C# type information for numeric enum backing types.
 *
 * Used to map TypeSpec numeric scalar kinds to C# type keywords and
 * .NET framework type names for the `ToSerial{FrameworkName}` method.
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
 * Only numeric types are supported because string extensible enums do not
 * generate a serialization file — they use `ToString()` directly.
 *
 * @param kind - The TCGC scalar kind (e.g., "float32", "int32").
 * @returns The C# type keyword and framework name.
 * @throws Error if the kind is not a supported numeric enum backing type.
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
      throw new Error(`Unsupported numeric enum value type kind: ${kind}`);
  }
}

/**
 * Props for the {@link ExtensibleEnumSerializationFile} component.
 */
export interface ExtensibleEnumSerializationFileProps {
  /** The TCGC SDK enum type representing a numeric extensible enum. */
  type: SdkEnumType;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates a C# serialization partial struct file for a numeric extensible enum.
 *
 * The file is output to `src/Generated/Models/{EnumName}.Serialization.cs` and contains
 * a `public readonly partial struct` with a single `internal` method:
 *
 * - `ToSerial{FrameworkName}()`: Returns the underlying `_value` field, allowing
 *   the serialization layer to write the numeric value to JSON.
 *
 * This component is only used for **numeric** extensible enums (int32, int64, float32,
 * float64). **String** extensible enums do not need a serialization file because they
 * use `ToString()` for serialization and an implicit conversion operator for
 * deserialization.
 *
 * @example Generated output for an int32-backed extensible enum:
 * ```csharp
 * public readonly partial struct IntExtensibleEnum
 * {
 *     internal int ToSerialInt32() => _value;
 * }
 * ```
 *
 * @see ExtensibleEnumFile for the main extensible enum struct declaration.
 * @see FixedEnumSerializationFile for fixed enum serialization (extension class pattern).
 */
export function ExtensibleEnumSerializationFile(
  props: ExtensibleEnumSerializationFileProps,
) {
  const header = getLicenseHeader(props.options);
  const namePolicy = useCSharpNamePolicy();
  const enumName = namePolicy.getName(props.type.name, "enum");
  const typeInfo = getCSharpNumericTypeInfo(props.type.valueType.kind);

  return (
    <SourceFile path={`src/Generated/Models/${enumName}.Serialization.cs`}>
      {header}
      {"\n\n"}
      <Namespace name={props.type.namespace}>
        <StructDeclaration public readonly partial name={enumName}>
          {`internal ${typeInfo.keyword} ToSerial${typeInfo.frameworkName}() => _value;`}
        </StructDeclaration>
      </Namespace>
    </SourceFile>
  );
}
