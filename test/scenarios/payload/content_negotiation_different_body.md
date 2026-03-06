# Should generate sub-clients for content negotiation with different body types

Validates that the emitter generates client and sub-client classes for content
negotiation scenarios where different content types return different body types.
`getAvatarAsPng` returns binary data while `getAvatarAsJson` returns a
`PngImageAsJson` model. Corresponds to the Spector
`Payload.ContentNegotiation.DifferentBody` scenario.

## TypeSpec

```tsp
@service
namespace Payload.ContentNegotiation;

@route("different-body")
namespace DifferentBody {
  model PngImage {
    @header contentType: "image/png";
    @body image: bytes;
  }

  model PngImageAsJson {
    @header contentType: "application/json";
    content: bytes;
  }

  @sharedRoute
  op getAvatarAsPng(@header accept: "image/png"): PngImage;

  @sharedRoute
  op getAvatarAsJson(@header accept: "application/json"): PngImageAsJson;
}
```

## Clients

Should generate a main client that provides access to the DifferentBody sub-client.

```csharp src/Generated/ContentNegotiationClient.cs class ContentNegotiationClient
public partial class ContentNegotiationClient
    {
        private readonly Uri _endpoint;
        private DifferentBody _cachedDifferentBody;

        /// <summary> Initializes a new instance of ContentNegotiationClient for mocking. </summary>
        protected ContentNegotiationClient()
        {
        }

        /// <summary> Initializes a new instance of ContentNegotiationClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> is null. </exception>
        public ContentNegotiationClient(Uri endpoint) : this(endpoint, new ContentNegotiationClientOptions())
        {
        }

        /// <summary> Initializes a new instance of ContentNegotiationClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="options"> The options for configuring the client. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> is null. </exception>
        public ContentNegotiationClient(Uri endpoint, ContentNegotiationClientOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));

            options ??= new ContentNegotiationClientOptions();

            _endpoint = endpoint;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(ContentNegotiationClient).Assembly) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary> Initializes a new instance of DifferentBody. </summary>
        public virtual DifferentBody GetDifferentBodyClient()
        {
            return Volatile.Read(ref _cachedDifferentBody) ?? Interlocked.CompareExchange(ref _cachedDifferentBody, new DifferentBody(Pipeline, _endpoint), null) ?? _cachedDifferentBody;
        }
    }
```

Should generate the DifferentBody sub-client with both convenience and protocol
methods. `getAvatarAsPng` returns `ClientResult<BinaryData>` (binary), while
`getAvatarAsJson` returns `ClientResult<PngImageAsJson>` (model type).

```csharp src/Generated/DifferentBody.cs class DifferentBody
public partial class DifferentBody
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of DifferentBody for mocking. </summary>
        protected DifferentBody()
        {
        }

        /// <summary> Initializes a new instance of DifferentBody. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal DifferentBody(ClientPipeline pipeline, Uri endpoint)
        {
            _endpoint = endpoint;
            Pipeline = pipeline;
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult<BinaryData> GetAvatarAsPng(CancellationToken cancellationToken = default)
        {
            ClientResult result = GetAvatarAsPng(cancellationToken.ToRequestOptions());
            return ClientResult.FromValue(result.GetRawResponse().Content, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<BinaryData>> GetAvatarAsPngAsync(
            CancellationToken cancellationToken = default
        )
        {
            ClientResult result = await GetAvatarAsPngAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue(result.GetRawResponse().Content, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult<PngImageAsJson> GetAvatarAsJson(CancellationToken cancellationToken = default)
        {
            ClientResult result = GetAvatarAsJson(cancellationToken.ToRequestOptions());
            return ClientResult.FromValue((PngImageAsJson)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<PngImageAsJson>> GetAvatarAsJsonAsync(
            CancellationToken cancellationToken = default
        )
        {
            ClientResult result = await GetAvatarAsJsonAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue((PngImageAsJson)result, result.GetRawResponse());
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult GetAvatarAsPng(RequestOptions options)
        {
            using PipelineMessage message = CreateGetAvatarAsPngRequest(options);
            return ClientResult.FromResponse(Pipeline.ProcessMessage(message, options));
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> GetAvatarAsPngAsync(RequestOptions options)
        {
            using PipelineMessage message = CreateGetAvatarAsPngRequest(options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult GetAvatarAsJson(RequestOptions options)
        {
            using PipelineMessage message = CreateGetAvatarAsJsonRequest(options);
            return ClientResult.FromResponse(Pipeline.ProcessMessage(message, options));
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> GetAvatarAsJsonAsync(RequestOptions options)
        {
            using PipelineMessage message = CreateGetAvatarAsJsonRequest(options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```

## Models

Should generate the PngImageAsJson model with ContentType and Content properties.

```csharp src/Generated/Models/PngImageAsJson.cs class PngImageAsJson
public partial class PngImageAsJson
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        /// <summary> Initializes a new instance of <see cref="PngImageAsJson"/>. </summary>
        /// <param name="content"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="content"/> is null. </exception>
        internal PngImageAsJson(BinaryData content)
        {
            Argument.AssertNotNull(content, nameof(content));

            Content = content;
        }

        /// <summary> Initializes a new instance of <see cref="PngImageAsJson"/>. </summary>
        /// <param name="contentType"></param>
        /// <param name="content"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        internal PngImageAsJson(
            string contentType,
            BinaryData content,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            ContentType = contentType;
            Content = content;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string ContentType { get; }
        public BinaryData Content { get; }
    }
```
