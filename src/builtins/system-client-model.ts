import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System.ClientModel namespace.
 *
 * These are core types from the System.ClientModel NuGet package used by
 * generated C# HTTP clients. Referencing these symbols in Alloy JSX components
 * automatically generates the correct `using System.ClientModel;` directive.
 *
 * @remarks Future tasks (0.2.2–0.2.6) will extend this declaration with
 * additional types such as ApiKeyCredential, ClientResultException,
 * CollectionResult, and serialization interfaces.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel
 */
export const SystemClientModel = createLibrary("System.ClientModel", {
  /**
   * Represents the result of a cloud service operation.
   * Non-generic base class used as the return type for protocol methods.
   * The generic variant ClientResult<T> is used for convenience methods.
   */
  ClientResult: {
    kind: "class",
    members: {
      /** Creates a ClientResult{T} from a value and its originating response. */
      FromValue: { kind: "method", methodKind: "ordinary", isStatic: true },
      /** Creates a ClientResult from a raw PipelineResponse. */
      FromResponse: { kind: "method", methodKind: "ordinary", isStatic: true },
    },
  },

  /**
   * Abstract base class for HTTP request body content.
   * Used in protocol methods for request serialization via the
   * static Create factory method.
   */
  BinaryContent: {
    kind: "class",
    members: {
      /** Creates BinaryContent from a serializable model and options. */
      Create: { kind: "method", methodKind: "ordinary", isStatic: true },
    },
  },

  /**
   * Exception thrown when a cloud service returns a non-success status code.
   * Used in generated XML documentation comments and error handling scenarios.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.clientresultexception
   */
  ClientResultException: {
    kind: "class",
    members: {
      /** Gets the HTTP status code of the failed response. */
      Status: { kind: "property" },
    },
  },

  /**
   * Credential type that wraps an API key string for service authentication.
   * Stored as a private field in generated client classes and passed to
   * ApiKeyAuthenticationPolicy for pipeline authentication.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.apikeycredential
   */
  ApiKeyCredential: {
    kind: "class",
    members: {},
  },

  /**
   * Abstract base class for synchronous paginated collection results.
   * Generated collection result classes extend this type (non-generic variant)
   * or the generic CollectionResult{T} to implement pagination over service responses.
   *
   * Used as both `CollectionResult` (non-generic, protocol-level) and
   * `CollectionResult<T>` (generic, convenience-level) via code template syntax:
   * `code\`${SystemClientModel.CollectionResult}<${itemType}>\``
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.collectionresult
   */
  CollectionResult: {
    kind: "class",
    members: {
      /** Returns the continuation token for the given page, or null if no more pages. */
      GetContinuationToken: { kind: "method", methodKind: "ordinary" },
    },
  },

  /**
   * Abstract base class for asynchronous paginated collection results.
   * Generated collection result classes extend this type (non-generic variant)
   * or the generic AsyncCollectionResult{T} to implement async pagination.
   *
   * Used as both `AsyncCollectionResult` (non-generic, protocol-level) and
   * `AsyncCollectionResult<T>` (generic, convenience-level) via code template syntax:
   * `code\`${SystemClientModel.AsyncCollectionResult}<${itemType}>\``
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.asynccollectionresult
   */
  AsyncCollectionResult: {
    kind: "class",
    members: {
      /** Returns the continuation token for the given page, or null if no more pages. */
      GetContinuationToken: { kind: "method", methodKind: "ordinary" },
    },
  },

  /**
   * Represents an opaque pagination token used to resume collection enumeration.
   * Created via the static FromBytes factory method in generated GetContinuationToken
   * implementations. The token is typically constructed from a next-link URL or
   * a continuation token value extracted from a service response.
   *
   * @example `ContinuationToken.FromBytes(BinaryData.FromString(nextPage))`
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.continuationtoken
   */
  ContinuationToken: {
    kind: "class",
    members: {
      /** Creates a ContinuationToken from a BinaryData payload (typically a serialized URL or token string). */
      FromBytes: { kind: "method", methodKind: "ordinary", isStatic: true },
    },
  },
});

/**
 * Alloy library declaration for types in the System.ClientModel.Primitives namespace.
 *
 * These are the pipeline and transport primitives used internally by generated
 * clients to construct HTTP requests, send them through the pipeline, and
 * process responses. Referencing these symbols automatically generates
 * `using System.ClientModel.Primitives;`.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives
 */
