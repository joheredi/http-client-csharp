# Should generate a client when server endpoint is not defined

Validates that the emitter generates a client class with a `Uri endpoint`
constructor parameter when the service does not use a `@server` decorator.
The client should automatically accept an endpoint to let users pass in their
own base URL. Corresponds to the Spector `Server.Endpoint.NotDefined` scenario.

## TypeSpec

```tsp
@service
@route("/server/endpoint/not-defined")
namespace Server.Endpoint.NotDefined;

@route("/valid")
@head
op valid(): void;
```

## Clients

Should generate a client class with `Uri endpoint` constructor parameter,
default constructor for mocking, and both convenience and protocol methods.

```csharp src/Generated/NotDefinedClient.cs class NotDefinedClient
public partial class NotDefinedClient
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of NotDefinedClient for mocking. </summary>
        protected NotDefinedClient()
        {
        }

        /// <summary> Initializes a new instance of NotDefinedClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> is null. </exception>
        public NotDefinedClient(Uri endpoint) : this(endpoint, new ClientPipelineOptions())
        {
        }

        /// <summary> Initializes a new instance of NotDefinedClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="options"> The options for configuring the client. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> is null. </exception>
        public NotDefinedClient(Uri endpoint, ClientPipelineOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));

            options ??= new ClientPipelineOptions();

            _endpoint = endpoint;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(NotDefinedClient).Assembly) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Valid(CancellationToken cancellationToken = default)
        {
            return Valid(cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> ValidAsync(CancellationToken cancellationToken = default)
        {
            return await ValidAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
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
        public virtual ClientResult Valid(RequestOptions options)
        {
            using PipelineMessage message = CreateValidRequest(options);
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
        public virtual async Task<ClientResult> ValidAsync(RequestOptions options)
        {
            using PipelineMessage message = CreateValidRequest(options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```
