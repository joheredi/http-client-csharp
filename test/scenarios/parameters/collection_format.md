# Should generate operations with collection format parameters

Validates that the emitter generates sub-clients with operations accepting
collection parameters (IEnumerable&lt;string&gt;) for various query and header
collection formats. Corresponds to the Spector `Parameters.CollectionFormat`
scenario.

## TypeSpec

```tsp
@service
namespace Parameters.CollectionFormat;

namespace Query {
  @route("/query/multi")
  @get
  op multi(@query(#{ explode: true }) colors: string[]): void;

  @route("/query/ssv")
  @get
  op ssv(@query @encode(ArrayEncoding.spaceDelimited) colors: string[]): void;

  @route("/query/pipes")
  @get
  op pipes(@query @encode(ArrayEncoding.pipeDelimited) colors: string[]): void;

  @route("/query/csv")
  @get
  op csv(@query colors: string[]): void;
}

namespace Header {
  @route("/header/csv")
  @get
  op csv(@header colors: string[]): void;
}
```

## Clients

Should generate root client with sub-client accessors.

```csharp src/Generated/CollectionFormatClient.cs class CollectionFormatClient
public partial class CollectionFormatClient
    {
        private readonly Uri _endpoint;
        private Query _cachedQuery;
        private Header _cachedHeader;

        /// <summary> Initializes a new instance of CollectionFormatClient for mocking. </summary>
        protected CollectionFormatClient() {}

        /// <summary> Initializes a new instance of CollectionFormatClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        public CollectionFormatClient(Uri endpoint) : this(endpoint, new ClientPipelineOptions()) {}

        /// <summary> Initializes a new instance of CollectionFormatClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="options"> The options for configuring the client. </param>
        public CollectionFormatClient(Uri endpoint, ClientPipelineOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));

            options ??= new ClientPipelineOptions();

            _endpoint = endpoint;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(CollectionFormatClient).Assembly) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary> Initializes a new instance of Query. </summary>
        public virtual Query GetQueryClient()
        {
            return Volatile.Read(ref _cachedQuery) ?? Interlocked.CompareExchange(ref _cachedQuery, new Query(Pipeline, _endpoint), null) ?? _cachedQuery;
        }

        /// <summary> Initializes a new instance of Header. </summary>
        public virtual Header GetHeaderClient()
        {
            return Volatile.Read(ref _cachedHeader) ?? Interlocked.CompareExchange(ref _cachedHeader, new Header(Pipeline, _endpoint), null) ?? _cachedHeader;
        }
    }
```

## Query sub-client

Should generate Query sub-client with operations for multi, ssv, pipes, csv formats.

```csharp src/Generated/Query.cs class Query
public partial class Query
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of Query for mocking. </summary>
        protected Query() {}

        /// <summary> Initializes a new instance of Query. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal Query(ClientPipeline pipeline, Uri endpoint)
        {
            _endpoint = endpoint;
            Pipeline = pipeline;
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="colors"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Multi(string[] colors, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            return Multi(colors, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="colors"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> MultiAsync(
            string[] colors,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(colors, nameof(colors));

            return await MultiAsync(colors, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="colors"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Ssv(string[] colors, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            return Ssv(colors, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="colors"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> SsvAsync(string[] colors, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            return await SsvAsync(colors, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="colors"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Pipes(string[] colors, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            return Pipes(colors, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="colors"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> PipesAsync(
            string[] colors,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(colors, nameof(colors));

            return await PipesAsync(colors, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="colors"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Csv(string[] colors, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            return Csv(colors, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="colors"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> CsvAsync(string[] colors, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            return await CsvAsync(colors, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="colors"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Multi(string colors, RequestOptions options)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            using PipelineMessage message = CreateMultiRequest(colors, options);
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
        /// <param name="colors"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> MultiAsync(string colors, RequestOptions options)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            using PipelineMessage message = CreateMultiRequest(colors, options);
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
        /// <param name="colors"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Ssv(string colors, RequestOptions options)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            using PipelineMessage message = CreateSsvRequest(colors, options);
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
        /// <param name="colors"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> SsvAsync(string colors, RequestOptions options)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            using PipelineMessage message = CreateSsvRequest(colors, options);
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
        /// <param name="colors"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Pipes(string colors, RequestOptions options)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            using PipelineMessage message = CreatePipesRequest(colors, options);
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
        /// <param name="colors"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> PipesAsync(string colors, RequestOptions options)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            using PipelineMessage message = CreatePipesRequest(colors, options);
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
        /// <param name="colors"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Csv(string colors, RequestOptions options)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            using PipelineMessage message = CreateCsvRequest(colors, options);
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
        /// <param name="colors"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> CsvAsync(string colors, RequestOptions options)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            using PipelineMessage message = CreateCsvRequest(colors, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```

## Header sub-client

Should generate Header sub-client with CSV collection format operation.

```csharp src/Generated/Header.cs class Header
public partial class Header
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of Header for mocking. </summary>
        protected Header() {}

        /// <summary> Initializes a new instance of Header. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal Header(ClientPipeline pipeline, Uri endpoint)
        {
            _endpoint = endpoint;
            Pipeline = pipeline;
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="colors"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Csv(string[] colors, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            return Csv(colors, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="colors"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> CsvAsync(string[] colors, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            return await CsvAsync(colors, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="colors"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Csv(string colors, RequestOptions options)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            using PipelineMessage message = CreateCsvRequest(colors, options);
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
        /// <param name="colors"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="colors"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> CsvAsync(string colors, RequestOptions options)
        {
            Argument.AssertNotNull(colors, nameof(colors));

            using PipelineMessage message = CreateCsvRequest(colors, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```
