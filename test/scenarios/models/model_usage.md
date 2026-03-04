# Should generate models with correct usage patterns (input, output, input-output)

Validates that models used only as input get a public constructor with read-only properties,
models used only as output get an internal constructor with read-only properties,
and models used as both get a public constructor with read-write properties.
Matches Spector `Type.Model.Usage` golden files.

## TypeSpec

```tsp
@service
namespace Type.Model.Usage;

alias RecordBase = {
  requiredProp: string;
};

model InputRecord {
  ...RecordBase;
}

model OutputRecord {
  ...RecordBase;
}

model InputOutputRecord {
  ...RecordBase;
}

@route("/input")
op input(@body input: InputRecord): void;

@route("/output")
op output(): OutputRecord;

@route("/input-output")
op inputAndOutput(@body body: InputOutputRecord): InputOutputRecord;
```

## Models

Should generate InputRecord with a public constructor (input-only model)

```csharp src/Generated/Models/InputRecord.cs class InputRecord
public partial class InputRecord
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        /// <summary> Initializes a new instance of <see cref="InputRecord"/>. </summary>
        /// <param name="requiredProp"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="requiredProp"/> is null. </exception>
        public InputRecord(string requiredProp)
        {
            Argument.AssertNotNull(requiredProp, nameof(requiredProp));

            RequiredProp = requiredProp;
        }

        /// <summary> Initializes a new instance of <see cref="InputRecord"/>. </summary>
        /// <param name="requiredProp"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        internal InputRecord(string requiredProp, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            RequiredProp = requiredProp;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string RequiredProp { get; }
    }
```

Should generate OutputRecord with an internal constructor (output-only model)

```csharp src/Generated/Models/OutputRecord.cs class OutputRecord
public partial class OutputRecord
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        /// <summary> Initializes a new instance of <see cref="OutputRecord"/>. </summary>
        /// <param name="requiredProp"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="requiredProp"/> is null. </exception>
        internal OutputRecord(string requiredProp)
        {
            Argument.AssertNotNull(requiredProp, nameof(requiredProp));

            RequiredProp = requiredProp;
        }

        /// <summary> Initializes a new instance of <see cref="OutputRecord"/>. </summary>
        /// <param name="requiredProp"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        internal OutputRecord(string requiredProp, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            RequiredProp = requiredProp;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string RequiredProp { get; }
    }
```

Should generate InputOutputRecord with a public constructor and read-write property (both input and output)

```csharp src/Generated/Models/InputOutputRecord.cs class InputOutputRecord
public partial class InputOutputRecord
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        /// <summary> Initializes a new instance of <see cref="InputOutputRecord"/>. </summary>
        /// <param name="requiredProp"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="requiredProp"/> is null. </exception>
        public InputOutputRecord(string requiredProp)
        {
            Argument.AssertNotNull(requiredProp, nameof(requiredProp));

            RequiredProp = requiredProp;
        }

        /// <summary> Initializes a new instance of <see cref="InputOutputRecord"/>. </summary>
        /// <param name="requiredProp"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        internal InputOutputRecord(string requiredProp, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            RequiredProp = requiredProp;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string RequiredProp { get; set; }
    }
```
