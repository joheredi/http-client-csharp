/**
 * Property serialization component for JSON write path.
 *
 * Generates the `writer.WritePropertyName("serializedName"u8)` and
 * `writer.WriteXxxValue(PropertyName)` statements for a single model
 * property inside `JsonModelWriteCore`.
 *
 * Handles:
 * - **String/URL** → `WriteStringValue`
 * - **Numeric** (int8–int64, uint8–uint64, float32, float64, decimal, decimal128,
 *   safeint, numeric, integer, float) → `WriteNumberValue`
 * - **Boolean** → `WriteBooleanValue`
 * - **DateTime** (utcDateTime, offsetDateTime) → `WriteStringValue` or
 *   `WriteNumberValue` with format specifier depending on encoding
 * - **Duration** → `WriteStringValue` with `"P"` for ISO8601, or
 *   `WriteNumberValue` with `.TotalSeconds`/`.TotalMilliseconds` for numeric
 *   encodings (integer variants wrapped in `Convert.ToInt32`)
 * - **plainDate** → `WriteStringValue` with `"D"` format
 * - **plainTime** → `WriteStringValue` with `"T"` format
 * - **Bytes/BinaryData** → `WriteBase64StringValue` with `"D"` (base64) or
 *   `"U"` (base64url) format, using `.ToArray()` to convert BinaryData to byte[]
 * - **Nested models** → `WriteObjectValue(prop, options)` which delegates to
 *   the model's own `IJsonModel<T>.Write` implementation
 * - **Enums** → Fixed enums serialize via extension methods (`ToSerialString`,
 *   `ToSerialSingle`) or direct casts (`(int)value`); extensible enums use
 *   instance methods (`ToString`, `ToSerialInt32`)
 * - **Dictionaries (Record)** → `WriteStartObject` + `foreach` loop with
 *   `WritePropertyName(item.Key)` + value serialization + `WriteEndObject`.
 *   Nested dictionaries use depth-based variable names (`item`, `item0`, `item1`).
 *
 * @example Generated output for a string property:
 * ```csharp
 * writer.WritePropertyName("name"u8);
 * writer.WriteStringValue(Name);
 * ```
 *
 * @example Generated output for a DateTime property (RFC3339):
 * ```csharp
 * writer.WritePropertyName("createdAt"u8);
 * writer.WriteStringValue(CreatedAt, "O");
 * ```
 *
 * @example Generated output for a DateTime property (Unix timestamp):
 * ```csharp
 * writer.WritePropertyName("timestamp"u8);
 * writer.WriteNumberValue(Timestamp, "U");
 * ```
 *
 * @example Generated output for a Duration property (ISO8601):
 * ```csharp
 * writer.WritePropertyName("timeout"u8);
 * writer.WriteStringValue(Timeout, "P");
 * ```
 *
 * @example Generated output for a Duration property (seconds, float):
 * ```csharp
 * writer.WritePropertyName("delay"u8);
 * writer.WriteNumberValue(Delay.TotalSeconds);
 * ```
 *
 * @example Generated output for a Duration property (seconds, integer):
 * ```csharp
 * writer.WritePropertyName("ttl"u8);
 * writer.WriteNumberValue(Convert.ToInt32(Ttl.TotalSeconds));
 * ```
 *
 * @example Generated output for a bytes/BinaryData property (base64):
 * ```csharp
 * writer.WritePropertyName("data"u8);
 * writer.WriteBase64StringValue(Data.ToArray(), "D");
 * ```
 *
 * @example Generated output for a nested model property:
 * ```csharp
 * writer.WritePropertyName("pet"u8);
 * writer.WriteObjectValue(Pet, options);
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import type { Children } from "@alloy-js/core";
import {
  isSdkIntKind,
  type SdkArrayType,
  type SdkBuiltInType,
  type SdkDateTimeType,
  type SdkDictionaryType,
  type SdkDurationType,
  type SdkEnumType,
  type SdkModelPropertyType,
  type SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { isCollectionType, unwrapNullableType } from "../../utils/nullable.js";
import {
  isCSharpReferenceType,
  isPropertyReadOnly,
  resolvePropertyName,
} from "../../utils/property.js";

/**
 * Props for the {@link WritePropertySerialization} component.
 */
export interface WritePropertySerializationProps {
  /** The TCGC SDK model property to serialize. */
  property: SdkModelPropertyType;
  /** The raw TCGC name of the enclosing model, used for CS0542 collision detection. */
  modelName: string;
}

/** Primitive SDK type kinds that map to `writer.WriteStringValue`. */
const STRING_KINDS = new Set(["string", "url"]);

/**
 * Primitive SDK type kinds that map to `writer.WriteNumberValue`.
 *
 * Includes all integer, floating-point, and decimal variants from TCGC's
 * `SdkBuiltInKinds`, plus the abstract `numeric`, `integer`, and `float`
 * kinds used for unspecified numeric constraints.
 */
const NUMBER_KINDS = new Set([
  "int8",
  "int16",
  "int32",
  "int64",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "float",
  "float32",
  "float64",
  "decimal",
  "decimal128",
  "safeint",
  "numeric",
  "integer",
]);

/** Primitive SDK type kinds that map to `writer.WriteBooleanValue`. */
const BOOLEAN_KINDS = new Set(["boolean"]);

/**
 * Integer SDK type kinds used to determine whether a numeric duration
 * encoding requires `Convert.ToInt32()` wrapping.
 *
 * When a duration is encoded as seconds or milliseconds with an integer
 * wire type, the value must be truncated via `Convert.ToInt32()` to match
 * the legacy emitter's behavior. Float/double wire types pass through
 * the raw `TotalSeconds` or `TotalMilliseconds` value.
 */
