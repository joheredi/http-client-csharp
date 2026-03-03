# Should generate continuation-token paging with additional parameters

Validates that the emitter generates correct paging method signatures when
continuation-token paging operations have additional header and query parameters
beyond the token itself. Corresponds to the Spector
`Payload.Pageable.ServerDrivenPagination.ContinuationToken` scenario pattern.
This tests:

- Continuation token parameter plus additional params (foo, bar) in signatures
- Header and query parameter forwarding in collection result constructors

## TypeSpec

```tsp
@service
namespace TestService;

model Pet {
  id: string;
  name: string;
}

@route("/continuation")
namespace ContinuationToken {
  @route("/request-query-response-body")
  @list
  op requestQueryResponseBody(@continuationToken @query token?: string, @header foo?: string, @query bar?: string): {
    @pageItems pets: Pet[];
    @continuationToken nextToken?: string;
  };
}
```

## Clients

Should generate sub-client with RequestQueryResponseBody paging methods
that include token, foo, and bar parameters in both protocol and convenience
signatures.

```csharp src/Generated/ContinuationToken.cs class ContinuationToken
public partial class ContinuationToken
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of ContinuationToken for mocking. </summary>
        protected ContinuationToken() {}

        /// <summary> Initializes a new instance of ContinuationToken. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal ContinuationToken(ClientPipeline pipeline, Uri endpoint)
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
        /// <param name="foo"></param>
        /// <param name="token"></param>
        /// <param name="bar"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual CollectionResult RequestQueryResponseBody(
            string foo = default,
            string token = default,
            string bar = default,
            RequestOptions options = null
        )
        {
            return new ContinuationTokenRequestQueryResponseBodyCollectionResult(this, foo, token, bar, options);
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="foo"></param>
        /// <param name="token"></param>
        /// <param name="bar"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async AsyncCollectionResult RequestQueryResponseBodyAsync(
            string foo = default,
            string token = default,
            string bar = default,
            RequestOptions options = null
        )
        {
            return new ContinuationTokenRequestQueryResponseBodyAsyncCollectionResult(this, foo, token, bar, options);
        }

        /// <summary>  </summary>
        /// <param name="foo"></param>
        /// <param name="token"></param>
        /// <param name="bar"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual CollectionResult<Pet> RequestQueryResponseBody(
            string foo = default,
            string token = default,
            string bar = default,
            CancellationToken cancellationToken = default
        )
        {
            return new ContinuationTokenRequestQueryResponseBodyCollectionResultOfT(this, foo, token, bar, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="foo"></param>
        /// <param name="token"></param>
        /// <param name="bar"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async AsyncCollectionResult<Pet> RequestQueryResponseBodyAsync(
            string foo = default,
            string token = default,
            string bar = default,
            CancellationToken cancellationToken = default
        )
        {
            return new ContinuationTokenRequestQueryResponseBodyAsyncCollectionResultOfT(this, foo, token, bar, cancellationToken.ToRequestOptions());
        }
    }
```

## CollectionResults

Should generate continuation-token collection result that stores all parameters
(token, foo, bar) as fields for subsequent page requests.

