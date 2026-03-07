import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import { code } from "@alloy-js/core";
import type { Children } from "@alloy-js/core";
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
 * This static utility class provides extension methods for the HTTP pipeline
 * that handle the send-and-check pattern for HTTP messages:
 *
 * - `ProcessMessageAsync` / `ProcessMessage` — send a message through the
 *   pipeline and throw on error responses unless `NoThrow` is set.
 * - `ProcessHeadAsBoolMessageAsync` / `ProcessHeadAsBoolMessage` — send a
 *   HEAD request and convert the response to a `bool` result: `true` for
 *   2xx, `false` for 4xx, and `ErrorResult<bool>` otherwise.
 *
 * For unbranded flavor, extends `ClientPipeline` with `PipelineResponse` returns
 * and `ClientResultException` errors. For Azure flavor, extends `HttpPipeline`
 * with `Response` returns and `RequestFailedException` errors.
 *
 * The generated class matches the legacy emitter's output:
 * `src/Generated/Internal/ClientPipelineExtensions.cs`.
 */
export function ClientPipelineExtensionsFile(
  props: ClientPipelineExtensionsFileProps,
) {
  const header = getLicenseHeader(props.options);
  const isAzure = props.options.flavor === "azure";

  if (isAzure) {
    return renderAzurePipelineExtensions(props.packageName, header);
  }

  return renderUnbrandedPipelineExtensions(props.packageName, header);
}

/**
 * Renders the unbranded (System.ClientModel) version of ClientPipelineExtensions.
 *
 * Uses `ClientPipeline`, `PipelineMessage`, `RequestOptions`, `PipelineResponse`,
 * `ClientResultException`, and `ClientErrorBehaviors` types.
 */
function renderUnbrandedPipelineExtensions(
  packageName: string,
  header: Children,
) {
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
      <Namespace name={packageName}>
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

/**
 * Renders the Azure (Azure.Core) version of ClientPipelineExtensions.
 *
 * Uses `HttpPipeline`, `HttpMessage`, `RequestContext`, `Response`,
 * `RequestFailedException`, and `ErrorOptions` types. The Azure version
 * differs from unbranded in several ways:
 * - Uses `RequestContext.Parse()` to extract cancellation token and error options
 * - Passes `CancellationToken` explicitly to pipeline Send methods
 * - Returns `Response` directly from `message.Response` (no buffer/extract logic)
 * - Uses `Response<bool>` / `Response.FromValue()` for HEAD-as-bool methods
 */
function renderAzurePipelineExtensions(packageName: string, header: Children) {
  return (
    <SourceFile
      path="src/Generated/Internal/ClientPipelineExtensions.cs"
      using={[
        "System.Threading",
        "System.Threading.Tasks",
        "Azure",
        "Azure.Core",
        "Azure.Core.Pipeline",
      ]}
    >
      {header}
      {"\n\n"}
      <Namespace name={packageName}>
        <ClassDeclaration
          internal
          static
          partial
          name="ClientPipelineExtensions"
        >
          {code`
            public static async ValueTask<Response> ProcessMessageAsync(this HttpPipeline pipeline, HttpMessage message, RequestContext context)
            {
                (CancellationToken userCancellationToken, ErrorOptions errorOptions) = context.Parse();
                await pipeline.SendAsync(message, userCancellationToken).ConfigureAwait(false);

                if (message.Response.IsError && (errorOptions & ErrorOptions.NoThrow) != ErrorOptions.NoThrow)
                {
                    throw new RequestFailedException(message.Response);
                }

                return message.Response;
            }
          `}
          {"\n\n"}
          {code`
            public static Response ProcessMessage(this HttpPipeline pipeline, HttpMessage message, RequestContext context)
            {
                (CancellationToken userCancellationToken, ErrorOptions errorOptions) = context.Parse();
                pipeline.Send(message, userCancellationToken);

                if (message.Response.IsError && (errorOptions & ErrorOptions.NoThrow) != ErrorOptions.NoThrow)
                {
                    throw new RequestFailedException(message.Response);
                }

                return message.Response;
            }
          `}
          {"\n\n"}
          {code`
            public static async ValueTask<Response<bool>> ProcessHeadAsBoolMessageAsync(this HttpPipeline pipeline, HttpMessage message, RequestContext context)
            {
                Response response = await pipeline.ProcessMessageAsync(message, context).ConfigureAwait(false);
                switch (response.Status)
                {
                    case >= 200 and < 300:
                        return Response.FromValue(true, response);
                    case >= 400 and < 500:
                        return Response.FromValue(false, response);
                    default:
                        return new ErrorResult<bool>(response, new RequestFailedException(response));
                }
            }
          `}
          {"\n\n"}
          {code`
            public static Response<bool> ProcessHeadAsBoolMessage(this HttpPipeline pipeline, HttpMessage message, RequestContext context)
            {
                Response response = pipeline.ProcessMessage(message, context);
                switch (response.Status)
                {
                    case >= 200 and < 300:
                        return Response.FromValue(true, response);
                    case >= 400 and < 500:
                        return Response.FromValue(false, response);
                    default:
                        return new ErrorResult<bool>(response, new RequestFailedException(response));
                }
            }
          `}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