const INTEGER_KINDS = new Set([
  "int8",
  "int16",
  "int32",
  "int64",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "safeint",
  "integer",
]);

/**
 * Information about how to write a property value to a `Utf8JsonWriter`.
 *
 * For primitive types, only `methodName` is set. For types that require
 * a format specifier (DateTime, Duration, bytes), `formatArg` provides
 * the format string that is passed as the second argument to the writer
 * method. These format-aware overloads are defined in the generated
 * `ModelSerializationExtensions` class.
 */
export interface WriteMethodInfo {
  /** The `Utf8JsonWriter` method name (e.g., `"WriteStringValue"`). */
  methodName: string;
  /**
   * Optional format specifier argument (e.g., `"O"` for RFC3339, `"R"` for
   * RFC7231, `"U"` for Unix timestamp, `"P"` for ISO8601 Duration). When
   * present, generates a two-argument call like `writer.WriteStringValue(prop, "O")`.
   */
  formatArg?: string;
  /**
   * Optional value transformation function. When present, the property name
   * is passed through this function to produce the value expression.
   *
   * Used for Duration types where the value needs wrapping, e.g.:
   * - `(name) => \`${name}.TotalSeconds\`` for float duration seconds
   * - `(name) => \`Convert.ToInt32(${name}.TotalSeconds)\`` for integer duration seconds
   */
  valueTransform?: (propertyName: string) => string;
}

/**
 * Returns the write method info for a `SdkDateTimeType` based on its encoding.
 *
 * The encoding determines both the writer method and the .NET format specifier:
 * - `"rfc3339"` → `WriteStringValue` with `"O"` (ISO 8601 round-trip)
 * - `"rfc7231"` → `WriteStringValue` with `"R"` (RFC 1123 HTTP-date)
 * - `"unixTimestamp"` → `WriteNumberValue` with `"U"` (seconds since epoch)
 *
 * @param type - An `SdkDateTimeType` with its encoding resolved by TCGC.
 * @returns Write method info with the correct method name and format specifier.
 */
function getDateTimeWriteInfo(type: SdkDateTimeType): WriteMethodInfo {
  switch (type.encode) {
    case "rfc7231":
      return { methodName: "WriteStringValue", formatArg: "R" };
    case "unixTimestamp":
      return { methodName: "WriteNumberValue", formatArg: "U" };
    case "rfc3339":
    default:
      // RFC3339 is the default encoding for utcDateTime/offsetDateTime in JSON.
      // Unknown encodings also fall back to ISO 8601 round-trip format.
      return { methodName: "WriteStringValue", formatArg: "O" };
  }
}

/**
 * Returns the write method info for a `SdkDurationType` based on its encoding.
 *
 * Duration (TimeSpan) supports three encoding strategies:
 * - `"ISO8601"` (default) → `WriteStringValue` with `"P"` format. The "P" format
 *   triggers `TypeFormatters.ToString(value, "P")` which uses `XmlConvert.ToString()`
 *   to produce ISO 8601 duration strings like `"P1DT2H3M4S"`.
 * - `"seconds"` → `WriteNumberValue` with the `.TotalSeconds` property. Integer wire
 *   types wrap in `Convert.ToInt32()` to truncate fractional seconds.
 * - `"milliseconds"` → `WriteNumberValue` with the `.TotalMilliseconds` property.
 *   Integer wire types wrap in `Convert.ToInt32()` for the same reason.
 *
 * @param type - An `SdkDurationType` with its encoding and wireType resolved by TCGC.
 * @returns Write method info with the correct method name, optional format specifier,
 *   and optional value transformation for numeric encodings.
 */
function getDurationWriteInfo(type: SdkDurationType): WriteMethodInfo {
  switch (type.encode) {
    case "seconds":
      return getDurationNumericWriteInfo(type, "TotalSeconds");
    case "milliseconds":
      return getDurationNumericWriteInfo(type, "TotalMilliseconds");
    case "ISO8601":
    default:
      // ISO8601 is the default encoding for duration in JSON.
      // Uses the "P" format specifier which delegates to XmlConvert.ToString().
      return { methodName: "WriteStringValue", formatArg: "P" };
  }
}

/**
 * Returns write method info for a numeric duration encoding (seconds or milliseconds).
 *
 * When the wire type is an integer kind, the value is wrapped in `Convert.ToInt32()`
 * to truncate fractional values, matching the legacy emitter's behavior. For float or
 * double wire types, the raw `TotalSeconds` or `TotalMilliseconds` value is used directly.
 *
 * @param type - The `SdkDurationType` whose `wireType` determines integer vs float behavior.
 * @param totalProperty - The TimeSpan property to access (`"TotalSeconds"` or `"TotalMilliseconds"`).
 * @returns Write method info with a `valueTransform` that wraps the property name appropriately.
 */
function getDurationNumericWriteInfo(
  type: SdkDurationType,
  totalProperty: string,
): WriteMethodInfo {
  if (INTEGER_KINDS.has(type.wireType.kind)) {
    return {
      methodName: "WriteNumberValue",
      valueTransform: (name: string) =>
        `Convert.ToInt32(${name}.${totalProperty})`,
    };
  }
  return {
    methodName: "WriteNumberValue",
    valueTransform: (name: string) => `${name}.${totalProperty}`,
  };
}

/**
 * Maps TCGC enum value type kinds to .NET framework type names for
 * serialization method suffixes (e.g., `ToSerialString`, `ToSerialSingle`).
 *
 * Covers only the types supported as enum backing types in the C# emitter.
 */
