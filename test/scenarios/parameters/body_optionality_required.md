# Should generate operations with required body parameters

Validates that the emitter generates operations with required body parameters
for both explicit (@body) and implicit (spread) body styles. Corresponds to
the Spector `Parameters.BodyOptionality` scenario.

## TypeSpec

```tsp
@service
namespace Parameters.BodyOptionality;

model BodyModel {
  name: string;
}

@route("/required-explicit")
@post
op requiredExplicit(@body body: BodyModel): void;

@route("/required-implicit")
@post
op requiredImplicit(...BodyModel): void;

namespace OptionalExplicit {
  @route("/optional-explicit/set")
  @post
  op set(@body body?: BodyModel): void;

  @route("/optional-explicit/omit")
  @post
  op omit(@body body?: BodyModel): void;
}
```

## Clients

Should generate client with required body operations and a sub-client accessor.

```csharp src/Generated/BodyOptionalityClient.cs class BodyOptionalityClient
public partial class BodyOptionalityClient
    {
        private readonly Uri _endpoint;
        private OptionalExplicit _cachedOptionalExplicit;

        /// <summary> Initializes a new instance of BodyOptionalityClient for mocking. </summary>
        protected BodyOptionalityClient() {}

        /// <summary> Initializes a new instance of BodyOptionalityClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        public BodyOptionalityClient(Uri endpoint) : this(endpoint, new ClientPipelineOptions()) {}

        /// <summary> Initializes a new instance of BodyOptionalityClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="options"> The options for configuring the client. </param>
        public BodyOptionalityClient(Uri endpoint, ClientPipelineOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));

            options ??= new ClientPipelineOptions();

            _endpoint = endpoint;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(BodyOptionalityClient).Assembly) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult RequiredExplicit(BodyModel body, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(body, nameof(body));

            return RequiredExplicit(body, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> RequiredExplicitAsync(
            BodyModel body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            return await RequiredExplicitAsync(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="name"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult RequiredImplicit(string name, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));

            return RequiredImplicit(new BodyModel(name), cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="name"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> RequiredImplicitAsync(
            string name,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));

            return await RequiredImplicitAsync(new BodyModel(name), cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="content"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult RequiredExplicit(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateRequiredExplicitRequest(content, options);
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
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="content"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> RequiredExplicitAsync(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateRequiredExplicitRequest(content, options);
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
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="content"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult RequiredImplicit(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateRequiredImplicitRequest(content, options);
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
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="content"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> RequiredImplicitAsync(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateRequiredImplicitRequest(content, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }

        /// <summary> Initializes a new instance of OptionalExplicit. </summary>
        public virtual OptionalExplicit GetOptionalExplicitClient()
        {
            return Volatile.Read(ref _cachedOptionalExplicit) ?? Interlocked.CompareExchange(ref _cachedOptionalExplicit, new OptionalExplicit(Pipeline, _endpoint), null) ?? _cachedOptionalExplicit;
        }
    }
```

## Sub-clients

Should generate OptionalExplicit sub-client with optional body parameters
(body = default).

```csharp src/Generated/OptionalExplicit.cs class OptionalExplicit
public partial class OptionalExplicit
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of OptionalExplicit for mocking. </summary>
        protected OptionalExplicit() {}

        /// <summary> Initializes a new instance of OptionalExplicit. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal OptionalExplicit(ClientPipeline pipeline, Uri endpoint)
        {
            _endpoint = endpoint;
            Pipeline = pipeline;
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Set(BodyModel body = default, CancellationToken cancellationToken = default)
        {
            return Set(body, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> SetAsync(
            BodyModel body = default,
            CancellationToken cancellationToken = default
        )
        {
            return await SetAsync(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Omit(BodyModel body = default, CancellationToken cancellationToken = default)
        {
            return Omit(body, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> OmitAsync(
            BodyModel body = default,
            CancellationToken cancellationToken = default
        )
        {
            return await OmitAsync(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Set(BinaryContent content = default, RequestOptions options = null)
        {
            using PipelineMessage message = CreateSetRequest(content, options);
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
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> SetAsync(BinaryContent content = default, RequestOptions options = null)
        {
            using PipelineMessage message = CreateSetRequest(content, options);
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
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Omit(BinaryContent content = default, RequestOptions options = null)
        {
            using PipelineMessage message = CreateOmitRequest(content, options);
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
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> OmitAsync(
            BinaryContent content = default,
            RequestOptions options = null
        )
        {
            using PipelineMessage message = CreateOmitRequest(content, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```

## Models

Should generate BodyModel with required name property.

```csharp src/Generated/Models/BodyModel.cs class BodyModel
public partial class BodyModel
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public BodyModel(string name)
        {
            Argument.AssertNotNull(name, nameof(name));

            Name = name;
        }

        internal BodyModel(string name, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Name = name;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string Name { get; }
    }
```
