# Should generate correct types for datetime encoding

Validates that the emitter generates `DateTimeOffset` for `utcDateTime` properties
regardless of the `@encode` decorator (rfc3339, rfc7231, unixTimestamp). Encoding
affects serialization format but not the C# type. Arrays of encoded datetime use
`IList<DateTimeOffset>` for properties and `IEnumerable<DateTimeOffset>` for
constructor parameters. Corresponds to the Spector `Encode.Datetime` scenario.

## TypeSpec

```tsp
@service
namespace Encode.Datetime;

@encode(DateTimeKnownEncoding.unixTimestamp, int64)
scalar unixTimestampDatetime extends utcDateTime;

model DefaultDatetimeProperty {
  value: utcDateTime;
}

model Rfc3339DatetimeProperty {
  @encode(DateTimeKnownEncoding.rfc3339)
  value: utcDateTime;
}

model Rfc7231DatetimeProperty {
  @encode(DateTimeKnownEncoding.rfc7231)
  value: utcDateTime;
}

model UnixTimestampDatetimeProperty {
  @encode(DateTimeKnownEncoding.unixTimestamp, int64)
  value: utcDateTime;
}

model UnixTimestampArrayDatetimeProperty {
  value: unixTimestampDatetime[];
}

namespace Property {
  @route("/property/default")
  @post
  op default(@body body: DefaultDatetimeProperty): DefaultDatetimeProperty;

  @route("/property/rfc3339")
  @post
  op rfc3339(@body body: Rfc3339DatetimeProperty): Rfc3339DatetimeProperty;

  @route("/property/rfc7231")
  @post
  op rfc7231(@body body: Rfc7231DatetimeProperty): Rfc7231DatetimeProperty;

  @route("/property/unix-timestamp")
  @post
  op unixTimestamp(@body body: UnixTimestampDatetimeProperty): UnixTimestampDatetimeProperty;

  @route("/property/unix-timestamp-array")
  @post
  op unixTimestampArray(@body body: UnixTimestampArrayDatetimeProperty): UnixTimestampArrayDatetimeProperty;
}

namespace Query {
  @route("/query/default")
  @get
  op default(@query value: utcDateTime): void;

  @route("/query/rfc7231")
  @get
  op rfc7231(@query @encode(DateTimeKnownEncoding.rfc7231) value: utcDateTime): void;

  @route("/query/unix-timestamp")
  @get
  op unixTimestamp(@query @encode(DateTimeKnownEncoding.unixTimestamp, int64) value: utcDateTime): void;

  @route("/query/unix-timestamp-array")
  @get
  op unixTimestampArray(@query value: unixTimestampDatetime[]): void;
}
```

## Models

Validates that all datetime encoding variants produce DateTimeOffset properties.

```csharp src/Generated/Models/DefaultDatetimeProperty.cs class DefaultDatetimeProperty
public partial class DefaultDatetimeProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public DefaultDatetimeProperty(DateTimeOffset value)
        {
            Value = value;
        }

        internal DefaultDatetimeProperty(
            DateTimeOffset value,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public DateTimeOffset Value { get; set; }
    }
```

```csharp src/Generated/Models/Rfc3339DatetimeProperty.cs class Rfc3339DatetimeProperty
public partial class Rfc3339DatetimeProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public Rfc3339DatetimeProperty(DateTimeOffset value)
        {
            Value = value;
        }

        internal Rfc3339DatetimeProperty(
            DateTimeOffset value,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public DateTimeOffset Value { get; set; }
    }
```

```csharp src/Generated/Models/Rfc7231DatetimeProperty.cs class Rfc7231DatetimeProperty
public partial class Rfc7231DatetimeProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public Rfc7231DatetimeProperty(DateTimeOffset value)
        {
            Value = value;
        }

        internal Rfc7231DatetimeProperty(
            DateTimeOffset value,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public DateTimeOffset Value { get; set; }
    }
```

