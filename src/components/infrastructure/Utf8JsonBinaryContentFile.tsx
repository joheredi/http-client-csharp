import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * Props for the {@link Utf8JsonBinaryContentFile} component.
 */
export interface Utf8JsonBinaryContentFileProps {
  /** The resolved package name, used for the root namespace. */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates the `Utf8JsonBinaryContent.cs` internal helper class.
 *
 * This class extends `BinaryContent` (from System.ClientModel) and wraps a
 * `Utf8JsonWriter` around a `MemoryStream`. It provides a convenient way to
 * build JSON request bodies:
 *
 * 1. Create a new instance → internal `MemoryStream` and `Utf8JsonWriter` are initialized
 * 2. Write JSON via `JsonWriter` property
 * 3. Pass to `PipelineRequest.Content` → `WriteToAsync`/`WriteTo` flush the writer
 *    and forward the stream bytes to the pipeline
 *
 * Overrides:
 * - `WriteToAsync` / `WriteTo` — flush the JSON writer, then delegate to the
 *   inner `BinaryContent` created from the memory stream.
 * - `TryComputeLength` — returns committed + pending bytes from the writer.
 * - `Dispose` — disposes writer, inner content, and stream.
 *
 * The generated class matches the legacy emitter's `Utf8JsonBinaryContentDefinition`.
 *
 * @example Generated output:
 * ```csharp
 * internal partial class Utf8JsonBinaryContent : BinaryContent
 * {
 *     private readonly MemoryStream _stream;
 *     private readonly BinaryContent _content;
 *     public Utf8JsonWriter JsonWriter { get; }
 *     ...
 * }
 * ```
 */
export function Utf8JsonBinaryContentFile(
  props: Utf8JsonBinaryContentFileProps,
) {
  const header = getLicenseHeader(props.options);
  const isAzure = props.options.flavor === "azure";

  // Azure flavor uses Utf8JsonRequestContent from Azure.Core shared source,
  // which extends RequestContent instead of BinaryContent.
  if (isAzure) return null;

  return (
    <SourceFile
      path="src/Generated/Internal/Utf8JsonBinaryContent.cs"
      using={[
        "System",
        "System.ClientModel",
        "System.IO",
        "System.Text.Json",
        "System.Threading",
        "System.Threading.Tasks",
      ]}
    >
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration
          internal
          partial
          name="Utf8JsonBinaryContent"
          baseType="BinaryContent"
        >
          {code`
            private readonly MemoryStream _stream;
            private readonly BinaryContent _content;

            public Utf8JsonWriter JsonWriter { get; }

            public Utf8JsonBinaryContent()
            {
                _stream = new MemoryStream();
                _content = BinaryContent.Create(_stream);
                JsonWriter = new Utf8JsonWriter(_stream);
            }
          `}
          {"\n\n"}
          {code`
            public override async Task WriteToAsync(Stream stream, CancellationToken cancellationToken)
            {
                await JsonWriter.FlushAsync().ConfigureAwait(false);
                await _content.WriteToAsync(stream, cancellationToken).ConfigureAwait(false);
            }
          `}
          {"\n\n"}
          {code`
            public override void WriteTo(Stream stream, CancellationToken cancellationToken)
            {
                JsonWriter.Flush();
                _content.WriteTo(stream, cancellationToken);
            }
          `}
          {"\n\n"}
          {code`
            public override bool TryComputeLength(out long length)
            {
                length = JsonWriter.BytesCommitted + JsonWriter.BytesPending;
                return true;
            }
          `}
          {"\n\n"}
          {code`
            public override void Dispose()
            {
                JsonWriter.Dispose();
                _content.Dispose();
                _stream.Dispose();
            }
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