const ENUM_FRAMEWORK_NAMES: Record<string, string> = {
  string: "String",
  float32: "Single",
  float64: "Double",
  int32: "Int32",
  int64: "Int64",
};

/**
 * Maps TCGC integer kinds to C# type keywords for cast expressions.
 *
 * Used for int-backed fixed enums which serialize via direct cast:
 * `writer.WriteNumberValue((int)MyProp)`.
 */
const INT_CAST_KEYWORDS: Record<string, string> = {
  int32: "int",
  int64: "long",
};

/**
 * Returns the write method info for an `SdkEnumType` based on its
 * fixed/extensible status and backing type.
 *
 * The serialization pattern depends on two dimensions:
 *
 * | Kind       | String-backed         | Int-backed         | Float-backed          |
 * |------------|-----------------------|--------------------|-----------------------|
 * | Fixed      | `.ToSerialString()`   | `(int)value`       | `.ToSerialSingle()`   |
 * | Extensible | `.ToString()`         | `.ToSerialInt32()`  | `.ToSerialSingle()`   |
 *
 * Fixed enums use extension methods from `{EnumName}Extensions`.
 * Extensible enums use instance methods on the `readonly struct`.
 * Int-backed fixed enums use a direct cast because their values are
 * embedded in the C# enum declaration.
 *
 * @param enumType - The TCGC enum type to serialize.
 * @returns Write method info with the appropriate writer method and value transform.
 */
function getEnumWriteInfo(enumType: SdkEnumType): WriteMethodInfo {
  const valueTypeKind = enumType.valueType.kind;
  const isStringBacked = valueTypeKind === "string";

  if (enumType.isFixed) {
    // Fixed (non-extensible) C# enums
    if (isStringBacked) {
      // String-backed: writer.WriteStringValue(MyProp.ToSerialString())
      return {
        methodName: "WriteStringValue",
        valueTransform: (name) => `${name}.ToSerialString()`,
      };
    }
    if (isSdkIntKind(valueTypeKind)) {
      // Int-backed: writer.WriteNumberValue((int)MyProp)
      const keyword = INT_CAST_KEYWORDS[valueTypeKind] ?? "int";
      return {
        methodName: "WriteNumberValue",
        valueTransform: (name) => `(${keyword})${name}`,
      };
    }
    // Float-backed: writer.WriteNumberValue(MyProp.ToSerialSingle())
    const frameworkName = ENUM_FRAMEWORK_NAMES[valueTypeKind] ?? valueTypeKind;
    return {
      methodName: "WriteNumberValue",
      valueTransform: (name) => `${name}.ToSerial${frameworkName}()`,
    };
  }

  // Extensible enums (readonly struct)
  if (isStringBacked) {
    // String-backed: writer.WriteStringValue(MyProp.ToString())
    return {
      methodName: "WriteStringValue",
      valueTransform: (name) => `${name}.ToString()`,
    };
  }
  // Numeric: writer.WriteNumberValue(MyProp.ToSerialInt32())
  const frameworkName = ENUM_FRAMEWORK_NAMES[valueTypeKind] ?? valueTypeKind;
  return {
    methodName: "WriteNumberValue",
    valueTransform: (name) => `${name}.ToSerial${frameworkName}()`,
  };
}

/**
 * Returns the write method info for a bytes/BinaryData SDK type.
 *
 * Maps the TCGC bytes encoding to the corresponding `Utf8JsonWriter` extension
 * method call pattern. BinaryData values are converted to `byte[]` via `.ToArray()`
 * before being passed to `WriteBase64StringValue`.
 *
 * Encoding mapping:
 * - `"base64"` → `WriteBase64StringValue(Name.ToArray(), "D")` (standard base64)
 * - `"base64url"` → `WriteBase64StringValue(Name.ToArray(), "U")` (URL-safe base64)
 *
 * The `WriteBase64StringValue(byte[], string)` overload is a custom extension method
 * defined in the generated `ModelSerializationExtensions` class that handles both
 * standard ("D") and URL-safe ("U") base64 encodings.
 *
 * @param type - An `SdkBuiltInType` with `kind: "bytes"` and encoding.
 * @returns Write method info with format specifier and `.ToArray()` value transform,
 *   or `null` for unsupported encodings.
 */
function getBytesWriteInfo(type: SdkBuiltInType): WriteMethodInfo | null {
  if (type.encode === "base64") {
    return {
      methodName: "WriteBase64StringValue",
      formatArg: "D",
      valueTransform: (name) => `${name}.ToArray()`,
    };
  }
  if (type.encode === "base64url") {
    return {
      methodName: "WriteBase64StringValue",
      formatArg: "U",
      valueTransform: (name) => `${name}.ToArray()`,
    };
  }
  return null;
}

/**
 * Determines the `Utf8JsonWriter` write method and optional format specifier
 * for a given SDK type.
 *
 * Unwraps nullable wrappers and constant types to find the underlying
 * kind, then maps it to the appropriate writer method. For types that
 * require encoding-aware serialization (DateTime, Duration, plainDate,
 * plainTime, bytes), also returns the format specifier and/or value transform.
 *
 * @param type - An SDK type from TCGC.
 * @returns Write method info, or `null` if the type requires a different
 *   serialization strategy (models, collections, etc.).
 */
