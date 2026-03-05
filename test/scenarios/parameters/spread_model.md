# Should generate operations with spread parameters

Validates that the emitter generates sub-clients with operations
using spread model types for request bodies. Spread operations should
expose the model properties as individual method parameters in convenience
methods. Corresponds to the Spector `Parameters.Spread` scenario.

## TypeSpec

```tsp
@service
namespace Parameters.Spread;

namespace Model {
  model BodyParameter {
    name: string;
  }

  @route("/model/request-body")
  @put
  op spreadAsRequestBody(...BodyParameter): void;

  @route("/model/composite-request-only-with-body")
  @put
  op spreadCompositeRequestOnlyWithBody(@body body: BodyParameter): void;

  @route("/model/composite-request-without-body/{name}")
  @put
  op spreadCompositeRequestWithoutBody(@path name: string, @header testHeader: string): void;

  @route("/model/composite-request/{name}")
  @put
  op spreadCompositeRequest(@path name: string, @header testHeader: string, @body body: BodyParameter): void;

  @route("/model/composite-request-mix/{name}")
  @put
  op spreadCompositeRequestMix(@path name: string, @header testHeader: string, prop: string): void;
}
```

## Clients

Should generate root client with sub-client accessor.

```csharp src/Generated/SpreadClient.cs class SpreadClient
public partial class SpreadClient
    {
        private readonly Uri _endpoint;
        private Model _cachedModel;

        /// <summary> Initializes a new instance of SpreadClient for mocking. </summary>
        protected SpreadClient()
        {
        }

        /// <summary> Initializes a new instance of SpreadClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> is null. </exception>
        public SpreadClient(Uri endpoint) : this(endpoint, new ClientPipelineOptions())
        {
        }

        /// <summary> Initializes a new instance of SpreadClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="options"> The options for configuring the client. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> is null. </exception>
        public SpreadClient(Uri endpoint, ClientPipelineOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));

            options ??= new ClientPipelineOptions();

            _endpoint = endpoint;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(SpreadClient).Assembly) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary> Initializes a new instance of Model. </summary>
        public virtual Model GetModelClient()
        {
            return Volatile.Read(ref _cachedModel) ?? Interlocked.CompareExchange(ref _cachedModel, new Model(Pipeline, _endpoint), null) ?? _cachedModel;
        }
    }
```

## Sub-clients

Should generate Model sub-client with spread operations.

