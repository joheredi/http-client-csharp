# Should generate sub-clients for content negotiation with same body type

Validates that the emitter generates client and sub-client classes for content
negotiation scenarios where different content types return the same body type
(binary data). Operations like `getAvatarAsPng` and `getAvatarAsJpeg` both
return `bytes` but with different Accept headers. Corresponds to the Spector
`Payload.ContentNegotiation.SameBody` scenario.

## TypeSpec

```tsp
@service
namespace Payload.ContentNegotiation;

@route("same-body")
namespace SameBody {
  model PngImage {
    @header contentType: "image/png";
    @body image: bytes;
  }

  model JpegImage {
    @header contentType: "image/jpeg";
    @body image: bytes;
  }

  @sharedRoute
  op getAvatarAsPng(@header accept: "image/png"): PngImage;

  @sharedRoute
  op getAvatarAsJpeg(@header accept: "image/jpeg"): JpegImage;
}
```

## Clients

Should generate a main client that provides access to the SameBody sub-client.

```csharp src/Generated/ContentNegotiationClient.cs class ContentNegotiationClient
public partial class ContentNegotiationClient
    {
        private readonly Uri _endpoint;
        private SameBody _cachedSameBody;

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

        /// <summary> Initializes a new instance of SameBody. </summary>
        public virtual SameBody GetSameBodyClient()
        {
            return Volatile.Read(ref _cachedSameBody) ?? Interlocked.CompareExchange(ref _cachedSameBody, new SameBody(Pipeline, _endpoint), null) ?? _cachedSameBody;
        }
    }
```

Should generate the SameBody sub-client with convenience and protocol methods
for getting avatars in PNG and JPEG formats. Convenience methods return
`ClientResult<BinaryData>` since the response is binary data (bytes).

```csharp src/Generated/SameBody.cs class SameBody
public partial class SameBody
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of SameBody for mocking. </summary>
        protected SameBody()
        {
        }

        /// <summary> Initializes a new instance of SameBody. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal SameBody(ClientPipeline pipeline, Uri endpoint)
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
        public virtual ClientResult<BinaryData> GetAvatarAsJpeg(CancellationToken cancellationToken = default)
        {
            ClientResult result = GetAvatarAsJpeg(cancellationToken.ToRequestOptions());
            return ClientResult.FromValue(result.GetRawResponse().Content, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<BinaryData>> GetAvatarAsJpegAsync(
            CancellationToken cancellationToken = default
        )
        {
            ClientResult result = await GetAvatarAsJpegAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue(result.GetRawResponse().Content, result.GetRawResponse());
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
        public virtual ClientResult GetAvatarAsJpeg(RequestOptions options)
        {
            using PipelineMessage message = CreateGetAvatarAsJpegRequest(options);
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
        public virtual async Task<ClientResult> GetAvatarAsJpegAsync(RequestOptions options)
        {
            using PipelineMessage message = CreateGetAvatarAsJpegRequest(options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```