```csharp src/Generated/Models/UnixTimestampDatetimeProperty.cs class UnixTimestampDatetimeProperty
public partial class UnixTimestampDatetimeProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public UnixTimestampDatetimeProperty(DateTimeOffset value)
        {
            Value = value;
        }

        internal UnixTimestampDatetimeProperty(
            DateTimeOffset value,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public DateTimeOffset Value { get; set; }
    }
```

```csharp src/Generated/Models/UnixTimestampArrayDatetimeProperty.cs class UnixTimestampArrayDatetimeProperty
public partial class UnixTimestampArrayDatetimeProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public UnixTimestampArrayDatetimeProperty(IEnumerable<DateTimeOffset> value) {}

        internal UnixTimestampArrayDatetimeProperty(
            IList<DateTimeOffset> value,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public IList<DateTimeOffset> Value { get; }
    }
```

## Query sub-client

Validates that query parameter methods use DateTimeOffset regardless of encoding.

```csharp src/Generated/Query.cs class Query
public partial class Query
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of Query for mocking. </summary>
        protected Query() {}

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
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Default(DateTimeOffset value, CancellationToken cancellationToken = default)
        {
            return Default(value, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> DefaultAsync(
            DateTimeOffset value,
            CancellationToken cancellationToken = default
        )
        {
            return await DefaultAsync(value, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Rfc7231(DateTimeOffset value, CancellationToken cancellationToken = default)
        {
            return Rfc7231(value, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> Rfc7231Async(
            DateTimeOffset value,
            CancellationToken cancellationToken = default
        )
        {
            return await Rfc7231Async(value, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult UnixTimestamp(DateTimeOffset value, CancellationToken cancellationToken = default)
        {
            return UnixTimestamp(value, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> UnixTimestampAsync(
            DateTimeOffset value,
            CancellationToken cancellationToken = default
        )
        {
            return await UnixTimestampAsync(value, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult UnixTimestampArray(
            IEnumerable<DateTimeOffset> value,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(value, nameof(value));

            return UnixTimestampArray(value, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="value"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="value"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> UnixTimestampArrayAsync(
            IEnumerable<DateTimeOffset> value,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(value, nameof(value));

            return await UnixTimestampArrayAsync(value, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
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
        public virtual ClientResult Default(DateTimeOffset value, RequestOptions options)
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
        public virtual async Task<ClientResult> DefaultAsync(DateTimeOffset value, RequestOptions options)
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
        public virtual ClientResult Rfc7231(DateTimeOffset value, RequestOptions options)
        {
            Argument.AssertNotNull(value, nameof(value));

            using PipelineMessage message = CreateRfc7231Request(value, options);
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
        public virtual async Task<ClientResult> Rfc7231Async(DateTimeOffset value, RequestOptions options)
        {
            Argument.AssertNotNull(value, nameof(value));

            using PipelineMessage message = CreateRfc7231Request(value, options);
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
        public virtual ClientResult UnixTimestamp(DateTimeOffset value, RequestOptions options)
        {
            Argument.AssertNotNull(value, nameof(value));

            using PipelineMessage message = CreateUnixTimestampRequest(value, options);
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
        public virtual async Task<ClientResult> UnixTimestampAsync(DateTimeOffset value, RequestOptions options)
        {
            Argument.AssertNotNull(value, nameof(value));

            using PipelineMessage message = CreateUnixTimestampRequest(value, options);
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
        public virtual ClientResult UnixTimestampArray(IEnumerable<DateTimeOffset> value, RequestOptions options)
        {
            Argument.AssertNotNull(value, nameof(value));

            using PipelineMessage message = CreateUnixTimestampArrayRequest(value, options);
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
        public virtual async Task<ClientResult> UnixTimestampArrayAsync(
            IEnumerable<DateTimeOffset> value,
            RequestOptions options
        )
        {
            Argument.AssertNotNull(value, nameof(value));

            using PipelineMessage message = CreateUnixTimestampArrayRequest(value, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```

## Property sub-client

Validates that property sub-client convenience methods return encoded model types.

