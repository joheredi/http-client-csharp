# Should generate versioned client and models with @added decorator

Validates that the emitter correctly handles the `@added` versioning decorator,
generating only the latest version's API surface. Types and members added in v2
should appear in the output, while the overall structure should reflect the
latest version. Corresponds to the Spector `Versioning.Added` golden files.

## TypeSpec

```tsp
using TypeSpec.Versioning;

@versioned(Versions)
@service
@server(
  "{endpoint}/versioning/added/api-version:{version}",
  "Testserver endpoint",
  {
    endpoint: url,
    version: Versions,
  }
)
namespace Versioning.Added;

enum Versions {
  v1: "v1",
  v2: "v2",
}

model ModelV1 {
  prop: string;
  enumProp: EnumV1;

  @added(Versions.v2)
  unionProp: UnionV1;
}

enum EnumV1 {
  enumMemberV1,

  @added(Versions.v2)
  enumMemberV2,
}

@added(Versions.v2)
model ModelV2 {
  prop: string;
  enumProp: EnumV2;
  unionProp: UnionV2;
}

@added(Versions.v2)
enum EnumV2 {
  enumMember,
}

union UnionV1 {
  string,

  @added(Versions.v2)
  V2Scalar,
}

@added(Versions.v2)
union UnionV2 {
  string,
  int32,
}

@added(Versions.v2)
scalar V2Scalar extends int32;

@route("/v1")
@post
op v1(@body body: ModelV1, @added(Versions.v2) @header headerV2: string): ModelV1;

@route("/v2")
@added(Versions.v2)
@post
op v2(@body body: ModelV2): ModelV2;

@added(Versions.v2)
@route("/interface-v2")
interface InterfaceV2 {
  @post
  @route("/v2")
  v2InInterface(@body body: ModelV2): ModelV2;
}
```

## Models

placeholder

```csharp src/Generated/Models/ModelV1.cs class ModelV1
public partial class ModelV1
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        /// <summary> Initializes a new instance of <see cref="ModelV1"/>. </summary>
        /// <param name="prop"></param>
        /// <param name="enumProp"></param>
        /// <param name="unionProp"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="prop"/> is null. </exception>
        public ModelV1(string prop, EnumV1 enumProp, BinaryData unionProp)
        {
            Argument.AssertNotNull(prop, nameof(prop));

            Prop = prop;
            EnumProp = enumProp;
            UnionProp = unionProp;
        }

        /// <summary> Initializes a new instance of <see cref="ModelV1"/>. </summary>
        /// <param name="prop"></param>
        /// <param name="enumProp"></param>
        /// <param name="unionProp"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        internal ModelV1(
            string prop,
            EnumV1 enumProp,
            BinaryData unionProp,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            Prop = prop;
            EnumProp = enumProp;
            UnionProp = unionProp;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string Prop { get; set; }
        public EnumV1 EnumProp { get; set; }
        public BinaryData UnionProp { get; set; }
    }
```

```csharp src/Generated/Models/ModelV2.cs class ModelV2
public partial class ModelV2
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        /// <summary> Initializes a new instance of <see cref="ModelV2"/>. </summary>
        /// <param name="prop"></param>
        /// <param name="enumProp"></param>
        /// <param name="unionProp"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="prop"/> is null. </exception>
        public ModelV2(string prop, EnumV2 enumProp, BinaryData unionProp)
        {
            Argument.AssertNotNull(prop, nameof(prop));

            Prop = prop;
            EnumProp = enumProp;
            UnionProp = unionProp;
        }

        /// <summary> Initializes a new instance of <see cref="ModelV2"/>. </summary>
        /// <param name="prop"></param>
        /// <param name="enumProp"></param>
        /// <param name="unionProp"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        internal ModelV2(
            string prop,
            EnumV2 enumProp,
            BinaryData unionProp,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            Prop = prop;
            EnumProp = enumProp;
            UnionProp = unionProp;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string Prop { get; set; }
        public EnumV2 EnumProp { get; set; }
        public BinaryData UnionProp { get; set; }
    }
```

```csharp src/Generated/Models/EnumV1.cs enum EnumV1
public enum EnumV1
    {
        /// <summary> enumMemberV1. </summary>
        EnumMemberV1,
        /// <summary> enumMemberV2. </summary>
        EnumMemberV2
    }
```

```csharp src/Generated/Models/EnumV2.cs enum EnumV2
public enum EnumV2
    {
        /// <summary> enumMember. </summary>
        EnumMember
    }
```

