/**
 * Property matching loop for JSON deserialization.
 *
 * Generates the `foreach (var prop in element.EnumerateObject())` loop
 * that iterates over all JSON properties in the element and matches each
 * one by name to populate the corresponding local variable. This is the
 * core pattern of JSON deserialization in the System.ClientModel framework.
 *
 * The generated loop:
 * 1. Iterates over all properties in the JSON element.
 * 2. For each known property, checks `prop.NameEquals("serializedName"u8)`.
 * 3. Assigns the extracted value to the local variable: `{var} = prop.Value.Get{Type}()`.
 * 4. Calls `continue` to skip to the next JSON property.
 *
 * Properties with types not yet handled (enums, collections,
 * dictionaries) are skipped — those are implemented by subsequent
 * tasks (2.3.8–2.3.10). A children slot after all property matches allows
 * task 2.3.12 to add the additional binary data catch-all.
 *
 * For derived discriminated models, the loop includes ALL properties from
 * the entire inheritance hierarchy (base + own), matching the flat
 * deserialization pattern where the derived model's `DeserializeXxx` method
 * handles all properties including inherited ones.
 *
 * @example Generated output for a model `Widget { name: string; count: int32; }`:
 * ```csharp
 * foreach (var prop in element.EnumerateObject())
 * {
 *     if (prop.NameEquals("name"u8))
 *     {
 *         name = prop.Value.GetString();
 *         continue;
 *     }
 *     if (prop.NameEquals("count"u8))
 *     {
 *         count = prop.Value.GetInt32();
 *         continue;
 *     }
 * }
 * ```
 *
 * @module
 */

