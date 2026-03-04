# Should generate sub-client with multiple next-link paging operations

Validates that the emitter generates correct paging method signatures on a
sub-client class when multiple next-link paging operations exist. Corresponds
to the Spector `Payload.Pageable.ServerDrivenPagination` scenario. The sub-client
must have:

- 4 method variants per operation (sync/async × protocol/convenience)
- CollectionResult return types for protocol methods
- CollectionResult\<T\> return types for convenience methods

## TypeSpec

```tsp
@service
namespace TestService;

model Pet {
  id: string;
  name: string;
}

@route("/server-driven-pagination")
namespace ServerDrivenPagination {
  @route("/link")
  @list
  op link(): {
    @pageItems pets: Pet[];
    @nextLink next?: url;
  };

  @route("/link-string")
  @list
  op linkString(): {
    @pageItems pets: Pet[];
    @nextLink next?: string;
  };
}
```

## Clients

Should generate sub-client with Link and LinkString paging methods,
each having sync/async protocol and convenience variants that return
CollectionResult or AsyncCollectionResult types.

```csharp src/Generated/ServerDrivenPagination.cs class ServerDrivenPagination
public partial class ServerDrivenPagination
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of ServerDrivenPagination for mocking. </summary>
        protected ServerDrivenPagination()
        {
        }

        /// <summary> Initializes a new instance of ServerDrivenPagination. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal ServerDrivenPagination(ClientPipeline pipeline, Uri endpoint)
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
        public virtual CollectionResult Link(RequestOptions options)
        {
            return new ServerDrivenPaginationLinkCollectionResult(this, options);
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
        public virtual AsyncCollectionResult LinkAsync(RequestOptions options)
        {
            return new ServerDrivenPaginationLinkAsyncCollectionResult(this, options);
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual CollectionResult<Pet> Link(CancellationToken cancellationToken = default)
        {
            return new ServerDrivenPaginationLinkCollectionResultOfT(this, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual AsyncCollectionResult<Pet> LinkAsync(CancellationToken cancellationToken = default)
        {
            return new ServerDrivenPaginationLinkAsyncCollectionResultOfT(this, cancellationToken.ToRequestOptions());
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
        public virtual CollectionResult LinkString(RequestOptions options)
        {
            return new ServerDrivenPaginationLinkStringCollectionResult(this, options);
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
        public virtual AsyncCollectionResult LinkStringAsync(RequestOptions options)
        {
            return new ServerDrivenPaginationLinkStringAsyncCollectionResult(this, options);
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual CollectionResult<Pet> LinkString(CancellationToken cancellationToken = default)
        {
            return new ServerDrivenPaginationLinkStringCollectionResultOfT(this, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual AsyncCollectionResult<Pet> LinkStringAsync(CancellationToken cancellationToken = default)
        {
            return new ServerDrivenPaginationLinkStringAsyncCollectionResultOfT(this, cancellationToken.ToRequestOptions());
        }
    }
```
