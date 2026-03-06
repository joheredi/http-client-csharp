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
 * Properties with types not yet handled are skipped —
 * those are implemented by subsequent tasks. A children slot
 * after all property matches allows task 2.3.12 to add the additional
 * binary data catch-all.
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
import { code } from "@alloy-js/core";
import type { NamePolicy } from "@alloy-js/core";
import type {
  SdkArrayType,
  SdkBuiltInType,
  SdkDateTimeType,
  SdkDictionaryType,
  SdkDurationType,
  SdkEnumType,
  SdkEnumValueType,
  SdkModelPropertyType,
  SdkModelType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import {
  isCollectionType,
  isPropertyNullable,
  unwrapNullableType,
} from "../../utils/nullable.js";
import {
  resolvePropertyName,
  collectPropertyCSharpNames,
} from "../../utils/property.js";
import { isDynamicModel } from "../models/DynamicModel.js";
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
  if (model.baseModel) {
    const baseProps = computeMatchableProperties(model.baseModel);
    const ownProps = model.properties.filter(
      (p) => !isBaseDiscriminatorOverride(p),
    );
    return [...baseProps, ...ownProps];
  }

  return [...model.properties];
}

/**
 * Represents a matchable property paired with its declaring model name.
 * Used for CS0542 collision detection: a property name is only renamed
 * when it matches the name of its declaring model, not a derived model.
 */
interface MatchablePropertyInfo {
  property: SdkModelPropertyType;
  modelName: string;
}

/**
 * Computes matchable properties with their declaring model names.
 * Each property is paired with the name of the model that declares it,
 * which is needed for accurate CS0542 property name collision detection.
 */
function computeMatchablePropertyInfos(
  model: SdkModelType,
): MatchablePropertyInfo[] {
  if (model.baseModel) {
    const baseInfos = computeMatchablePropertyInfos(model.baseModel);
    const ownProps = model.properties.filter(
      (p) => !isBaseDiscriminatorOverride(p),
    );
    return [
      ...baseInfos,
      ...ownProps.map((p) => ({ property: p, modelName: model.name })),
    ];
  }

  return model.properties.map((p) => ({ property: p, modelName: model.name }));
}

/**
 * Describes how a property should handle `JsonValueKind.Null` during
 * deserialization. Used by the property matching loop to generate the
 * appropriate null-handling code block before the value extraction.
 *
 * - `"assign-null"` — nullable non-collection: `propVar = null; continue;`
 * - `"skip"` — optional collection: `continue;` (leave tracking collection as-is)
 * - `"empty-collection"` — required nullable collection:
 *   `propVar = new ChangeTrackingList<T>(); continue;`
 */
export type NullCheckBehavior = "assign-null" | "skip" | "empty-collection";

/**
 * Determines the null-check behavior for a property during deserialization.
 *
 * Matches the legacy emitter's `DeserializationPropertyNullCheckStatement` in
 * `MrwSerializationTypeDefinition.cs` (lines 1449–1491):
 *
 * 1. **Nullable non-collection** → `"assign-null"`: assign null and continue.
 * 2. **Optional collection** → `"skip"`: just continue (leave ChangeTracking default).
 * 3. **Required but explicitly nullable collection** → `"empty-collection"`:
 *    assign a new ChangeTracking instance to represent "was null on the wire".
 * 4. **Required non-nullable** (scalar or collection) → `null`: no null check.
 *
 * @param property - An SDK model property from TCGC.
 * @returns The null-check behavior, or `null` if no check is needed.
 */
export function getNullCheckBehavior(
  property: SdkModelPropertyType,
): NullCheckBehavior | null {
  const isCollection = isCollectionType(property.type);

  if (!isCollection) {
    // Non-collection: null check only when the property is nullable
    // (optional or explicitly SdkNullableType-wrapped).
    if (isPropertyNullable(property)) {
      return "assign-null";
    }
    return null;
  }

  // Collection properties
  if (property.optional) {
    // Optional collection: skip null (leave ChangeTracking default)
    return "skip";
  }

  if (property.type.kind === "nullable") {
    // Required but explicitly nullable collection: empty tracking instance
    return "empty-collection";
  }

  // Required non-nullable collection: no null check
  return null;
}

