# Should generate a client with API Key authentication

Validates that the emitter generates a client class with ApiKeyCredential
constructor overloads and API key authentication policy when using
`@useAuth(ApiKeyAuth<...>)`. Corresponds to the Spector
`Authentication.ApiKey` scenario.

## TypeSpec

```tsp
@service
@useAuth(ApiKeyAuth<ApiKeyLocation.header, "x-ms-api-key">)
namespace Authentication.ApiKey;

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

Should generate a client class with API key credential fields, constructors
accepting ApiKeyCredential, and both convenience and protocol methods.

```csharp src/Generated/ApiKeyClient.cs class ApiKeyClient
public partial class ApiKeyClient
    {
        private readonly Uri _endpoint;
        private readonly ApiKeyCredential _keyCredential;
        private const string AuthorizationHeader = "x-ms-api-key";

        /// <summary> Initializes a new instance of ApiKeyClient for mocking. </summary>
        protected ApiKeyClient() {}

        /// <summary> Initializes a new instance of ApiKeyClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="credential"> A credential used to authenticate to the service. </param>
        public ApiKeyClient(
            Uri endpoint,
            ApiKeyCredential credential
        ) : this(endpoint, credential, new ClientPipelineOptions()) {}

        /// <summary> Initializes a new instance of ApiKeyClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="credential"> A credential used to authenticate to the service. </param>
        /// <param name="options"> The options for configuring the client. </param>
        public ApiKeyClient(Uri endpoint, ApiKeyCredential credential, ClientPipelineOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));
            Argument.AssertNotNull(credential, nameof(credential));

            options ??= new ClientPipelineOptions();

            _endpoint = endpoint;
            _keyCredential = credential;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(ApiKeyClient).Assembly), ApiKeyAuthenticationPolicy.CreateHeaderApiKeyPolicy(_keyCredential, AuthorizationHeader) }, Array.Empty<PipelinePolicy>());
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
