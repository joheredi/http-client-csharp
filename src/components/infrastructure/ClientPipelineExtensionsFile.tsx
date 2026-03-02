import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";

/**
 * Props for the {@link ClientPipelineExtensionsFile} component.
 */
export interface ClientPipelineExtensionsFileProps {
  /** The resolved package name, used for the root namespace. */
  packageName: string;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates the `ClientPipelineExtensions.cs` internal helper class.
 *
 * This static utility class provides extension methods for `ClientPipeline`
 * that handle the send-and-check pattern for HTTP messages:
 *
 * - `ProcessMessageAsync` / `ProcessMessage` — send a message through the
 *   pipeline and throw `ClientResultException` on error responses unless
 *   `NoThrow` is set in the error options.
 * - `ProcessHeadAsBoolMessageAsync` / `ProcessHeadAsBoolMessage` — send a
 *   HEAD request and convert the response to a `bool` result: `true` for
 *   2xx, `false` for 4xx, and `ErrorResult<bool>` otherwise.
 *
 * The generated class matches the legacy emitter's output:
 * `src/Generated/Internal/ClientPipelineExtensions.cs`.
 */
export function ClientPipelineExtensionsFile(
  props: ClientPipelineExtensionsFileProps,
) {
  const header = getLicenseHeader(props.options);

  return (
    <SourceFile
      path="src/Generated/Internal/ClientPipelineExtensions.cs"
      using={[
        "System.ClientModel",
        "System.ClientModel.Primitives",
        "System.Threading.Tasks",
      ]}
    >
      {header}
      {"\n\n"}
      <Namespace name={props.packageName}>
        <ClassDeclaration
          internal
          static
          partial
          name="ClientPipelineExtensions"
        >
          {code`
            public static async ValueTask<PipelineResponse> ProcessMessageAsync(this ClientPipeline pipeline, PipelineMessage message, RequestOptions options)
            {
                await pipeline.SendAsync(message).ConfigureAwait(false);

                if (message.Response.IsError && (options?.ErrorOptions & ClientErrorBehaviors.NoThrow) != ClientErrorBehaviors.NoThrow)
                {
                    throw await ClientResultException.CreateAsync(message.Response).ConfigureAwait(false);
                }

                PipelineResponse response = message.BufferResponse ? message.Response : message.ExtractResponse();
                return response;
            }
          `}
          {"\n\n"}
          {code`
            public static PipelineResponse ProcessMessage(this ClientPipeline pipeline, PipelineMessage message, RequestOptions options)
            {
                pipeline.Send(message);

                if (message.Response.IsError && (options?.ErrorOptions & ClientErrorBehaviors.NoThrow) != ClientErrorBehaviors.NoThrow)
                {
                    throw new ClientResultException(message.Response);
                }

                PipelineResponse response = message.BufferResponse ? message.Response : message.ExtractResponse();
                return response;
            }
          `}
          {"\n\n"}
          {code`
            public static async ValueTask<ClientResult<bool>> ProcessHeadAsBoolMessageAsync(this ClientPipeline pipeline, PipelineMessage message, RequestOptions options)
            {
                PipelineResponse response = await pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false);
                switch (response.Status)
                {
                    case >= 200 and < 300:
                        return ClientResult.FromValue(true, response);
                    case >= 400 and < 500:
                        return ClientResult.FromValue(false, response);
                    default:
                        return new ErrorResult<bool>(response, new ClientResultException(response));
                }
            }
          `}
          {"\n\n"}
          {code`
            public static ClientResult<bool> ProcessHeadAsBoolMessage(this ClientPipeline pipeline, PipelineMessage message, RequestOptions options)
            {
                PipelineResponse response = pipeline.ProcessMessage(message, options);
                switch (response.Status)
                {
                    case >= 200 and < 300:
                        return ClientResult.FromValue(true, response);
                    case >= 400 and < 500:
                        return ClientResult.FromValue(false, response);
                    default:
                        return new ErrorResult<bool>(response, new ClientResultException(response));
                }
            }
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
