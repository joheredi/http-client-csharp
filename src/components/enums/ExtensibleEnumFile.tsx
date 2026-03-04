import {
  Namespace,
  SourceFile,
  StructDeclaration,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import type {
  SdkEnumType,
  SdkEnumValueType,
} from "@azure-tools/typespec-client-generator-core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { ensureTrailingPeriod, formatDocLines } from "../../utils/doc.js";
import { getLicenseHeader } from "../../utils/header.js";
import { efCsharpRefkey } from "../../utils/refkey.js";

/**
 * C# type information derived from a TCGC value type kind.
 *
 * Used to map TypeSpec enum backing types to C# type keywords and
 * .NET framework type names for extensible enum generation.
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
 * Returns the XML doc description for an extensible enum type declaration,
 * or `undefined` when the TypeSpec definition has no documentation.
 *
 * Uses the TCGC summary or doc string, applying `ensureTrailingPeriod` to
 * match the legacy emitter's `XmlDocStatement.GetPeriodOrEmpty()` behavior.
 *
 * @param sdkEnum - The TCGC enum type to extract documentation from.
 * @returns A description string with trailing period, or `undefined` if no doc exists.
 */
function getEnumDescription(sdkEnum: SdkEnumType): string | undefined {
  const raw = sdkEnum.summary ?? sdkEnum.doc;
  return raw ? ensureTrailingPeriod(raw) : undefined;
}

/**
 * Returns the XML doc description for an enum member.
 *
 * Uses the TCGC summary or doc string when available, falling back to
 * the member name followed by a period — matching the legacy C# generator's
 * `DocHelpers.GetFormattableDescription()` behavior.
 *
 * @param member - The TCGC enum value type to extract documentation from.
 * @returns A description string suitable for use in a `<summary>` XML doc tag.
 */
function getEnumMemberDescription(member: SdkEnumValueType): string {
  return member.summary ?? member.doc ?? `${member.name}.`;
}

/**
 * Props for the {@link ExtensibleEnumFile} component.
 */
export interface ExtensibleEnumFileProps {
  /** The TCGC SDK enum type representing an extensible enum. */
  type: SdkEnumType;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates a C# source file containing an extensible enum as a readonly
 * partial struct implementing IEquatable<T>.
 *
 * Extensible enums differ from fixed enums in that they are represented as
 * structs rather than C# enum types. This allows callers to pass custom values
 * beyond the predefined set, which is important for forward-compatibility with
 * service versions that may add new enum values.
 *
 * The generated struct includes:
 * - A private `_value` field storing the underlying value
 * - Private const fields for each predefined value
 * - A public constructor accepting the underlying type
 * - Static properties for each predefined enum member
 * - Equality operators (`==`, `!=`)
 * - Implicit conversion from the underlying type
 * - `Equals`, `GetHashCode`, and `ToString` overrides
 *
 * String-backed enums use case-insensitive comparison and include
 * `Argument.AssertNotNull` validation. Numeric-backed enums use direct
 * value comparison.
 *
 * @example Generated output for a string-backed extensible enum:
 * ```csharp
 * public readonly partial struct DaysOfWeek : IEquatable<DaysOfWeek>
 * {
 *     private readonly string _value;
 *     private const string MondayValue = "Monday";
 *
 *     public DaysOfWeek(string value)
 *     {
 *         Argument.AssertNotNull(value, nameof(value));
 *         _value = value;
 *     }
 *
 *     public static DaysOfWeek Monday { get; } = new DaysOfWeek(MondayValue);
 *     // ... operators, Equals, GetHashCode, ToString
 * }
 * ```
 *
 * @see FixedEnumFile for non-extensible enum generation.
 */
export function ExtensibleEnumFile(props: ExtensibleEnumFileProps) {
  const header = getLicenseHeader(props.options);
  const namePolicy = useCSharpNamePolicy();
  const enumName = namePolicy.getName(props.type.name, "enum");
  const isString = props.type.valueType.kind === "string";
  const typeInfo = getCSharpTypeInfo(props.type.valueType.kind);
  const structDescription = getEnumDescription(props.type);

  let usings = "using System;\nusing System.ComponentModel;";
  if (!isString) {
    usings += "\nusing System.Globalization;";
  }

  return (
    <SourceFile path={`src/Generated/Models/${enumName}.cs`}>
      {header}
      {`\n\n${usings}\n\n`}
      <Namespace name={props.type.namespace}>
        {`/// <summary>${structDescription ? ` ${formatDocLines(structDescription)} ` : ""}</summary>\n`}
        <StructDeclaration
          public
          readonly
          partial
          name={enumName}
          refkey={efCsharpRefkey(props.type.__raw!)}
          interfaceTypes={[`IEquatable<${enumName}>`]}
        >
          <ValueFields type={props.type} typeInfo={typeInfo} />
          {"\n\n"}
          <EnumConstructor
            enumName={enumName}
            typeInfo={typeInfo}
            isString={isString}
          />
          {"\n\n"}
          <EnumStaticProperties type={props.type} enumName={enumName} />
          {"\n\n"}
          <EqualityOperators enumName={enumName} />
          {"\n\n"}
          <ImplicitConversionOperators
            enumName={enumName}
            typeInfo={typeInfo}
            isString={isString}
          />
          {"\n\n"}
          <EqualsObjectMethod enumName={enumName} />
          {"\n\n"}
          <EqualsTypeMethod enumName={enumName} isString={isString} />
          {"\n\n"}
          <GetHashCodeMethod isString={isString} />
          {"\n\n"}
          <ToStringMethod isString={isString} />
        </StructDeclaration>
      </Namespace>
    </SourceFile>
  );
}

/**
 * Renders the private `_value` field and private const value fields.
 *
 * The `_value` field stores the underlying value for the extensible enum instance.
 * Each predefined enum member gets a private const field with a "Value" suffix
 * (e.g., `MondayValue`) that stores the underlying literal value.
 */
function ValueFields(props: { type: SdkEnumType; typeInfo: CSharpTypeInfo }) {
  const namePolicy = useCSharpNamePolicy();
  const { type, typeInfo } = props;

  const constFields = type.values.map((member) => {
    const memberName = namePolicy.getName(member.name, "enum-member");
    const literal = formatValueLiteral(member.value, type.valueType.kind);
    return `private const ${typeInfo.keyword} ${memberName}Value = ${literal};`;
  });

  return (
    <>
      {`private readonly ${typeInfo.keyword} _value;`}
      {"\n"}
      {constFields.join("\n")}
    </>
  );
}

/**
 * Renders the public constructor for the extensible enum.
 *
 * For string-backed enums, includes `Argument.AssertNotNull` validation
 * because string is a reference type. Numeric types skip the null check
 * since they are value types.
 */
function EnumConstructor(props: {
  enumName: string;
  typeInfo: CSharpTypeInfo;
  isString: boolean;
}) {
  const { enumName, typeInfo, isString } = props;

  return (
    <>
      {`/// <summary> Initializes a new instance of <see cref="${enumName}"/>. </summary>`}
      {"\n"}
      {`/// <param name="value"> The value. </param>`}
      {isString
        ? `\n/// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>`
        : ""}
      {"\n"}
      {`public ${enumName}(${typeInfo.keyword} value)`}
      {"\n"}
      {"{"}
      {isString ? "\n    Argument.AssertNotNull(value, nameof(value));\n" : ""}
      {"\n"}
      {"    _value = value;"}
      {"\n"}
      {"}"}
    </>
  );
}

/**
 * Renders static properties for each predefined enum member.
 *
 * Each property returns a cached instance initialized with the corresponding
 * const value field, e.g.:
 * `public static DaysOfWeek Monday { get; } = new DaysOfWeek(MondayValue);`
 */
function EnumStaticProperties(props: { type: SdkEnumType; enumName: string }) {
  const namePolicy = useCSharpNamePolicy();
  const { type, enumName } = props;

  const properties = type.values.map((member) => {
    const memberName = namePolicy.getName(member.name, "enum-member");
    const description = getEnumMemberDescription(member);
    return `/// <summary> Gets the ${description} </summary>\npublic static ${enumName} ${memberName} { get; } = new ${enumName}(${memberName}Value);`;
  });

  return <>{properties.join("\n\n")}</>;
}

/**
 * Renders the `==` and `!=` equality operators.
 *
 * Both operators delegate to the `Equals` instance method.
 */
function EqualityOperators(props: { enumName: string }) {
  const { enumName } = props;

  return (
    <>
      {`/// <summary> Determines if two <see cref="${enumName}"/> values are the same. </summary>`}
      {"\n"}
      {`/// <param name="left"> The left value to compare. </param>`}
      {"\n"}
      {`/// <param name="right"> The right value to compare. </param>`}
      {"\n"}
      {`public static bool operator ==(${enumName} left, ${enumName} right) => left.Equals(right);`}
      {"\n\n"}
      {`/// <summary> Determines if two <see cref="${enumName}"/> values are not the same. </summary>`}
      {"\n"}
      {`/// <param name="left"> The left value to compare. </param>`}
      {"\n"}
      {`/// <param name="right"> The right value to compare. </param>`}
      {"\n"}
      {`public static bool operator !=(${enumName} left, ${enumName} right) => !left.Equals(right);`}
    </>
  );
}

/**
 * Renders implicit conversion operators from the underlying type.
 *
 * All extensible enums get a non-nullable implicit operator. String-backed
 * enums additionally get a nullable variant that returns null when the input
 * string is null.
 */
function ImplicitConversionOperators(props: {
  enumName: string;
  typeInfo: CSharpTypeInfo;
  isString: boolean;
}) {
  const { enumName, typeInfo, isString } = props;

  return (
    <>
      {`/// <summary> Converts a string to a <see cref="${enumName}"/>. </summary>`}
      {"\n"}
      {`/// <param name="value"> The value. </param>`}
      {"\n"}
      {`public static implicit operator ${enumName}(${typeInfo.keyword} value) => new ${enumName}(value);`}
      {isString
        ? `\n\n/// <summary> Converts a string to a <see cref="${enumName}"/>. </summary>\n/// <param name="value"> The value. </param>\npublic static implicit operator ${enumName}?(${typeInfo.keyword} value) => value == null ? null : new ${enumName}(value);`
        : ""}
    </>
  );
}

/**
 * Renders the `Equals(object)` override with `[EditorBrowsable(Never)]`.
 *
 * The attribute hides the method from IntelliSense, encouraging use of
 * the strongly-typed `Equals(T)` overload instead. The implementation
 * uses pattern matching (`is EnumName other`) and delegates to `Equals(T)`.
 */
function EqualsObjectMethod(props: { enumName: string }) {
  const { enumName } = props;

  return (
    <>
      {"/// <inheritdoc/>"}
      {"\n"}
      {"[EditorBrowsable(EditorBrowsableState.Never)]"}
      {"\n"}
      {`public override bool Equals(object obj) => obj is ${enumName} other && Equals(other);`}
    </>
  );
}

/**
 * Renders the strongly-typed `Equals(T)` method.
 *
 * String-backed enums use `string.Equals` with `InvariantCultureIgnoreCase`
 * for case-insensitive comparison. Numeric-backed enums use `Equals` with
 * direct value comparison.
 */
function EqualsTypeMethod(props: { enumName: string; isString: boolean }) {
  const { enumName, isString } = props;

  const body = isString
    ? `string.Equals(_value, other._value, StringComparison.InvariantCultureIgnoreCase)`
    : `Equals(_value, other._value)`;

  return (
    <>{`/// <inheritdoc/>\npublic bool Equals(${enumName} other) => ${body};`}</>
  );
}

/**
 * Renders the `GetHashCode()` override with `[EditorBrowsable(Never)]`.
 *
 * String-backed enums use `StringComparer.InvariantCultureIgnoreCase` to
 * ensure hash codes are consistent with the case-insensitive equality
 * comparison. Includes a null check returning 0 for null values.
 * Numeric-backed enums delegate directly to the underlying value's
 * `GetHashCode()`.
 */
function GetHashCodeMethod(props: { isString: boolean }) {
  const { isString } = props;

  const body = isString
    ? "_value != null ? StringComparer.InvariantCultureIgnoreCase.GetHashCode(_value) : 0"
    : "_value.GetHashCode()";

  return (
    <>
      {"/// <inheritdoc/>"}
      {"\n"}
      {"[EditorBrowsable(EditorBrowsableState.Never)]"}
      {"\n"}
      {`public override int GetHashCode() => ${body};`}
    </>
  );
}

/**
 * Renders the `ToString()` override.
 *
 * String-backed enums return `_value` directly. Numeric-backed enums
 * format the value using `CultureInfo.InvariantCulture` to ensure
 * consistent string representation across locales.
 */
function ToStringMethod(props: { isString: boolean }) {
  const { isString } = props;

  if (isString) {
    return (
      <>{"/// <inheritdoc/>\npublic override string ToString() => _value;"}</>
    );
  }

  return (
    <>
      {
        "/// <inheritdoc/>\npublic override string ToString() => _value.ToString(CultureInfo.InvariantCulture);"
      }
    </>
  );
}
