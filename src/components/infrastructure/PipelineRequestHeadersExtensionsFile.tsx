import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * Props for the {@link PipelineRequestHeadersExtensionsFile} component.
 */
export interface PipelineRequestHeadersExtensionsFileProps {
  /** The resolved package name, used for the root namespace. */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates the `PipelineRequestHeadersExtensions.cs` internal static class.
 *
 * This class provides extension methods for `PipelineRequestHeaders` from
 * System.ClientModel.Primitives:
 *
 * - `SetDelimited<T>(name, value, delimiter)` — joins an enumerable of values
 *   into a delimited string and sets it as a header value. Uses
 *   `TypeFormatters.ConvertToString` for type conversion.
 * - `SetDelimited<T>(name, value, delimiter, format)` — overload that accepts
 *   a `SerializationFormat` for formatted conversion (e.g., date formats).
 * - `Add(prefix, value)` — adds multiple headers from a dictionary, prepending
 *   a prefix to each header key. Used for header parameters with a common prefix.
 *
 * The generated class matches the legacy emitter's
 * `PipelineRequestHeadersExtensionsDefinition`.
 *
 * @example Generated output:
 * ```csharp
 * internal static class PipelineRequestHeadersExtensions
 * {
 *     public static void SetDelimited<T>(this PipelineRequestHeaders headers,
 *         string name, IEnumerable<T> value, string delimiter) { ... }
 *     public static void Add(this PipelineRequestHeaders headers,
 *         string prefix, IDictionary<string, string> value) { ... }
 * }
 * ```
 */
export function PipelineRequestHeadersExtensionsFile(
  props: PipelineRequestHeadersExtensionsFileProps,
) {
  const header = getLicenseHeader(props.options);

  return (
    <SourceFile
      path="src/Generated/Internal/PipelineRequestHeadersExtensions.cs"
      using={[
        "System.ClientModel.Primitives",
        "System.Collections.Generic",
        "System.Linq",
      ]}
    >
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration
          internal
          static
          name="PipelineRequestHeadersExtensions"
        >
          {code`
            public static void SetDelimited<T>(this PipelineRequestHeaders headers, string name, IEnumerable<T> value, string delimiter)
            {
                var stringValues = value.Select(v => TypeFormatters.ConvertToString(v));
                headers.Set(name, string.Join(delimiter, stringValues));
            }
          `}
          {"\n\n"}
          {code`
            public static void SetDelimited<T>(this PipelineRequestHeaders headers, string name, IEnumerable<T> value, string delimiter, SerializationFormat format)
            {
                var stringValues = value.Select(v => TypeFormatters.ConvertToString(v, format));
                headers.Set(name, string.Join(delimiter, stringValues));
            }
          `}
          {"\n\n"}
          {code`
            public static void Add(this PipelineRequestHeaders headers, string prefix, IDictionary<string, string> value)
            {
                foreach (var header in value)
                {
                    headers.Add((prefix + header.Key), header.Value);
                }
            }
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
