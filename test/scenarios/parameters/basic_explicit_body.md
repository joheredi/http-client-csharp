# Should generate sub-client with explicit body parameter

Validates that the emitter generates a sub-client class with operations
that accept a model type as an explicit `@body` parameter. Corresponds to the
Spector `Parameters.Basic.ExplicitBody` scenario.

## TypeSpec

```tsp
@service
namespace Parameters.Basic;

@route("/explicit-body")
namespace ExplicitBody {
  @doc("This is a simple model.")
  model User {
    name: string;
  }

  @route("/simple")
  @put
  op simple(@body body: User): void;
}
```

## Clients

Should generate a sub-client with both convenience methods (accepting User)
and protocol methods (accepting BinaryContent).

```csharp src/Generated/ExplicitBody.cs class ExplicitBody
public partial class ExplicitBody
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of ExplicitBody for mocking. </summary>
        protected ExplicitBody() {}

        /// <summary> Initializes a new instance of ExplicitBody. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal ExplicitBody(ClientPipeline pipeline, Uri endpoint)
        {
            _endpoint = endpoint;
            Pipeline = pipeline;
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Simple(User body, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(body, nameof(body));

            return Simple(body, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> SimpleAsync(User body, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(body, nameof(body));

            return await SimpleAsync(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="content"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Simple(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateSimpleRequest(content, options);
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
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="content"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> SimpleAsync(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateSimpleRequest(content, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```

## Models

Should generate a User model with a required name property.

```csharp src/Generated/Models/User.cs class User
public partial class User
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public User(string name)
        {
            Argument.AssertNotNull(name, nameof(name));

            Name = name;
        }

        internal User(string name, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Name = name;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string Name { get; }
    }
```
