/**
 * AdditionalBinaryDataRead component for C# model deserialization.
 *
 * Generates the catch-all block inside the `foreach (var prop in element.EnumerateObject())`
 * loop that captures unknown JSON properties into `additionalBinaryDataProperties`.
 * This block appears after all known property `if (prop.NameEquals(...))` matches as
 * the final statement in the loop body.
 *
 * The generated code:
 * 1. Guards with `options.Format != "W"` — additional binary data is only captured
 *    during round-trip deserialization, never in wire format.
 * 2. Calls `additionalBinaryDataProperties.Add(prop.Name, BinaryData.FromString(prop.Value.GetRawText()))`
 *    to store the unknown property as raw JSON bytes, preserving fidelity for re-serialization.
 *
 * This is the read-side counterpart to {@link AdditionalBinaryDataWrite}, which writes
 * the captured properties back during serialization.
 *
 * @example Generated output (inside foreach loop, after all property matches):
 * ```csharp
 * if (options.Format != "W")
 * {
 *     additionalBinaryDataProperties.Add(prop.Name, BinaryData.FromString(prop.Value.GetRawText()));
 * }
 * ```
 *
 * @module
 */

import { code } from "@alloy-js/core";
import { System } from "../../builtins/system.js";
import { ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME } from "../models/ModelConstructors.js";

/**
 * Generates the additional binary data capture block for the deserialization
 * property matching loop.
 *
 * This component renders the `if (options.Format != "W")` guard and the
 * `additionalBinaryDataProperties.Add(...)` call that stores unknown JSON
 * properties as `BinaryData` for round-trip fidelity.
 *
 * Rendered as children of {@link PropertyMatchingLoop} so it appears after
 * all known property match blocks inside the foreach body.
 *
 * @returns JSX fragment rendering the additional binary data capture block.
 */
export function AdditionalBinaryDataRead() {
  const param = ADDITIONAL_BINARY_DATA_PROPS_PARAM_NAME;

  return (
    <>
      {`\n        if (options.Format != "W")`}
      {"\n        {"}
      {code`\n            ${param}.Add(jsonProperty.Name, ${System.BinaryData}.FromString(jsonProperty.Value.GetRawText()));`}
      {"\n        }"}
    </>
  );
}