export function getWriteMethodInfo(type: SdkType): WriteMethodInfo | null {
  let unwrapped = unwrapNullableType(type);

  // Unwrap constant types to get the underlying primitive kind.
  // Constants (e.g., `kind: "dog"`) still serialize via their property accessor,
  // but we need the underlying type to pick the correct writer method.
  if (unwrapped.kind === "constant") {
    unwrapped = unwrapped.valueType;
  }

  const kind = unwrapped.kind;

  // Primitive types — no format specifier needed.
  if (STRING_KINDS.has(kind)) return { methodName: "WriteStringValue" };
  if (NUMBER_KINDS.has(kind)) return { methodName: "WriteNumberValue" };
  if (BOOLEAN_KINDS.has(kind)) return { methodName: "WriteBooleanValue" };

  // DateTime types — encoding determines method + format specifier.
  if (kind === "utcDateTime" || kind === "offsetDateTime") {
    return getDateTimeWriteInfo(unwrapped as SdkDateTimeType);
  }

  // Duration types — encoding determines method, format, and value transform.
  if (kind === "duration") {
    return getDurationWriteInfo(unwrapped as SdkDurationType);
  }

  // Plain date/time — always use fixed ISO format specifiers.
  if (kind === "plainDate")
    return { methodName: "WriteStringValue", formatArg: "D" };
  if (kind === "plainTime")
    return { methodName: "WriteStringValue", formatArg: "T" };

  // Enum types — fixed enums use extension methods or casts,
  // extensible enums use instance methods or ToString().
  if (kind === "enum") {
    return getEnumWriteInfo(unwrapped as SdkEnumType);
  }

  // Bytes types — encoding determines base64 format specifier.
  // BinaryData needs .ToArray() conversion to byte[].
  if (kind === "bytes") {
    return getBytesWriteInfo(unwrapped as SdkBuiltInType);
  }

  return null;
}

/**
 * Determines whether a property needs an `Optional.IsDefined` or
 * `Optional.IsCollectionDefined` guard during JSON serialization.
 *
 * Two categories of properties need guards:
 * 1. **Optional properties** — may not have been set by the user, so they
 *    must be wrapped in `Optional.IsDefined`/`IsCollectionDefined` to avoid
 *    serializing unset values.
 * 2. **Required nullable properties** — always serialized but need a guard
 *    to determine whether to write the value or write null. These get an
 *    `if/else` pattern: `if (Optional.IsDefined(P)) { write... } else { WriteNull }`.
 *
 * Required non-nullable properties are always present and serialize directly
 * without guards.
 *
 * @param property - An SDK model property from TCGC.
 * @returns `true` if the property should be wrapped in an Optional guard.
 */
export function needsOptionalGuard(property: SdkModelPropertyType): boolean {
  return property.optional || isRequiredNullable(property);
}

/**
 * Determines whether a property is required and explicitly nullable.
 *
 * A required-nullable property is one where the TypeSpec definition
 * explicitly allows `null` (e.g., `prop: string | null`) but the property
 * is not optional. During serialization, these properties must always be
 * written — either with their value (if defined) or as `null`.
 *
 * Collections are excluded because they use `ChangeTrackingList`/
 * `ChangeTrackingDictionary` for "undefined" semantics instead of null.
 *
 * @param property - An SDK model property from TCGC.
 * @returns `true` if the property is required and has an explicitly nullable type.
 */
export function isRequiredNullable(property: SdkModelPropertyType): boolean {
  if (property.optional) return false;
  if (isCollectionType(property.type)) return false;
  return property.type.kind === "nullable";
}

/**
 * Determines whether a property accessor needs `.Value` to unwrap a nullable
 * value type.
 *
 * In C#, nullable value types (e.g., `int?`, `bool?`, `DateTimeOffset?`) are
 * `Nullable<T>` structs whose underlying value must be accessed via `.Value`.
 * Reference types (e.g., `string?`) don't need `.Value` — the nullable annotation
 * is just a hint to the compiler.
 *
 * This is needed inside `Optional.IsDefined` guard blocks for both
 * required-nullable and optional nullable properties, where we know the
 * value is non-null and can safely unwrap.
 *
 * @param property - An SDK model property from TCGC.
 * @returns `true` if the property is a guarded nullable value type.
 */
export function needsNullableValueAccess(
  property: SdkModelPropertyType,
): boolean {
  // Only relevant for properties inside a guard block
  if (!needsSerializationGuard(property)) return false;
  // Collections don't need .Value
  if (isCollectionType(property.type)) return false;
  // Reference types don't need .Value
  if (isCSharpReferenceType(property.type)) return false;
  // Optional properties with value types need .Value inside the guard
  if (property.optional) return true;
  // Required-nullable value types need .Value
  return property.type.kind === "nullable";
}

/**
 * Returns the `Optional` guard method name for a property.
 *
 * Collections use `Optional.IsCollectionDefined()` because they use
 * `ChangeTrackingList`/`ChangeTrackingDictionary` which have special
 * "is defined" semantics. Scalar properties use `Optional.IsDefined()`.
 *
 * @param property - An SDK model property from TCGC.
 * @returns `"IsCollectionDefined"` for collection types, `"IsDefined"` otherwise.
 */
export function getOptionalGuardMethodName(
  property: SdkModelPropertyType,
): string {
  return isCollectionType(property.type) ? "IsCollectionDefined" : "IsDefined";
}

/**
 * Determines whether a property needs any serialization guard (read-only
 * format check, optional check, or both).
 *
 * A property needs a guard if:
 * - It is read-only (`@visibility(Lifecycle.Read)`) — serialized only when
 *   `options.Format != "W"` (non-wire format).
 * - It is optional or required-nullable — needs `Optional.IsDefined` /
 *   `Optional.IsCollectionDefined` guard.
 * - Both — the guards are combined with `&&`.
 *
 * @param property - An SDK model property from TCGC.
 * @returns `true` if the property requires any guard during serialization.
 */
export function needsSerializationGuard(
  property: SdkModelPropertyType,
): boolean {
  return needsOptionalGuard(property) || isPropertyReadOnly(property);
}

