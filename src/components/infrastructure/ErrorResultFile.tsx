import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import { getPipelineTypes } from "../../utils/pipeline-types.js";

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
 * `ErrorResult<T>` extends the flavor-appropriate result type
 * (`ClientResult<T>` for unbranded, `Response<T>` for Azure) and is used
 * to represent failed API responses in the HEAD-as-bool pattern. When the
 * `Value` property is accessed, it throws the stored exception, allowing
 * the pipeline to propagate typed results with deferred error semantics.
 *
 * The generated class matches the legacy emitter's output:
 * `src/Generated/Internal/ErrorResult.cs`.
 *
 * @example Generated output (unbranded):
 * ```csharp
 * internal partial class ErrorResult<T> : ClientResult<T>
 * {
 *     private readonly PipelineResponse _response;
 *     private readonly ClientResultException _exception;
 *     public ErrorResult(PipelineResponse response, ClientResultException exception) : base(default, response) { ... }
 *     public override T Value => throw _exception;
 * }
 * ```
 *
 * @example Generated output (Azure):
 * ```csharp
 * internal partial class ErrorResult<T> : Response<T>
 * {
 *     private readonly Response _response;
 *     private readonly RequestFailedException _exception;
 *     public ErrorResult(Response response, RequestFailedException exception) : base(default, response) { ... }
 *     public override T Value => throw _exception;
 *     public override Response GetRawResponse() => _response;
 * }
 * ```
 */
export function ErrorResultFile(props: ErrorResultFileProps) {
  const header = getLicenseHeader(props.options);
  const flavor = props.options.flavor ?? "unbranded";
  const pipelineTypes = getPipelineTypes(flavor);
  const isAzure = flavor === "azure";

  return (
    <SourceFile path="src/Generated/Internal/ErrorResult.cs">
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration
          internal
          partial
          name="ErrorResult"
          typeParameters={["T"]}
          baseType={code`${pipelineTypes.clientResult}<T>`}
        >
          {code`
            private readonly ${pipelineTypes.response} _response;
            private readonly ${pipelineTypes.errorException} _exception;

            public ErrorResult(${pipelineTypes.response} response, ${pipelineTypes.errorException} exception) : base(default, response)
            {
                _response = response;
                _exception = exception;
            }

            /// <summary> Gets the Value. </summary>
            public override T Value => throw _exception;
          `}
          {isAzure
            ? code`
            /// <summary> Gets the raw response. </summary>
            public override ${pipelineTypes.response} GetRawResponse() => _response;
          `
            : undefined}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
