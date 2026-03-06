# Should generate a versioned client with multiple server path parameters

Validates that the emitter generates a client class with `Uri endpoint` and
custom `MultipleClientOptions` when using `@server` with multiple path
parameters including `apiVersion` from `@versioned`. The `MultipleClientOptions`
class should include a `ServiceVersion` enum. Corresponds to the Spector
`Server.Path.Multiple` scenario.

## TypeSpec

```tsp
using TypeSpec.Versioning;

@versioned(Versions)
@service(#{ title: "ServerPathMultiple" })
@server(
  "{endpoint}/server/path/multiple/{apiVersion}",
  "Test server with path parameters.",
  {
    @doc("Pass in http://localhost:3000 for endpoint.")
    endpoint: url,
    @doc("Pass in v1.0 for API version.")
    apiVersion: Versions,
  }
)
namespace Server.Path.Multiple;

@doc("Service versions")
enum Versions {
  @doc("Version 1.0")
  v1_0: "v1.0",
}

op noOperationParams(): void;

op withOperationPathParam(@path keyword: string): void;
```

## Clients

Should generate a client class with `Uri endpoint` and `MultipleClientOptions`
constructor parameters, `NoOperationParams` and `WithOperationPathParam`
operation methods with proper argument validation.

```csharp src/Generated/MultipleClient.cs class MultipleClient
public partial class MultipleClient
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of MultipleClient for mocking. </summary>
        protected MultipleClient()
        {
        }

        /// <summary> Initializes a new instance of MultipleClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> is null. </exception>
        public MultipleClient(Uri endpoint) : this(endpoint, new MultipleClientOptions())
        {
        }

        /// <summary> Initializes a new instance of MultipleClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="options"> The options for configuring the client. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> is null. </exception>
        public MultipleClient(Uri endpoint, MultipleClientOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));

            options ??= new MultipleClientOptions();

            ClientUriBuilder endpointBuilder = new ClientUriBuilder();
            endpointBuilder.Reset(endpoint);
            endpointBuilder.AppendPath("/server/path/multiple/", false);
            endpointBuilder.AppendPath(options.Version, true);
            _endpoint = endpointBuilder.ToUri();
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(MultipleClient).Assembly) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult NoOperationParams(CancellationToken cancellationToken = default)
        {
            return NoOperationParams(cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> NoOperationParamsAsync(CancellationToken cancellationToken = default)
        {
            return await NoOperationParamsAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="keyword"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="keyword"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="keyword"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult WithOperationPathParam(
            string keyword,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNullOrEmpty(keyword, nameof(keyword));

            return WithOperationPathParam(keyword, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="keyword"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="keyword"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="keyword"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> WithOperationPathParamAsync(
            string keyword,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNullOrEmpty(keyword, nameof(keyword));

            return await WithOperationPathParamAsync(keyword, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
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
        public virtual ClientResult NoOperationParams(RequestOptions options)
        {
            using PipelineMessage message = CreateNoOperationParamsRequest(options);
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
        public virtual async Task<ClientResult> NoOperationParamsAsync(RequestOptions options)
        {
            using PipelineMessage message = CreateNoOperationParamsRequest(options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="keyword"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="keyword"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="keyword"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult WithOperationPathParam(string keyword, RequestOptions options)
        {
            Argument.AssertNotNullOrEmpty(keyword, nameof(keyword));

            using PipelineMessage message = CreateWithOperationPathParamRequest(keyword, options);
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
        /// <param name="keyword"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="keyword"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="keyword"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> WithOperationPathParamAsync(string keyword, RequestOptions options)
        {
            Argument.AssertNotNullOrEmpty(keyword, nameof(keyword));

            using PipelineMessage message = CreateWithOperationPathParamRequest(keyword, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```

## Client Options

Should generate a `MultipleClientOptions` class extending `ClientPipelineOptions`
with a `ServiceVersion` enum containing the version defined in the TypeSpec.

```csharp src/Generated/MultipleClientOptions.cs class MultipleClientOptions
public partial class MultipleClientOptions : ClientPipelineOptions
    {
        private const ServiceVersion LatestVersion = ServiceVersion.V1_0;

        /// <summary> Initializes a new instance of MultipleClientOptions. </summary>
        /// <param name="version"> The service version. </param>
        public MultipleClientOptions(ServiceVersion version = LatestVersion)
        {
            Version = version switch
            {
                ServiceVersion.V1_0 => "v1.0",
                _ => throw new NotSupportedException()
            };
        }

        /// <summary> Gets the Version. </summary>
        internal string Version { get; }

        /// <summary> The version of the service to use. </summary>
        public enum ServiceVersion
        {
            /// <summary> V1_0. </summary>
            V1_0 = 1
        }
    }
```