/**
 * Builds the complete `if` condition for a serialization guard.
 *
 * Combines read-only and optional guard conditions with `&&`:
 * - Read-only only: `options.Format != "W"`
 * - Optional only: `Optional.IsDefined(Prop)` or `Optional.IsCollectionDefined(Prop)`
 * - Both: `options.Format != "W" && Optional.IsDefined(Prop)`
 *
 * @param property - An SDK model property from TCGC.
 * @param csharpName - The PascalCase C# property name for the Optional guard.
 * @returns The combined guard condition string.
 */
export function buildGuardCondition(
  property: SdkModelPropertyType,
  csharpName: string,
): string {
  const parts: string[] = [];
  if (isPropertyReadOnly(property)) {
    parts.push('options.Format != "W"');
  }
  if (needsOptionalGuard(property)) {
    const guardMethod = getOptionalGuardMethodName(property);
    parts.push(`Optional.${guardMethod}(${csharpName})`);
  }
  return parts.join(" && ");
}

/**
 * Renders the `else` or `else if` branch for writing null when a
 * required-nullable property is not defined.
 *
 * For non-read-only required-nullable properties, generates a simple `else`
 * branch. For read-only required-nullable properties, generates an `else if
 * (options.Format != "W")` branch to avoid writing null in wire format.
 *
 * @param property - An SDK model property from TCGC.
 * @param serializedName - The JSON wire name for the `WriteNull` call.
 * @returns JSX element with the else-null branch, or `null` if not needed.
 */
function renderElseNull(
  property: SdkModelPropertyType,
  serializedName: string,
): Children | null {
  if (!isRequiredNullable(property)) return null;
  const readOnly = isPropertyReadOnly(property);
  return (
    <>
      {readOnly ? `\n    else if (options.Format != "W")` : "\n    else"}
      {"\n    {"}
      {`\n        writer.WriteNull("${serializedName}"u8);`}
      {"\n    }"}
    </>
  );
}

/**
 * Renders the `writer.WritePropertyName` and `writer.WriteXxxValue` statements
 * for a property at the specified indentation level.
 *
 * Extracted as a helper to support both direct (unguarded) and guarded
 * serialization paths, which differ only in indentation.
 *
 * @param serializedName - The JSON wire name (e.g., `"name"`).
 * @param writeInfo - The write method info for this property type.
 * @param csharpName - The PascalCase C# property name (e.g., `"Name"`).
 * @param indent - The whitespace indentation prefix (e.g., `"    "` or `"        "`).
 * @returns JSX element with the two write statements.
 */
function renderWriteStatements(
  serializedName: string,
  writeInfo: WriteMethodInfo,
  csharpName: string,
  indent: string,
) {
  const valuePart = writeInfo.valueTransform
    ? writeInfo.valueTransform(csharpName)
    : csharpName;
  const formatPart = writeInfo.formatArg ? `, "${writeInfo.formatArg}"` : "";

  return (
    <>
      {`\n${indent}writer.WritePropertyName("${serializedName}"u8);`}
      {`\n${indent}writer.${writeInfo.methodName}(${valuePart}${formatPart});`}
    </>
  );
}

/**
 * Determines whether a collection item type needs a null check during
 * JSON serialization.
 *
 * In C#, reference types can be null at runtime, so `foreach` loop items
 * of reference types need a guard: `if (item == null) { WriteNullValue(); continue; }`.
 * Non-nullable value types (int, bool, enum) cannot be null and skip the check.
 *
 * Matches the legacy emitter's `TypeRequiresNullCheckInSerialization`:
 * - Collections → always (reference types in C#)
 * - Explicitly nullable types → always
 * - C# reference type kinds (string, model, bytes, url, unknown) → always
 * - Value types (int, bool, DateTime, etc.) → never
 *
 * @param itemType - The SDK type of the collection element.
 * @returns `true` if items of this type need null checks in the foreach loop.
 */
function collectionItemNeedsNullCheck(itemType: SdkType): boolean {
  if (itemType.kind === "nullable") return true;
  const unwrapped = unwrapNullableType(itemType);
  if (unwrapped.kind === "array" || unwrapped.kind === "dict") return true;
  return isCSharpReferenceType(itemType);
}

/**
 * Returns the loop variable name for dictionary serialization at a given nesting depth.
 *
 * Matches the legacy emitter's `ForEachStatement` naming convention:
 * - Depth 0 → `"item"` (outermost dictionary loop)
 * - Depth 1 → `"item0"` (first nested dictionary)
 * - Depth 2 → `"item1"` (second nested dictionary)
 *
 * Unlike arrays (which shadow `item` at every level), dictionaries use distinct
 * variable names because the outer variable's `.Key` and `.Value` members may still
 * be referenced in the inner scope (e.g., in the `foreach` expression `item.Value`).
 *
 * @param depth - The nesting depth of the dictionary (0 = outermost).
 * @returns The loop variable name for this depth level.
 */
function getDictItemVarName(depth: number): string {
  return depth === 0 ? "item" : `item${depth - 1}`;
}

/**
 * Renders the serialization statements for a single value expression.
 *
 * Handles four categories:
 * - **Primitive types** — delegates to `getWriteMethodInfo` to produce
 *   `writer.WriteXxxValue(expr[, format])`.
 * - **Array types** — recursively renders `WriteStartArray`, `foreach` loop,
 *   item serialization, and `WriteEndArray`.
 * - **Dictionary types** — renders `WriteStartObject`, `foreach` loop with
 *   `WritePropertyName(item.Key)`, value serialization, and `WriteEndObject`.
 * - **Model types** — renders `writer.WriteObjectValue(expr, options)` which
 *   delegates to the nested model's own `IJsonModel<T>.Write`.
 * - **Enum types** — handled via `getWriteMethodInfo` using value transforms
 *   for extension methods, casts, or instance methods.
 *
 * @param type - The SDK type of the value to serialize.
 * @param valueExpr - The C# expression that produces the value (e.g., property
 *   name `"Items"` or loop variable `"item"`).
 * @param indent - Whitespace indentation prefix for the generated statements.
 * @returns JSX element with the serialization statements, or `null` if unsupported.
 */