/**
 * Renders the property-level null-check block inside a `prop.NameEquals(...)` if.
 *
 * The generated block checks `prop.Value.ValueKind == JsonValueKind.Null` and
 * takes action based on the {@link NullCheckBehavior}:
 *
 * - `"assign-null"` → `varName = null; continue;`
 * - `"skip"` → `continue;`
 * - `"empty-collection"` → `varName = new ChangeTrackingList<T>(); continue;`
 *   (or `ChangeTrackingDictionary<string, T>()` for dict properties).
 *
 * @param behavior - The null-check behavior determined by {@link getNullCheckBehavior}.
 * @param varName - The local variable name for the property.
 * @param property - The SDK model property (used for collection element type in empty-collection).
 * @returns JSX fragment for the null-check block.
 */
function renderPropertyNullCheck(
  behavior: NullCheckBehavior,
  varName: string,
  property: SdkModelPropertyType,
): Children {
  const nullCondition =
    "\n            if (jsonProperty.Value.ValueKind == JsonValueKind.Null)";
  const openBrace = "\n            {";
  const closeBrace = "\n            }";

  if (behavior === "assign-null") {
    return (
      <>
        {nullCondition}
        {openBrace}
        {`\n                ${varName} = null;`}
        {"\n                continue;"}
        {closeBrace}
      </>
    );
  }

  if (behavior === "skip") {
    return (
      <>
        {nullCondition}
        {openBrace}
        {"\n                continue;"}
        {closeBrace}
      </>
    );
  }

  // "empty-collection": required nullable collection → new ChangeTracking instance
  const unwrapped = unwrapNullableType(property.type);
  if (unwrapped.kind === "array") {
    const elementType = unwrapNullableType(
      (unwrapped as SdkArrayType).valueType,
    );
    return (
      <>
        {nullCondition}
        {openBrace}
        {`\n                ${varName} = new ChangeTrackingList<`}
        <TypeExpression type={elementType.__raw!} />
        {">();"}
        {"\n                continue;"}
        {closeBrace}
      </>
    );
  }

  // Dictionary collection
  const valueType = unwrapNullableType(
    (unwrapped as SdkDictionaryType).valueType,
  );
  return (
    <>
      {nullCondition}
      {openBrace}
      {`\n                ${varName} = new ChangeTrackingDictionary<string, `}
      <TypeExpression type={valueType.__raw!} />
      {">();"}
      {"\n                continue;"}
      {closeBrace}
    </>
  );
}

/**
 * Checks whether a collection's item/value type requires null checks
 * during element-level deserialization.
 *
 * Returns `true` when the raw (pre-unwrap) type is `SdkNullableType`,
 * meaning the TypeSpec definition explicitly allows null items
 * (e.g., `(string | null)[]`).
 *
 * @param rawItemType - The collection's valueType before unwrapping nullable.
 * @returns `true` if item-level null checks should be generated.
 */
