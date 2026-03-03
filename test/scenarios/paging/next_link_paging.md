# Should generate next-link paging collection result classes

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

  @nextLink
  nextLink?: url;
}

@route("/pets")
@list
@get
op listPets(): PetPage;
```

## CollectionResults

Should generate sync protocol collection result with next-link while loop

```csharp src/Generated/CollectionResults/TestServiceClientGetPetsCollectionResult.cs class TestServiceClientGetPetsCollectionResult
internal partial class TestServiceClientGetPetsCollectionResult : CollectionResult
    {
        private readonly TestServiceClient _client;
        private readonly RequestOptions _options;

        /// <summary> Initializes a new instance of TestServiceClientGetPetsCollectionResult, which is used to iterate over the pages of a collection. </summary>
        /// <param name="client"> The TestServiceClient client used to send requests. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        public TestServiceClientGetPetsCollectionResult(TestServiceClient client, RequestOptions options)
        {
            _client = client;
            _options = options;
        }

        /// <summary> Gets the raw pages of the collection. </summary>
        /// <returns> The raw pages of the collection. </returns>
        public override IEnumerable<ClientResult> GetRawPages()
        {
            PipelineMessage message = _client.CreateGetPetsRequest(_options);
            Uri nextPageUri = null;
            while (true)
            {
                ClientResult result = ClientResult.FromResponse(_client.Pipeline.ProcessMessage(message, _options));
                yield return result;

                nextPageUri = ((PetPage)result).NextLink;
                if (nextPageUri == null)
                {
                    yield break;
                }
                message = _client.CreateNextGetPetsRequest(nextPageUri, _options);
            }
        }

        /// <summary> Gets the continuation token from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The continuation token for the specified page. </returns>
        public override ContinuationToken GetContinuationToken(ClientResult page)
        {
            Uri nextPage = ((PetPage)page).NextLink;
            if (nextPage != null)
            {
                return ContinuationToken.FromBytes(BinaryData.FromString(nextPage.IsAbsoluteUri ? nextPage.AbsoluteUri : nextPage.OriginalString));
            }
            return null;
        }
    }
```

Should generate sync convenience collection result with next-link loop and GetValuesFromPage

```csharp src/Generated/CollectionResults/TestServiceClientGetPetsCollectionResultOfT.cs class TestServiceClientGetPetsCollectionResultOfT
internal partial class TestServiceClientGetPetsCollectionResultOfT : CollectionResult<Pet>
    {
        private readonly TestServiceClient _client;
        private readonly RequestOptions _options;

        /// <summary> Initializes a new instance of TestServiceClientGetPetsCollectionResultOfT, which is used to iterate over the pages of a collection. </summary>
        /// <param name="client"> The TestServiceClient client used to send requests. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        public TestServiceClientGetPetsCollectionResultOfT(TestServiceClient client, RequestOptions options)
        {
            _client = client;
            _options = options;
        }

        /// <summary> Gets the raw pages of the collection. </summary>
        /// <returns> The raw pages of the collection. </returns>
        public override IEnumerable<ClientResult> GetRawPages()
        {
            PipelineMessage message = _client.CreateGetPetsRequest(_options);
            Uri nextPageUri = null;
            while (true)
            {
                ClientResult result = ClientResult.FromResponse(_client.Pipeline.ProcessMessage(message, _options));
                yield return result;

                nextPageUri = ((PetPage)result).NextLink;
                if (nextPageUri == null)
                {
                    yield break;
                }
                message = _client.CreateNextGetPetsRequest(nextPageUri, _options);
            }
        }

        /// <summary> Gets the continuation token from the specified page. </summary>
        /// <param name="page"></param>
        /// <returns> The continuation token for the specified page. </returns>
        public override ContinuationToken GetContinuationToken(ClientResult page)
        {
            Uri nextPage = ((PetPage)page).NextLink;
            if (nextPage != null)
            {
                return ContinuationToken.FromBytes(BinaryData.FromString(nextPage.IsAbsoluteUri ? nextPage.AbsoluteUri : nextPage.OriginalString));
            }
            return null;
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