function renderValueWrite(
  type: SdkType,
  valueExpr: string,
  indent: string,
): Children | null {
  const unwrapped = unwrapNullableType(type);

  // Array types — recursive collection serialization
  if (unwrapped.kind === "array") {
    return renderArraySerialization(
      unwrapped as SdkArrayType,
      valueExpr,
      indent,
    );
  }

  // Dictionary types — recursive dictionary serialization
  if (unwrapped.kind === "dict") {
    return renderDictionarySerialization(
      unwrapped as SdkDictionaryType,
      valueExpr,
      indent,
    );
  }

  // Model types — delegate to WriteObjectValue which calls the model's IJsonModel.Write
  if (unwrapped.kind === "model") {
    return <>{`\n${indent}writer.WriteObjectValue(${valueExpr}, options);`}</>;
  }

  // Primitive types — simple writer method call
  const writeInfo = getWriteMethodInfo(type);
  if (!writeInfo) return null;

  const valuePart = writeInfo.valueTransform
    ? writeInfo.valueTransform(valueExpr)
    : valueExpr;
  const formatPart = writeInfo.formatArg ? `, "${writeInfo.formatArg}"` : "";

  return (
    <>{`\n${indent}writer.${writeInfo.methodName}(${valuePart}${formatPart});`}</>
  );
}

/**
 * Renders the complete array serialization block for a collection value.
 *
 * Generates the pattern:
 * ```csharp
 * writer.WriteStartArray();
 * foreach (ItemType item in collection)
 * {
 *     // optional: null check for reference type items
 *     writer.WriteXxxValue(item);
 * }
 * writer.WriteEndArray();
 * ```
 *
 * Handles nested collections recursively — a `List<List<string>>` produces
 * nested `WriteStartArray`/`WriteEndArray` pairs with nested `foreach` loops.
 * The loop variable is always named `item`; nested levels shadow the outer
 * variable, matching the legacy emitter's `ForEachStatement("item", ...)` pattern.
 *
 * Uses `TypeExpression` to render the correct C# type name for the `foreach`
 * variable declaration (e.g., `string`, `int`, `IList<string>`).
 *
 * @param arrayType - The TCGC `SdkArrayType` whose items are being serialized.
 * @param valueExpr - The C# expression for the collection (e.g., `"Items"` or `"item"`).
 * @param indent - Whitespace indentation prefix for the generated block.
 * @returns JSX element with the complete array serialization, or `null` if
 *   the item type is not yet supported.
 */
function renderArraySerialization(
  arrayType: SdkArrayType,
  valueExpr: string,
  indent: string,
) {
  const itemType = arrayType.valueType;
  const unwrappedItemType = unwrapNullableType(itemType);
  const innerIndent = indent + "    ";
  const loopVar = "item";

  // Get item serialization — recursive for nested arrays, primitive for leaves
  const itemSerialization = renderValueWrite(itemType, loopVar, innerIndent);
  if (itemSerialization === null) return null;

  const needsNull = collectionItemNeedsNullCheck(itemType);

  return (
    <>
      {`\n${indent}writer.WriteStartArray();`}
      {`\n${indent}foreach (`}
      <TypeExpression type={unwrappedItemType.__raw!} />
      {` ${loopVar} in ${valueExpr})`}
      {`\n${indent}{`}
      {needsNull && (
        <>
          {`\n${innerIndent}if (${loopVar} == null)`}
          {`\n${innerIndent}{`}
          {`\n${innerIndent}    writer.WriteNullValue();`}
          {`\n${innerIndent}    continue;`}
          {`\n${innerIndent}}`}
        </>
      )}
      {itemSerialization}
      {`\n${indent}}`}
      {`\n${indent}writer.WriteEndArray();`}
    </>
  );
}

/**
 * Renders the complete dictionary serialization block for a dictionary value.
 *
 * Generates the pattern:
 * ```csharp
 * writer.WriteStartObject();
 * foreach (var item in DictionaryProp)
 * {
 *     writer.WritePropertyName(item.Key);
 *     writer.WriteXxxValue(item.Value);
 * }
 * writer.WriteEndObject();
 * ```
 *
 * Handles nested dictionaries recursively — a `Record<Record<string>>` produces
 * nested `WriteStartObject`/`WriteEndObject` pairs with nested `foreach` loops.
 * Unlike arrays (which shadow `item` at every level), dictionary loops use
 * depth-based variable names (`item`, `item0`, `item1`, ...) because the outer
 * variable's `.Key`/`.Value` members may still be referenced in the `foreach`
 * expression of inner loops (e.g., `foreach (var item0 in item.Value)`).
 *
 * For reference type values, a null check is inserted:
 * `if (item.Value == null) { WriteNullValue(); continue; }`.
 *
 * Uses `var` for the foreach type declaration (not an explicit type like arrays)
 * matching the legacy emitter's `ForEachStatement("item", dictionary, ...)` pattern.
 *
 * @param dictType - The TCGC `SdkDictionaryType` whose entries are being serialized.
 * @param valueExpr - The C# expression for the dictionary (e.g., `"Names"` or `"item.Value"`).
 * @param indent - Whitespace indentation prefix for the generated block.
 * @param depth - Nesting depth for dictionary variable naming (0 = outermost).
 * @returns JSX element with the complete dictionary serialization, or `null` if
 *   the value type is not yet supported.
 */
