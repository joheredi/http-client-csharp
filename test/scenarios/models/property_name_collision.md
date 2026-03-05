# Should rename properties that collide with their enclosing class name (CS0542)

C# rule CS0542 forbids class members with the same name as their enclosing type.
When a model property has the same raw TCGC name as the model, the emitter must
append a "Property" suffix to avoid the compilation error. This matches the legacy
emitter's PropertyProvider.cs behavior (lines 104–106).

## TypeSpec

```tsp
@service
namespace TestNamespace;

model SameAsModel {
  SameAsModel: string;
}

@route("/test")
op getTest(): SameAsModel;
```

## Models

The property `SameAsModel` on class `SameAsModel` must be renamed to `SameAsModelProperty`
to avoid CS0542. Constructor parameters follow the same rename pattern (camelCase of
the renamed property).

```csharp src/Generated/Models/SameAsModel.cs class SameAsModel
public partial class SameAsModel
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        /// <summary> Initializes a new instance of <see cref="SameAsModel"/>. </summary>
        /// <param name="sameAsModelProperty"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="sameAsModelProperty"/> is null. </exception>
        internal SameAsModel(string sameAsModelProperty)
        {
            Argument.AssertNotNull(sameAsModelProperty, nameof(sameAsModelProperty));

            SameAsModelProperty = sameAsModelProperty;
        }

        /// <summary> Initializes a new instance of <see cref="SameAsModel"/>. </summary>
        /// <param name="sameAsModelProperty"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        internal SameAsModel(string sameAsModelProperty, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            SameAsModelProperty = sameAsModelProperty;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string SameAsModelProperty { get; }
    }
```
