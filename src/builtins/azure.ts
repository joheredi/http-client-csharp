import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the Azure namespace.
 *
 * These are Azure SDK types from the Azure.Core NuGet package that are
 * referenced by generated Azure-flavored C# client code. Referencing these
 * symbols in Alloy JSX components automatically generates the correct
 * `using Azure;` directive.
 *
 * Only activated when the emitter `flavor` option is set to `"azure"`.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/azure
 */
export const Azure = createLibrary("Azure", {
  /**
   * Represents an Azure geography region where a resource is deployed
   * (e.g., "WestUS", "EastUS2"). Maps from the TypeSpec scalar
   * `Azure.Core.azureLocation`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.azurelocation
   */
  AzureLocation: {
    kind: "struct",
    members: {},
  },

  /**
   * Represents an HTTP ETag value used for conditional requests.
   * Maps from the TypeSpec scalar `Azure.Core.eTag`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.etag
   */
  ETag: {
    kind: "struct",
    members: {},
  },

  /**
   * Represents a structured error response from an Azure service.
   * Maps from the TypeSpec model `Azure.Core.Foundations.Error`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.responseerror
   */
  ResponseError: {
    kind: "class",
    members: {},
  },

  /**
   * Credential for authenticating to Azure services using an API key.
   * Azure equivalent of System.ClientModel's `ApiKeyCredential`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.azurekeycredential
   */
  AzureKeyCredential: {
    kind: "class",
    members: {},
  },

  /**
   * Represents an HTTP response from an Azure service.
   * Azure equivalent of System.ClientModel.Primitives' `PipelineResponse`.
   * Also used as `Response<T>` for typed results.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.response
   */
  Response: {
    kind: "class",
    members: {
      /**
       * Creates a `Response<T>` wrapping a value and the raw response.
       */
      FromValue: {
        kind: "method",
      },
    },
  },

  /**
   * Provides per-request options for Azure pipeline calls, including
   * cancellation and error handling behavior.
   * Azure equivalent of System.ClientModel.Primitives' `RequestOptions`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.requestcontext
   */
  RequestContext: {
    kind: "class",
    members: {
      /**
       * Extracts cancellation token and error options from the context.
       */
      Parse: {
        kind: "method",
      },
    },
  },

  /**
   * Exception thrown when an Azure service returns a non-success status code.
   * Azure equivalent of System.ClientModel's `ClientResultException`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.requestfailedexception
   */
  RequestFailedException: {
    kind: "class",
    members: {},
  },

  /**
   * Flags controlling error handling behavior in Azure pipeline calls.
   * Azure equivalent of System.ClientModel.Primitives' `ClientErrorBehaviors`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.erroroptions
   */
  ErrorOptions: {
    kind: "enum",
    members: {
      /** Suppresses exceptions for error responses. */
      NoThrow: {},
    },
  },
});

/**
 * Alloy library declaration for types in the Azure.Core namespace.
 *
 * These are Azure SDK types from the Azure.Core NuGet package that live
 * in the `Azure.Core` sub-namespace. Referencing these symbols automatically
 * generates the correct `using Azure.Core;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core
 */
export const AzureCore = createLibrary("Azure.Core", {
  /**
   * Represents a fully qualified Azure Resource Manager resource identifier.
   * Maps from the TypeSpec scalar `Azure.Core.armResourceIdentifier`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.resourceidentifier
   */
  ResourceIdentifier: {
    kind: "class",
    members: {},
  },

  /**
   * Credential for authenticating to Azure services using OAuth2/bearer tokens.
   * Azure equivalent of System.ClientModel's `AuthenticationTokenProvider`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.tokencredential
   */
  TokenCredential: {
    kind: "class",
    members: {},
  },

  /**
   * Base class for Azure service client options.
   * Azure equivalent of System.ClientModel.Primitives' `ClientPipelineOptions`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.clientoptions
   */
  ClientOptions: {
    kind: "class",
    members: {},
  },

  /**
   * Static helper for argument validation (e.g., null checks).
   * Provides `AssertNotNull`, `AssertNotNullOrEmpty`, etc.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.argument
   */
  Argument: {
    kind: "class",
    members: {
      AssertNotNull: {
        kind: "method",
      },
    },
  },

  /**
   * Represents an HTTP request in the Azure pipeline.
   * Azure equivalent of System.ClientModel.Primitives' `PipelineRequest`.
   * Accessible via `HttpMessage.Request`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.request
   */
  Request: {
    kind: "class",
    members: {},
  },

  /**
   * Abstract base class for HTTP request body content in Azure.
   * Azure equivalent of System.ClientModel's `BinaryContent`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.requestcontent
   */
  RequestContent: {
    kind: "class",
    members: {
      /** Creates RequestContent from a serializable model. */
      Create: { kind: "method", methodKind: "ordinary", isStatic: true },
    },
  },
});