export const SystemClientModelPrimitives = createLibrary(
  "System.ClientModel.Primitives",
  {
    /**
     * The HTTP pipeline that sends requests and applies policies.
     * Created via the static Create factory in client constructors.
     */
    ClientPipeline: {
      kind: "class",
      members: {
        /** Creates a new pipeline from client options and per-call/per-try policies. */
        Create: { kind: "method", methodKind: "ordinary", isStatic: true },
        /** Creates a new PipelineMessage for building an HTTP request. */
        CreateMessage: { kind: "method", methodKind: "ordinary" },
        /** Synchronously sends a PipelineMessage through the pipeline. */
        Send: { kind: "method", methodKind: "ordinary" },
        /** Asynchronously sends a PipelineMessage through the pipeline. */
        SendAsync: { kind: "method", methodKind: "ordinary" },
      },
    },

    /**
     * Represents a single HTTP request/response pair flowing through the pipeline.
     * Created by ClientPipeline.CreateMessage, configured via its Request property,
     * then sent; the Response property is populated after sending.
     */
    PipelineMessage: {
      kind: "class",
      members: {
        /** Gets the PipelineRequest to configure URI, headers, and content. */
        Request: {
          kind: "property",
          type: () => SystemClientModelPrimitives.PipelineRequest,
        },
        /** Gets the PipelineResponse after the message has been sent. */
        Response: {
          kind: "property",
          type: () => SystemClientModelPrimitives.PipelineResponse,
        },
        /** Gets or sets whether the response should be buffered in memory. */
        BufferResponse: { kind: "property" },
        /** Extracts and returns the response, transferring ownership to the caller. */
        ExtractResponse: { kind: "method", methodKind: "ordinary" },
        /** Applies RequestOptions overrides to this message. */
        Apply: { kind: "method", methodKind: "ordinary" },
      },
    },

    /**
     * Represents the HTTP request portion of a PipelineMessage.
     * Provides access to headers, content, and URI for request configuration.
     */
    PipelineRequest: {
      kind: "class",
      members: {
        /** Gets the request headers collection for setting HTTP headers. */
        Headers: { kind: "property" },
        /** Gets or sets the request body content. */
        Content: {
          kind: "property",
          type: () => SystemClientModel.BinaryContent,
        },
        /** Gets or sets the request URI. */
        Uri: { kind: "property" },
      },
    },

    /**
     * Represents the HTTP response received from the pipeline.
     * Provides status, headers, content, and error detection.
     */
    PipelineResponse: {
      kind: "class",
      members: {
        /** Gets the HTTP status code of the response. */
        Status: { kind: "property" },
        /** Gets the response body as BinaryData. */
        Content: { kind: "property" },
        /** Gets the response body as a Stream (used for XML parsing). */
        ContentStream: { kind: "property" },
        /** Gets the response headers collection. */
        Headers: { kind: "property" },
        /** Gets whether the response status code indicates an error. */
        IsError: { kind: "property" },
      },
    },

    /**
     * Abstract base class for pipeline policies that process requests and responses.
     * Subclasses implement authentication, retry, logging, etc.
     */
    PipelinePolicy: {
      kind: "class",
      members: {},
    },

    /**
     * Classifies HTTP responses by status code to determine success or failure.
     * Cached as static fields on RestClient classes for efficient reuse.
     */
    PipelineMessageClassifier: {
      kind: "class",
      members: {
        /** Creates a classifier that accepts the specified HTTP status codes. */
        Create: { kind: "method", methodKind: "ordinary", isStatic: true },
      },
    },

    /**
     * Base class for service-specific client options (e.g., {ServiceName}ClientOptions).
     * Generated options classes inherit from this to provide service version enums
     * and custom pipeline configuration.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.clientpipelineoptions
     */
    ClientPipelineOptions: {
      kind: "class",
      members: {},
    },

    /**
     * Per-request options that control pipeline behavior for individual API calls.
     * Used as an optional parameter in protocol method signatures to allow callers
     * to override error behavior and provide cancellation tokens.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.requestoptions
     */
    RequestOptions: {
      kind: "class",
      members: {
        /** Gets or sets the error handling behavior for this request. */
        ErrorOptions: { kind: "property" },
        /** Gets the cancellation token for this request. */
        CancellationToken: { kind: "property" },
      },
    },

    /**
     * Pipeline policy that authenticates requests using an API key.
     * The static CreateHeaderApiKeyPolicy factory creates a policy that adds
     * the key as an HTTP header value.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.apikeyauthenticationpolicy
     */
    ApiKeyAuthenticationPolicy: {
      kind: "class",
      members: {
        /**
         * Creates a policy that authenticates via an API key in the specified
         * HTTP header, optionally with a key prefix (e.g., "Bearer").
         */
        CreateHeaderApiKeyPolicy: {
          kind: "method",
          methodKind: "ordinary",
          isStatic: true,
        },
      },
    },

    /**
     * Abstract base class for token-based authentication providers.
     * Stored as a private field in generated client classes for OAuth2/bearer
     * token authentication scenarios.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.authenticationtokenprovider
     */
    AuthenticationTokenProvider: {
      kind: "class",
      members: {},
    },

    /**
     * Pipeline policy that sets the User-Agent header on outgoing requests.
     * Created in the primary client constructor and passed as a per-retry
     * policy to ClientPipeline.Create.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.useragentpolicy
     */
    UserAgentPolicy: {
      kind: "class",
      members: {},
    },

    /**
     * Pipeline policy that authenticates requests using a bearer token
     * obtained from an AuthenticationTokenProvider.
     * Used in OAuth2-authenticated client constructors.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.bearertokenauthenticationpolicy
     */
    BearerTokenAuthenticationPolicy: {
      kind: "class",
      members: {},
    },

    /**
     * Flags enum that controls how the pipeline handles error responses.
     * Used with RequestOptions.ErrorOptions to suppress automatic exception
     * throwing on non-success status codes.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.clienterrorbehaviors
     */
    ClientErrorBehaviors: {
      kind: "enum",
      members: {
        /** Suppresses automatic ClientResultException throwing on error responses. */
        NoThrow: { kind: "field" },
      },
    },

    /**
     * Options that control the format used by model serialization and deserialization.
     * Passed to IJsonModel and IPersistableModel methods to select wire format ("J" for JSON, "X" for XML).
     * Used as a parameter type in Write, Create, and GetFormatFromOptions methods on generated
     * serialization classes.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.modelreaderwriteroptions
     */
    ModelReaderWriterOptions: {
      kind: "class",
      members: {
        /** Gets the wire format string (e.g., "J" for JSON, "X" for XML). */
        Format: { kind: "property" },
      },
    },

    /**
     * Abstract base class for generated model reader/writer context types.
     * Each generated library produces a context class (e.g., SampleTypeSpecContext)
     * that inherits from this type and registers all serializable models via
     * ModelReaderWriterBuildable attributes. The context is referenced via its
     * static Default property (e.g., SampleTypeSpecContext.Default) when calling
     * ModelReaderWriter.Write.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.modelreaderwritercontext
     */
    ModelReaderWriterContext: {
      kind: "class",
      members: {},
    },

    /**
     * Static helper for serializing and deserializing models that implement
     * IPersistableModel{T}. Used in generated serialization code, e.g.,
     * `ModelReaderWriter.Write(this, options, SampleTypeSpecContext.Default)`.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.modelreaderwriter
     */
    ModelReaderWriter: {
      kind: "class",
      members: {
        /** Serializes a model to BinaryData using the given options and optional context. */
        Write: { kind: "method", methodKind: "ordinary", isStatic: true },
      },
    },

    /**
     * Generic interface implemented by models that support JSON serialization.
     * Generated .Serialization.cs partial classes implement IJsonModel{T} to
     * provide Utf8JsonWriter-based write and Utf8JsonReader-based read methods.
     * The generic type parameter T is the model type itself.
     *
     * @remarks Methods: void Write(Utf8JsonWriter, ModelReaderWriterOptions),
     * T Create(ref Utf8JsonReader, ModelReaderWriterOptions)
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.ijsonmodel-1
     */
    IJsonModel: {
      kind: "interface",
      members: {
        /** Writes the model to a Utf8JsonWriter with the specified format options. */
        Write: { kind: "method", methodKind: "ordinary" },
        /** Creates a model instance from a Utf8JsonReader with the specified format options. */
        Create: { kind: "method", methodKind: "ordinary" },
      },
    },

    /**
     * Generic interface implemented by models that support binary (BinaryData) serialization.
     * Generated .Serialization.cs partial classes implement IPersistableModel{T} to
     * provide format-agnostic write/create methods and format negotiation.
     * The generic type parameter T is the model type itself.
     *
     * @remarks Methods: BinaryData Write(ModelReaderWriterOptions),
     * T Create(BinaryData, ModelReaderWriterOptions),
     * string GetFormatFromOptions(ModelReaderWriterOptions)
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.ipersistablemodel-1
     */
    IPersistableModel: {
      kind: "interface",
      members: {
        /** Serializes the model to BinaryData using the specified format options. */
        Write: { kind: "method", methodKind: "ordinary" },
        /** Creates a model instance from BinaryData using the specified format options. */
        Create: { kind: "method", methodKind: "ordinary" },
        /** Returns the wire format string supported by this model for the given options. */
        GetFormatFromOptions: { kind: "method", methodKind: "ordinary" },
      },
    },

    /**
     * Attribute applied to abstract models with a discriminator to specify
     * the unknown/fallback variant type. Used in polymorphic deserialization
     * so the framework knows which concrete type to instantiate when the
     * discriminator value is unrecognized.
     *
     * @example `[PersistableModelProxy(typeof(UnknownAnimal))]`
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.persistablemodelproxyattribute
     */
    PersistableModelProxyAttribute: {
      kind: "class",
      members: {},
    },

    /**
     * Attribute applied to a ModelReaderWriterContext class to register a
     * model type as buildable (serializable/deserializable). One attribute
     * is added per model type that implements IPersistableModel{T} or IJsonModel{T}.
     *
     * @example `[ModelReaderWriterBuildable(typeof(Dog))]`
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.clientmodel.primitives.modelreaderwriterbuildableattribute
     */
    ModelReaderWriterBuildableAttribute: {
      kind: "class",
      members: {},
    },
  },
);
