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

    /**
     * Specifies the converter type to use for a type when serializing
     * or deserializing with System.Text.Json. Applied to model classes
     * that have the `@useSystemTextJsonConverter` decorator (Azure flavor)
     * to register a nested converter class for custom JSON handling.
     *
     * @example `[JsonConverter(typeof(FooPropertiesConverter))]`
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.text.json.serialization.jsonconverterattribute
     */
    JsonConverterAttribute: {
      kind: "class",
      members: {},
    },

    /**
     * Abstract base class for converting objects to and from JSON.
     * The generated `{ModelName}Converter` nested class inherits from
     * `JsonConverter<T>` and overrides `Write` and `Read` methods to
     * delegate to the model's `IJsonModel<T>` implementation.
     *
     * @example `internal partial class FooConverter : JsonConverter<Foo>`
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.text.json.serialization.jsonconverter-1
     */
    JsonConverter: {
      kind: "class",
      members: {},
    },
  },
);