function itemNeedsNullCheck(rawItemType: SdkType): boolean {
  return rawItemType.kind === "nullable";
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
 * Types not in this map (collections) require
 * specialized deserialization and return `null` from `getReadExpression` —
 * collections are handled by `renderArrayDeserialization`, and dictionaries
 * by `renderDictionaryDeserialization`. Model types are handled
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
 * @param accessor - The C# expression for the JsonElement (e.g., `"prop.Value"` or `"item"`).
 * @returns The C# expression string for reading the DateTime value.
 */
function getDateTimeReadExpression(
  type: SdkDateTimeType,
  accessor: string,
): string {
  if (type.encode === "unixTimestamp") {
    return `DateTimeOffset.FromUnixTimeSeconds(${accessor}.GetInt64())`;
  }
  const format = type.encode === "rfc7231" ? "R" : "O";
  return `${accessor}.GetDateTimeOffset("${format}")`;
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
 * @param accessor - The C# expression for the JsonElement (e.g., `"prop.Value"` or `"item"`).
 * @returns The C# expression string for reading the Duration value.
 */
function getDurationReadExpression(
  type: SdkDurationType,
  accessor: string,
): string {
  if (type.encode === "seconds") {
    return getDurationNumericReadExpression(type, "FromSeconds", accessor);
  }
  if (type.encode === "milliseconds") {
    return getDurationNumericReadExpression(type, "FromMilliseconds", accessor);
  }
  // ISO8601 is the default encoding — uses custom GetTimeSpan extension method.
  return `${accessor}.GetTimeSpan("P")`;
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
 * @param accessor - The C# expression for the JsonElement (e.g., `"prop.Value"` or `"item"`).
 * @returns The C# expression string.
 */
function getDurationNumericReadExpression(
  type: SdkDurationType,
  method: string,
  accessor: string,
): string {
  const getter = type.wireType.kind === "int32" ? "GetInt32" : "GetDouble";
  return `TimeSpan.${method}(${accessor}.${getter}())`;
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
 * @param accessor - The C# expression for the JsonElement (e.g., `"prop.Value"` or `"item"`).
 * @returns The C# expression string for reading the bytes value.
 */
function getBytesReadExpression(
  type: SdkBuiltInType,
  accessor: string,
): string {
  if (type.encode === "base64") {
    return `BinaryData.FromBytes(${accessor}.GetBytesFromBase64("D"))`;
  }
  if (type.encode === "base64url") {
    return `BinaryData.FromBytes(${accessor}.GetBytesFromBase64("U"))`;
  }
  // Default encoding — raw JSON text to BinaryData
  return `BinaryData.FromString(${accessor}.GetRawText())`;
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
 * @param accessor - The C# expression for the JsonElement (e.g., `"prop.Value"` or `"item"`).
 * @returns The C# expression string, or `null` for unsupported backing types.
 */
function getEnumReadExpression(
  enumType: SdkEnumType,
  namePolicy: NamePolicy<string>,
  accessor: string,
): string | null {
  const valueTypeKind = enumType.valueType.kind;
  const getterMethod = READ_METHOD_MAP[valueTypeKind];
  if (!getterMethod) return null;

  const getter = `${accessor}.${getterMethod}()`;
  const enumName = namePolicy.getName(enumType.name, "enum");

  if (enumType.isFixed) {
    // Fixed enums: {accessor}.GetXxx().To{EnumName}()
    return `${getter}.To${enumName}()`;
  }

  // Extensible enums: new {EnumName}({accessor}.GetXxx())
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
 * - **Collections (arrays)** — handled by `renderArrayDeserialization`
 * - **Dictionaries** — handled by `renderDictionaryDeserialization`
 *
 * @param type - An SDK type from TCGC.
 * @param namePolicy - Optional C# name policy for resolving model/enum class names.
 *   Required for model and enum type deserialization.
 * @param accessor - The C# expression for the JsonElement (e.g., `"prop.Value"` or `"item"`).
 *   Defaults to `"prop.Value"` for the standard property matching loop context.
 * @param enclosingPropertyNames - Optional set of PascalCase property names from the
 *   enclosing model and its ancestors. When provided and a model type name collides
 *   with a property name, the type reference is namespace-qualified to avoid CS0120
 *   errors in static deserialization methods.
 * @returns The C# expression string, or `null` if the type is not yet supported.
 */
export function getReadExpression(
  type: SdkType,
  namePolicy?: NamePolicy<string>,
  accessor: string = "jsonProperty.Value",
  enclosingPropertyNames?: Set<string>,
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
    return `new Uri(${accessor}.GetString())`;
  }

  // DateTime types — encoding determines the format specifier or Unix strategy.
  if (kind === "utcDateTime" || kind === "offsetDateTime") {
    return getDateTimeReadExpression(unwrapped as SdkDateTimeType, accessor);
  }

  // Duration types — encoding determines ISO8601 vs numeric strategy.
  if (kind === "duration") {
    return getDurationReadExpression(unwrapped as SdkDurationType, accessor);
  }

  // Bytes type — encoding determines Base64 vs Base64URL vs raw.
  if (kind === "bytes") {
    return getBytesReadExpression(unwrapped as SdkBuiltInType, accessor);
  }

  // Unknown types — BinaryData from raw JSON text.
  if (kind === "unknown") {
    return `BinaryData.FromString(${accessor}.GetRawText())`;
  }

  // Plain date/time — fixed ISO format specifiers using custom extension methods.
  if (kind === "plainDate") {
    return `${accessor}.GetDateTimeOffset("D")`;
  }
  if (kind === "plainTime") {
    return `${accessor}.GetTimeSpan("T")`;
  }

  // Primitive types — direct JsonElement getter
  const method = READ_METHOD_MAP[kind];
  if (method) {
    return `${accessor}.${method}()`;
  }

  // Enum types — fixed enums use extension methods, extensible enums use constructors.
  if (kind === "enum" && namePolicy) {
    return getEnumReadExpression(
      unwrapped as SdkEnumType,
      namePolicy,
      accessor,
    );
  }

  // Enum value literals (e.g., ExtendedEnum.EnumValue2) — deserialize using
  // the parent enum type's deserialization method.
  if (kind === "enumvalue" && namePolicy) {
    return getEnumReadExpression(
      (unwrapped as SdkEnumValueType).enumType,
      namePolicy,
      accessor,
    );
  }

  // Model types — call static DeserializeXxx method on the model class.
  // The pattern is: ModelName.DeserializeModelName({accessor}, options)
  // For dynamic models, pass the raw UTF-8 bytes as the BinaryData parameter:
  // ModelName.DeserializeModelName({accessor}, {accessor}.GetUtf8Bytes(), options)
  // This delegates deserialization to the nested model's own static method.
  //
  // When a property name on the enclosing model matches the target model type name,
  // the type reference must be namespace-qualified to prevent CS0120 errors in
  // static methods (C# resolves the unqualified name to the instance property).
  if (kind === "model" && namePolicy) {
    const modelType = unwrapped as SdkModelType;
    const modelName = namePolicy.getName(modelType.name, "class");
    const typeRef = enclosingPropertyNames?.has(modelName)
      ? `${modelType.namespace}.${modelName}`
      : modelName;
    if (isDynamicModel(modelType)) {
      return `${typeRef}.Deserialize${modelName}(${accessor}, ${accessor}.GetUtf8Bytes(), options)`;
    }
    return `${typeRef}.Deserialize${modelName}(${accessor}, options)`;
  }

  // Types handled by subsequent tasks return null
  return null;
}

/**
 * Returns the variable name for the local list at a given nesting depth.
 *
 * Follows the legacy emitter's naming convention:
 * - depth 0: `"array"` (top-level collection)
 * - depth 1: `"array0"` (first nested collection)
 * - depth 2: `"array1"` (second nested collection)
 *
 * @param depth - The current nesting depth (0-based).
 * @returns The variable name string.
 */
function getArrayVarName(depth: number): string {
  return depth === 0 ? "array0" : `array${depth}`;
}

/**
 * Returns the loop variable name for the foreach at a given nesting depth.
 *
 * Follows the legacy emitter's naming convention:
 * - depth 0: `"item"` (top-level foreach)
 * - depth 1: `"item0"` (first nested foreach)
 * - depth 2: `"item1"` (second nested foreach)
 *
 * @param depth - The current nesting depth (0-based).
 * @returns The loop variable name string.
 */
function getItemVarName(depth: number): string {
  return depth === 0 ? "item" : `item${depth - 1}`;
}

/**
 * Renders the array deserialization block for a collection property or
 * nested collection.
 *
 * Generates the pattern:
 * ```csharp
 * List<T> array = new List<T>();
 * foreach (var item in {accessor}.EnumerateArray())
 * {
 *     array.Add({itemReadExpr});
 * }
 * ```
 *
 * Handles nested collections recursively — a `List<List<string>>` produces
 * nested `List` declarations and `foreach` loops. Variable names use depth
 * suffixes (`array`, `array0`, `array1`; `item`, `item0`, `item1`) matching
 * the legacy emitter's naming convention.
 *
 * Uses `TypeExpression` to render the correct C# type name for the `List<T>`
 * generic parameter, ensuring proper `using` directives are generated.
 *
 * @param arrayType - The TCGC `SdkArrayType` whose items are being deserialized.
 * @param accessor - The C# expression for the JsonElement to enumerate
 *   (e.g., `"prop.Value"` for top-level, `"item"` for nested).
 * @param indent - Whitespace indentation prefix for the generated block.
 * @param namePolicy - C# name policy for resolving type names.
 * @param depth - Current nesting depth (0 for top-level collection).
 * @param enclosingPropertyNames - Optional set of PascalCase property names for
 *   CS0120 collision detection (see {@link getReadExpression}).
 * @returns JSX element with the array deserialization block, or `null` if
 *   the item type is not yet supported.
 */
function renderArrayDeserialization(
  arrayType: SdkArrayType,
  accessor: string,
  indent: string,
  namePolicy: NamePolicy<string>,
  depth: number = 0,
  enclosingPropertyNames?: Set<string>,
): Children | null {
  const itemType = arrayType.valueType;
  const unwrappedItemType = unwrapNullableType(itemType);
  const innerIndent = indent + "    ";
  const arrayVar = getArrayVarName(depth);
  const itemVar = getItemVarName(depth);

  // Determine the foreach body based on item type
  let foreachBody: Children;

  if (unwrappedItemType.kind === "array") {
    // Nested array — recursive: build inner list then add to outer
    const innerBlock = renderArrayDeserialization(
      unwrappedItemType as SdkArrayType,
      itemVar,
      innerIndent,
      namePolicy,
      depth + 1,
      enclosingPropertyNames,
    );
    if (!innerBlock) return null;
    const innerArrayVar = getArrayVarName(depth + 1);
    foreachBody = (
      <>
        {innerBlock}
        {`\n${innerIndent}${arrayVar}.Add(${innerArrayVar}.ToArray());`}
      </>
    );
  } else if (unwrappedItemType.kind === "dict") {
    // Dictionary inside array — delegate to dictionary deserialization
    const dictBlock = renderDictionaryDeserialization(
      unwrappedItemType as SdkDictionaryType,
      itemVar,
      innerIndent,
      namePolicy,
      0,
    );
    if (!dictBlock) return null;
    foreachBody = (
      <>
        {dictBlock}
        {`\n${innerIndent}${arrayVar}.Add(dictionary);`}
      </>
    );
  } else {
    // Leaf type — use getReadExpression for the item value
    const itemReadExpr = getReadExpression(
      itemType,
      namePolicy,
      itemVar,
      enclosingPropertyNames,
    );
    if (!itemReadExpr) return null;

    if (itemNeedsNullCheck(itemType)) {
      // Nullable items: check for JsonValueKind.Null before extracting
      const deeperIndent = innerIndent + "    ";
      foreachBody = (
        <>
          {`\n${innerIndent}if (${itemVar}.ValueKind == JsonValueKind.Null)`}
          {`\n${innerIndent}{`}
          {`\n${deeperIndent}${arrayVar}.Add(null);`}
          {`\n${innerIndent}}`}
          {`\n${innerIndent}else`}
          {`\n${innerIndent}{`}
          {`\n${deeperIndent}${arrayVar}.Add(${itemReadExpr});`}
          {`\n${innerIndent}}`}
        </>
      );
    } else {
      foreachBody = <>{`\n${innerIndent}${arrayVar}.Add(${itemReadExpr});`}</>;
    }
  }

  return (
    <>
      {code`\n${indent}${SystemCollectionsGeneric.List}<`}
      <TypeExpression type={unwrappedItemType.__raw!} />
      {code`> ${arrayVar} = new ${SystemCollectionsGeneric.List}<`}
      <TypeExpression type={unwrappedItemType.__raw!} />
      {`>();`}
      {`\n${indent}foreach (var ${itemVar} in ${accessor}.EnumerateArray())`}
      {`\n${indent}{`}
      {foreachBody}
      {`\n${indent}}`}
    </>
  );
}

/**
 * Returns the variable name for the local dictionary at a given nesting depth.
 *
 * Follows the legacy emitter's naming convention:
 * - depth 0: `"dictionary"` (top-level dictionary)
 * - depth 1: `"dictionary0"` (first nested dictionary)
 * - depth 2: `"dictionary1"` (second nested dictionary)
 *
 * @param depth - The current nesting depth (0-based).
 * @returns The variable name string.
 */
function getDictionaryVarName(depth: number): string {
  return depth === 0 ? "dictionary0" : `dictionary${depth}`;
}

/**
 * Returns the loop variable name for the dictionary foreach at a given nesting depth.
 *
 * Uses `prop0`, `prop1`, etc. instead of `prop` because the outer property
 * matching loop already uses `prop` as its iteration variable. Starting at
 * `prop0` avoids variable shadowing.
 *
 * @param depth - The current nesting depth (0-based).
 * @returns The loop variable name string.
 */
function getDictionaryPropVarName(depth: number): string {
  return `prop${depth}`;
}

/**
 * Renders the dictionary deserialization block for a `Record<string, T>` property.
 *
 * Generates the pattern:
 * ```csharp
 * Dictionary<string, T> dictionary = new Dictionary<string, T>();
 * foreach (var prop0 in {accessor}.EnumerateObject())
 * {
 *     dictionary.Add(prop0.Name, {valueReadExpr});
 * }
 * ```
 *
 * Handles nested dictionaries recursively — a `Dictionary<string, Dictionary<string, int>>`
 * produces nested `Dictionary` declarations and `foreach` loops. Variable names use
 * depth suffixes (`dictionary`, `dictionary0`; `prop0`, `prop1`) matching the legacy
 * emitter's naming convention.
 *
 * Also handles dictionaries containing arrays by delegating to `renderArrayDeserialization`.
 *
 * @param dictType - The TCGC `SdkDictionaryType` whose values are being deserialized.
 * @param accessor - The C# expression for the JsonElement to enumerate
 *   (e.g., `"prop.Value"` for top-level, `"prop0.Value"` for nested).
 * @param indent - Whitespace indentation prefix for the generated block.
 * @param namePolicy - C# name policy for resolving type names.
 * @param depth - Current nesting depth (0 for top-level dictionary).
 * @param enclosingPropertyNames - Optional set of PascalCase property names for
 *   CS0120 collision detection (see {@link getReadExpression}).
 * @returns JSX element with the dictionary deserialization block, or `null` if
 *   the value type is not yet supported.
 */
function renderDictionaryDeserialization(
  dictType: SdkDictionaryType,
  accessor: string,
  indent: string,
  namePolicy: NamePolicy<string>,
  depth: number = 0,
  enclosingPropertyNames?: Set<string>,
): Children | null {
  const valueType = dictType.valueType;
  const unwrappedValueType = unwrapNullableType(valueType);
  const innerIndent = indent + "    ";
  const dictVar = getDictionaryVarName(depth);
  const propVar = getDictionaryPropVarName(depth);

  let foreachBody: Children;

  if (unwrappedValueType.kind === "dict") {
    // Nested dictionary — recursive: build inner dict then add to outer
    const innerBlock = renderDictionaryDeserialization(
      unwrappedValueType as SdkDictionaryType,
      `${propVar}.Value`,
      innerIndent,
      namePolicy,
      depth + 1,
      enclosingPropertyNames,
    );
    if (!innerBlock) return null;
    const innerDictVar = getDictionaryVarName(depth + 1);
    foreachBody = (
      <>
        {innerBlock}
        {`\n${innerIndent}${dictVar}.Add(${propVar}.Name, ${innerDictVar});`}
      </>
    );
  } else if (unwrappedValueType.kind === "array") {
    // Array inside dictionary — delegate to array deserialization
    const arrayBlock = renderArrayDeserialization(
      unwrappedValueType as SdkArrayType,
      `${propVar}.Value`,
      innerIndent,
      namePolicy,
      0,
      enclosingPropertyNames,
    );
    if (!arrayBlock) return null;
    foreachBody = (
      <>
        {arrayBlock}
        {`\n${innerIndent}${dictVar}.Add(${propVar}.Name, ${getArrayVarName(0)}.ToArray());`}
      </>
    );
  } else {
    // Leaf type — use getReadExpression for the value
    const valueReadExpr = getReadExpression(
      valueType,
      namePolicy,
      `${propVar}.Value`,
      enclosingPropertyNames,
    );
    if (!valueReadExpr) return null;

    if (itemNeedsNullCheck(valueType)) {
      // Nullable dict values: check for JsonValueKind.Null before extracting
      const deeperIndent = innerIndent + "    ";
      foreachBody = (
        <>
          {`\n${innerIndent}if (${propVar}.Value.ValueKind == JsonValueKind.Null)`}
          {`\n${innerIndent}{`}
          {`\n${deeperIndent}${dictVar}.Add(${propVar}.Name, null);`}
          {`\n${innerIndent}}`}
          {`\n${innerIndent}else`}
          {`\n${innerIndent}{`}
          {`\n${deeperIndent}${dictVar}.Add(${propVar}.Name, ${valueReadExpr});`}
          {`\n${innerIndent}}`}
        </>
      );
    } else {
      foreachBody = (
        <>
          {`\n${innerIndent}${dictVar}.Add(${propVar}.Name, ${valueReadExpr});`}
        </>
      );
    }
  }

  return (
    <>
      {code`\n${indent}${SystemCollectionsGeneric.Dictionary}<string, `}
      <TypeExpression type={unwrappedValueType.__raw!} />
      {code`> ${dictVar} = new ${SystemCollectionsGeneric.Dictionary}<string, `}
      <TypeExpression type={unwrappedValueType.__raw!} />
      {`>();`}
      {`\n${indent}foreach (var ${propVar} in ${accessor}.EnumerateObject())`}
      {`\n${indent}{`}
      {foreachBody}
      {`\n${indent}}`}
    </>
  );
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
 *     if (prop.Value.ValueKind == JsonValueKind.Null)
 *     {
 *         variableName = null;
 *         continue;
 *     }
 *     variableName = prop.Value.GetXxx();
 *     continue;
 * }
 * ```
 *
 * Null handling varies by property kind (see {@link getNullCheckBehavior}):
 * - Nullable non-collections: assign null and continue
 * - Optional collections: just continue (leave ChangeTracking default)
 * - Required nullable collections: assign new ChangeTracking instance
 * - Required non-nullable: no null check
 *
 * Properties whose types are not yet supported (returning `null` from
 * `getReadExpression` and not array/dict types) are silently skipped. This
 * allows subsequent tasks to incrementally add support for more types
 * without changing this component.
 *
 * @param props - The component props containing the model type and optional children.
 * @returns JSX element rendering the property matching foreach loop.
 */
export function PropertyMatchingLoop(props: PropertyMatchingLoopProps) {
  const namePolicy = useCSharpNamePolicy();
  const propertyInfos = computeMatchablePropertyInfos(props.type);
  // Collect all PascalCase property names from the model hierarchy for CS0120
  // collision detection. Passed to getReadExpression so that model type references
  // that collide with property names are namespace-qualified.
  const enclosingPropertyNames = collectPropertyCSharpNames(
    props.type,
    namePolicy,
  );

  return (
    <>
      {"\n    foreach (var jsonProperty in element.EnumerateObject())"}
      {"\n    {"}
      {propertyInfos.map(({ property: p, modelName }) => {
        const serializedName = p.serializedName;
        const varName = namePolicy.getName(
          resolvePropertyName(p.name, modelName),
          "parameter",
        );
        const unwrapped = unwrapNullableType(p.type);
        const nullBehavior = getNullCheckBehavior(p);

        // Array types need a multi-line block with List<T> + foreach
        if (unwrapped.kind === "array") {
          const arrayBlock = renderArrayDeserialization(
            unwrapped as SdkArrayType,
            "jsonProperty.Value",
            "            ",
            namePolicy,
            0,
            enclosingPropertyNames,
          );
          if (!arrayBlock) return null;
          return (
            <>
              {`\n        if (jsonProperty.NameEquals("${serializedName}"u8))`}
              {"\n        {"}
              {nullBehavior !== null &&
                renderPropertyNullCheck(nullBehavior, varName, p)}
              {arrayBlock}
              {`\n            ${varName} = array0.ToArray();`}
              {"\n            continue;"}
              {"\n        }"}
            </>
          );
        }

        // Dictionary types need a multi-line block with Dictionary<string, T> + foreach
        if (unwrapped.kind === "dict") {
          const dictBlock = renderDictionaryDeserialization(
            unwrapped as SdkDictionaryType,
            "jsonProperty.Value",
            "            ",
            namePolicy,
            0,
            enclosingPropertyNames,
          );
          if (!dictBlock) return null;
          return (
            <>
              {`\n        if (jsonProperty.NameEquals("${serializedName}"u8))`}
              {"\n        {"}
              {nullBehavior !== null &&
                renderPropertyNullCheck(nullBehavior, varName, p)}
              {dictBlock}
              {`\n            ${varName} = dictionary0;`}
              {"\n            continue;"}
              {"\n        }"}
            </>
          );
        }

        // Simple expression-based deserialization for scalar types
        const readExpr = getReadExpression(
          p.type,
          namePolicy,
          undefined,
          enclosingPropertyNames,
        );
        if (!readExpr) return null;

        return (
          <>
            {`\n        if (jsonProperty.NameEquals("${serializedName}"u8))`}
            {"\n        {"}
            {nullBehavior !== null &&
              renderPropertyNullCheck(nullBehavior, varName, p)}
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
