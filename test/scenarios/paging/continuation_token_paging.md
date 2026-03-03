# Should generate continuation-token paging collection result classes

## TypeSpec

```tsp
@service
namespace TestService;

model Pet {
  name: string;
  id: string;
}

model PetPage {
  @pageItems
  pets: Pet[];

  @continuationToken
  nextToken?: string;
}

@route("/pets")
@list
@get
op listPets(@query @continuationToken token?: string): PetPage;
```

## CollectionResults

Should generate sync protocol collection result with continuation-token while loop and token field

```csharp src/Generated/CollectionResults/TestServiceClientGetPetsCollectionResult.cs class TestServiceClientGetPetsCollectionResult
internal partial class TestServiceClientGetPetsCollectionResult : CollectionResult
    {
        private readonly TestServiceClient _client;
        private readonly string _token;
        private readonly RequestOptions _options;

        /// <summary> Initializes a new instance of TestServiceClientGetPetsCollectionResult, which is used to iterate over the pages of a collection. </summary>
        /// <param name="client"> The TestServiceClient client used to send requests. </param>
        /// <param name="token"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        public TestServiceClientGetPetsCollectionResult(TestServiceClient client, string token, RequestOptions options)
        {
            _client = client;
            _token = token;
            _options = options;
        }

        /// <summary> Gets the raw pages of the collection. </summary>
        /// <returns> The raw pages of the collection. </returns>
        public override IEnumerable<ClientResult> GetRawPages()
        {
            PipelineMessage message = _client.CreateGetPetsRequest(_token, _options);
            string nextToken = null;
            while (true)
            {
                ClientResult result = ClientResult.FromResponse(_client.Pipeline.ProcessMessage(message, _options));
                yield return result;

                nextToken = ((PetPage)result).NextToken;
                if (string.IsNullOrEmpty(nextToken))
                {
                    yield break;
                }
                message = _client.CreateGetPetsRequest(nextToken, _options);
            }
        }

        /// <summary> Gets the continuation token from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The continuation token for the specified page. </returns>
        public override ContinuationToken GetContinuationToken(ClientResult page)
        {
            string nextPage = ((PetPage)page).NextToken;
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

Should generate sync convenience collection result with continuation-token loop and GetValuesFromPage

```csharp src/Generated/CollectionResults/TestServiceClientGetPetsCollectionResultOfT.cs class TestServiceClientGetPetsCollectionResultOfT
internal partial class TestServiceClientGetPetsCollectionResultOfT : CollectionResult<Pet>
    {
        private readonly TestServiceClient _client;
        private readonly string _token;
        private readonly RequestOptions _options;

        /// <summary> Initializes a new instance of TestServiceClientGetPetsCollectionResultOfT, which is used to iterate over the pages of a collection. </summary>
        /// <param name="client"> The TestServiceClient client used to send requests. </param>
        /// <param name="token"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        public TestServiceClientGetPetsCollectionResultOfT(
            TestServiceClient client,
            string token,
            RequestOptions options
        )
        {
            _client = client;
            _token = token;
            _options = options;
        }

        /// <summary> Gets the raw pages of the collection. </summary>
        /// <returns> The raw pages of the collection. </returns>
        public override IEnumerable<ClientResult> GetRawPages()
        {
            PipelineMessage message = _client.CreateGetPetsRequest(_token, _options);
            string nextToken = null;
            while (true)
            {
                ClientResult result = ClientResult.FromResponse(_client.Pipeline.ProcessMessage(message, _options));
                yield return result;

                nextToken = ((PetPage)result).NextToken;
                if (string.IsNullOrEmpty(nextToken))
                {
                    yield break;
                }
                message = _client.CreateGetPetsRequest(nextToken, _options);
            }
        }

        /// <summary> Gets the continuation token from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The continuation token for the specified page. </returns>
        public override ContinuationToken GetContinuationToken(ClientResult page)
        {
            string nextPage = ((PetPage)page).NextToken;
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
            return ((PetPage)page).Pets;
        }
    }
```