```csharp src/Generated/CollectionResults/ContinuationTokenRequestQueryResponseBodyCollectionResult.cs class ContinuationTokenRequestQueryResponseBodyCollectionResult
internal partial class ContinuationTokenRequestQueryResponseBodyCollectionResult : CollectionResult
    {
        private readonly ContinuationToken _client;
        private readonly string _foo;
        private readonly string _token;
        private readonly string _bar;
        private readonly RequestOptions _options;

        /// <summary> Initializes a new instance of ContinuationTokenRequestQueryResponseBodyCollectionResult, which is used to iterate over the pages of a collection. </summary>
        /// <param name="client"> The ContinuationToken client used to send requests. </param>
        /// <param name="foo"></param>
        /// <param name="token"></param>
        /// <param name="bar"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        public ContinuationTokenRequestQueryResponseBodyCollectionResult(
            ContinuationToken client,
            string foo,
            string token,
            string bar,
            RequestOptions options
        )
        {
            _client = client;
            _foo = foo;
            _token = token;
            _bar = bar;
            _options = options;
        }

        /// <summary> Gets the raw pages of the collection. </summary>
        /// <returns> The raw pages of the collection. </returns>
        public override IEnumerable<ClientResult> GetRawPages()
        {
            PipelineMessage message = _client.CreateRequestQueryResponseBodyRequest(_foo, _token, _bar, _options);
            string nextToken = null;
            while (true)
            {
                ClientResult result = ClientResult.FromResponse(_client.Pipeline.ProcessMessage(message, _options));
                yield return result;

                nextToken = ((RequestQueryResponseBodyResponse)result).NextToken;
                if (string.IsNullOrEmpty(nextToken))
                {
                    yield break;
                }
                message = _client.CreateRequestQueryResponseBodyRequest(_foo, nextToken, _bar, _options);
            }
        }

        /// <summary> Gets the continuation token from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The continuation token for the specified page. </returns>
        public override ContinuationToken GetContinuationToken(ClientResult page)
        {
            string nextPage = ((RequestQueryResponseBodyResponse)page).NextToken;
            if (!string.IsNullOrEmpty(nextPage))
            {
                return ContinuationToken.FromBytes(BinaryData.FromString(nextPage));
            }
            else
            {
                return null;
            }
        }
    }
```

Should generate convenience collection result with GetValuesFromPage for
continuation-token paging with additional parameters.

```csharp src/Generated/CollectionResults/ContinuationTokenRequestQueryResponseBodyCollectionResultOfT.cs class ContinuationTokenRequestQueryResponseBodyCollectionResultOfT
internal partial class ContinuationTokenRequestQueryResponseBodyCollectionResultOfT : CollectionResult<Pet>
    {
        private readonly ContinuationToken _client;
        private readonly string _foo;
        private readonly string _token;
        private readonly string _bar;
        private readonly RequestOptions _options;

        /// <summary> Initializes a new instance of ContinuationTokenRequestQueryResponseBodyCollectionResultOfT, which is used to iterate over the pages of a collection. </summary>
        /// <param name="client"> The ContinuationToken client used to send requests. </param>
        /// <param name="foo"></param>
        /// <param name="token"></param>
        /// <param name="bar"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        public ContinuationTokenRequestQueryResponseBodyCollectionResultOfT(
            ContinuationToken client,
            string foo,
            string token,
            string bar,
            RequestOptions options
        )
        {
            _client = client;
            _foo = foo;
            _token = token;
            _bar = bar;
            _options = options;
        }

        /// <summary> Gets the raw pages of the collection. </summary>
        /// <returns> The raw pages of the collection. </returns>
        public override IEnumerable<ClientResult> GetRawPages()
        {
            PipelineMessage message = _client.CreateRequestQueryResponseBodyRequest(_foo, _token, _bar, _options);
            string nextToken = null;
            while (true)
            {
                ClientResult result = ClientResult.FromResponse(_client.Pipeline.ProcessMessage(message, _options));
                yield return result;

                nextToken = ((RequestQueryResponseBodyResponse)result).NextToken;
                if (string.IsNullOrEmpty(nextToken))
                {
                    yield break;
                }
                message = _client.CreateRequestQueryResponseBodyRequest(_foo, nextToken, _bar, _options);
            }
        }

        /// <summary> Gets the continuation token from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The continuation token for the specified page. </returns>
        public override ContinuationToken GetContinuationToken(ClientResult page)
        {
            string nextPage = ((RequestQueryResponseBodyResponse)page).NextToken;
            if (!string.IsNullOrEmpty(nextPage))
            {
                return ContinuationToken.FromBytes(BinaryData.FromString(nextPage));
            }
            else
            {
                return null;
            }
        }

        /// <summary> Gets the values from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The values from the specified page. </returns>
        protected override IEnumerable<Pet> GetValuesFromPage(ClientResult page)
        {
            return ((RequestQueryResponseBodyResponse)page).Pets;
        }
    }
```
