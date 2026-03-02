/**
 * AdditionalBinaryDataWrite component for C# model serialization files.
 *
 * Generates the serialization block that writes unknown JSON properties stored in
 * `_additionalBinaryDataProperties` back to JSON during the write path. This block
 * appears at the end of `JsonModelWriteCore`, after all known property writes.
 *
 * The generated code:
 * 1. Guards with `options.Format != "W"` — additional binary data is never written
 *    in wire format ("W"), only in the round-trip format.
 * 2. Null-checks `_additionalBinaryDataProperties` — the field may be null if no
 *    unknown properties were captured during deserialization.
 * 3. Iterates the dictionary and writes each key-value pair using a preprocessor
 *    conditional: `WriteRawValue` on .NET 6+ (efficient), or `JsonDocument.Parse`
 *    fallback on older frameworks.
 *
 * Only rendered for root models (models without a base class). Derived models inherit
 * the `_additionalBinaryDataProperties` field from their root, and the base class's
 * `JsonModelWriteCore` handles writing it via the `base.JsonModelWriteCore()` call.
 *
 * @example Generated output (inside JsonModelWriteCore, after property writes):
 * ```csharp
 * if (((options.Format != "W") && (_additionalBinaryDataProperties != null)))
 * {
 *     foreach (var item in _additionalBinaryDataProperties)
 *     {
 *         writer.WritePropertyName(item.Key);
 *         #if NET6_0_OR_GREATER
 *         writer.WriteRawValue(item.Value);
 *         #else
 *         using (JsonDocument document = JsonDocument.Parse(item.Value))
 *         {
 *             JsonSerializer.Serialize(writer, document.RootElement);
 *         }
 *         #endif
 *     }
 * }
 * ```
 *
 * @module
 */

import { code } from "@alloy-js/core";
import { SystemTextJson } from "../../builtins/system-text-json.js";
import { ADDITIONAL_BINARY_DATA_PROPS_FIELD_NAME } from "../models/ModelConstructors.js";

/**
 * Generates the additional binary data serialization block for `JsonModelWriteCore`.
 *
 * This component renders the `if`/`foreach` loop that writes unknown properties
 * from `_additionalBinaryDataProperties` back to the JSON writer. The loop uses
 * a `#if NET6_0_OR_GREATER` preprocessor directive to select between:
 * - `WriteRawValue` (modern .NET — direct raw JSON write, most efficient)
 * - `JsonDocument.Parse` + `JsonSerializer.Serialize` (older frameworks fallback)
 *
 * The guard condition `options.Format != "W"` ensures additional binary data is
 * only written during round-trip serialization, not wire format serialization.
 *
 * @returns JSX fragment rendering the additional binary data write block.
 */
export function AdditionalBinaryDataWrite() {
  const field = ADDITIONAL_BINARY_DATA_PROPS_FIELD_NAME;

  return (
    <>
      {`\n    if (((options.Format != "W") && (${field} != null)))`}
      {"\n    {"}
      {`\n        foreach (var item in ${field})`}
      {"\n        {"}
      {"\n            writer.WritePropertyName(item.Key);"}
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
      {"\n        }"}
      {"\n    }"}
    </>
  );
}
