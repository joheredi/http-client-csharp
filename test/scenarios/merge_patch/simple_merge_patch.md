# Should generate a dynamic model class for a model used with merge-patch content type

Validates that a model used in a `@patch` operation with `application/merge-patch+json`
content type generates the correct dynamic model structure: a `_patch` field of type
`JsonPatch`, a `Patch` ref-return property with `[JsonIgnore]` and `[EditorBrowsable(Never)]`
attributes, and constructors that use `in JsonPatch patch` instead of
`additionalBinaryDataProperties`. The dynamic members are wrapped in `#pragma warning
disable/restore SCME0001` to suppress the experimental API diagnostic.

## TypeSpec

```tsp
@service
namespace TestService;

model Resource {
  name: string;
  description?: string;
}

@route("/resources")
@patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
```

## Models

Should generate a dynamic model class with `_patch` field and `Patch` ref-return property

```csharp src/Generated/Models/Resource.cs class Resource
public partial class Resource
    {
        #pragma warning disable SCME0001
        private JsonPatch _patch;

        [JsonIgnore]
        [EditorBrowsable(EditorBrowsableState.Never)]
        public ref JsonPatch Patch => ref _patch;
        #pragma warning restore SCME0001

        public Resource(string name)
        {
            Argument.AssertNotNull(name, nameof(name));

            Name = name;
        }

        #pragma warning disable SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates.
        internal Resource(string name, string? description, in JsonPatch patch)
        {
            Name = name;
            Description = description;
            _patch = patch;
        }
        #pragma warning restore SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates.

        public string Name { get; }
        public string? Description { get; set; }
    }
```

Should generate model factory with `default` for the patch parameter

```csharp src/Generated/TestServiceModelFactory.cs class TestServiceModelFactory
public static partial class TestServiceModelFactory
    {
        public static Resource Resource(string name = default, string? description = default)
        {
            return new Resource(name, description, default);
        }
    }
```
