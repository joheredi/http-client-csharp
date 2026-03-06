/**
 * AdditionalPropertiesRead component for C# model deserialization.
 *
 * Generates the catch-all block inside the `foreach (var jsonProperty in element.EnumerateObject())`
 * loop that captures unknown JSON properties into the typed `additionalProperties`
 * dictionary. This block appears after all known property `if (prop.NameEquals(...))`
 * matches as the final statement in the loop body.
 *
 * Unlike {@link AdditionalBinaryDataRead} (which stores raw BinaryData), this
 * component reads values with the correct type based on the model's
 * `additionalProperties` type from TCGC.
 *
 * @example Generated output for float additional properties:
 * ```csharp
 * additionalProperties[jsonProperty.Name] = jsonProperty.Value.GetSingle();
 * ```
 *
 * @example Generated output for BinaryData/unknown additional properties:
 * ```csharp
 * additionalProperties[jsonProperty.Name] = BinaryData.FromString(jsonProperty.Value.GetRawText());
 * ```
 *
 * @module
 */

import { code } from "@alloy-js/core";
import type {
  SdkModelType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { System } from "../../builtins/system.js";
import { SystemCollectionsGeneric } from "../../builtins/system-collections-generic.js";
import {
  ADDITIONAL_PROPERTIES_PARAM_NAME,
  isAdditionalPropertiesBinaryData,
  isAdditionalPropertiesArray,
} from "../../utils/additional-properties.js";
import { unwrapNullableType } from "../../utils/nullable.js";

/**
 * Props for the {@link AdditionalPropertiesRead} component.
 */
export interface AdditionalPropertiesReadProps {
  /** The TCGC SDK model type with additional properties. */
  type: SdkModelType;
}

/**
 * Map of TCGC scalar kinds to their `JsonElement.GetXxx()` method names.
 */
const READ_METHOD_MAP: ReadonlyMap<string, string> = new Map([
  ["string", "GetString()"],
  ["boolean", "GetBoolean()"],
  ["int8", "GetSByte()"],
  ["uint8", "GetByte()"],
  ["int16", "GetInt16()"],
  ["uint16", "GetUInt16()"],
  ["int32", "GetInt32()"],
  ["uint32", "GetUInt32()"],
  ["int64", "GetInt64()"],
  ["uint64", "GetUInt64()"],
  ["float32", "GetSingle()"],
  ["float64", "GetDouble()"],
  ["decimal", "GetDecimal()"],
  ["decimal128", "GetDecimal()"],
  ["integer", "GetInt64()"],
  ["safeint", "GetInt64()"],
  ["numeric", "GetDouble()"],
  ["float", "GetDouble()"],
]);

/**
 * Renders the read expression for a single additional property value.
 *
 * Maps the TCGC additional properties type to the appropriate
 * `JsonElement.GetXxx()` call or model deserialization call.
 *
 * @param type - The TCGC SDK type of the additional properties value.
 * @returns A string or JSX fragment rendering the read expression,
 *   or null if the type requires block-level rendering (e.g., arrays).
 */
function renderValueRead(type: SdkType): ReturnType<typeof code> | string | null {
  const unwrapped = unwrapNullableType(type);

  // BinaryData types (model, array, union, unknown) use raw JSON capture.
  // Check this FIRST since isAdditionalPropertiesBinaryData covers all
  // non-scalar types.
  if (isAdditionalPropertiesBinaryData(type)) {
    return code`${System.BinaryData}.FromString(jsonProperty.Value.GetRawText())`;
  }

  // Scalar types: use the read method map
  const readMethod = READ_METHOD_MAP.get(unwrapped.kind);
  if (readMethod) {
    return `jsonProperty.Value.${readMethod}`;
  }

  // Fallback
  return code`${System.BinaryData}.FromString(jsonProperty.Value.GetRawText())`;
}

/**
 * Generates the typed additional properties capture block for the deserialization
 * property matching loop.
 *
 * This component renders the assignment that stores unknown JSON properties
 * into the typed `additionalProperties` dictionary. Unlike
 * {@link AdditionalBinaryDataRead}, this does not guard with
 * `options.Format != "W"` because typed additional properties are always
 * captured regardless of format.
 *
 * Rendered as children of {@link PropertyMatchingLoop} so it appears after
 * all known property match blocks inside the foreach body.
 *
 * @param props - The component props containing the model type.
 * @returns JSX fragment rendering the additional properties capture block.
 */
export function AdditionalPropertiesRead(props: AdditionalPropertiesReadProps) {
  const param = ADDITIONAL_PROPERTIES_PARAM_NAME;
  const apType = props.type.additionalProperties!;

  // Array types need block-level rendering to create a BinaryData[] from
  // the JSON array elements
  if (isAdditionalPropertiesArray(apType)) {
    return (
      <>
        {"\n        {"}
        {code`\n            ${SystemCollectionsGeneric.List}<${System.BinaryData}> array0 = new ${SystemCollectionsGeneric.List}<${System.BinaryData}>();`}
        {"\n            foreach (var item in jsonProperty.Value.EnumerateArray())"}
        {"\n            {"}
        {code`\n                array0.Add(${System.BinaryData}.FromString(item.GetRawText()));`}
        {"\n            }"}
        {`\n            ${param}[jsonProperty.Name] = array0.ToArray();`}
        {"\n        }"}
      </>
    );
  }

  const valueRead = renderValueRead(apType);

  return (
    <>
      {`\n        ${param}[jsonProperty.Name] = `}
      {valueRead}
      {";"}
    </>
  );
}
