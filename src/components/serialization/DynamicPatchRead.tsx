/**
 * Patch-aware unknown property read for dynamic (JSON Merge Patch) models.
 *
 * Generates the catch-all block inside the `foreach (var prop in element.EnumerateObject())`
 * loop that captures unknown JSON properties into the `JsonPatch` instance instead of the
 * `additionalBinaryDataProperties` dictionary used by non-dynamic models.
 *
 * For dynamic models, unknown properties are stored as patch entries via
 * `patch.Set(...)` so they are preserved during JSON merge patch round-trip serialization.
 *
 * @example Generated output (inside foreach loop, after all property matches):
 * ```csharp
 * patch.Set([.. "$."u8, .. Encoding.UTF8.GetBytes(prop.Name)], BinaryData.FromString(prop.Value.GetRawText()));
 * ```
 *
 * @module
 */

/**
 * Generates the patch-aware unknown property capture for dynamic model deserialization.
 *
 * Unlike {@link AdditionalBinaryDataRead} which uses a dictionary and guards with
 * `options.Format != "W"`, this component directly sets the unknown property on the
 * `JsonPatch` instance with no format guard (patch always captures all unknown props).
 *
 * @returns JSX fragment rendering the patch set call.
 */
export function DynamicPatchRead() {
  return (
    <>
      {`\n        patch.Set([.. "$."u8, .. Encoding.UTF8.GetBytes(jsonProperty.Name)], jsonProperty.Value.GetUtf8Bytes());`}
    </>
  );
}
