# Should generate a client with a parameterized server endpoint

Validates that the emitter generates a client class with a `Uri endpoint`
constructor parameter when using `@server("{endpoint}", ...)` with a
parameterized endpoint URL. The client should accept the endpoint as a
constructor parameter. Corresponds to the Spector `Server.Path.Single` scenario.

## TypeSpec

```tsp
@service
@server(
  "{endpoint}",
  "Testserver endpoint",
  {
    @doc("Need to be set as 'http://localhost:3000' in client.")
    endpoint: url,
  }
)
@route("/server/path/single")
namespace Server.Path.Single;

@route("/myOp")
@head
op myOp(): void;
```

## Clients

Should generate a client class with `Uri endpoint` parameter from the
`@server` template variable, and `MyOp`/`MyOpAsync` operation methods.

```csharp src/Generated/SingleClient.cs class SingleClient
public partial class SingleClient
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of SingleClient for mocking. </summary>
        protected SingleClient()
        {
        }

        /// <summary> Initializes a new instance of SingleClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        public SingleClient(Uri endpoint) : this(endpoint, new ClientPipelineOptions())
        {
        }

        /// <summary> Initializes a new instance of SingleClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="options"> The options for configuring the client. </param>
        public SingleClient(Uri endpoint, ClientPipelineOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));

            options ??= new ClientPipelineOptions();

            _endpoint = endpoint;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(SingleClient).Assembly) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult MyOp(CancellationToken cancellationToken = default)
        {
            return MyOp(cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> MyOpAsync(CancellationToken cancellationToken = default)
        {
            return await MyOpAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
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
        public virtual ClientResult MyOp(RequestOptions options)
        {
            using PipelineMessage message = CreateMyOpRequest(options);
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
        public virtual async Task<ClientResult> MyOpAsync(RequestOptions options)
        {
            using PipelineMessage message = CreateMyOpRequest(options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```
