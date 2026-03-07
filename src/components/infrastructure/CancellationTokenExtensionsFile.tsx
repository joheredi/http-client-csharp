import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import { getPipelineTypes } from "../../utils/pipeline-types.js";

/**
 * Props for the {@link CancellationTokenExtensionsFile} component.
 */
export interface CancellationTokenExtensionsFileProps {
  /** The resolved package name, used for the root namespace. */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates the `CancellationTokenExtensions.cs` internal helper class.
 *
 * This static utility class provides an extension method that converts a
 * `CancellationToken` into the flavor-appropriate request options type for
 * use with the HTTP pipeline. For unbranded flavor, this returns `RequestOptions`;
 * for Azure flavor, this returns `RequestContext`.
 *
 * If the token can be canceled, it wraps it in the request options instance;
 * otherwise it returns null.
 *
 * The generated class matches the legacy emitter's output:
 * `src/Generated/Internal/CancellationTokenExtensions.cs`.
 *
 * @example Generated output (unbranded):
 * ```csharp
 * internal static partial class CancellationTokenExtensions
 * {
 *     public static RequestOptions ToRequestOptions(this CancellationToken cancellationToken)
 *         => cancellationToken.CanBeCanceled ? new RequestOptions { CancellationToken = cancellationToken } : null;
 * }
 * ```
 *
 * @example Generated output (Azure):
 * ```csharp
 * internal static partial class CancellationTokenExtensions
 * {
 *     public static RequestContext ToRequestOptions(this CancellationToken cancellationToken)
 *         => cancellationToken.CanBeCanceled ? new RequestContext { CancellationToken = cancellationToken } : null;
 * }
 * ```
 */
export function CancellationTokenExtensionsFile(
  props: CancellationTokenExtensionsFileProps,
) {
  const header = getLicenseHeader(props.options);
  const pipelineTypes = getPipelineTypes(props.options.flavor ?? "unbranded");

  return (
    <SourceFile
      path="src/Generated/Internal/CancellationTokenExtensions.cs"
      using={["System.Threading"]}
    >
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration
          internal
          static
          partial
          name="CancellationTokenExtensions"
        >
          {code`
            public static ${pipelineTypes.requestOptions} ToRequestOptions(this CancellationToken cancellationToken) => cancellationToken.CanBeCanceled ? new ${pipelineTypes.requestOptions} { CancellationToken = cancellationToken } : null;
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
