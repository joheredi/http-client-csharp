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
 * Properties with types not yet handled (models, enums, collections,
 * dictionaries, bytes) are skipped — those are implemented by subsequent
 * tasks (2.3.5–2.3.10). A children slot after all property matches allows
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
import type {
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
 * Types not in this map (models, enums, collections, dictionaries, bytes,
 * datetime, duration) require specialized deserialization and return `null`
 * from `getReadExpression` — those are handled by subsequent tasks.
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
 * Returns the C# expression to extract a value from `prop.Value` (a
 * `JsonElement`) for the given SDK type.
 *
 * Unwraps nullable and constant type wrappers to find the underlying
 * primitive kind, then maps it to the appropriate `JsonElement.Get{Type}()`
 * method call. URL types are handled specially with `new Uri(prop.Value.GetString())`.
 *
 * Returns `null` for types that need specialized deserialization logic:
 * - **Models** — task 2.3.7 (recursive `DeserializeXxx` call)
 * - **Enums** — task 2.3.8 (conversion via `ToXxx` extension)
 * - **Collections (arrays)** — task 2.3.9 (foreach over array)
 * - **Dictionaries** — task 2.3.10 (foreach over object)
 * - **Bytes** — task 2.3.6 (Base64/Base64URL encoding)
 * - **DateTime** — task 2.3.6 (format-aware deserialization)
 * - **Duration** — task 2.3.6 (encoding-aware deserialization)
 * - **plainDate/plainTime** — task 2.3.6 (format specifiers)
 *
 * @param type - An SDK type from TCGC.
 * @returns The C# expression string, or `null` if the type is not yet supported.
 */
export function getReadExpression(type: SdkType): string | null {
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

  // Primitive types — direct JsonElement getter
  const method = READ_METHOD_MAP[kind];
  if (method) {
    return `prop.Value.${method}()`;
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
 * to incrementally add support for more types without changing this component.
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
        const readExpr = getReadExpression(p.type);
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