function renderDictionarySerialization(
  dictType: SdkDictionaryType,
  valueExpr: string,
  indent: string,
  depth: number = 0,
): Children | null {
  const valueType = dictType.valueType;
  const unwrappedValueType = unwrapNullableType(valueType);
  const innerIndent = indent + "    ";
  const loopVar = getDictItemVarName(depth);

  // Build value serialization based on the value type
  let valueSerialization: Children | null;

  if (unwrappedValueType.kind === "dict") {
    // Nested dictionary — recurse with incremented depth
    valueSerialization = renderDictionarySerialization(
      unwrappedValueType as SdkDictionaryType,
      `${loopVar}.Value`,
      innerIndent,
      depth + 1,
    );
  } else if (unwrappedValueType.kind === "array") {
    // Array inside dictionary — delegate to array serialization
    valueSerialization = renderArraySerialization(
      unwrappedValueType as SdkArrayType,
      `${loopVar}.Value`,
      innerIndent,
    );
  } else {
    // Primitive, model, or enum — delegate to renderValueWrite
    valueSerialization = renderValueWrite(
      valueType,
      `${loopVar}.Value`,
      innerIndent,
    );
  }

  if (valueSerialization === null) return null;

  const needsNull = collectionItemNeedsNullCheck(valueType);

  return (
    <>
      {`\n${indent}writer.WriteStartObject();`}
      {`\n${indent}foreach (var ${loopVar} in ${valueExpr})`}
      {`\n${indent}{`}
      {`\n${innerIndent}writer.WritePropertyName(${loopVar}.Key);`}
      {needsNull && (
        <>
          {`\n${innerIndent}if (${loopVar}.Value == null)`}
          {`\n${innerIndent}{`}
          {`\n${innerIndent}    writer.WriteNullValue();`}
          {`\n${innerIndent}    continue;`}
          {`\n${innerIndent}}`}
        </>
      )}
      {valueSerialization}
      {`\n${indent}}`}
      {`\n${indent}writer.WriteEndObject();`}
    </>
  );
}

/**
 * Renders collection property serialization with appropriate property name
 * writing and optional guards.
 *
 * Handles both guarded (optional/required-nullable) and unguarded (required)
 * collection properties. The property name write and collection value
 * serialization are placed inside the guard block when needed.
 *
 * @param property - The SDK model property being serialized.
 * @param arrayType - The unwrapped `SdkArrayType` for the property.
 * @param serializedName - The JSON wire name for the property.
 * @param csharpName - The PascalCase C# property name.
 * @returns JSX element with the complete collection serialization, or `null`
 *   if the collection items can't be serialized yet.
 */
function renderCollectionProperty(
  property: SdkModelPropertyType,
  arrayType: SdkArrayType,
  serializedName: string,
  csharpName: string,
) {
  if (needsSerializationGuard(property)) {
    const condition = buildGuardCondition(property, csharpName);
    const collectionContent = renderArraySerialization(
      arrayType,
      csharpName,
      "        ",
    );
    if (collectionContent === null) return null;

    return (
      <>
        {`\n    if (${condition})`}
        {"\n    {"}
        {`\n        writer.WritePropertyName("${serializedName}"u8);`}
        {collectionContent}
        {"\n    }"}
        {renderElseNull(property, serializedName)}
      </>
    );
  }

  const collectionContent = renderArraySerialization(
    arrayType,
    csharpName,
    "    ",
  );
  if (collectionContent === null) return null;

  return (
    <>
      {`\n    writer.WritePropertyName("${serializedName}"u8);`}
      {collectionContent}
    </>
  );
}

/**
 * Renders dictionary property serialization with appropriate property name
 * writing and optional guards.
 *
 * Generates `WriteStartObject`, a `foreach` loop that writes each key-value pair
 * using `WritePropertyName(item.Key)` and the appropriate value writer, then
 * `WriteEndObject`. Matches the legacy emitter's dictionary serialization pattern.
 *
 * Handles both guarded (optional/required-nullable) and unguarded (required)
 * dictionary properties. The property name write and dictionary value
 * serialization are placed inside the guard block when needed.
 *
 * @param property - The SDK model property being serialized.
 * @param dictType - The unwrapped `SdkDictionaryType` for the property.
 * @param serializedName - The JSON wire name for the property.
 * @param csharpName - The PascalCase C# property name.
 * @returns JSX element with the complete dictionary serialization, or `null`
 *   if the dictionary values can't be serialized yet.
 */
function renderDictionaryProperty(
  property: SdkModelPropertyType,
  dictType: SdkDictionaryType,
  serializedName: string,
  csharpName: string,
) {
  if (needsSerializationGuard(property)) {
    const condition = buildGuardCondition(property, csharpName);
    const dictContent = renderDictionarySerialization(
      dictType,
      csharpName,
      "        ",
    );
    if (dictContent === null) return null;

    return (
      <>
        {`\n    if (${condition})`}
        {"\n    {"}
        {`\n        writer.WritePropertyName("${serializedName}"u8);`}
        {dictContent}
        {"\n    }"}
        {renderElseNull(property, serializedName)}
      </>
    );
  }

  const dictContent = renderDictionarySerialization(
    dictType,
    csharpName,
    "    ",
  );
  if (dictContent === null) return null;

  return (
    <>
      {`\n    writer.WritePropertyName("${serializedName}"u8);`}
      {dictContent}
    </>
  );
}