/**
 * Alloy library declaration for types in the Azure.Core.Pipeline namespace.
 *
 * These are the core HTTP pipeline infrastructure types from the Azure.Core
 * NuGet package. Azure-flavored clients use `HttpPipeline` (instead of
 * `ClientPipeline`), `HttpPipelineBuilder` (instead of `ClientPipeline.Create`),
 * and Azure-specific auth policies.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.pipeline
 */
export const AzureCorePipeline = createLibrary("Azure.Core.Pipeline", {
  /**
   * The Azure HTTP pipeline for sending and receiving REST requests.
   * Azure equivalent of System.ClientModel.Primitives' `ClientPipeline`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.pipeline.httppipeline
   */
  HttpPipeline: {
    kind: "class",
    members: {
      /** Sends an HTTP message through the pipeline asynchronously. */
      SendAsync: {
        kind: "method",
      },
      /** Sends an HTTP message through the pipeline synchronously. */
      Send: {
        kind: "method",
      },
      /** Creates a new HTTP message for this pipeline. */
      CreateMessage: {
        kind: "method",
      },
    },
  },

  /**
   * Represents an HTTP request/response pair flowing through the Azure pipeline.
   * Azure equivalent of System.ClientModel.Primitives' `PipelineMessage`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.httpmessage
   */
  HttpMessage: {
    kind: "class",
    members: {},
  },

  /**
   * Fluent builder for constructing an Azure HTTP pipeline with policies.
   * Azure equivalent of `ClientPipeline.Create()` — called as
   * `HttpPipelineBuilder.Build(options, policies)`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.pipeline.httppipelinebuilder
   */
  HttpPipelineBuilder: {
    kind: "class",
    members: {
      /** Builds an HttpPipeline from options and per-retry policies. */
      Build: {
        kind: "method",
      },
    },
  },

  /**
   * Base class for Azure HTTP pipeline policies.
   * Azure equivalent of System.ClientModel.Primitives' `PipelinePolicy`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.pipeline.httppipelinepolicy
   */
  HttpPipelinePolicy: {
    kind: "class",
    members: {},
  },

  /**
   * Pipeline policy that authenticates requests using an Azure API key.
   * Azure equivalent of System.ClientModel.Primitives' `ApiKeyAuthenticationPolicy`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.pipeline.azurekeycredentialpolicy
   */
  AzureKeyCredentialPolicy: {
    kind: "class",
    members: {},
  },

  /**
   * Pipeline policy that authenticates requests using an OAuth2 bearer token.
   * Azure equivalent of System.ClientModel.Primitives' `BearerTokenPolicy`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.pipeline.bearertokenauthenticationpolicy
   */
  BearerTokenAuthenticationPolicy: {
    kind: "class",
    members: {},
  },

  /**
   * Provides distributed tracing support for Azure client libraries.
   * Creates diagnostic scopes for tracking operations.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.pipeline.clientdiagnostics
   */
  ClientDiagnostics: {
    kind: "class",
    members: {},
  },

  /**
   * Represents a diagnostic scope for tracing an Azure operation.
   * Used with `ClientDiagnostics.CreateScope()`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.pipeline.diagnosticscope
   */
  DiagnosticScope: {
    kind: "struct",
    members: {},
  },
});
