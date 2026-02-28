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
 *
 * Non-primitive types (models, enums, collections, dictionaries,
 * bytes) return `null` and are handled by subsequent tasks:
 * - 2.2.6: Bytes serialization
 * - 2.2.7: Nested model serialization
 * - 2.2.8: Enum serialization
 * - 2.2.9: Collection serialization
 * - 2.2.10: Dictionary serialization
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
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import type {
  SdkDateTimeType,
  SdkDurationType,
  SdkModelPropertyType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { isCollectionType, unwrapNullableType } from "../../utils/nullable.js";

/**
 * Props for the {@link WritePropertySerialization} component.
 */
export interface WritePropertySerializationProps {
  /** The TCGC SDK model property to serialize. */
  property: SdkModelPropertyType;
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
 * Determines the `Utf8JsonWriter` write method and optional format specifier
 * for a given SDK type.
 *
 * Unwraps nullable wrappers and constant types to find the underlying
 * kind, then maps it to the appropriate writer method. For types that
 * require encoding-aware serialization (DateTime, Duration, plainDate,
 * plainTime), also returns the format specifier and/or value transform.
 *
 * @param type - An SDK type from TCGC.
 * @returns Write method info, or `null` if the type requires a different
 *   serialization strategy (models, enums, collections, etc.).
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

  return null;
}

/**
 * Determines whether a property needs an `Optional.IsDefined` or
 * `Optional.IsCollectionDefined` guard during JSON serialization.
 *
 * Optional properties may not have been set by the user, so they must be
 * wrapped in an `Optional.IsDefined`/`IsCollectionDefined` check to avoid
 * serializing unset values. Required non-nullable properties are always
 * present and serialize directly without guards.
 *
 * @param property - An SDK model property from TCGC.
 * @returns `true` if the property should be wrapped in an Optional guard.
 */
export function needsOptionalGuard(property: SdkModelPropertyType): boolean {
  return property.optional;
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
 * Generates the serialization statements for a single model property.
 *
 * Produces two C# statements:
 * 1. `writer.WritePropertyName("serializedName"u8);` — writes the JSON property
 *    name using a UTF-8 byte literal for performance.
 * 2. `writer.WriteXxxValue(PropertyName[, "format"]);` — writes the property value
 *    using the appropriate `Utf8JsonWriter` method. For types with encoding
 *    (DateTime, Duration, plainDate, plainTime), a format specifier argument
 *    is included. For Duration with numeric encoding, a value transform wraps
 *    the property access (e.g., `Property.TotalSeconds`).
 *
 * Optional properties are wrapped in an `Optional.IsDefined` or
 * `Optional.IsCollectionDefined` guard to skip serialization of unset values.
 * Required non-nullable properties serialize directly without guards.
 *
 * Returns `null` for non-primitive types (models, enums, collections, etc.)
 * which are handled by subsequent tasks (2.2.6–2.2.10).
 *
 * @example Generated output for a required string property (no guard):
 * ```csharp
 * writer.WritePropertyName("name"u8);
 * writer.WriteStringValue(Name);
 * ```
 *
 * @example Generated output for an optional string property (with guard):
 * ```csharp
 * if (Optional.IsDefined(Name))
 * {
 *     writer.WritePropertyName("name"u8);
 *     writer.WriteStringValue(Name);
 * }
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

  const writeInfo = getWriteMethodInfo(property.type);
  if (!writeInfo) return null;

  const serializedName = property.serializedName;
  const csharpName = namePolicy.getName(property.name, "class-property");

  if (needsOptionalGuard(property)) {
    const guardMethod = getOptionalGuardMethodName(property);
    return (
      <>
        {`\n    if (Optional.${guardMethod}(${csharpName}))`}
        {"\n    {"}
        {renderWriteStatements(
          serializedName,
          writeInfo,
          csharpName,
          "        ",
        )}
        {"\n    }"}
      </>
    );
  }

  return renderWriteStatements(serializedName, writeInfo, csharpName, "    ");
}
