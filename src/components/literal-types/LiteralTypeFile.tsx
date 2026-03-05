/**
 * Literal type wrapper struct file component.
 *
 * Generates a C# source file containing a `readonly partial struct` that wraps a
 * literal type property value. These structs follow the same pattern as extensible
 * enums: they implement `IEquatable<T>`, include equality operators, implicit
 * conversions from the underlying type, and standard `Equals`/`GetHashCode`/`ToString`
 * overrides.
 *
 * Literal wrapper structs are generated for optional/nullable model properties whose
 * type is a constant literal (string, int, float) — NOT boolean. They allow the
 * property to accept any value of the underlying type (not just the literal), similar
 * to extensible enums with a single predefined member.
 *
 * @example Generated output for a float literal wrapper:
 * ```csharp
 * public readonly partial struct ThingOptionalLiteralFloat : IEquatable<ThingOptionalLiteralFloat>
 * {
 *     private readonly float _value;
 *     private const float _456Value = 4.56F;
 *
 *     public ThingOptionalLiteralFloat(float value)
 *     {
 *         _value = value;
 *     }
 *
 *     public static ThingOptionalLiteralFloat _456 { get; } = new ThingOptionalLiteralFloat(_456Value);
 *     // ... operators, Equals, GetHashCode, ToString
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
import type { SdkConstantType } from "@azure-tools/typespec-client-generator-core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import { literalTypeRefkey } from "../../utils/refkey.js";

/**
 * C# type information derived from a TCGC value type kind.
 */
interface CSharpTypeInfo {
  /** The C# keyword for the type (e.g., "string", "float", "int"). */
  keyword: string;
  /** The .NET framework type name (e.g., "String", "Single", "Int32"). */
  frameworkName: string;
}

/**
 * Maps a TCGC value type kind to its corresponding C# type keyword and
 * .NET framework type name.
 *
 * @param kind - The TCGC scalar kind (e.g., "string", "float32", "int32").
 * @returns The C# type keyword and framework name.
 * @throws Error if the kind is not a supported literal backing type.
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
      throw new Error(`Unsupported literal value type kind: ${kind}`);
  }
}

/**
 * Formats a literal value as a C# literal expression.
 *
 * - String values are double-quoted: `"value"`
 * - float32 values get an F suffix: `4.56F`
 * - int64 values get an L suffix: `1L`
 * - Other numeric values are rendered as-is
 *
 * @param value - The raw literal value.
 * @param kind - The TCGC scalar kind of the value type.
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
 * Derives a C# identifier for a literal value to use as a member name.
 *
 * For string values, uses the value itself (which becomes PascalCase via naming
 * policy). For numeric values, prefixes with underscore to create a valid
 * identifier (e.g., 456 → "_456", 4.56 → "_456").
 *
 * @param value - The raw literal value.
 * @param kind - The TCGC scalar kind of the value type.
 * @returns A string suitable for use as a C# identifier (before naming policy).
 */
function getMemberName(value: string | number, kind: string): string {
  if (kind === "string") {
    return String(value);
  }
  // Numeric values: prefix with "V" to create a valid C# identifier
  // (e.g., 456 → "V456", 4.56 → "V456", 1 → "V1")
  return `V${String(value).replace(".", "")}`;
}

/**
 * Props for the {@link LiteralTypeFile} component.
 */
