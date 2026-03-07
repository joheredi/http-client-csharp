import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System.Text.Json namespace.
 *
 * These are JSON serialization types from the .NET BCL used by generated
 * model serialization code. Referencing these symbols in Alloy JSX components
 * automatically generates the correct `using System.Text.Json;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.text.json
 */
export const SystemTextJson = createLibrary("System.Text.Json", {
  /**
   * Provides a high-performance API for forward-only, read-only access to
   * UTF-8 encoded JSON text. Used as the reader parameter in IJsonModel.Create
   * and JsonModelCreateCore methods. Passed by ref since it is a mutable struct.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.text.json.utf8jsonreader
   */
  Utf8JsonReader: {
    kind: "class",
    members: {},
  },

  /**
   * Provides a high-performance API for forward-only, non-cached writing of
   * UTF-8 encoded JSON text. Used as the writer parameter in JsonModelWriteCore
   * and IJsonModel.Write methods.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.text.json.utf8jsonwriter
   */
  Utf8JsonWriter: {
    kind: "class",
    members: {
      /** Writes the beginning of a JSON object. */
      WriteStartObject: { kind: "method", methodKind: "ordinary" },
      /** Writes the end of a JSON object. */
      WriteEndObject: { kind: "method", methodKind: "ordinary" },
      /** Writes a property name as a UTF-8 string. */
      WritePropertyName: { kind: "method", methodKind: "ordinary" },
      /** Writes a string value. */
      WriteStringValue: { kind: "method", methodKind: "ordinary" },
      /** Writes a boolean value. */
      WriteBooleanValue: { kind: "method", methodKind: "ordinary" },
      /** Writes a numeric value (int). */
      WriteNumberValue: { kind: "method", methodKind: "ordinary" },
      /** Writes a null value. */
      WriteNullValue: { kind: "method", methodKind: "ordinary" },
      /** Writes a pre-formatted JSON value. */
      WriteRawValue: { kind: "method", methodKind: "ordinary" },
    },
  },

  /**
   * Represents a single JSON value within a JSON document.
   * Used as the input parameter for Deserialize methods.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.text.json.jsonelement
   */
  JsonElement: {
    kind: "class",
    members: {},
  },

  /**
   * Represents a parsed JSON document. Used in deserialization code
   * for the NET Framework fallback path for additional binary data.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.text.json.jsondocument
   */
  JsonDocument: {
    kind: "class",
    members: {
      /** Parses text representing a single JSON value into a JsonDocument. */
      Parse: { kind: "method", methodKind: "ordinary", isStatic: true },
      /** Parses one JSON value (including objects or arrays) from the provided reader. */
      ParseValue: { kind: "method", methodKind: "ordinary", isStatic: true },
    },
  },

  /**
   * Converts objects to JSON strings and JSON strings to objects.
   * Used in the NET Framework fallback path for writing additional binary data.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.text.json.jsonserializer
   */
  JsonSerializer: {
    kind: "class",
    members: {
      /** Converts a JsonElement to JSON string via a Utf8JsonWriter. */
      Serialize: { kind: "method", methodKind: "ordinary", isStatic: true },
    },
  },

  /**
   * Provides options to be used with JsonSerializer. Used as a parameter
   * in `JsonConverter<T>.Write` and `JsonConverter<T>.Read` override methods
   * generated for models with the `@useSystemTextJsonConverter` decorator.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.text.json.jsonserializeroptions
   */
  JsonSerializerOptions: {
    kind: "class",
    members: {},
  },
});
