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
 * - **plainDate** → `WriteStringValue` with `"D"` format
 * - **plainTime** → `WriteStringValue` with `"T"` format
 *
 * Non-primitive types (models, enums, collections, dictionaries,
 * Duration, bytes) return `null` and are handled by subsequent tasks:
 * - 2.2.5: Duration serialization
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
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import type {
  SdkDateTimeType,
  SdkModelPropertyType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { unwrapNullableType } from "../../utils/nullable.js";

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
   * RFC7231, `"U"` for Unix timestamp). When present, generates a two-argument
   * call like `writer.WriteStringValue(prop, "O")`.
   */
  formatArg?: string;
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
 * Determines the `Utf8JsonWriter` write method and optional format specifier
 * for a given SDK type.
 *
 * Unwraps nullable wrappers and constant types to find the underlying
 * kind, then maps it to the appropriate writer method. For types that
 * require encoding-aware serialization (DateTime, plainDate, plainTime),
 * also returns the format specifier argument.
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

  // Plain date/time — always use fixed ISO format specifiers.
  if (kind === "plainDate") return { methodName: "WriteStringValue", formatArg: "D" };
  if (kind === "plainTime") return { methodName: "WriteStringValue", formatArg: "T" };

  return null;
}

/**
 * Generates the serialization statements for a single model property.
 *
 * Produces two C# statements:
 * 1. `writer.WritePropertyName("serializedName"u8);` — writes the JSON property
 *    name using a UTF-8 byte literal for performance.
 * 2. `writer.WriteXxxValue(PropertyName[, "format"]);` — writes the property value
 *    using the appropriate `Utf8JsonWriter` method. For types with encoding
 *    (DateTime, plainDate, plainTime), a format specifier argument is included.
 *
 * Returns `null` for non-primitive types (models, enums, collections, etc.)
 * which are handled by subsequent tasks (2.2.5–2.2.10).
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
  const formatPart = writeInfo.formatArg ? `, "${writeInfo.formatArg}"` : "";

  return (
    <>
      {`\n    writer.WritePropertyName("${serializedName}"u8);`}
      {`\n    writer.${writeInfo.methodName}(${csharpName}${formatPart});`}
    </>
  );
}
