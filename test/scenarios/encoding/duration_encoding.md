# Should generate correct types for duration encoding

Validates that the emitter generates `TimeSpan` for `duration` properties regardless
of the `@encode` decorator (ISO8601, seconds, milliseconds). Encoding affects the
wire format but not the C# type. Corresponds to a subset of the Spector
`Encode.Duration` scenario.

## TypeSpec

```tsp
@service
namespace Encode.Duration;

model DefaultDurationProperty {
  value: duration;
}

model ISO8601DurationProperty {
  @encode(DurationKnownEncoding.ISO8601)
  value: duration;
}

model Int32SecondsDurationProperty {
  @encode(DurationKnownEncoding.seconds, int32)
  value: duration;
}

model FloatSecondsDurationProperty {
  @encode(DurationKnownEncoding.seconds, float)
  value: duration;
}

namespace Property {
  @route("/property/default")
  @post
  op default(@body body: DefaultDurationProperty): DefaultDurationProperty;

  @route("/property/iso8601")
  @post
  op iso8601(@body body: ISO8601DurationProperty): ISO8601DurationProperty;

  @route("/property/int32-seconds")
  @post
  op int32Seconds(@body body: Int32SecondsDurationProperty): Int32SecondsDurationProperty;

  @route("/property/float-seconds")
  @post
  op floatSeconds(@body body: FloatSecondsDurationProperty): FloatSecondsDurationProperty;
}

namespace Query {
  @route("/query/default")
  @get
  op default(@query input: duration): void;

  @route("/query/int32-seconds")
  @get
  op int32Seconds(@query @encode(DurationKnownEncoding.seconds, int32) input: duration): void;
}
```

## Models

Validates that all duration encoding variants produce TimeSpan properties.

```csharp src/Generated/Models/DefaultDurationProperty.cs class DefaultDurationProperty
public partial class DefaultDurationProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public DefaultDurationProperty(TimeSpan value)
        {
            Value = value;
        }

        internal DefaultDurationProperty(TimeSpan value, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public TimeSpan Value { get; set; }
    }
```

```csharp src/Generated/Models/ISO8601DurationProperty.cs class ISO8601DurationProperty
public partial class ISO8601DurationProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public ISO8601DurationProperty(TimeSpan value)
        {
            Value = value;
        }

        internal ISO8601DurationProperty(TimeSpan value, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public TimeSpan Value { get; set; }
    }
```

```csharp src/Generated/Models/Int32SecondsDurationProperty.cs class Int32SecondsDurationProperty
public partial class Int32SecondsDurationProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public Int32SecondsDurationProperty(TimeSpan value)
        {
            Value = value;
        }

        internal Int32SecondsDurationProperty(
            TimeSpan value,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public TimeSpan Value { get; set; }
    }
```

```csharp src/Generated/Models/FloatSecondsDurationProperty.cs class FloatSecondsDurationProperty
public partial class FloatSecondsDurationProperty
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public FloatSecondsDurationProperty(TimeSpan value)
        {
            Value = value;
        }

        internal FloatSecondsDurationProperty(
            TimeSpan value,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        )
        {
            Value = value;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public TimeSpan Value { get; set; }
    }
```

## Query sub-client

Validates that query parameter methods use TimeSpan regardless of encoding.

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
        /// <param name="input"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Default(TimeSpan input, CancellationToken cancellationToken = default)
        {
            return Default(input, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="input"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> DefaultAsync(
            TimeSpan input,
            CancellationToken cancellationToken = default
        )
        {
            return await DefaultAsync(input, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>  </summary>
        /// <param name="input"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual ClientResult Int32Seconds(TimeSpan input, CancellationToken cancellationToken = default)
        {
            return Int32Seconds(input, cancellationToken.ToRequestOptions());
        }

        /// <summary>  </summary>
        /// <param name="input"></param>
        /// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        public virtual async Task<ClientResult> Int32SecondsAsync(
            TimeSpan input,
            CancellationToken cancellationToken = default
        )
        {
            return await Int32SecondsAsync(input, cancellationToken.ToRequestOptions()).ConfigureAwait(false);
        }

        /// <summary>
        /// [Protocol Method]
        /// <list type="bullet">
        /// <item>
        /// <description> This <see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see> allows explicit creation of the request and processing of the response for advanced scenarios. </description>
        /// </item>
        /// </list>
        /// </summary>
        /// <param name="input"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="input"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Default(TimeSpan input, RequestOptions options)
        {
            Argument.AssertNotNull(input, nameof(input));

            using PipelineMessage message = CreateDefaultRequest(input, options);
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
        /// <param name="input"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="input"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> DefaultAsync(TimeSpan input, RequestOptions options)
        {
            Argument.AssertNotNull(input, nameof(input));

            using PipelineMessage message = CreateDefaultRequest(input, options);
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
        /// <param name="input"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="input"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual ClientResult Int32Seconds(TimeSpan input, RequestOptions options)
        {
            Argument.AssertNotNull(input, nameof(input));

            using PipelineMessage message = CreateInt32SecondsRequest(input, options);
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
        /// <param name="input"></param>
        /// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>
        /// <exception cref="ArgumentNullException"> <paramref name="input"/> is null. </exception>
        /// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>
        /// <returns> The response returned from the service. </returns>
        public virtual async Task<ClientResult> Int32SecondsAsync(TimeSpan input, RequestOptions options)
        {
            Argument.AssertNotNull(input, nameof(input));

            using PipelineMessage message = CreateInt32SecondsRequest(input, options);
            return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));
        }
    }
```
