# Should generate paging operations with page-size and without continuation

Validates that the emitter generates correct paging method signatures for
operations without continuation (single-page) and with a @pageSize parameter.
Corresponds to the Spector `Payload.Pageable.PageSize` scenario. This tests:

- Single-page paging (no nextLink or continuationToken) generates single-yield CollectionResult
- @pageSize parameter appears in method signatures
- Both protocol and convenience method variants

## TypeSpec

```tsp
@service
namespace TestService;

model Pet {
  id: string;
  name: string;
}

@route("/pagesize")
namespace PageSize {
  @route("/without-continuation")
  @list
  op listWithoutContinuation(): {
    @pageItems pets: Pet[];
  };

  @route("/list")
  @list
  op listWithPageSize(@pageSize @query pageSize?: int32): {
    @pageItems pets: Pet[];
  };
}
```

## Clients

Should generate sub-client with GetWithoutContinuation and GetWithPageSize
methods, each with sync/async protocol and convenience variants.

```csharp src/Generated/PageSize.cs class PageSize
public partial class PageSize
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of PageSize for mocking. </summary>
        protected PageSize() {}

        /// <summary> Initializes a new instance of PageSize. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal PageSize(ClientPipeline pipeline, Uri endpoint)
        {
            _endpoint = endpoint;
            Pipeline = pipeline;
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

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
        public virtual CollectionResult GetWithoutContinuation(RequestOptions options)
        {
            return new PageSizeGetWithoutContinuationCollectionResult(this, options);
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
        public virtual async AsyncCollectionResult GetWithoutContinuationAsync(RequestOptions options)
        {
            return new PageSizeGetWithoutContinuationAsyncCollectionResult(this, options);
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual CollectionResult<Pet> GetWithoutContinuation(CancellationToken cancellationToken = default)
        {
            return new PageSizeGetWithoutContinuationCollectionResultOfT(this, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async AsyncCollectionResult<Pet> GetWithoutContinuationAsync(
            CancellationToken cancellationToken = default
        )
        {
            return new PageSizeGetWithoutContinuationAsyncCollectionResultOfT(this, cancellationToken.ToRequestOptions());
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="pageSize"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual CollectionResult GetWithPageSize(int pageSize = default, RequestOptions options = null)
        {
            return new PageSizeGetWithPageSizeCollectionResult(this, pageSize, options);
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="pageSize"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async AsyncCollectionResult GetWithPageSizeAsync(
            int pageSize = default,
            RequestOptions options = null
        )
        {
            return new PageSizeGetWithPageSizeAsyncCollectionResult(this, pageSize, options);
        }

        /// <summary>  </summary>
        /// <param name="pageSize"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual CollectionResult<Pet> GetWithPageSize(
            int pageSize = default,
            CancellationToken cancellationToken = default
        )
        {
            return new PageSizeGetWithPageSizeCollectionResultOfT(this, pageSize, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="pageSize"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async AsyncCollectionResult<Pet> GetWithPageSizeAsync(
            int pageSize = default,
            CancellationToken cancellationToken = default
        )
        {
            return new PageSizeGetWithPageSizeAsyncCollectionResultOfT(this, pageSize, cancellationToken.ToRequestOptions());
        }
    }
```

## CollectionResults

Should generate single-page collection result (no continuation loop) for
the without-continuation operation.

```csharp src/Generated/CollectionResults/PageSizeGetWithoutContinuationCollectionResult.cs class PageSizeGetWithoutContinuationCollectionResult
internal partial class PageSizeGetWithoutContinuationCollectionResult : CollectionResult
    {
        private readonly PageSize _client;
        private readonly RequestOptions _options;

        /// <summary> Initializes a new instance of PageSizeGetWithoutContinuationCollectionResult, which is used to iterate over the pages of a collection. </summary>
        /// <param name="client"> The PageSize client used to send requests. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        public PageSizeGetWithoutContinuationCollectionResult(PageSize client, RequestOptions options)
        {
            _client = client;
            _options = options;
        }

        /// <summary> Gets the raw pages of the collection. </summary>
        /// <returns> The raw pages of the collection. </returns>
        public override IEnumerable<ClientResult> GetRawPages()
        {
            PipelineMessage message = _client.CreateGetWithoutContinuationRequest(_options);
            yield return ClientResult.FromResponse(_client.Pipeline.ProcessMessage(message, _options));
        }

        /// <summary> Gets the continuation token from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The continuation token for the specified page. </returns>
        public override ContinuationToken GetContinuationToken(ClientResult page)
        {
            return null;
        }
    }
```

Should generate single-page convenience collection result with GetValuesFromPage
for the without-continuation operation.

```csharp src/Generated/CollectionResults/PageSizeGetWithoutContinuationCollectionResultOfT.cs class PageSizeGetWithoutContinuationCollectionResultOfT
internal partial class PageSizeGetWithoutContinuationCollectionResultOfT : CollectionResult<Pet>
    {
        private readonly PageSize _client;
        private readonly RequestOptions _options;

        /// <summary> Initializes a new instance of PageSizeGetWithoutContinuationCollectionResultOfT, which is used to iterate over the pages of a collection. </summary>
        /// <param name="client"> The PageSize client used to send requests. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        public PageSizeGetWithoutContinuationCollectionResultOfT(PageSize client, RequestOptions options)
        {
            _client = client;
            _options = options;
        }

        /// <summary> Gets the raw pages of the collection. </summary>
        /// <returns> The raw pages of the collection. </returns>
        public override IEnumerable<ClientResult> GetRawPages()
        {
            PipelineMessage message = _client.CreateGetWithoutContinuationRequest(_options);
            yield return ClientResult.FromResponse(_client.Pipeline.ProcessMessage(message, _options));
        }

        /// <summary> Gets the continuation token from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The continuation token for the specified page. </returns>
        public override ContinuationToken GetContinuationToken(ClientResult page)
        {
            return null;
        }

        /// <summary> Gets the values from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The values from the specified page. </returns>
        protected override IEnumerable<Pet> GetValuesFromPage(ClientResult page)
        {
            return ((ListWithoutContinuationResponse)page).Pets;
        }
    }
```
