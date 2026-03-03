# Should generate versioned client and models with @removed decorator

Validates that the emitter correctly handles the `@removed` versioning decorator,
omitting types, members, and operations that were removed in the latest version.
Removed models, enums, operations, and interfaces should not appear in the output.
Removed properties should be absent from models. Corresponds to the Spector
`Versioning.Removed` golden files.

## TypeSpec

```tsp
using TypeSpec.Versioning;

@versioned(Versions)
@service
@server(
  "{endpoint}/versioning/removed/api-version:{version}",
  "Testserver endpoint",
  {
    endpoint: url,
    version: Versions,
  }
)
namespace Versioning.Removed;

enum Versions {
  v1: "v1",
  v2preview: "v2preview",
  v2: "v2",
}

@removed(Versions.v2)
model ModelV1 {
  prop: string;
  enumProp: EnumV1;
  unionProp: UnionV1;
}

@removed(Versions.v2)
enum EnumV1 {
  enumMember,
}

model ModelV2 {
  prop: string;

  @removed(Versions.v2)
  removedProp: string;

  enumProp: EnumV2;

  @added(Versions.v1)
  unionProp: UnionV2;
}

model ModelV3 {
  id: string;

  @removed(Versions.v2preview)
  @added(Versions.v2)
  enumProp: EnumV3;
}

enum EnumV2 {
  @removed(Versions.v2)
  enumMemberV1,

  enumMemberV2,
}

enum EnumV3 {
  @removed(Versions.v2preview)
  @added(Versions.v2)
  enumMemberV1,

  enumMemberV2Preview,
}

@removed(Versions.v2)
union UnionV1 {
  string,
  int32,
}

union UnionV2 {
  string,
  float32,

  @removed(Versions.v2)
  V1Scalar,
}

@removed(Versions.v2)
scalar V1Scalar extends int32;

@route("/v1")
@post
@removed(Versions.v2)
op v1(@body body: ModelV1): ModelV1;

@route("/v2")
@post
op v2(@body body: ModelV2, @removed(Versions.v2) @query param: string): ModelV2;

@route("/interface-v1")
@removed(Versions.v2)
interface InterfaceV1 {
  @post
  @route("/v1")
  v1InInterface(@body body: ModelV1): ModelV1;
}

@post
@route("/v3")
op modelV3(@body body: ModelV3): ModelV3;
```

## Models

placeholder

```csharp src/Generated/Models/ModelV2.cs class ModelV2
public partial class ModelV2
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public ModelV2(string prop, EnumV2 enumProp, BinaryData unionProp)
        {
            Argument.AssertNotNull(prop, nameof(prop));

            Prop = prop;
            EnumProp = enumProp;
            UnionProp = unionProp;
        }

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

```csharp src/Generated/Models/ModelV3.cs class ModelV3
public partial class ModelV3
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public ModelV3(string id, EnumV3 enumProp)
        {
            Argument.AssertNotNull(id, nameof(id));

            Id = id;
            EnumProp = enumProp;
        }

        internal ModelV3(string id, EnumV3 enumProp, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Id = id;
            EnumProp = enumProp;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string Id { get; set; }
        public EnumV3 EnumProp { get; set; }
    }
```

```csharp src/Generated/Models/EnumV2.cs enum EnumV2
public enum EnumV2
    {
        /// <summary> enumMemberV2. </summary>
        EnumMemberV2
    }
```

```csharp src/Generated/Models/EnumV3.cs enum EnumV3
public enum EnumV3
    {
        /// <summary> enumMemberV1. </summary>
        EnumMemberV1,
        /// <summary> enumMemberV2Preview. </summary>
        EnumMemberV2Preview
    }
```

## Clients

placeholder

```csharp src/Generated/RemovedClient.cs class RemovedClient
public partial class RemovedClient
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of RemovedClient for mocking. </summary>
        protected RemovedClient() {}

        /// <summary> Initializes a new instance of RemovedClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        public RemovedClient(Uri endpoint) : this(endpoint, new RemovedClientOptions()) {}

        /// <summary> Initializes a new instance of RemovedClient. </summary>
        /// <param name="endpoint"> Service endpoint. </param>
        /// <param name="options"> The options for configuring the client. </param>
        public RemovedClient(Uri endpoint, RemovedClientOptions options)
        {
            Argument.AssertNotNull(endpoint, nameof(endpoint));

            options ??= new RemovedClientOptions();

            _endpoint = endpoint;
            Pipeline = ClientPipeline.Create(options, Array.Empty<PipelinePolicy>(), new PipelinePolicy[] { new UserAgentPolicy(typeof(RemovedClient).Assembly) }, Array.Empty<PipelinePolicy>());
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

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

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult<ModelV3> ModelV3(ModelV3 body, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = ModelV3(body, cancellationToken.ToRequestOptions());
            return ClientResult.FromValue((ModelV3)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<ModelV3>> ModelV3Async(
            ModelV3 body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = await ModelV3Async(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue((ModelV3)result, result.GetRawResponse());
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
        public virtual ClientResult V2(BinaryContent content, RequestOptions options)
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
        public virtual async Task<ClientResult> V2Async(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateV2Request(content, options);
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
        public virtual ClientResult ModelV3(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateModelV3Request(content, options);
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
        public virtual async Task<ClientResult> ModelV3Async(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateModelV3Request(content, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```
