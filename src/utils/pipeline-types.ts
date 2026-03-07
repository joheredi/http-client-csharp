/**
 * Pipeline type mapping utility for flavor-aware code generation.
 *
 * Returns the correct Alloy library type references for HTTP pipeline
 * infrastructure based on the emitter flavor ("azure" vs "unbranded").
 * Components use these references in JSX `type` props to generate the
 * correct C# type names and auto-add `using` directives.
 *
 * Azure flavor uses Azure.Core.Pipeline types (HttpPipeline, HttpMessage, etc.)
 * while unbranded uses System.ClientModel types (ClientPipeline, PipelineMessage, etc.).
 *
 * @module
 */

import type { Children } from "@alloy-js/core";
import { Azure, AzureCore, AzureCorePipeline } from "../builtins/azure.js";
import {
  SystemClientModel,
  SystemClientModelPrimitives,
} from "../builtins/system-client-model.js";

/**
 * Type references for HTTP pipeline infrastructure, resolved per flavor.
 *
 * Each field is an Alloy library member reference that can be used as a
 * `type` prop in JSX components (e.g., `<Property type={types.pipeline} />`).
 * Using these references ensures correct `using` directives are auto-generated.
 */
export interface PipelineTypes {
  /** The HTTP pipeline type: `HttpPipeline` (Azure) or `ClientPipeline` (unbranded). */
  pipeline: Children;
  /** The HTTP message type: `HttpMessage` (Azure) or `PipelineMessage` (unbranded). */
  message: Children;
  /** The pipeline policy base type: `HttpPipelinePolicy` (Azure) or `PipelinePolicy` (unbranded). */
  policy: Children;
  /** The API key credential type: `AzureKeyCredential` (Azure) or `ApiKeyCredential` (unbranded). */
  apiKeyCredential: Children;
  /** The token credential type: `TokenCredential` (Azure) or `AuthenticationTokenProvider` (unbranded). */
  tokenCredential: Children;
  /** The request options type: `RequestContext` (Azure) or `RequestOptions` (unbranded). */
  requestOptions: Children;
  /** The response type: `Response` (Azure) or `PipelineResponse` (unbranded). */
  response: Children;
  /** The error exception type: `RequestFailedException` (Azure) or `ClientResultException` (unbranded). */
  errorException: Children;
  /** The error behavior flags type: `ErrorOptions` (Azure) or `ClientErrorBehaviors` (unbranded). */
  errorBehaviors: Children;
  /** Whether the Pipeline property should have the `virtual` modifier. True for Azure. */
  pipelineIsVirtual: boolean;
  /** Whether this flavor uses ClientDiagnostics for distributed tracing. True for Azure. */
  hasDiagnostics: boolean;
  /** The client result type: `Response` (Azure) or `ClientResult` (unbranded). Used as return type for protocol/convenience methods. */
  clientResult: Children;
  /** The request body content type: `RequestContent` (Azure) or `BinaryContent` (unbranded). */
  binaryContent: Children;
  /** The HTTP request type: `Request` (Azure) or `PipelineRequest` (unbranded). Used in REST client request building. */
  request: Children;
  /** The non-generic Operation base class for void-returning LRO methods (Azure only). Undefined for unbranded. */
  operation?: Children;
  /** The WaitUntil enum type for controlling LRO wait behavior (Azure only). Undefined for unbranded. */
  waitUntil?: Children;
  /** The OperationFinalStateVia enum for polling strategy (Azure only). Undefined for unbranded. */
  operationFinalStateVia?: Children;
  /** The ProtocolOperationHelpers static class for LRO processing (Azure only). Undefined for unbranded. */
  protocolOperationHelpers?: Children;
}

/**
 * Returns the correct pipeline type references for the given emitter flavor.
 *
 * Azure flavor maps to Azure.Core.Pipeline types (HttpPipeline, HttpMessage, etc.)
 * while unbranded flavor maps to System.ClientModel types (ClientPipeline, PipelineMessage, etc.).
 *
 * @param flavor - The emitter flavor: `"azure"` or `"unbranded"`.
 * @returns An object containing Alloy library member references for all
 *   pipeline-related types in the target flavor.
 *
 * @example
 * ```tsx
 * const types = getPipelineTypes(options.flavor);
 * <Property public name="Pipeline" type={types.pipeline} get />
 * ```
 */
export function getPipelineTypes(
  flavor: "azure" | "unbranded" | string,
): PipelineTypes {
  if (flavor === "azure") {
    return {
      pipeline: AzureCorePipeline.HttpPipeline,
      message: AzureCorePipeline.HttpMessage,
      policy: AzureCorePipeline.HttpPipelinePolicy,
      apiKeyCredential: Azure.AzureKeyCredential,
      tokenCredential: AzureCore.TokenCredential,
      requestOptions: Azure.RequestContext,
      response: Azure.Response,
      errorException: Azure.RequestFailedException,
      errorBehaviors: Azure.ErrorOptions,
      pipelineIsVirtual: true,
      hasDiagnostics: true,
      clientResult: Azure.Response,
      binaryContent: AzureCore.RequestContent,
      request: AzureCore.Request,
      operation: Azure.Operation,
      waitUntil: Azure.WaitUntil,
      operationFinalStateVia: AzureCore.OperationFinalStateVia,
      protocolOperationHelpers: AzureCore.ProtocolOperationHelpers,
    };
  }

  return {
    pipeline: SystemClientModelPrimitives.ClientPipeline,
    message: SystemClientModelPrimitives.PipelineMessage,
    policy: SystemClientModelPrimitives.PipelinePolicy,
    apiKeyCredential: SystemClientModel.ApiKeyCredential,
    tokenCredential: SystemClientModel.AuthenticationTokenProvider,
    requestOptions: SystemClientModelPrimitives.RequestOptions,
    response: SystemClientModelPrimitives.PipelineResponse,
    errorException: SystemClientModel.ClientResultException,
    errorBehaviors: SystemClientModelPrimitives.ClientErrorBehaviors,
    pipelineIsVirtual: false,
    hasDiagnostics: false,
    clientResult: SystemClientModel.ClientResult,
    binaryContent: SystemClientModel.BinaryContent,
    request: SystemClientModelPrimitives.PipelineRequest,
  };
}
