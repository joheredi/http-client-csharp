import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * Props for the {@link BinaryContentHelperFile} component.
 */
export interface BinaryContentHelperFileProps {
  /** The resolved package name, used for the root namespace. */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates the `BinaryContentHelper.cs` internal static helper class.
 *
 * This class provides static factory methods that convert various .NET types
 * into `BinaryContent` instances suitable for HTTP request bodies. Each method
 * creates a `Utf8JsonBinaryContent`, writes the appropriate JSON representation
 * via `Utf8JsonWriter`, and returns it as `BinaryContent`.
 *
 * Generated methods:
 * - `FromEnumerable<T>(IEnumerable<T>)` — generic enumerable to JSON array
 * - `FromEnumerable(IEnumerable<BinaryData>)` — BinaryData enumerable with null handling
 * - `FromEnumerable<T>(ReadOnlySpan<T>)` — span to JSON array
 * - `FromDictionary<T>(IDictionary<string, T>)` — generic dictionary to JSON object
 * - `FromDictionary(IDictionary<string, BinaryData>)` — BinaryData dictionary with null handling
 * - `FromObject(object)` — single object via `WriteObjectValue`
 * - `FromObject(BinaryData)` — raw BinaryData via `WriteRawValue`
 *
 * BinaryData methods use `#if NET6_0_OR_GREATER` for `WriteRawValue` support,
 * falling back to `JsonDocument.Parse` + `JsonSerializer.Serialize` on older TFMs.
 *
 * The generated class matches the legacy emitter's `BinaryContentHelperDefinition`.
 *
 * @example Generated output:
 * ```csharp
 * internal static partial class BinaryContentHelper
 * {
 *     public static BinaryContent FromEnumerable<T>(IEnumerable<T> enumerable) where T : notnull { ... }
 *     public static BinaryContent FromObject(object value) { ... }
 *     ...
 * }
 * ```
 */
export function BinaryContentHelperFile(props: BinaryContentHelperFileProps) {
  const header = getLicenseHeader(props.options);

  // Methods that use #if preprocessor directives require plain strings
  // (not code blocks) for the conditional sections to avoid Alloy's
  // indentation engine concatenating lines with directives.
  const fromEnumerableBinaryData = `
public static BinaryContent FromEnumerable(IEnumerable<BinaryData> enumerable)
{
    Utf8JsonBinaryContent content = new Utf8JsonBinaryContent();
    content.JsonWriter.WriteStartArray();
    foreach (BinaryData item in enumerable)
    {
        if (item == null)
        {
            content.JsonWriter.WriteNullValue();
        }
        else
        {
#if NET6_0_OR_GREATER
            content.JsonWriter.WriteRawValue(item);
#else
            using (JsonDocument document = JsonDocument.Parse(item))
            {
                JsonSerializer.Serialize(content.JsonWriter, document.RootElement);
            }
#endif
        }
    }
    content.JsonWriter.WriteEndArray();

    return content;
}`;

  const fromDictionaryBinaryData = `
public static BinaryContent FromDictionary(IDictionary<string, BinaryData> dictionary)
{
    Utf8JsonBinaryContent content = new Utf8JsonBinaryContent();
    content.JsonWriter.WriteStartObject();
    foreach (var item in dictionary)
    {
        content.JsonWriter.WritePropertyName(item.Key);
        if (item.Value == null)
        {
            content.JsonWriter.WriteNullValue();
        }
        else
        {
#if NET6_0_OR_GREATER
            content.JsonWriter.WriteRawValue(item.Value);
#else
            using (JsonDocument document = JsonDocument.Parse(item.Value))
            {
                JsonSerializer.Serialize(content.JsonWriter, document.RootElement);
            }
#endif
        }
    }
    content.JsonWriter.WriteEndObject();

    return content;
}`;

  const fromObjectBinaryData = `
public static BinaryContent FromObject(BinaryData value)
{
    Utf8JsonBinaryContent content = new Utf8JsonBinaryContent();
#if NET6_0_OR_GREATER
    content.JsonWriter.WriteRawValue(value);
#else
    using (JsonDocument document = JsonDocument.Parse(value))
    {
        JsonSerializer.Serialize(content.JsonWriter, document.RootElement);
    }
#endif
    return content;
}`;

  return (
    <SourceFile
      path="src/Generated/Internal/BinaryContentHelper.cs"
      using={[
        "System",
        "System.ClientModel",
        "System.Collections.Generic",
        "System.Text.Json",
      ]}
    >
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration internal static partial name="BinaryContentHelper">
          {code`
            public static BinaryContent FromEnumerable<T>(IEnumerable<T> enumerable) where T : notnull
            {
                Utf8JsonBinaryContent content = new Utf8JsonBinaryContent();
                content.JsonWriter.WriteStartArray();
                foreach (var item in enumerable)
                {
                    content.JsonWriter.WriteObjectValue<T>(item, ModelSerializationExtensions.WireOptions);
                }
                content.JsonWriter.WriteEndArray();

                return content;
            }
          `}
          {"\n\n"}
          {fromEnumerableBinaryData}
          {"\n\n"}
          {code`
            public static BinaryContent FromEnumerable<T>(ReadOnlySpan<T> span) where T : notnull
            {
                Utf8JsonBinaryContent content = new Utf8JsonBinaryContent();
                content.JsonWriter.WriteStartArray();
                int i = 0;
                for (; i < span.Length; i++)
                {
                    content.JsonWriter.WriteObjectValue<T>(span[i], ModelSerializationExtensions.WireOptions);
                }
                content.JsonWriter.WriteEndArray();

                return content;
            }
          `}
          {"\n\n"}
          {code`
            public static BinaryContent FromDictionary<T>(IDictionary<string, T> dictionary) where T : notnull
            {
                Utf8JsonBinaryContent content = new Utf8JsonBinaryContent();
                content.JsonWriter.WriteStartObject();
                foreach (var item in dictionary)
                {
                    content.JsonWriter.WritePropertyName(item.Key);
                    content.JsonWriter.WriteObjectValue<T>(item.Value, ModelSerializationExtensions.WireOptions);
                }
                content.JsonWriter.WriteEndObject();

                return content;
            }
          `}
          {"\n\n"}
          {fromDictionaryBinaryData}
          {"\n\n"}
          {code`
            public static BinaryContent FromObject(object value)
            {
                Utf8JsonBinaryContent content = new Utf8JsonBinaryContent();
                content.JsonWriter.WriteObjectValue<object>(value, ModelSerializationExtensions.WireOptions);
                return content;
            }
          `}
          {"\n\n"}
          {fromObjectBinaryData}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