/**
 * Renders model property serialization with appropriate property name
 * writing and optional guards.
 *
 * Generates `writer.WriteObjectValue(PropertyName, options)` which delegates
 * serialization to the nested model's own `IJsonModel<T>.Write` implementation.
 * The generic type parameter is inferred by C# from the argument type.
 *
 * For optional model properties, wraps in `Optional.IsDefined()` guard.
 * For required-nullable model properties, adds `else { WriteNull }` branch.
 * Models are C# reference types so they never need `.Value` unwrapping.
 *
 * @param property - The SDK model property being serialized.
 * @param serializedName - The JSON wire name for the property.
 * @param csharpName - The PascalCase C# property name.
 * @returns JSX element with the complete model serialization.
 */
function renderModelProperty(
  property: SdkModelPropertyType,
  serializedName: string,
  csharpName: string,
) {
  if (needsSerializationGuard(property)) {
    const condition = buildGuardCondition(property, csharpName);
    return (
      <>
        {`\n    if (${condition})`}
        {"\n    {"}
        {`\n        writer.WritePropertyName("${serializedName}"u8);`}
        {`\n        writer.WriteObjectValue(${csharpName}, options);`}
        {"\n    }"}
        {renderElseNull(property, serializedName)}
      </>
    );
  }

  return (
    <>
      {`\n    writer.WritePropertyName("${serializedName}"u8);`}
      {`\n    writer.WriteObjectValue(${csharpName}, options);`}
    </>
  );
}

/**
 * Generates the serialization statements for a single model property.
 *
 * Produces C# statements for writing the property to a `Utf8JsonWriter`.
 * Handles five categories of types:
 *
 * **Primitive types** — `writer.WritePropertyName("name"u8)` followed by
 * `writer.WriteXxxValue(Name)` with optional format specifier.
 *
 * **Collection types (arrays/lists)** — `writer.WritePropertyName("name"u8)`
 * followed by `writer.WriteStartArray()`, a `foreach` loop that serializes
 * each item, and `writer.WriteEndArray()`. Nested collections are handled
 * recursively with nested foreach loops.
 *
 * **Dictionary types (Record)** — `writer.WritePropertyName("name"u8)` followed
 * by `writer.WriteStartObject()`, a `foreach` loop that writes each key-value
 * pair with `WritePropertyName(item.Key)` and the appropriate value writer,
 * and `writer.WriteEndObject()`. Nested dictionaries use depth-based variable
 * names (`item`, `item0`, `item1`, ...).
 *
 * **Model types** — `writer.WritePropertyName("pet"u8)` followed by
 * `writer.WriteObjectValue(Pet, options)` which delegates to the nested
 * model's own `IJsonModel<T>.Write` implementation.
 *
 * Optional properties are wrapped in `Optional.IsDefined` / `IsCollectionDefined`
 * guards. Required nullable properties get an `else { WriteNull }` branch.
 *
 * @example Generated output for a required List<string> property:
 * ```csharp
 * writer.WritePropertyName("items"u8);
 * writer.WriteStartArray();
 * foreach (string item in Items)
 * {
 *     if (item == null)
 *     {
 *         writer.WriteNullValue();
 *         continue;
 *     }
 *     writer.WriteStringValue(item);
 * }
 * writer.WriteEndArray();
 * ```
 *
 * @example Generated output for an optional List<int> property:
 * ```csharp
 * if (Optional.IsCollectionDefined(Counts))
 * {
 *     writer.WritePropertyName("counts"u8);
 *     writer.WriteStartArray();
 *     foreach (int item in Counts)
 *     {
 *         writer.WriteNumberValue(item);
 *     }
 *     writer.WriteEndArray();
 * }
 * ```
 *
 * @example Generated output for a nested model property:
 * ```csharp
 * writer.WritePropertyName("pet"u8);
 * writer.WriteObjectValue(Pet, options);
 * ```
 *
 * @param props - The component props containing the property to serialize.
 * @returns JSX element with the write statements, or `null` for unsupported types.
 */
export function WritePropertySerialization(
  props: WritePropertySerializationProps,
) {
  const namePolicy = useCSharpNamePolicy();
  const { property } = props;

  const serializedName = property.serializedName;
  const csharpName = namePolicy.getName(
    resolvePropertyName(property.name, props.modelName),
    "class-property",
  );

  // Collection types — array/list serialization with foreach loops
  const unwrapped = unwrapNullableType(property.type);
  if (unwrapped.kind === "array") {
    return renderCollectionProperty(
      property,
      unwrapped as SdkArrayType,
      serializedName,
      csharpName,
    );
  }

  // Dictionary types — WriteStartObject/foreach/WriteEndObject serialization
  if (unwrapped.kind === "dict") {
    return renderDictionaryProperty(
      property,
      unwrapped as SdkDictionaryType,
      serializedName,
      csharpName,
    );
  }

  // Model types — WriteObjectValue delegates to nested model's IJsonModel.Write
  if (unwrapped.kind === "model") {
    return renderModelProperty(property, serializedName, csharpName);
  }

  // Primitive types — simple writer method call
  const writeInfo = getWriteMethodInfo(property.type);
  if (!writeInfo) return null;

  if (needsSerializationGuard(property)) {
    const condition = buildGuardCondition(property, csharpName);
    const valueAccessor = needsNullableValueAccess(property) ? ".Value" : "";
    return (
      <>
        {`\n    if (${condition})`}
        {"\n    {"}
        {renderWriteStatements(
          serializedName,
          writeInfo,
          csharpName + valueAccessor,
          "        ",
        )}
        {"\n    }"}
        {renderElseNull(property, serializedName)}
      </>
    );
  }

  return renderWriteStatements(serializedName, writeInfo, csharpName, "    ");
}
