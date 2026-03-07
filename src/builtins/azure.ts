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
   * Groups If-Match and If-None-Match conditional request headers into a
   * single parameter. Used when an Azure operation has both ETag-based
   * conditional headers but no time-based headers.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.matchconditions
   */
  MatchConditions: {
    kind: "class",
    members: {
      IfMatch: { kind: "property" },
      IfNoneMatch: { kind: "property" },
    },
  },

  /**
   * Groups all conditional request headers (If-Match, If-None-Match,
   * If-Modified-Since, If-Unmodified-Since) into a single parameter.
   * Extends MatchConditions with time-based conditional headers.
   * Used when an Azure operation has any time-based conditional headers.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.requestconditions
   */
  RequestConditions: {
    kind: "class",
    members: {
      IfMatch: { kind: "property" },
      IfNoneMatch: { kind: "property" },
      IfModifiedSince: { kind: "property" },
      IfUnmodifiedSince: { kind: "property" },
    },
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

  /**
   * Controls whether an LRO method waits for completion or returns
   * immediately after starting the operation.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.waituntil
   */
  WaitUntil: {
    kind: "enum",
    members: {},
  },

  /**
   * Abstract base class for long-running operations without a typed result.
   * Used as return type for void-returning LRO methods.
   * Also serves as the base class for `Operation<T>`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.operation
   */
  Operation: {
    kind: "class",
    members: {},
  },

  /**
   * Represents an async sequence of pages containing typed results.
   * Used as the return type for async listing operations on ARM collections.
   * Consumed as `AsyncPageable<TResource>` in GetAllAsync methods.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.asyncpageable-1
   */
  AsyncPageable: {
    kind: "class",
    members: {},
  },

  /**
   * Represents a synchronous sequence of pages containing typed results.
   * Used as the return type for sync listing operations on ARM collections.
   * Consumed as `Pageable<TResource>` in GetAll methods.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.pageable-1
   */
  Pageable: {
    kind: "class",
    members: {},
  },

  /**
   * Represents a response that may or may not contain a value.
   * Used as the return type for GetIfExists methods on ARM collections.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.nullableresponse-1
   */
  NullableResponse: {
    kind: "class",
    members: {},
  },

  /**
   * Represents a response where the value is null/absent.
   * Used internally by GetIfExists when the resource does not exist (404).
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.novalueresponse-1
   */
  NoValueResponse: {
    kind: "class",
    members: {},
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
   * Represents an Azure geography region where a resource is deployed
   * (e.g., "WestUS", "EastUS2"). Maps from the TypeSpec scalar
   * `Azure.Core.azureLocation`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.azurelocation
   */
  AzureLocation: {
    kind: "struct",
    members: {},
  },

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

  /**
   * Enum controlling how the final state of a long-running operation is
   * determined — via Azure-AsyncOperation header, Location header,
   * Operation-Location header, or original URI.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.operationfinalstatevia
   */
  OperationFinalStateVia: {
    kind: "enum",
    members: {
      /** Final state via Azure-AsyncOperation header. */
      AzureAsyncOperation: {},
      /** Final state via Location header. */
      Location: {},
      /** Final state by re-polling the original request URI. */
      OriginalUri: {},
      /** Final state via Operation-Location header. */
      OperationLocation: {},
    },
  },

  /**
   * Static helper class for creating and managing polling `Operation<T>`
   * instances from protocol method responses. Provides ProcessMessage
   * (for typed results), ProcessMessageWithoutResponseValue (for void),
   * and Convert (for transforming Operation<BinaryData> to Operation<T>).
   *
   * @see Azure.Core shared source ProtocolOperationHelpers.cs
   */
  ProtocolOperationHelpers: {
    kind: "class",
    members: {
      /** Sends a request and returns Operation<BinaryData> with polling. */
      ProcessMessage: { kind: "method" },
      /** Sends a request and returns Task<Operation<BinaryData>> with polling. */
      ProcessMessageAsync: { kind: "method" },
      /** Sends a request and returns Operation (void) with polling. */
      ProcessMessageWithoutResponseValue: { kind: "method" },
      /** Sends a request and returns Task<Operation> (void) with polling. */
      ProcessMessageWithoutResponseValueAsync: { kind: "method" },
      /** Converts Operation<BinaryData> to Operation<T> using a conversion function. */
      Convert: { kind: "method" },
    },
  },

  /**
   * Abstract base class for classifying HTTP responses by status code.
   * Azure equivalent of System.ClientModel.Primitives' `PipelineMessageClassifier`.
   *
   * Used as the type for lazy-initialized classifier fields in RestClient files.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.responseclassifier
   */
  ResponseClassifier: {
    kind: "class",
    members: {},
  },

  /**
   * Concrete `ResponseClassifier` implementation that classifies responses
   * by their HTTP status code. Created with a `stackalloc ushort[]` of
   * success status codes.
   *
   * Azure equivalent of `PipelineMessageClassifier.Create(stackalloc ushort[] { ... })`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.statuscodeclassifier
   */
  StatusCodeClassifier: {
    kind: "class",
    members: {},
  },

  /**
   * Struct representing an HTTP request method (GET, POST, PUT, etc.).
   * Used in Azure.Core to set the HTTP method on a request.
   * Provides static properties: Get, Post, Put, Patch, Delete, Head, Options, Trace.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.requestmethod
   */
  RequestMethod: {
    kind: "struct",
    members: {
      Get: { kind: "property" },
      Post: { kind: "property" },
      Put: { kind: "property" },
      Patch: { kind: "property" },
      Delete: { kind: "property" },
      Head: { kind: "property" },
      Options: { kind: "property" },
      Trace: { kind: "property" },
    },
  },

  /**
   * Internal shared-source URI builder for Azure HTTP requests.
   * Extends `RequestUriBuilder` with `Reset()` and `AppendPath()`/`AppendQuery()` methods.
   * Compiled from Azure.Core shared source into each generated project.
   *
   * Azure equivalent of the generated `ClientUriBuilder` infrastructure class.
   *
   * @see Azure.Core shared source RawRequestUriBuilder.cs
   */
  RawRequestUriBuilder: {
    kind: "class",
    members: {},
  },

  /**
   * Internal shared-source extension methods for HttpPipeline.
   * Provides ProcessMessage/ProcessMessageAsync as extension methods
   * that handle error checking and cancellation.
   * Compiled from Azure.Core shared source into each generated project.
   *
   * Referenced in protocol methods to trigger `using Azure.Core;` generation
   * when using the static method call syntax for ProcessMessage.
   *
   * @see Azure.Core shared source HttpPipelineExtensions.cs
   */
  HttpPipelineExtensions: {
    kind: "class",
    members: {
      /** Sends a message async, checks for errors, returns Response. */
      ProcessMessageAsync: { kind: "method" },
      /** Sends a message sync, checks for errors, returns Response. */
      ProcessMessage: { kind: "method" },
      /** HEAD request async, returns Response<bool>. */
      ProcessHeadAsBoolMessageAsync: { kind: "method" },
      /** HEAD request sync, returns Response<bool>. */
      ProcessHeadAsBoolMessage: { kind: "method" },
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
