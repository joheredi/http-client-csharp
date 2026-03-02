import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * Props for the {@link ErrorResultFile} component.
 */
export interface ErrorResultFileProps {
  /** The resolved package name, used for the root namespace. */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates the `ErrorResult.cs` internal generic class.
 *
 * `ErrorResult<T>` extends `ClientResult<T>` and is used to represent
 * failed API responses in the HEAD-as-bool pattern. When the `Value`
 * property is accessed, it throws the stored `ClientResultException`,
 * allowing the pipeline to propagate typed results with deferred error
 * semantics.
 *
 * The generated class matches the legacy emitter's output:
 * `src/Generated/Internal/ErrorResult.cs`.
 *
 * @example Generated output:
 * ```csharp
 * internal partial class ErrorResult<T> : ClientResult<T>
 * {
 *     private readonly PipelineResponse _response;
 *     private readonly ClientResultException _exception;
 *     public ErrorResult(PipelineResponse response, ClientResultException exception) : base(default, response) { ... }
 *     public override T Value => throw _exception;
 * }
 * ```
 */
export function ErrorResultFile(props: ErrorResultFileProps) {
  const header = getLicenseHeader(props.options);

  return (
    <SourceFile
      path="src/Generated/Internal/ErrorResult.cs"
      using={["System.ClientModel", "System.ClientModel.Primitives"]}
    >
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration
          internal
          partial
          name="ErrorResult"
          typeParameters={["T"]}
          baseType="ClientResult<T>"
        >
          {code`
            private readonly PipelineResponse _response;
            private readonly ClientResultException _exception;

            public ErrorResult(PipelineResponse response, ClientResultException exception) : base(default, response)
            {
                _response = response;
                _exception = exception;
            }

            /// <summary> Gets the Value. </summary>
            public override T Value => throw _exception;
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
