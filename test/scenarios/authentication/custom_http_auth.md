# Should generate a client with custom HTTP authentication

Validates that the emitter generates a client class with ApiKeyCredential
constructor overloads when using a custom HTTP authentication scheme.
Non-bearer HTTP auth is mapped to API key credential.
Corresponds to the Spector `Authentication.Http.Custom` scenario.

## TypeSpec

```tsp
@service
@useAuth({
  type: AuthType.http,
  scheme: "SharedAccessKey",
})
namespace Authentication.Http.Custom;

@doc("Check whether client is authenticated")
@get
@route("/valid")
op valid(): void;

@doc("Check whether client is authenticated.")
@get
@route("/invalid")
op invalid(): void;
```

## Clients

Should generate a client class with API key credential (custom HTTP auth
maps to API key authentication).

```csharp src/Generated/CustomClient.cs class CustomClient
public partial class CustomClient
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of CustomClient for mocking. </summary>
        protected CustomClient()
        {
        }

        /// <summary> Initializes a new instance of CustomClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        public CustomClient(Uri endpoint) : this(endpoint, new ClientPipelineOptions())
        {
        }

        /// <summary> Initializes a new instance of CustomClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="options"> The options for configuring the client. </param>
        public CustomClient(Uri endpoint, ClientPipelineOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));

            options ??= new ClientPipelineOptions();

            _endpoint = endpoint;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(CustomClient).Assembly) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary> Check whether client is authenticated </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Valid(CancellationToken cancellationToken = default)
        {
            return Valid(cancellationToken.ToRequestOptions());
        }

        /// <summary> Check whether client is authenticated </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> ValidAsync(CancellationToken cancellationToken = default)
        {
            return await ValidAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary> Check whether client is authenticated. </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Invalid(CancellationToken cancellationToken = default)
        {
            return Invalid(cancellationToken.ToRequestOptions());
        }

        /// <summary> Check whether client is authenticated. </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> InvalidAsync(CancellationToken cancellationToken = default)
        {
            return await InvalidAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>
        /// [Protocol Method] Check whether client is authenticated
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
        /// [Protocol Method] Check whether client is authenticated
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

        /// <summary>
        /// [Protocol Method] Check whether client is authenticated.
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Invalid(RequestOptions options)
        {
            using PipelineMessage message = CreateInvalidRequest(options);
            return ClientResult.FromResponse(Pipeline.ProcessMessage(message, options));
        }

        /// <summary>
        /// [Protocol Method] Check whether client is authenticated.
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> InvalidAsync(RequestOptions options)
        {
            using PipelineMessage message = CreateInvalidRequest(options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```
