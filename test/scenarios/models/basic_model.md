# Should generate a model class for a simple model

## TypeSpec

```tsp
@service
namespace TestNamespace;

model Widget {
  name: string;
  id: int32;
}

@route("/widgets")
op getWidget(): Widget;
```

## Models

Should generate a C# class for the Widget model

```csharp src/Generated/Models/Widget.cs class Widget
public partial class Widget
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        /// <summary> Initializes a new instance of <see cref="Widget"/>. </summary>
        /// <param name="name"></param>
        /// <param name="id"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/> is null. </exception>
        internal Widget(string name, int id)
        {
            Argument.AssertNotNull(name, nameof(name));

            Name = name;
            Id = id;
        }

        /// <summary> Initializes a new instance of <see cref="Widget"/>. </summary>
        /// <param name="name"></param>
        /// <param name="id"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        internal Widget(string name, int id, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Name = name;
            Id = id;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string Name { get; }
        public int Id { get; }
    }
```
