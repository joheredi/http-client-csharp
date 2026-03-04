# Should generate a client with NoAuth | OAuth2 union authentication

Validates that the emitter generates a client class with only
AuthenticationTokenProvider constructors when using
`@useAuth(NoAuth | OAuth2Auth<...>)`. The NoAuth variant allows
unauthenticated requests while OAuth2 provides token-based auth.
Corresponds to the Spector `Authentication.Noauth.Union` scenario.

## TypeSpec

```tsp
@service
@useAuth(NoAuth | OAuth2Auth<[MyFlow]>)
namespace Authentication.Noauth.Union;

model MyFlow {
  type: OAuth2FlowType.implicit;
  authorizationUrl: "https://login.microsoftonline.com/common/oauth2/authorize";
  scopes: ["https://security.microsoft.com/.default"];
}

@doc("Check whether client can make a request without authentication")
@get
@route("/valid")
op validNoAuth(): void;

@doc("Check whether client is authenticated with OAuth2 token")
@get
@route("/validtoken")
op validToken(): void;
```

## Clients

Should generate a client class with OAuth2 token provider constructors
(NoAuth is handled at runtime, not reflected in constructor signatures).

```csharp src/Generated/UnionClient.cs class UnionClient
public partial class UnionClient
    {
        private readonly Uri _endpoint;
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
        /// <param name="tokenProvider"> A token provider used to authenticate to the service. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> or <paramref name="tokenProvider"/> is null. </exception>
        public UnionClient(
            Uri endpoint,
            AuthenticationTokenProvider tokenProvider
        ) : this(endpoint, tokenProvider, new ClientPipelineOptions())
        {
        }

        /// <summary> Initializes a new instance of UnionClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="tokenProvider"> A token provider used to authenticate to the service. </param>
        /// <param name="options"> The options for configuring the client. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> or <paramref name="tokenProvider"/> is null. </exception>
        public UnionClient(Uri endpoint, AuthenticationTokenProvider tokenProvider, ClientPipelineOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));
            Argument.AssertNotNull(tokenProvider, nameof(tokenProvider));

            options ??= new ClientPipelineOptions();

            _endpoint = endpoint;
            _tokenProvider = tokenProvider;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(UnionClient).Assembly), new BearerTokenPolicy(_tokenProvider, _flows) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary> Check whether client can make a request without authentication </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult ValidNoAuth(CancellationToken cancellationToken = default)
        {
            return ValidNoAuth(cancellationToken.ToRequestOptions());
        }

        /// <summary> Check whether client can make a request without authentication </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> ValidNoAuthAsync(CancellationToken cancellationToken = default)
        {
            return await ValidNoAuthAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary> Check whether client is authenticated with OAuth2 token </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult ValidToken(CancellationToken cancellationToken = default)
        {
            return ValidToken(cancellationToken.ToRequestOptions());
        }

        /// <summary> Check whether client is authenticated with OAuth2 token </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> ValidTokenAsync(CancellationToken cancellationToken = default)
        {
            return await ValidTokenAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>
        /// [Protocol Method] Check whether client can make a request without authentication
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult ValidNoAuth(RequestOptions options)
        {
            using PipelineMessage message = CreateValidNoAuthRequest(options);
            return ClientResult.FromResponse(Pipeline.ProcessMessage(message, options));
        }

        /// <summary>
        /// [Protocol Method] Check whether client can make a request without authentication
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> ValidNoAuthAsync(RequestOptions options)
        {
            using PipelineMessage message = CreateValidNoAuthRequest(options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }

        /// <summary>
        /// [Protocol Method] Check whether client is authenticated with OAuth2 token
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
        /// [Protocol Method] Check whether client is authenticated with OAuth2 token
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
