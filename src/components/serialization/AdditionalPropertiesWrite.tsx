/**
 * AdditionalPropertiesWrite component for C# model serialization files.
 *
 * Generates the serialization block that writes typed additional properties
 * from the `AdditionalProperties` dictionary to JSON during the write path.
 * This block appears at the end of `JsonModelWriteCore`, after all known
 * property writes.
 *
 * Unlike {@link AdditionalBinaryDataWrite} (which writes raw BinaryData with
 * format guards), this component writes strongly-typed values based on the
 * model's `additionalProperties` type from TCGC.
 *
 * @example Generated output for float additional properties:
 * ```csharp
 * foreach (var item in AdditionalProperties)
 * {
 *     writer.WritePropertyName(item.Key);
 *     writer.WriteNumberValue(item.Value);
 * }
 * ```
 *
 * @example Generated output for BinaryData/unknown additional properties:
 * ```csharp
 * foreach (var item in AdditionalProperties)
 * {
 *     writer.WritePropertyName(item.Key);
 *     #if NET6_0_OR_GREATER
 *     writer.WriteRawValue(item.Value);
 *     #else
 *     using (JsonDocument document = JsonDocument.Parse(item.Value))
 *     {
 *         JsonSerializer.Serialize(writer, document.RootElement);
 *     }
 *     #endif
 * }
 * ```
 *
 * @module
 */

import { code } from "@alloy-js/core";
import type {
  SdkModelType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { SystemTextJson } from "../../builtins/system-text-json.js";
import {
  ADDITIONAL_PROPERTIES_PROP_NAME,
  isAdditionalPropertiesBinaryData,
  isAdditionalPropertiesArray,
} from "../../utils/additional-properties.js";
import { getWriteMethodInfo } from "./PropertySerializer.js";

/**
 * Props for the {@link AdditionalPropertiesWrite} component.
 */
export interface AdditionalPropertiesWriteProps {
  /** The TCGC SDK model type with additional properties. */
  type: SdkModelType;
}

/**
 * Renders the write expression for a single additional property value.
 *
 * Maps the TCGC additional properties type to the appropriate
 * `Utf8JsonWriter.WriteXxxValue()` call.
 *
 * @param type - The TCGC SDK type of the additional properties value.
 * @returns JSX fragment rendering the write statement(s).
 */
function renderValueWrite(type: SdkType) {
  // Array types: iterate and write each element as raw BinaryData
  if (isAdditionalPropertiesArray(type)) {
    return (
      <>
        {"\n            writer.WriteStartArray();"}
        {"\n            foreach (var element in item.Value)"}
        {"\n            {"}
        {"\n#if NET6_0_OR_GREATER"}
        {"\n                writer.WriteRawValue(element);"}
        {"\n#else"}
        {"\n                "}
        {code`using (${SystemTextJson.JsonDocument} document = ${SystemTextJson.JsonDocument}.Parse(element))`}
        {"\n                {"}
        {"\n                    "}
        {code`${SystemTextJson.JsonSerializer}.Serialize(writer, document.RootElement);`}
        {"\n                }"}
        {"\n#endif"}
        {"\n            }"}
        {"\n            writer.WriteEndArray();"}
      </>
    );
  }

  // BinaryData types (model, union, unknown) use raw JSON write
  if (isAdditionalPropertiesBinaryData(type)) {
    return (
      <>
        {"\n#if NET6_0_OR_GREATER"}
        {"\n            writer.WriteRawValue(item.Value);"}
        {"\n#else"}
        {"\n            "}
        {code`using (${SystemTextJson.JsonDocument} document = ${SystemTextJson.JsonDocument}.Parse(item.Value))`}
        {"\n            {"}
        {"\n                "}
        {code`${SystemTextJson.JsonSerializer}.Serialize(writer, document.RootElement);`}
        {"\n            }"}
        {"\n#endif"}
      </>
    );
  }

  // Scalar types: use getWriteMethodInfo for the correct writer method
  const writeInfo = getWriteMethodInfo(type);
  if (writeInfo) {
    const value = writeInfo.valueTransform
      ? writeInfo.valueTransform("item.Value")
      : "item.Value";
    const formatArg = writeInfo.formatArg ? `, "${writeInfo.formatArg}"` : "";
    return `\n            writer.${writeInfo.methodName}(${value}${formatArg});`;
  }

  // Fallback: write as raw value
  return "\n            writer.WriteStringValue(item.Value.ToString());";
}

/**
 * Generates the typed additional properties serialization block for `JsonModelWriteCore`.
 *
 * This component renders the `foreach` loop that writes additional properties
 * from the typed `AdditionalProperties` dictionary to the JSON writer. The
 * write method depends on the value type (float → WriteNumberValue, string →
 * WriteStringValue, BinaryData → WriteRawValue, etc.).
 *
 * Only rendered for root models (models without a base class). Derived models
 * inherit the additional properties write from their base class's
 * `JsonModelWriteCore` via the `base.JsonModelWriteCore()` call.
 *
 * @param props - The component props containing the model type.
 * @returns JSX fragment rendering the additional properties write block.
 */
export function AdditionalPropertiesWrite(
  props: AdditionalPropertiesWriteProps,
) {
  const propName = ADDITIONAL_PROPERTIES_PROP_NAME;

  return (
    <>
      {`\n    foreach (var item in ${propName})`}
      {"\n    {"}
      {"\n        writer.WritePropertyName(item.Key);"}
      {renderValueWrite(props.type.additionalProperties!)}
      {"\n    }"}
    </>
  );
}
