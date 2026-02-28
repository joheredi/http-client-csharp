/**
 * Property serialization component for JSON write path.
 *
 * Generates the `writer.WritePropertyName("serializedName"u8)` and
 * `writer.WriteXxxValue(PropertyName)` statements for a single model
 * property inside `JsonModelWriteCore`.
 *
 * Currently handles primitive types only:
 * - **String/URL** → `WriteStringValue`
 * - **Numeric** (int8–int64, uint8–uint64, float32, float64, decimal, decimal128,
 *   safeint, numeric, integer, float) → `WriteNumberValue`
 * - **Boolean** → `WriteBooleanValue`
 *
 * Non-primitive types (models, enums, collections, dictionaries, DateTime,
 * Duration, bytes) return `null` and are handled by subsequent tasks:
 * - 2.2.4: DateTime serialization
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
 * @example Generated output for a numeric property:
 * ```csharp
 * writer.WritePropertyName("count"u8);
 * writer.WriteNumberValue(Count);
 * ```
 *
 * @example Generated output for a boolean property:
 * ```csharp
 * writer.WritePropertyName("isActive"u8);
 * writer.WriteBooleanValue(IsActive);
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import type {
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
 * Determines the `Utf8JsonWriter` write method name for a given SDK type.
 *
 * Unwraps nullable wrappers and constant types to find the underlying
 * primitive kind, then maps it to the appropriate writer method.
 *
 * @param type - An SDK type from TCGC.
 * @returns The writer method name (e.g., "WriteStringValue"), or `null` if the
 *   type is not a primitive and requires a different serialization strategy.
 */
export function getWriteMethodName(type: SdkType): string | null {
  let unwrapped = unwrapNullableType(type);

  // Unwrap constant types to get the underlying primitive kind.
  // Constants (e.g., `kind: "dog"`) still serialize via their property accessor,
  // but we need the underlying type to pick the correct writer method.
  if (unwrapped.kind === "constant") {
    unwrapped = unwrapped.valueType;
  }

  const kind = unwrapped.kind;
  if (STRING_KINDS.has(kind)) return "WriteStringValue";
  if (NUMBER_KINDS.has(kind)) return "WriteNumberValue";
  if (BOOLEAN_KINDS.has(kind)) return "WriteBooleanValue";
  return null;
}

/**
 * Generates the serialization statements for a single model property.
 *
 * Produces two C# statements:
 * 1. `writer.WritePropertyName("serializedName"u8);` — writes the JSON property
 *    name using a UTF-8 byte literal for performance.
 * 2. `writer.WriteXxxValue(PropertyName);` — writes the property value using
 *    the appropriate `Utf8JsonWriter` method for the primitive type.
 *
 * Returns `null` for non-primitive types (models, enums, collections, etc.)
 * which are handled by subsequent tasks (2.2.4–2.2.10).
 *
 * @param props - The component props containing the property to serialize.
 * @returns JSX element with the write statements, or `null` for unsupported types.
 */
export function WritePropertySerialization(
  props: WritePropertySerializationProps,
) {
  const namePolicy = useCSharpNamePolicy();
  const { property } = props;

  const writeMethod = getWriteMethodName(property.type);
  if (!writeMethod) return null;

  const serializedName = property.serializedName;
  const csharpName = namePolicy.getName(property.name, "class-property");

  return (
    <>
      {`\n    writer.WritePropertyName("${serializedName}"u8);`}
      {`\n    writer.${writeMethod}(${csharpName});`}
    </>
  );
}