export interface LiteralTypeFileProps {
  /** The TCGC SDK constant type representing the literal value. */
  type: SdkConstantType;
  /** The namespace for the generated struct. */
  namespace: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates a C# source file containing a literal type wrapper struct.
 *
 * The generated struct follows the same pattern as extensible enums:
 * - Private `_value` field storing the underlying value
 * - Private const field for the literal value
 * - Public constructor accepting the underlying type
 * - Static property for the predefined literal value
 * - Equality operators (`==`, `!=`)
 * - Implicit conversion from the underlying type
 * - `Equals`, `GetHashCode`, and `ToString` overrides
 *
 * String-backed literals use case-insensitive comparison and include
 * `Argument.AssertNotNull` validation. Numeric-backed literals use direct
 * value comparison.
 */
export function LiteralTypeFile(props: LiteralTypeFileProps) {
  const header = getLicenseHeader(props.options);
  const namePolicy = useCSharpNamePolicy();
  const structName = namePolicy.getName(props.type.name, "enum");
  const isString = props.type.valueType.kind === "string";
  const typeInfo = getCSharpTypeInfo(props.type.valueType.kind);
  const memberName = namePolicy.getName(
    getMemberName(
      props.type.value as string | number,
      props.type.valueType.kind,
    ),
    "enum-member",
  );
  const valueLiteral = formatValueLiteral(
    props.type.value as string | number,
    props.type.valueType.kind,
  );

  let usings = "using System;\nusing System.ComponentModel;";
  if (!isString) {
    usings += "\nusing System.Globalization;";
  }

  return (
    <SourceFile path={`src/Generated/Models/${structName}.cs`}>
      {header}
      {`\n\n${usings}\n\n`}
      <Namespace name={props.namespace}>
        {`/// <summary></summary>\n`}
        <StructDeclaration
          public
          readonly
          partial
          name={structName}
          refkey={literalTypeRefkey(props.type)}
          interfaceTypes={[`IEquatable<${structName}>`]}
        >
          {/* Private value field and const */}
          {`private readonly ${typeInfo.keyword} _value;`}
          {"\n"}
          {`private const ${typeInfo.keyword} ${memberName}Value = ${valueLiteral};`}
          {"\n\n"}
          {/* Constructor */}
          {`/// <summary> Initializes a new instance of <see cref="${structName}"/>. </summary>`}
          {"\n"}
          {`/// <param name="value"> The value. </param>`}
          {isString
            ? `\n/// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>`
            : ""}
          {"\n"}
          {`public ${structName}(${typeInfo.keyword} value)`}
          {"\n"}
          {"{"}
          {isString
            ? "\n    Argument.AssertNotNull(value, nameof(value));\n"
            : ""}
          {"\n"}
          {"    _value = value;"}
          {"\n"}
          {"}"}
          {"\n\n"}
          {/* Static property */}
          {`/// <summary> Gets the ${memberName}. </summary>`}
          {"\n"}
          {`public static ${structName} ${memberName} { get; } = new ${structName}(${memberName}Value);`}
          {"\n\n"}
          {/* Equality operators */}
          {`/// <summary> Determines if two <see cref="${structName}"/> values are the same. </summary>`}
          {"\n"}
          {`/// <param name="left"> The left value to compare. </param>`}
          {"\n"}
          {`/// <param name="right"> The right value to compare. </param>`}
          {"\n"}
          {`public static bool operator ==(${structName} left, ${structName} right) => left.Equals(right);`}
          {"\n\n"}
          {`/// <summary> Determines if two <see cref="${structName}"/> values are not the same. </summary>`}
          {"\n"}
          {`/// <param name="left"> The left value to compare. </param>`}
          {"\n"}
          {`/// <param name="right"> The right value to compare. </param>`}
          {"\n"}
          {`public static bool operator !=(${structName} left, ${structName} right) => !left.Equals(right);`}
          {"\n\n"}
          {/* Implicit conversion operators */}
          {`/// <summary> Converts a string to a <see cref="${structName}"/>. </summary>`}
          {"\n"}
          {`/// <param name="value"> The value. </param>`}
          {"\n"}
          {`public static implicit operator ${structName}(${typeInfo.keyword} value) => new ${structName}(value);`}
          {isString
            ? `\n\n/// <summary> Converts a string to a <see cref="${structName}"/>. </summary>\n/// <param name="value"> The value. </param>\npublic static implicit operator ${structName}?(${typeInfo.keyword} value) => value == null ? null : new ${structName}(value);`
            : ""}
          {"\n\n"}
          {/* Equals(object) */}
          {"/// <inheritdoc/>"}
          {"\n"}
          {"[EditorBrowsable(EditorBrowsableState.Never)]"}
          {"\n"}
          {`public override bool Equals(object obj) => obj is ${structName} other && Equals(other);`}
          {"\n\n"}
          {/* Equals(T) */}
          {`/// <inheritdoc/>\npublic bool Equals(${structName} other) => ${
            isString
              ? `string.Equals(_value, other._value, StringComparison.InvariantCultureIgnoreCase)`
              : `Equals(_value, other._value)`
          };`}
          {"\n\n"}
          {/* GetHashCode */}
          {"/// <inheritdoc/>"}
          {"\n"}
          {"[EditorBrowsable(EditorBrowsableState.Never)]"}
          {"\n"}
          {`public override int GetHashCode() => ${
            isString
              ? "_value != null ? StringComparer.InvariantCultureIgnoreCase.GetHashCode(_value) : 0"
              : "_value.GetHashCode()"
          };`}
          {"\n\n"}
          {/* ToString */}
          {isString
            ? "/// <inheritdoc/>\npublic override string ToString() => _value;"
            : "/// <inheritdoc/>\npublic override string ToString() => _value.ToString(CultureInfo.InvariantCulture);"}
        </StructDeclaration>
      </Namespace>
    </SourceFile>
  );
}
