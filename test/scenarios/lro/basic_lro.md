# Should generate standard client methods for LRO operations

For the System.ClientModel target (non-Azure), LRO operations generate the same method
signatures and return types as basic operations. The LRO metadata is available but does not
affect the generated code shape. This scenario verifies that `@markAsLro` operations produce
correct protocol and convenience methods identical to basic operations.

## TypeSpec

```tsp
using Azure.ClientGenerator.Core.Legacy;

@service
namespace TestService;

model Status {
  done: boolean;
}

@route("/tasks")
@post
@markAsLro
op startTask(): Status;
```

## Client

Should generate the client class with protocol and convenience methods for the LRO operation,
using standard ClientResult return types (not LRO-specific types).

```csharp src/Generated/TestServiceClient.cs class TestServiceClient
public partial class TestServiceClient
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of TestServiceClient for mocking. </summary>
        protected TestServiceClient() {}

        /// <summary> Initializes a new instance of TestServiceClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        public TestServiceClient(Uri endpoint) : this(endpoint, new ClientPipelineOptions()) {}

        /// <summary> Initializes a new instance of TestServiceClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="options"> The options for configuring the client. </param>
        public TestServiceClient(Uri endpoint, ClientPipelineOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));

            options ??= new ClientPipelineOptions();

            _endpoint = endpoint;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(TestServiceClient).Assembly) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult<Status> StartTask(CancellationToken cancellationToken = default)
        {
            ClientResult result = StartTask(cancellationToken.ToRequestOptions());
            return ClientResult.FromValue((Status)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<Status>> StartTaskAsync(CancellationToken cancellationToken = default)
        {
            ClientResult result = await StartTaskAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue((Status)result, result.GetRawResponse());
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
        public virtual ClientResult StartTask(RequestOptions options)
        {
            using PipelineMessage message = CreateStartTaskRequest(options);
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
        public virtual async Task<ClientResult> StartTaskAsync(RequestOptions options)
        {
            using PipelineMessage message = CreateStartTaskRequest(options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```