```csharp src/Generated/Model.cs class Model
public partial class Model
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of Model for mocking. </summary>
        protected Model()
        {
        }

        /// <summary> Initializes a new instance of Model. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal Model(ClientPipeline pipeline, Uri endpoint)
        {
            _endpoint = endpoint;
            Pipeline = pipeline;
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="name"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult SpreadAsRequestBody(string name, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));

            return SpreadAsRequestBody(new BodyParameter(name), cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="name"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> SpreadAsRequestBodyAsync(
            string name,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));

            return await SpreadAsRequestBodyAsync(new BodyParameter(name), cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult SpreadCompositeRequestOnlyWithBody(
            BodyParameter body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            return SpreadCompositeRequestOnlyWithBody(body, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> SpreadCompositeRequestOnlyWithBodyAsync(
            BodyParameter body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            return await SpreadCompositeRequestOnlyWithBodyAsync(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="name"></param>
        /// <param name="testHeader"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/> or <paramref name="testHeader"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> or <paramref name="testHeader"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult SpreadCompositeRequestWithoutBody(
            string name,
            string testHeader,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));
            Argument.AssertNotNullOrEmpty(testHeader, nameof(testHeader));

            return SpreadCompositeRequestWithoutBody(name, testHeader, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="name"></param>
        /// <param name="testHeader"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/> or <paramref name="testHeader"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> or <paramref name="testHeader"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> SpreadCompositeRequestWithoutBodyAsync(
            string name,
            string testHeader,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));
            Argument.AssertNotNullOrEmpty(testHeader, nameof(testHeader));

            return await SpreadCompositeRequestWithoutBodyAsync(name, testHeader, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="name"></param>
        /// <param name="testHeader"></param>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/>, <paramref name="testHeader"/> or <paramref name="body"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> or <paramref name="testHeader"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult SpreadCompositeRequest(
            string name,
            string testHeader,
            BodyParameter body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));
            Argument.AssertNotNullOrEmpty(testHeader, nameof(testHeader));
            Argument.AssertNotNull(body, nameof(body));

            return SpreadCompositeRequest(name, testHeader, body, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="name"></param>
        /// <param name="testHeader"></param>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/>, <paramref name="testHeader"/> or <paramref name="body"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> or <paramref name="testHeader"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> SpreadCompositeRequestAsync(
            string name,
            string testHeader,
            BodyParameter body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));
            Argument.AssertNotNullOrEmpty(testHeader, nameof(testHeader));
            Argument.AssertNotNull(body, nameof(body));

            return await SpreadCompositeRequestAsync(name, testHeader, body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="name"></param>
        /// <param name="testHeader"></param>
        /// <param name="prop"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/>, <paramref name="testHeader"/> or <paramref name="prop"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/>, <paramref name="testHeader"/> or <paramref name="prop"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult SpreadCompositeRequestMix(
            string name,
            string testHeader,
            string prop,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));
            Argument.AssertNotNullOrEmpty(testHeader, nameof(testHeader));
            Argument.AssertNotNullOrEmpty(prop, nameof(prop));

            return SpreadCompositeRequestMix(name, testHeader, BinaryContentHelper.FromObject(new SpreadCompositeRequestMixRequest(prop)), cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="name"></param>
        /// <param name="testHeader"></param>
        /// <param name="prop"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/>, <paramref name="testHeader"/> or <paramref name="prop"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/>, <paramref name="testHeader"/> or <paramref name="prop"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> SpreadCompositeRequestMixAsync(
            string name,
            string testHeader,
            string prop,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));
            Argument.AssertNotNullOrEmpty(testHeader, nameof(testHeader));
            Argument.AssertNotNullOrEmpty(prop, nameof(prop));

            return await SpreadCompositeRequestMixAsync(name, testHeader, BinaryContentHelper.FromObject(new SpreadCompositeRequestMixRequest(prop)), cancellationToken.ToRequestOptions()).ConfigureAwait(false);
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
        public virtual ClientResult SpreadAsRequestBody(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateSpreadAsRequestBodyRequest(content, options);
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
        public virtual async Task<ClientResult> SpreadAsRequestBodyAsync(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateSpreadAsRequestBodyRequest(content, options);
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
        public virtual ClientResult SpreadCompositeRequestOnlyWithBody(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateSpreadCompositeRequestOnlyWithBodyRequest(content, options);
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
        public virtual async Task<ClientResult> SpreadCompositeRequestOnlyWithBodyAsync(
            BinaryContent content,
            RequestOptions options
        )
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateSpreadCompositeRequestOnlyWithBodyRequest(content, options);
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
        /// <param name="name"></param>
        /// <param name="testHeader"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/> or <paramref name="testHeader"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> or <paramref name="testHeader"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult SpreadCompositeRequestWithoutBody(
            string name,
            string testHeader,
            RequestOptions options
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));
            Argument.AssertNotNullOrEmpty(testHeader, nameof(testHeader));

            using PipelineMessage message = CreateSpreadCompositeRequestWithoutBodyRequest(name, testHeader, options);
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
        /// <param name="name"></param>
        /// <param name="testHeader"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/> or <paramref name="testHeader"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> or <paramref name="testHeader"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> SpreadCompositeRequestWithoutBodyAsync(
            string name,
            string testHeader,
            RequestOptions options
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));
            Argument.AssertNotNullOrEmpty(testHeader, nameof(testHeader));

            using PipelineMessage message = CreateSpreadCompositeRequestWithoutBodyRequest(name, testHeader, options);
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
        /// <param name="name"></param>
        /// <param name="testHeader"></param>
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/>, <paramref name="testHeader"/> or <paramref name="content"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> or <paramref name="testHeader"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult SpreadCompositeRequest(
            string name,
            string testHeader,
            BinaryContent content,
            RequestOptions options
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));
            Argument.AssertNotNullOrEmpty(testHeader, nameof(testHeader));
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateSpreadCompositeRequestRequest(name, testHeader, content, options);
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
        /// <param name="name"></param>
        /// <param name="testHeader"></param>
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/>, <paramref name="testHeader"/> or <paramref name="content"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> or <paramref name="testHeader"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> SpreadCompositeRequestAsync(
            string name,
            string testHeader,
            BinaryContent content,
            RequestOptions options
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));
            Argument.AssertNotNullOrEmpty(testHeader, nameof(testHeader));
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateSpreadCompositeRequestRequest(name, testHeader, content, options);
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
        /// <param name="name"></param>
        /// <param name="testHeader"></param>
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/>, <paramref name="testHeader"/> or <paramref name="content"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> or <paramref name="testHeader"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult SpreadCompositeRequestMix(
            string name,
            string testHeader,
            BinaryContent content,
            RequestOptions options
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));
            Argument.AssertNotNullOrEmpty(testHeader, nameof(testHeader));
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateSpreadCompositeRequestMixRequest(name, testHeader, content, options);
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
        /// <param name="name"></param>
        /// <param name="testHeader"></param>
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/>, <paramref name="testHeader"/> or <paramref name="content"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="name"/> or <paramref name="testHeader"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> SpreadCompositeRequestMixAsync(
            string name,
            string testHeader,
            BinaryContent content,
            RequestOptions options
        )
        {
            Argument.AssertNotNullOrEmpty(name, nameof(name));
            Argument.AssertNotNullOrEmpty(testHeader, nameof(testHeader));
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateSpreadCompositeRequestMixRequest(name, testHeader, content, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```

## Models

Should generate BodyParameter model with name property.

```csharp src/Generated/Models/BodyParameter.cs class BodyParameter
public partial class BodyParameter
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        /// <summary> Initializes a new instance of <see cref="BodyParameter"/>. </summary>
        /// <param name="name"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/> is null. </exception>
        public BodyParameter(string name)
        {
            Argument.AssertNotNull(name, nameof(name));

            Name = name;
        }

        /// <summary> Initializes a new instance of <see cref="BodyParameter"/>. </summary>
        /// <param name="name"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        internal BodyParameter(string name, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Name = name;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string Name { get; }
    }
```
