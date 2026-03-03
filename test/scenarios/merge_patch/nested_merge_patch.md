# Should generate dynamic model classes with propagators for nested merge-patch models

Validates that when a merge-patch model has properties whose type tree contains other
dynamic models (arrays, direct refs), the serialization constructor calls
`_patch.SetPropagators(PropagateSet, PropagateGet)` and `PropagateGet`/`PropagateSet`
methods are generated. The nested model (`Inner`) without further nesting has no
propagators. The model factory uses `default` for the patch parameter.

## TypeSpec

```tsp
@service
namespace TestService;

model Inner {
  bar: string;
}

model Resource {
  name: string;
  inner?: Inner;
  children?: Resource[];
}

@route("/resources")
@patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
```

## Models

Should generate the parent model with `SetPropagators` call in serialization constructor

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
        internal Resource(string name, Inner? inner, IList<Resource> children, in JsonPatch patch)
        {
            Name = name;
            Inner = inner;
            Children = children;
            _patch = patch;
            _patch.SetPropagators(PropagateSet, PropagateGet);
        }
        #pragma warning restore SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates.

        public string Name { get; }
        public Inner? Inner { get; set; }
        public IList<Resource> Children { get; }
    }
```

Should generate the nested model without propagators (no nested dynamic model properties)

```csharp src/Generated/Models/Inner.cs class Inner
public partial class Inner
    {
        #pragma warning disable SCME0001
        private JsonPatch _patch;

        [JsonIgnore]
        [EditorBrowsable(EditorBrowsableState.Never)]
        public ref JsonPatch Patch => ref _patch;
        #pragma warning restore SCME0001

        public Inner(string bar)
        {
            Argument.AssertNotNull(bar, nameof(bar));

            Bar = bar;
        }

        #pragma warning disable SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates.
        internal Inner(string bar, in JsonPatch patch)
        {
            Bar = bar;
            _patch = patch;
        }
        #pragma warning restore SCME0001 // Type is for evaluation purposes only and is subject to change or removal in future updates.

        public string Bar { get; }
    }
```

Should generate model factory using `default` for patch parameters

```csharp src/Generated/TestServiceModelFactory.cs class TestServiceModelFactory
public static partial class TestServiceModelFactory
    {
        public static Resource Resource(
            string name = default,
            Inner? inner = default,
            IEnumerable<Resource> children = default
        )
        {
            children ??= new ChangeTrackingList<Resource>();
            return new Resource(name, inner, children.ToArray(), default);
        }

        public static Inner Inner(string bar = default)
        {
            return new Inner(bar, default);
        }
    }
```
