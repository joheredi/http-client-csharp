# Should generate correct types for bytes encoding

Validates that the emitter generates `BinaryData` for `bytes` properties regardless
of the `@encode` decorator (base64, base64url). Encoding affects the wire format
but not the C# type. Arrays of encoded bytes use `IList<BinaryData>` for properties
and `IEnumerable<BinaryData>` for constructor parameters. Corresponds to a subset
of the Spector `Encode.Bytes` scenario.

## TypeSpec

```tsp
@service
namespace Encode.Bytes;

@encode("base64url")
scalar base64urlBytes extends bytes;

model DefaultBytesProperty {
  value: bytes;
}

model Base64BytesProperty {
  @encode("base64")
  value: bytes;
}

model Base64urlBytesProperty {
  @encode("base64url")
  value: bytes;
}

model Base64urlArrayBytesProperty {
  value: base64urlBytes[];
}

namespace Property {
  @route("/property/default")
  @post
  op default(@body body: DefaultBytesProperty): DefaultBytesProperty;

  @route("/property/base64")
  @post
  op base64(@body body: Base64BytesProperty): Base64BytesProperty;

  @route("/property/base64url")
  @post
  op base64url(@body body: Base64urlBytesProperty): Base64urlBytesProperty;

  @route("/property/base64url-array")
  @post
  op base64urlArray(@body body: Base64urlArrayBytesProperty): Base64urlArrayBytesProperty;
}

namespace Query {
  @route("/query/default")
  @get
  op default(@query value: bytes): void;

  @route("/query/base64url")
  @get
  op base64url(@query @encode("base64url") value: bytes): void;

  @route("/query/base64url-array")
  @get
  op base64urlArray(@query value: base64urlBytes[]): void;
}
```

## Models

Validates that all bytes encoding variants produce BinaryData properties.

```csharp src/Generated/Models/DefaultBytesProperty.cs class DefaultBytesProperty
public partial class DefaultBytesProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public DefaultBytesProperty(BinaryData value)
        {
            Argument.AssertNotNull(value, nameof(value));

            Value = value;
        }

        internal DefaultBytesProperty(BinaryData value, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public BinaryData Value { get; set; }
    }
```

```csharp src/Generated/Models/Base64BytesProperty.cs class Base64BytesProperty
public partial class Base64BytesProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public Base64BytesProperty(BinaryData value)
        {
            Argument.AssertNotNull(value, nameof(value));

            Value = value;
        }

        internal Base64BytesProperty(BinaryData value, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public BinaryData Value { get; set; }
    }
```

```csharp src/Generated/Models/Base64urlBytesProperty.cs class Base64urlBytesProperty
public partial class Base64urlBytesProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public Base64urlBytesProperty(BinaryData value)
        {
            Argument.AssertNotNull(value, nameof(value));

            Value = value;
        }

        internal Base64urlBytesProperty(
            BinaryData value,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public BinaryData Value { get; set; }
    }
```

```csharp src/Generated/Models/Base64urlArrayBytesProperty.cs class Base64urlArrayBytesProperty
public partial class Base64urlArrayBytesProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public Base64urlArrayBytesProperty(IEnumerable<BinaryData> value) {}

        internal Base64urlArrayBytesProperty(
            IList<BinaryData> value,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public IList<BinaryData> Value { get; }
    }
```

## Query sub-client

Validates that query parameter methods use BinaryData for bytes type.

```csharp src/Generated/Query.cs class Query
public partial class Query
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of Query for mocking. </summary>
        protected Query()
        {
        }

        /// <summary> Initializes a new instance of Query. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal Query(ClientPipeline pipeline, Uri endpoint)
        {
            _endpoint = endpoint;
            Pipeline = pipeline;
        }

        /// <summary> The HTTP pipeline for sending and receiving REST requests and responses. </summary>
        public ClientPipeline Pipeline { get; }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Default(BinaryData value, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(value, nameof(value));

            return Default(value, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> DefaultAsync(
            BinaryData value,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(value, nameof(value));

            return await DefaultAsync(value, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Base64url(BinaryData value, CancellationToken cancellationToken = default)
        {
            Argument.AssertNotNull(value, nameof(value));

            return Base64url(value, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> Base64urlAsync(
            BinaryData value,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(value, nameof(value));

            return await Base64urlAsync(value, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Base64urlArray(
            IEnumerable<BinaryData> value,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(value, nameof(value));

            return Base64urlArray(value, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> Base64urlArrayAsync(
            IEnumerable<BinaryData> value,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(value, nameof(value));

            return await Base64urlArrayAsync(value, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="value"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Default(BinaryData value, RequestOptions options)
        {
            Argument.AssertNotNull(value, nameof(value));

            using PipelineMessage message = CreateDefaultRequest(value, options);
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
        /// <param name="value"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> DefaultAsync(BinaryData value, RequestOptions options)
        {
            Argument.AssertNotNull(value, nameof(value));

            using PipelineMessage message = CreateDefaultRequest(value, options);
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
        /// <param name="value"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Base64url(BinaryData value, RequestOptions options)
        {
            Argument.AssertNotNull(value, nameof(value));

            using PipelineMessage message = CreateBase64urlRequest(value, options);
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
        /// <param name="value"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> Base64urlAsync(BinaryData value, RequestOptions options)
        {
            Argument.AssertNotNull(value, nameof(value));

            using PipelineMessage message = CreateBase64urlRequest(value, options);
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
        /// <param name="value"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Base64urlArray(IEnumerable<BinaryData> value, RequestOptions options)
        {
            Argument.AssertNotNull(value, nameof(value));

            using PipelineMessage message = CreateBase64urlArrayRequest(value, options);
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
        /// <param name="value"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> Base64urlArrayAsync(
            IEnumerable<BinaryData> value,
            RequestOptions options
        )
        {
            Argument.AssertNotNull(value, nameof(value));

            using PipelineMessage message = CreateBase64urlArrayRequest(value, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```