import { useCSharpNamePolicy } from "@alloy-js/csharp";
import type { Children } from "@alloy-js/core";
import type { NamePolicy } from "@alloy-js/core";
import type {
  SdkBuiltInType,
  SdkDateTimeType,
  SdkDurationType,
  SdkEnumType,
  SdkModelPropertyType,
  SdkModelType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { unwrapNullableType } from "../../utils/nullable.js";
import {
  isBaseDiscriminatorOverride,
  isDerivedDiscriminatedModel,
} from "../models/ModelConstructors.js";

/**
 * Props for the {@link PropertyMatchingLoop} component.
 */
export interface PropertyMatchingLoopProps {
  /** The TCGC SDK model type whose properties are being deserialized. */
  type: SdkModelType;
  /**
   * Optional children rendered after all property match blocks inside the
   * foreach body. Used by task 2.3.12 to add the additional binary data
   * catch-all statement.
   */
  children?: Children;
}

/**
 * Computes the flat list of model properties that should have matching
 * `if (prop.NameEquals(...))` blocks in the deserialization loop.
 *
 * For base/standalone models: returns all own properties.
 * For derived discriminated models: returns base model properties (recursive)
 * followed by own non-override properties. This mirrors the serialization
 * constructor parameter order and the `computeVariableInfos` function in
 * DeserializeVariableDeclarations.
 *
 * Discriminator override properties in derived models are excluded because
 * the base model already provides the matching block for the discriminator.
 *
 * @param model - The TCGC SDK model type.
 * @returns Ordered list of properties for the matching loop.
 */
export function computeMatchableProperties(
  model: SdkModelType,
): SdkModelPropertyType[] {
  if (isDerivedDiscriminatedModel(model)) {
    const baseProps = computeMatchableProperties(model.baseModel!);
    const ownProps = model.properties.filter(
      (p) => !isBaseDiscriminatorOverride(p),
    );
    return [...baseProps, ...ownProps];
  }

  return [...model.properties];
}

/**
 * Maps SDK type kinds to their corresponding `JsonElement` getter methods.
 *
 * Each entry maps a TCGC `SdkBuiltInKind` string to the method name on
 * `System.Text.Json.JsonElement` that extracts a value of that type.
 * The mapping follows the legacy emitter's `DeserializeJsonValueCore` logic
 * in `MrwSerializationTypeDefinition.cs`.
 *
 * Abstract numeric kinds (`numeric`, `integer`, `float`) map to their
 * C# default representations: `double` for numeric/float, `long` for integer.
 *
 * Types not in this map (enums, collections, dictionaries) require
 * specialized deserialization and return `null` from `getReadExpression` —
 * those are handled by subsequent tasks. Model types are handled
 * separately via the `DeserializeXxx` static method pattern.
 *
 * Encoded types (DateTime, Duration, bytes, plainDate, plainTime) are handled
 * by dedicated helper functions before consulting this map.
 */
const READ_METHOD_MAP: Record<string, string> = {
  string: "GetString",
  boolean: "GetBoolean",
  int8: "GetSByte",
  int16: "GetInt16",
  int32: "GetInt32",
  int64: "GetInt64",
  uint8: "GetByte",
  uint16: "GetUInt16",
  uint32: "GetUInt32",
  uint64: "GetUInt64",
  float32: "GetSingle",
  float64: "GetDouble",
  float: "GetDouble",
  decimal: "GetDecimal",
  decimal128: "GetDecimal",
  safeint: "GetInt64",
  numeric: "GetDouble",
  integer: "GetInt64",
};

/**
 * Returns the C# read expression for a `SdkDateTimeType` based on its encoding.
 *
 * The encoding determines how the JSON value is read:
 * - `"rfc3339"` (default) → `prop.Value.GetDateTimeOffset("O")` (ISO 8601 round-trip)
 * - `"rfc7231"` → `prop.Value.GetDateTimeOffset("R")` (RFC 1123 HTTP-date)
 * - `"unixTimestamp"` → `DateTimeOffset.FromUnixTimeSeconds(prop.Value.GetInt64())`
 *
 * The `GetDateTimeOffset(format)` overload is a custom extension method defined
 * in the generated `ModelSerializationExtensions` class. For Unix timestamps,
 * the value is a number so it uses the built-in `GetInt64()` with the framework's
 * `DateTimeOffset.FromUnixTimeSeconds` static method.
 *
 * @param type - An `SdkDateTimeType` with its encoding resolved by TCGC.
 * @returns The C# expression string for reading the DateTime value.
 */
function getDateTimeReadExpression(type: SdkDateTimeType): string {
  if (type.encode === "unixTimestamp") {
    return "DateTimeOffset.FromUnixTimeSeconds(prop.Value.GetInt64())";
  }
  const format = type.encode === "rfc7231" ? "R" : "O";
  return `prop.Value.GetDateTimeOffset("${format}")`;
}

/**
 * Returns the C# read expression for a `SdkDurationType` based on its encoding.
 *
 * Duration (TimeSpan) supports three encoding strategies:
 * - `"ISO8601"` (default) → `prop.Value.GetTimeSpan("P")` — custom extension method
 *   that delegates to `TypeFormatters.ParseTimeSpan`. The "P" format produces
 *   ISO 8601 duration strings like `"P1DT2H3M4S"`.
 * - `"seconds"` → `TimeSpan.FromSeconds(prop.Value.GetInt32())` for integer wire
 *   types, or `TimeSpan.FromSeconds(prop.Value.GetDouble())` for float/double wire
 *   types.
 * - `"milliseconds"` → `TimeSpan.FromMilliseconds(prop.Value.Get{Type}())` with
 *   the same integer vs float distinction.
 *
 * The wire type distinction matches the legacy emitter's `Duration_Seconds` (int32)
 * vs `Duration_Seconds_Float`/`Duration_Seconds_Double` (float) formats. Only
 * `int32` uses `GetInt32()`; all other wire types use `GetDouble()`.
 *
 * @param type - An `SdkDurationType` with its encoding and wireType resolved by TCGC.
 * @returns The C# expression string for reading the Duration value.
 */
function getDurationReadExpression(type: SdkDurationType): string {
  if (type.encode === "seconds") {
    return getDurationNumericReadExpression(type, "FromSeconds");
  }
  if (type.encode === "milliseconds") {
    return getDurationNumericReadExpression(type, "FromMilliseconds");
  }
  // ISO8601 is the default encoding — uses custom GetTimeSpan extension method.
  return `prop.Value.GetTimeSpan("P")`;
}

/**
 * Returns the C# read expression for a numeric-encoded duration.
 *
 * When the wire type is `int32`, uses `GetInt32()` matching the legacy emitter's
 * `Duration_Seconds` format. All other wire types (float32, float64, int64, etc.)
 * use `GetDouble()` matching the legacy emitter's `Duration_Seconds_Float` /
 * `Duration_Seconds_Double` fallback.
 *
 * @param type - The `SdkDurationType` whose `wireType` determines the getter method.
 * @param method - The `TimeSpan` factory method (`"FromSeconds"` or `"FromMilliseconds"`).
 * @returns The C# expression string.
 */
function getDurationNumericReadExpression(
  type: SdkDurationType,
  method: string,
): string {
  const getter = type.wireType.kind === "int32" ? "GetInt32" : "GetDouble";
  return `TimeSpan.${method}(prop.Value.${getter}())`;
}

/**
 * Returns the C# read expression for a `bytes` type based on its encoding.
 *
 * In this emitter, `bytes` maps to `BinaryData` (not `byte[]`), following the
 * SCALAR_TYPE_OVERRIDES in type-mapping.ts. The deserialization strategy depends
 * on the encoding:
 * - `"base64"` → `BinaryData.FromBytes(prop.Value.GetBytesFromBase64("D"))`
 * - `"base64url"` → `BinaryData.FromBytes(prop.Value.GetBytesFromBase64("U"))`
 * - default fallback → `BinaryData.FromString(prop.Value.GetRawText())`
 *
 * Note: TCGC always assigns `"base64"` as the default encode for bytes types,
 * so the raw text fallback is defensive and unlikely to be triggered for
 * standard `bytes` properties. It may be relevant for `unknown` types or
 * future TCGC changes.
 *
 * The `GetBytesFromBase64(format)` overload is a custom extension method defined
 * in the generated `ModelSerializationExtensions` class that handles both standard
 * base64 ("D") and URL-safe base64 ("U") encodings.
 *
 * @param type - An `SdkBuiltInType` with `kind: "bytes"` and encoding.
 * @returns The C# expression string for reading the bytes value.
 */
function getBytesReadExpression(type: SdkBuiltInType): string {
  if (type.encode === "base64") {
    return `BinaryData.FromBytes(prop.Value.GetBytesFromBase64("D"))`;
  }
  if (type.encode === "base64url") {
    return `BinaryData.FromBytes(prop.Value.GetBytesFromBase64("U"))`;
  }
  // Default encoding — raw JSON text to BinaryData
  return "BinaryData.FromString(prop.Value.GetRawText())";
}

/**
 * Returns the C# read expression for an `SdkEnumType` based on its
 * fixed/extensible status and backing type.
 *
 * The deserialization pattern depends on two dimensions:
 *
 * | Kind       | String-backed                       | Int-backed                          | Float-backed                          |
 * |------------|-------------------------------------|-------------------------------------|---------------------------------------|
 * | Fixed      | `GetString().To{Enum}()`            | `GetInt32().To{Enum}()`             | `GetSingle().To{Enum}()`              |
 * | Extensible | `new {Enum}(GetString())`           | `new {Enum}(GetInt32())`            | `new {Enum}(GetSingle())`             |
 *
 * Fixed enums use the `To{EnumName}` extension method defined in
 * `{EnumName}Extensions` (generated by FixedEnumSerializationFile).
 * Extensible enums construct a new instance directly from the raw JSON value
 * since any value is valid (forward-compatibility).
 *
 * The getter method is determined by looking up `enumType.valueType.kind` in
 * `READ_METHOD_MAP`, which reuses the same mapping used for primitive types.
 *
 * @param enumType - The TCGC enum type to deserialize.
 * @param namePolicy - C# name policy for resolving the enum type name.
 * @returns The C# expression string, or `null` for unsupported backing types.
 */
function getEnumReadExpression(
  enumType: SdkEnumType,
  namePolicy: NamePolicy<string>,
): string | null {
  const valueTypeKind = enumType.valueType.kind;
  const getterMethod = READ_METHOD_MAP[valueTypeKind];
  if (!getterMethod) return null;

  const getter = `prop.Value.${getterMethod}()`;
  const enumName = namePolicy.getName(enumType.name, "enum");

  if (enumType.isFixed) {
    // Fixed enums: prop.Value.GetXxx().To{EnumName}()
    return `${getter}.To${enumName}()`;
  }

  // Extensible enums: new {EnumName}(prop.Value.GetXxx())
  return `new ${enumName}(${getter})`;
}

/**
 * Returns the C# expression to extract a value from `prop.Value` (a
 * `JsonElement`) for the given SDK type.
 *
 * Unwraps nullable and constant type wrappers to find the underlying
 * primitive kind, then maps it to the appropriate `JsonElement.Get{Type}()`
 * method call. Handles:
 *
 * - **Primitive types** (string, numbers, boolean) → `prop.Value.Get{Type}()`
 * - **URL** → `new Uri(prop.Value.GetString())`
 * - **DateTime** (utcDateTime, offsetDateTime) → encoding-aware: `GetDateTimeOffset("O"/"R")`
 *   or `DateTimeOffset.FromUnixTimeSeconds(GetInt64())` for Unix
 * - **Duration** → encoding-aware: `GetTimeSpan("P")` for ISO8601, or
 *   `TimeSpan.FromSeconds(GetInt32()/GetDouble())` for numeric encodings
 * - **Bytes** → `BinaryData.FromBytes(GetBytesFromBase64("D"/"U"))` or
 *   `BinaryData.FromString(GetRawText())` for default encoding
 * - **plainDate** → `prop.Value.GetDateTimeOffset("D")`
 * - **plainTime** → `prop.Value.GetTimeSpan("T")`
 * - **Enums** → Fixed: `GetXxx().To{EnumName}()`, Extensible: `new {EnumName}(GetXxx())`
 *
 * Returns `null` for types that need specialized deserialization logic:
 * - **Collections (arrays)** — task 2.3.9 (foreach over array)
 * - **Dictionaries** — task 2.3.10 (foreach over object)
 *
 * @param type - An SDK type from TCGC.
 * @param namePolicy - Optional C# name policy for resolving model/enum class names.
 *   Required for model and enum type deserialization.
 * @returns The C# expression string, or `null` if the type is not yet supported.
 */
export function getReadExpression(
  type: SdkType,
  namePolicy?: NamePolicy<string>,
): string | null {
  let unwrapped = unwrapNullableType(type);

  // Unwrap constant types to get the underlying primitive kind.
  // Constants (e.g., discriminator `kind: "dog"`) still deserialize
  // via their JsonElement getter — the constant value is in the JSON.
  if (unwrapped.kind === "constant") {
    unwrapped = unwrapped.valueType;
  }

  const kind = unwrapped.kind;

  // URL type needs wrapping in a Uri constructor
  if (kind === "url") {
    return "new Uri(prop.Value.GetString())";
  }

  // DateTime types — encoding determines the format specifier or Unix strategy.
  if (kind === "utcDateTime" || kind === "offsetDateTime") {
    return getDateTimeReadExpression(unwrapped as SdkDateTimeType);
  }

  // Duration types — encoding determines ISO8601 vs numeric strategy.
  if (kind === "duration") {
    return getDurationReadExpression(unwrapped as SdkDurationType);
  }

  // Bytes type — encoding determines Base64 vs Base64URL vs raw.
  if (kind === "bytes") {
    return getBytesReadExpression(unwrapped as SdkBuiltInType);
  }

  // Plain date/time — fixed ISO format specifiers using custom extension methods.
  if (kind === "plainDate") {
    return `prop.Value.GetDateTimeOffset("D")`;
  }
  if (kind === "plainTime") {
    return `prop.Value.GetTimeSpan("T")`;
  }

  // Primitive types — direct JsonElement getter
  const method = READ_METHOD_MAP[kind];
  if (method) {
    return `prop.Value.${method}()`;
  }

  // Enum types — fixed enums use extension methods, extensible enums use constructors.
  if (kind === "enum" && namePolicy) {
    return getEnumReadExpression(unwrapped as SdkEnumType, namePolicy);
  }

  // Model types — call static DeserializeXxx method on the model class.
  // The pattern is: ModelName.DeserializeModelName(prop.Value, options)
  // This delegates deserialization to the nested model's own static method.
  if (kind === "model" && namePolicy) {
    const modelType = unwrapped as SdkModelType;
    const modelName = namePolicy.getName(modelType.name, "class");
    return `${modelName}.Deserialize${modelName}(prop.Value, options)`;
  }

  // Types handled by subsequent tasks return null
  return null;
}

/**
 * Generates the `foreach (var prop in element.EnumerateObject())` loop
 * that matches JSON properties by name and assigns their values to local
 * variables.
 *
 * This is the core deserialization loop placed inside the `DeserializeXxx`
 * method, after the variable declarations (task 2.3.3) and before the
 * constructor return (task 2.3.13).
 *
 * For each model property, generates:
 * ```csharp
 * if (prop.NameEquals("serializedName"u8))
 * {
 *     variableName = prop.Value.GetXxx();
 *     continue;
 * }
 * ```
 *
 * Properties whose types are not yet supported (returning `null` from
 * `getReadExpression`) are silently skipped. This allows subsequent tasks
 * to incrementally add support for more types (enums, collections,
 * dictionaries) without changing this component.
 *
 * @param props - The component props containing the model type and optional children.
 * @returns JSX element rendering the property matching foreach loop.
 */
export function PropertyMatchingLoop(props: PropertyMatchingLoopProps) {
  const namePolicy = useCSharpNamePolicy();
  const properties = computeMatchableProperties(props.type);

  return (
    <>
      {"\n    foreach (var prop in element.EnumerateObject())"}
      {"\n    {"}
      {properties.map((p) => {
        const serializedName = p.serializedName;
        const varName = namePolicy.getName(p.name, "parameter");
        const readExpr = getReadExpression(p.type, namePolicy);
        if (!readExpr) return null;

        return (
          <>
            {`\n        if (prop.NameEquals("${serializedName}"u8))`}
            {"\n        {"}
            {`\n            ${varName} = ${readExpr};`}
            {"\n            continue;"}
            {"\n        }"}
          </>
        );
      })}
      {props.children}
      {"\n    }"}
    </>
  );
}
