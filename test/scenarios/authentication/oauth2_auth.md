# Should generate a client with OAuth2 authentication

Validates that the emitter generates a client class with
AuthenticationTokenProvider constructor overloads and bearer token
authentication policy when using `@useAuth(OAuth2Auth<...>)`.
Corresponds to the Spector `Authentication.OAuth2` scenario.

## TypeSpec

```tsp
@service
@useAuth(OAuth2Auth<[MyFlow]>)
namespace Authentication.OAuth2;

model MyFlow {
  type: OAuth2FlowType.implicit;
  authorizationUrl: "https://login.microsoftonline.com/common/oauth2/authorize";
  scopes: ["https://security.microsoft.com/.default"];
}

@doc("Check whether client is authenticated")
@get
@route("/valid")
op valid(): void;

@doc("Check whether client is authenticated. Will return an invalid bearer error.")
@get
@route("/invalid")
op invalid(): void;
```

## Clients

Should generate a client class with OAuth2 token provider fields,
constructors accepting AuthenticationTokenProvider, and both convenience
and protocol methods.

```csharp src/Generated/OAuth2Client.cs class OAuth2Client
public partial class OAuth2Client
    {
        private readonly Uri _endpoint;
        private readonly AuthenticationTokenProvider _tokenProvider;
        private static readonly string[] AuthorizationScopes = new string[] { "https://security.microsoft.com/.default" };

        /// <summary> Initializes a new instance of OAuth2Client for mocking. </summary>
        protected OAuth2Client()
        {
        }

        /// <summary> Initializes a new instance of OAuth2Client. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="tokenProvider"> A token provider used to authenticate to the service. </param>
        public OAuth2Client(
            Uri endpoint,
            AuthenticationTokenProvider tokenProvider
        ) : this(endpoint, tokenProvider, new ClientPipelineOptions())
        {
        }

        /// <summary> Initializes a new instance of OAuth2Client. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="tokenProvider"> A token provider used to authenticate to the service. </param>
        /// <param name="options"> The options for configuring the client. </param>
        public OAuth2Client(Uri endpoint, AuthenticationTokenProvider tokenProvider, ClientPipelineOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));
            Argument.AssertNotNull(tokenProvider, nameof(tokenProvider));

            options ??= new ClientPipelineOptions();

            _endpoint = endpoint;
            _tokenProvider = tokenProvider;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(OAuth2Client).Assembly), new BearerTokenAuthenticationPolicy(_tokenProvider, AuthorizationScopes) }, Array.Empty<PipelinePolicy>());
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

        /// <summary> Check whether client is authenticated. Will return an invalid bearer error. </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Invalid(CancellationToken cancellationToken = default)
        {
            return Invalid(cancellationToken.ToRequestOptions());
        }

        /// <summary> Check whether client is authenticated. Will return an invalid bearer error. </summary>
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
        /// [Protocol Method] Check whether client is authenticated. Will return an invalid bearer error.
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
        /// [Protocol Method] Check whether client is authenticated. Will return an invalid bearer error.
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
