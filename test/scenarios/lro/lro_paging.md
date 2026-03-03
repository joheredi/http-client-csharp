# Should generate paging infrastructure for LRO+paging operations

Operations that combine LRO and paging (TCGC kind "lropaging") generate the same
paging infrastructure as regular paging operations. The LRO metadata does not affect
method signatures or return types for the System.ClientModel target. This scenario
verifies that `@markAsLro` combined with `@list` produces collection result classes
and CollectionResult return types.

## TypeSpec

```tsp
using Azure.ClientGenerator.Core.Legacy;

@service
namespace TestService;

model Item {
  name: string;
}

model PagedItems {
  @pageItems
  items: Item[];

  @nextLink
  nextLink?: url;
}

@route("/batch-items")
@list
@get
@markAsLro
op listBatchItems(): PagedItems;
```

## CollectionResults

Should generate sync protocol collection result for LRO+paging operation

```csharp src/Generated/CollectionResults/TestServiceClientGetBatchItemsCollectionResult.cs class TestServiceClientGetBatchItemsCollectionResult
internal partial class TestServiceClientGetBatchItemsCollectionResult : CollectionResult
    {
        private readonly TestServiceClient _client;
        private readonly RequestOptions _options;

        /// <summary> Initializes a new instance of TestServiceClientGetBatchItemsCollectionResult, which is used to iterate over the pages of a collection. </summary>
        /// <param name="client"> The TestServiceClient client used to send requests. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        public TestServiceClientGetBatchItemsCollectionResult(TestServiceClient client, RequestOptions options)
        {
            _client = client;
            _options = options;
        }

        /// <summary> Gets the raw pages of the collection. </summary>
        /// <returns> The raw pages of the collection. </returns>
        public override IEnumerable<ClientResult> GetRawPages()
        {
            PipelineMessage message = _client.CreateGetBatchItemsRequest(_options);
            Uri nextPageUri = null;
            while (true)
            {
                ClientResult result = ClientResult.FromResponse(_client.Pipeline.ProcessMessage(message, _options));
                yield return result;

                nextPageUri = ((PagedItems)result).NextLink;
                if (nextPageUri == null)
                {
                    yield break;
                }
                message = _client.CreateNextGetBatchItemsRequest(nextPageUri, _options);
            }
        }

        /// <summary> Gets the continuation token from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The continuation token for the specified page. </returns>
        public override ContinuationToken GetContinuationToken(ClientResult page)
        {
            Uri nextPage = ((PagedItems)page).NextLink;
            if (nextPage != null)
            {
                return ContinuationToken.FromBytes(BinaryData.FromString(nextPage.IsAbsoluteUri ? nextPage.AbsoluteUri : nextPage.OriginalString));
            }
            return null;
        }
    }
```

Should generate sync convenience collection result with GetValuesFromPage for LRO+paging operation

```csharp src/Generated/CollectionResults/TestServiceClientGetBatchItemsCollectionResultOfT.cs class TestServiceClientGetBatchItemsCollectionResultOfT
internal partial class TestServiceClientGetBatchItemsCollectionResultOfT : CollectionResult<Item>
    {
        private readonly TestServiceClient _client;
        private readonly RequestOptions _options;

        /// <summary> Initializes a new instance of TestServiceClientGetBatchItemsCollectionResultOfT, which is used to iterate over the pages of a collection. </summary>
        /// <param name="client"> The TestServiceClient client used to send requests. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        public TestServiceClientGetBatchItemsCollectionResultOfT(TestServiceClient client, RequestOptions options)
        {
            _client = client;
            _options = options;
        }

        /// <summary> Gets the raw pages of the collection. </summary>
        /// <returns> The raw pages of the collection. </returns>
        public override IEnumerable<ClientResult> GetRawPages()
        {
            PipelineMessage message = _client.CreateGetBatchItemsRequest(_options);
            Uri nextPageUri = null;
            while (true)
            {
                ClientResult result = ClientResult.FromResponse(_client.Pipeline.ProcessMessage(message, _options));
                yield return result;

                nextPageUri = ((PagedItems)result).NextLink;
                if (nextPageUri == null)
                {
                    yield break;
                }
                message = _client.CreateNextGetBatchItemsRequest(nextPageUri, _options);
            }
        }

        /// <summary> Gets the continuation token from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The continuation token for the specified page. </returns>
        public override ContinuationToken GetContinuationToken(ClientResult page)
        {
            Uri nextPage = ((PagedItems)page).NextLink;
            if (nextPage != null)
            {
                return ContinuationToken.FromBytes(BinaryData.FromString(nextPage.IsAbsoluteUri ? nextPage.AbsoluteUri : nextPage.OriginalString));
            }
            return null;
        }

        /// <summary> Gets the values from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The values from the specified page. </returns>
        protected override IEnumerable<Item> GetValuesFromPage(ClientResult page)
        {
            return ((PagedItems)page).Items;
        }
    }
```
