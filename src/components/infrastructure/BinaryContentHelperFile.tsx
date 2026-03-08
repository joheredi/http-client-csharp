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
  const isAzure = props.options.flavor === "azure";

  // For Azure, use RequestContent (from Azure.Core) and Utf8JsonRequestContent (shared source).
  // For unbranded, use BinaryContent (from System.ClientModel) and Utf8JsonBinaryContent (generated).
  const contentType = isAzure ? "RequestContent" : "BinaryContent";
  const jsonContentType = isAzure
    ? "Utf8JsonRequestContent"
    : "Utf8JsonBinaryContent";
  const contentCreate = isAzure
    ? "RequestContent.Create"
    : "BinaryContent.Create";

  // Methods that use #if preprocessor directives require plain strings
  // (not code blocks) for the conditional sections to avoid Alloy's
  // indentation engine concatenating lines with directives.
  const fromEnumerableBinaryData = `
public static ${contentType} FromEnumerable(IEnumerable<BinaryData> enumerable)
{
    ${jsonContentType} content = new ${jsonContentType}();
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
public static ${contentType} FromDictionary(IDictionary<string, BinaryData> dictionary)
{
    ${jsonContentType} content = new ${jsonContentType}();
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
public static ${contentType} FromObject(BinaryData value)
{
    ${jsonContentType} content = new ${jsonContentType}();
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

  const usingDirectives = isAzure
    ? ["System", "Azure.Core", "System.Collections.Generic", "System.Text.Json"]
    : [
        "System",
        "System.ClientModel",
        "System.Collections.Generic",
        "System.Text.Json",
      ];

  return (
    <SourceFile
      path="src/Generated/Internal/BinaryContentHelper.cs"
      using={usingDirectives}
    >
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration internal static partial name="BinaryContentHelper">
          {code`
            public static ${contentType} FromEnumerable<T>(IEnumerable<T> enumerable) where T : notnull
            {
                ${jsonContentType} content = new ${jsonContentType}();
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
            public static ${contentType} FromEnumerable<T>(ReadOnlySpan<T> span) where T : notnull
            {
                ${jsonContentType} content = new ${jsonContentType}();
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
            public static ${contentType} FromDictionary<T>(IDictionary<string, T> dictionary) where T : notnull
            {
                ${jsonContentType} content = new ${jsonContentType}();
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
            public static ${contentType} FromObject(object value)
            {
                ${jsonContentType} content = new ${jsonContentType}();
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
