# Should generate a client with union authentication (API Key | OAuth2)

Validates that the emitter generates a client class with both
ApiKeyCredential and AuthenticationTokenProvider constructor overloads
when using `@useAuth(ApiKeyAuth<...> | OAuth2Auth<...>)`.
Corresponds to the Spector `Authentication.Union` scenario.

## TypeSpec

```tsp
@service
@useAuth(ApiKeyAuth<ApiKeyLocation.header, "x-ms-api-key"> | OAuth2Auth<[MyFlow]>)
namespace Authentication.Union;

model MyFlow {
  type: OAuth2FlowType.implicit;
  authorizationUrl: "https://login.microsoftonline.com/common/oauth2/authorize";
  scopes: ["https://security.microsoft.com/.default"];
}

@doc("Check whether client is authenticated")
@get
@route("/validkey")
op validKey(): void;

@doc("Check whether client is authenticated")
@get
@route("/validtoken")
op validToken(): void;
```

## Clients

Should generate a client class with both API key and OAuth2 authentication
with separate constructors per auth scheme.

```csharp src/Generated/UnionClient.cs class UnionClient
public partial class UnionClient
    {
        private readonly Uri _endpoint;
        /// <summary> A credential used to authenticate to the service. </summary>
        private readonly ApiKeyCredential _keyCredential;
        private const string AuthorizationHeader = "x-ms-api-key";
        /// <summary> A credential provider used to authenticate to the service. </summary>
        private readonly AuthenticationTokenProvider _tokenProvider;
        /// <summary> The OAuth2 flows supported by the service. </summary>
        private readonly Dictionary<string, object>[] _flows = new Dictionary<string, object>[]
        {
        new Dictionary<string, object>
        {
        { GetTokenOptions.ScopesPropertyName, new string[] { "https://security.microsoft.com/.default" } },
        { GetTokenOptions.AuthorizationUrlPropertyName, "https://login.microsoftonline.com/common/oauth2/authorize" }
        }
        };

        /// <summary> Initializes a new instance of UnionClient for mocking. </summary>
        protected UnionClient()
        {
        }

        /// <summary> Initializes a new instance of UnionClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="credential"> A credential used to authenticate to the service. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> or <paramref name="credential"/> is null. </exception>
        public UnionClient(
            Uri endpoint,
            ApiKeyCredential credential
        ) : this(endpoint, credential, new UnionClientOptions())
        {
        }

        /// <summary> Initializes a new instance of UnionClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="credential"> A credential used to authenticate to the service. </param>
        /// <param name="options"> The options for configuring the client. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> or <paramref name="credential"/> is null. </exception>
        public UnionClient(Uri endpoint, ApiKeyCredential credential, UnionClientOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));
            Argument.AssertNotNull(credential, nameof(credential));

            options ??= new UnionClientOptions();

            _endpoint = endpoint;
            _keyCredential = credential;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(UnionClient).Assembly), ApiKeyAuthenticationPolicy.CreateHeaderApiKeyPolicy(_keyCredential, AuthorizationHeader) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> Initializes a new instance of UnionClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="tokenProvider"> A token provider used to authenticate to the service. </param>
        /// <param name="options"> The options for configuring the client. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> or <paramref name="tokenProvider"/> is null. </exception>
        public UnionClient(Uri endpoint, AuthenticationTokenProvider tokenProvider, UnionClientOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));
            Argument.AssertNotNull(tokenProvider, nameof(tokenProvider));

            options ??= new UnionClientOptions();

            _endpoint = endpoint;
            _tokenProvider = tokenProvider;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(UnionClient).Assembly), new BearerTokenPolicy(_tokenProvider, _flows) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary> Check whether client is authenticated </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult ValidKey(CancellationToken cancellationToken = default)
        {
            return ValidKey(cancellationToken.ToRequestOptions());
        }

        /// <summary> Check whether client is authenticated </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> ValidKeyAsync(CancellationToken cancellationToken = default)
        {
            return await ValidKeyAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary> Check whether client is authenticated </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult ValidToken(CancellationToken cancellationToken = default)
        {
            return ValidToken(cancellationToken.ToRequestOptions());
        }

        /// <summary> Check whether client is authenticated </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> ValidTokenAsync(CancellationToken cancellationToken = default)
        {
            return await ValidTokenAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
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
        public virtual ClientResult ValidKey(RequestOptions options)
        {
            using PipelineMessage message = CreateValidKeyRequest(options);
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
        public virtual async Task<ClientResult> ValidKeyAsync(RequestOptions options)
        {
            using PipelineMessage message = CreateValidKeyRequest(options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
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
        public virtual ClientResult ValidToken(RequestOptions options)
        {
            using PipelineMessage message = CreateValidTokenRequest(options);
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
        public virtual async Task<ClientResult> ValidTokenAsync(RequestOptions options)
        {
            using PipelineMessage message = CreateValidTokenRequest(options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```
