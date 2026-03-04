import {
  ClassDeclaration,
  Namespace,
  SourceFile,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import {
  isSdkIntKind,
  type SdkEnumType,
} from "@azure-tools/typespec-client-generator-core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import { fixedEnumMemberName } from "./FixedEnumFile.js";

/**
 * C# type information derived from a TCGC value type kind.
 *
 * Used to map TypeSpec enum backing types to C# type keywords and
 * .NET framework type names for serialization method generation.
 */
interface CSharpTypeInfo {
  /** The C# keyword for the type (e.g., "string", "float", "int"). */
  keyword: string;
  /** The .NET framework type name used in method name suffixes (e.g., "String", "Single"). */
  frameworkName: string;
}

/**
 * Maps a TCGC value type kind to its corresponding C# type keyword and
 * .NET framework type name.
 *
 * The keyword is used for method parameter/return types (e.g., `this string value`).
 * The framework name is used in serialization method name suffixes
 * (e.g., `ToSerialString`, `ToSerialSingle`).
 *
 * @param kind - The TCGC scalar kind (e.g., "string", "float32", "int32").
 * @returns The C# type keyword and framework name.
 * @throws Error if the kind is not a supported enum backing type.
 */
function getCSharpTypeInfo(kind: string): CSharpTypeInfo {
  switch (kind) {
    case "string":
      return { keyword: "string", frameworkName: "String" };
    case "float32":
      return { keyword: "float", frameworkName: "Single" };
    case "float64":
      return { keyword: "double", frameworkName: "Double" };
    case "int32":
      return { keyword: "int", frameworkName: "Int32" };
    case "int64":
      return { keyword: "long", frameworkName: "Int64" };
    default:
      throw new Error(`Unsupported enum value type kind: ${kind}`);
  }
}

/**
 * Determines whether a fixed enum is backed by an integer type.
 *
 * Int-backed enums skip the serialization method because their integer values
 * are embedded directly in the C# enum declaration. Only the deserialization
 * method is generated.
 *
 * @param sdkEnum - The TCGC enum type to inspect.
 * @returns `true` if the enum's underlying value type is an integer kind.
 */
function isIntValueType(sdkEnum: SdkEnumType): boolean {
  return isSdkIntKind(sdkEnum.valueType.kind);
}

/**
 * Formats a TCGC enum member value as a C# literal expression.
 *
 * - String values are double-quoted: `"value"`
 * - float32 values get an F suffix: `1.1F`
 * - int64 values get an L suffix: `1L`
 * - Other numeric values are rendered as-is
 *
 * @param value - The raw value from the TCGC enum member.
 * @param kind - The TCGC scalar kind of the enum's value type.
 * @returns A C# literal string suitable for embedding in generated code.
 */
function formatValueLiteral(value: string | number, kind: string): string {
  switch (kind) {
    case "string":
      return `"${value}"`;
    case "float32":
      return `${value}F`;
    case "int64":
      return `${value}L`;
    default:
      return `${value}`;
  }
}

/**
 * Props for the {@link FixedEnumSerializationFile} component.
 */
export interface FixedEnumSerializationFileProps {
  /** The TCGC SDK enum type representing a non-extensible (fixed) enum. */
  type: SdkEnumType;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates a C# serialization extension class file for a fixed (non-extensible) enum.
 *
 * The file is output to `src/Generated/Models/{EnumName}.Serialization.cs` and contains
 * an `internal static partial class {EnumName}Extensions` with:
 *
 * - **ToSerial{TypeName}**: Converts enum → underlying value via switch expression.
 *   Skipped for int-backed enums (values are embedded in the enum declaration).
 * - **To{EnumName}**: Converts underlying value → enum via if-chain.
 *   Uses case-insensitive comparison for strings, `==` for numerics.
 *
 * Both methods throw `ArgumentOutOfRangeException` for unknown values.
 *
 * @see FixedEnumFile for the enum declaration component.
 */
export function FixedEnumSerializationFile(
  props: FixedEnumSerializationFileProps,
) {
  const header = getLicenseHeader(props.options);
  const namePolicy = useCSharpNamePolicy();
  const enumName = namePolicy.getName(props.type.name, "enum");
  const intBacked = isIntValueType(props.type);
  const typeInfo = getCSharpTypeInfo(props.type.valueType.kind);
  const isString = props.type.valueType.kind === "string";

  return (
    <SourceFile path={`src/Generated/Models/${enumName}.Serialization.cs`}>
      {header}
      {"\n\nusing System;\n\n"}
      <Namespace name={props.type.namespace}>
        <ClassDeclaration
          internal
          static
          partial
          name={`${enumName}Extensions`}
        >
          {!intBacked && (
            <SerializeMethod
              type={props.type}
              enumName={enumName}
              typeInfo={typeInfo}
            />
          )}
          {!intBacked && "\n\n"}
          <DeserializeMethod
            type={props.type}
            enumName={enumName}
            typeInfo={typeInfo}
            isString={isString}
          />
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

/**
 * Shared props for the serialization/deserialization method sub-components.
 */
interface SerializeMethodProps {
  /** The TCGC enum type containing the members to serialize. */
  type: SdkEnumType;
  /** The PascalCase C# enum name. */
  enumName: string;
  /** C# type information for the enum's backing type. */
  typeInfo: CSharpTypeInfo;
}

/**
 * Props for the {@link DeserializeMethod} sub-component.
 */
interface DeserializeMethodProps extends SerializeMethodProps {
  /** Whether the enum is string-backed (uses case-insensitive comparison). */
  isString: boolean;
}

/**
 * Renders the serialization extension method (ToSerial{TypeName}).
 *
 * Generates a switch expression that maps each enum member to its underlying
 * serialized value literal. The default arm throws ArgumentOutOfRangeException.
 *
 * Only rendered for non-int-backed enums. Int-backed enums embed their values
 * directly in the enum declaration and don't need a serialization method.
 */
function SerializeMethod(props: SerializeMethodProps) {
  const namePolicy = useCSharpNamePolicy();
  const { type, enumName, typeInfo } = props;

  return (
    <>
      {`/// <param name="value"> The value to serialize. </param>`}
      {"\n"}
      {`public static ${typeInfo.keyword} ToSerial${typeInfo.frameworkName}(this ${enumName} value) => value switch`}
      {"\n"}
      {"{"}
      {type.values.map((member) => {
        const memberName = fixedEnumMemberName(member.name, namePolicy);
        const literal = formatValueLiteral(member.value, type.valueType.kind);
        return (
          <>
            {"\n"}
            {`    ${enumName}.${memberName} => ${literal},`}
          </>
        );
      })}
      {"\n"}
      {`    _ => throw new ArgumentOutOfRangeException(nameof(value), value, "Unknown ${enumName} value.")`}
      {"\n"}
      {"};"}
    </>
  );
}

/**
 * Renders the deserialization extension method (To{EnumName}).
 *
 * Generates an if-chain that compares the input value against each known
 * enum member value and returns the corresponding enum instance. String
 * values use `StringComparer.OrdinalIgnoreCase.Equals()` for case-insensitive
 * matching; numeric values use `==` equality. Falls through to
 * `ArgumentOutOfRangeException` for unknown values.
 */
function DeserializeMethod(props: DeserializeMethodProps) {
  const namePolicy = useCSharpNamePolicy();
  const { type, enumName, typeInfo, isString } = props;

  return (
    <>
      {`/// <param name="value"> The value to deserialize. </param>`}
      {"\n"}
      {`public static ${enumName} To${enumName}(this ${typeInfo.keyword} value)`}
      {"\n"}
      {"{"}
      {type.values.map((member) => {
        const memberName = fixedEnumMemberName(member.name, namePolicy);
        const literal = formatValueLiteral(member.value, type.valueType.kind);
        const condition = isString
          ? `StringComparer.OrdinalIgnoreCase.Equals(value, ${literal})`
          : `value == ${literal}`;
        return (
          <>
            {"\n"}
            {`    if (${condition})`}
            {"\n"}
            {"    {"}
            {"\n"}
            {`        return ${enumName}.${memberName};`}
            {"\n"}
            {"    }"}
          </>
        );
      })}
      {"\n"}
      {`    throw new ArgumentOutOfRangeException(nameof(value), value, "Unknown ${enumName} value.");`}
      {"\n"}
      {"}"}
    </>
  );
}