## Clients

placeholder

```csharp src/Generated/AddedClient.cs class AddedClient
public partial class AddedClient
    {
        private readonly Uri _endpoint;
        private InterfaceV2 _cachedInterfaceV2;

        /// <summary> Initializes a new instance of AddedClient for mocking. </summary>
        protected AddedClient()
        {
        }

        /// <summary> Initializes a new instance of AddedClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> is null. </exception>
        public AddedClient(Uri endpoint) : this(endpoint, new AddedClientOptions())
        {
        }

        /// <summary> Initializes a new instance of AddedClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="options"> The options for configuring the client. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="endpoint"/> is null. </exception>
        public AddedClient(Uri endpoint, AddedClientOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));

            options ??= new AddedClientOptions();

            ClientUriBuilder endpointBuilder = new ClientUriBuilder();
            endpointBuilder.Reset(endpoint);
            endpointBuilder.AppendPath("/versioning/added/api-version:", false);
            endpointBuilder.AppendPath(options.Version, true);
            _endpoint = endpointBuilder.ToUri();
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(AddedClient).Assembly) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="headerV2"></param>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="headerV2"/> or <paramref name="body"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="headerV2"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult<ModelV1> V1(
            string headerV2,
            ModelV1 body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNullOrEmpty(headerV2, nameof(headerV2));
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = V1(headerV2, body, cancellationToken.ToRequestOptions());
            return ClientResult.FromValue((ModelV1)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="headerV2"></param>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="headerV2"/> or <paramref name="body"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="headerV2"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<ModelV1>> V1Async(
            string headerV2,
            ModelV1 body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNullOrEmpty(headerV2, nameof(headerV2));
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = await V1Async(headerV2, body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue((ModelV1)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult<ModelV2> V2(ModelV2 body, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = V2(body, cancellationToken.ToRequestOptions());
            return ClientResult.FromValue((ModelV2)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<ModelV2>> V2Async(
            ModelV2 body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = await V2Async(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue((ModelV2)result, result.GetRawResponse());
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="headerV2"></param>
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="headerV2"/> or <paramref name="content"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="headerV2"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult V1(string headerV2, BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNullOrEmpty(headerV2, nameof(headerV2));
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateV1Request(headerV2, content, options);
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
        /// <param name="headerV2"></param>
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="headerV2"/> or <paramref name="content"/> is null. </exception>
        /// <exception cref="ArgumentException"> <paramref name="headerV2"/> is an empty string, and was expected to be non-empty. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> V1Async(string headerV2, BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNullOrEmpty(headerV2, nameof(headerV2));
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateV1Request(headerV2, content, options);
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
        /// <param name="content"> The content to send as the body of the request. </param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="content"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult V2(BinaryContent content, RequestOptions options = null)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateV2Request(content, options);
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
        public virtual async Task<ClientResult> V2Async(BinaryContent content, RequestOptions options = null)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateV2Request(content, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }

        /// <summary> Initializes a new instance of InterfaceV2. </summary>
        public virtual InterfaceV2 GetInterfaceV2Client()
        {
            return Volatile.Read(ref _cachedInterfaceV2) ?? Interlocked.CompareExchange(ref _cachedInterfaceV2, new InterfaceV2(Pipeline, _endpoint), null) ?? _cachedInterfaceV2;
        }
    }
```

## Sub-Clients

placeholder

```csharp src/Generated/InterfaceV2.cs class InterfaceV2
public partial class InterfaceV2
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of InterfaceV2 for mocking. </summary>
        protected InterfaceV2()
        {
        }

        /// <summary> Initializes a new instance of InterfaceV2. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal InterfaceV2(ClientPipeline pipeline, Uri endpoint)
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
        public virtual ClientResult<ModelV2> V2InInterface(ModelV2 body, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = V2InInterface(body, cancellationToken.ToRequestOptions());
            return ClientResult.FromValue((ModelV2)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<ModelV2>> V2InInterfaceAsync(
            ModelV2 body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = await V2InInterfaceAsync(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue((ModelV2)result, result.GetRawResponse());
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
        public virtual ClientResult V2InInterface(BinaryContent content, RequestOptions options = null)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateV2InInterfaceRequest(content, options);
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
        public virtual async Task<ClientResult> V2InInterfaceAsync(BinaryContent content, RequestOptions options = null)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateV2InInterfaceRequest(content, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```
