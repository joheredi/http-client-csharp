import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

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
 * `CancellationToken` into `RequestOptions` for use with the SCM pipeline.
 * If the token can be canceled, it wraps it in a `RequestOptions` instance;
 * otherwise it returns null.
 *
 * The generated class matches the legacy emitter's output:
 * `src/Generated/Internal/CancellationTokenExtensions.cs`.
 *
 * @example Generated output:
 * ```csharp
 * internal static partial class CancellationTokenExtensions
 * {
 *     public static RequestOptions ToRequestOptions(this CancellationToken cancellationToken)
 *         => cancellationToken.CanBeCanceled ? new RequestOptions { CancellationToken = cancellationToken } : null;
 * }
 * ```
 */
export function CancellationTokenExtensionsFile(
  props: CancellationTokenExtensionsFileProps,
) {
  const header = getLicenseHeader(props.options);

  return (
    <SourceFile
      path="src/Generated/Internal/CancellationTokenExtensions.cs"
      using={["System.ClientModel.Primitives", "System.Threading"]}
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
            public static RequestOptions ToRequestOptions(this CancellationToken cancellationToken) => cancellationToken.CanBeCanceled ? new RequestOptions { CancellationToken = cancellationToken } : null;
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