```csharp src/Generated/Property.cs class Property
public partial class Property
    {
        private readonly Uri _endpoint;

        /// <summary> Initializes a new instance of Property for mocking. </summary>
        protected Property() {}

        /// <summary> Initializes a new instance of Property. </summary>
        /// <param name="pipeline"> The HTTP pipeline for sending and receiving REST requests and responses. </param>
        /// <param name="endpoint"> Service endpoint. </param>
        internal Property(ClientPipeline pipeline, Uri endpoint)
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
        public virtual ClientResult<DefaultDatetimeProperty> Default(
            DefaultDatetimeProperty body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = Default(body, cancellationToken.ToRequestOptions());
            return ClientResult.FromValue((DefaultDatetimeProperty)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<DefaultDatetimeProperty>> DefaultAsync(
            DefaultDatetimeProperty body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = await DefaultAsync(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue((DefaultDatetimeProperty)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult<Rfc3339DatetimeProperty> Rfc3339(
            Rfc3339DatetimeProperty body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = Rfc3339(body, cancellationToken.ToRequestOptions());
            return ClientResult.FromValue((Rfc3339DatetimeProperty)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<Rfc3339DatetimeProperty>> Rfc3339Async(
            Rfc3339DatetimeProperty body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = await Rfc3339Async(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue((Rfc3339DatetimeProperty)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult<Rfc7231DatetimeProperty> Rfc7231(
            Rfc7231DatetimeProperty body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = Rfc7231(body, cancellationToken.ToRequestOptions());
            return ClientResult.FromValue((Rfc7231DatetimeProperty)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<Rfc7231DatetimeProperty>> Rfc7231Async(
            Rfc7231DatetimeProperty body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = await Rfc7231Async(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue((Rfc7231DatetimeProperty)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult<UnixTimestampDatetimeProperty> UnixTimestamp(
            UnixTimestampDatetimeProperty body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = UnixTimestamp(body, cancellationToken.ToRequestOptions());
            return ClientResult.FromValue((UnixTimestampDatetimeProperty)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<UnixTimestampDatetimeProperty>> UnixTimestampAsync(
            UnixTimestampDatetimeProperty body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = await UnixTimestampAsync(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue((UnixTimestampDatetimeProperty)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult<UnixTimestampArrayDatetimeProperty> UnixTimestampArray(
            UnixTimestampArrayDatetimeProperty body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = UnixTimestampArray(body, cancellationToken.ToRequestOptions());
            return ClientResult.FromValue((UnixTimestampArrayDatetimeProperty)result, result.GetRawResponse());
        }

        /// <summary>  </summary>
        /// <param name="body"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="body"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult<UnixTimestampArrayDatetimeProperty>> UnixTimestampArrayAsync(
            UnixTimestampArrayDatetimeProperty body,
            CancellationToken cancellationToken = default
        )
        {
            Argument.AssertNotNull(body, nameof(body));

            ClientResult result = await UnixTimestampArrayAsync(body, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
            return ClientResult.FromValue((UnixTimestampArrayDatetimeProperty)result, result.GetRawResponse());
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
        public virtual ClientResult Default(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateDefaultRequest(content, options);
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
        public virtual async Task<ClientResult> DefaultAsync(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateDefaultRequest(content, options);
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
        public virtual ClientResult Rfc3339(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateRfc3339Request(content, options);
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
        public virtual async Task<ClientResult> Rfc3339Async(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateRfc3339Request(content, options);
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
        public virtual ClientResult Rfc7231(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateRfc7231Request(content, options);
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
        public virtual async Task<ClientResult> Rfc7231Async(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateRfc7231Request(content, options);
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
        public virtual ClientResult UnixTimestamp(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateUnixTimestampRequest(content, options);
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
        public virtual async Task<ClientResult> UnixTimestampAsync(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateUnixTimestampRequest(content, options);
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
        public virtual ClientResult UnixTimestampArray(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateUnixTimestampArrayRequest(content, options);
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
        public virtual async Task<ClientResult> UnixTimestampArrayAsync(BinaryContent content, RequestOptions options)
        {
            Argument.AssertNotNull(content, nameof(content));

            using PipelineMessage message = CreateUnixTimestampArrayRequest(content, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```
