import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System.Text.Json.Serialization namespace.
 *
 * These types control JSON serialization behavior. Referencing these symbols
 * in Alloy JSX components automatically generates the correct
 * `using System.Text.Json.Serialization;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.text.json.serialization
 */
export const SystemTextJsonSerialization = createLibrary(
  "System.Text.Json.Serialization",
  {
    /**
     * Prevents a property from being serialized or deserialized.
     * Applied to the Patch property on dynamic models so the JsonPatch
     * tracking state is not written to JSON output.
     *
     * @example `[JsonIgnore]`
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.text.json.serialization.jsonignoreattribute
     */
    JsonIgnoreAttribute: {
      kind: "class",
      members: {},
    },
  },
);
