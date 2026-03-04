# Should generate polymorphic models with enum discriminators

Validates discriminated polymorphic inheritance using both extensible (union-based)
and fixed enum discriminators. Tests abstract base classes, derived classes,
extensible enum struct, fixed enum, and unknown variant fallbacks.
Matches Spector `Type.Model.Inheritance.EnumDiscriminator` golden files.

## TypeSpec

```tsp
@service
namespace Type.Model.Inheritance.EnumDiscriminator;

union DogKind {
  string,
  Golden: "golden",
}

@discriminator("kind")
model Dog {
  kind: DogKind;
  weight: int32;
}

model Golden extends Dog {
  kind: DogKind.Golden;
}

enum SnakeKind {
  Cobra: "cobra",
}

@discriminator("kind")
model Snake {
  kind: SnakeKind;
  length: int32;
}

model Cobra extends Snake {
  kind: SnakeKind.Cobra;
}

@route("/extensible-enum")
@get
op getExtensibleModel(): Dog;

@route("/extensible-enum")
@put
op putExtensibleModel(@body input: Dog): void;

@route("/fixed-enum")
@get
op getFixedModel(): Snake;

@route("/fixed-enum")
@put
op putFixedModel(@body input: Snake): void;
```

## Models

Should generate Dog as abstract base with extensible enum discriminator

```csharp src/Generated/Models/Dog.cs class Dog
public abstract partial class Dog
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        private protected Dog(DogKind kind, int weight)
        {
            Kind = kind;
            Weight = weight;
        }

        internal Dog(DogKind kind, int weight, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Kind = kind;
            Weight = weight;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        internal DogKind Kind { get; set; }
        public int Weight { get; set; }
    }
```

Should generate Golden as a derived class with DogKind.Golden discriminator

```csharp src/Generated/Models/Golden.cs class Golden
public partial class Golden : Dog
    {
        public Golden(int weight) : base(DogKind.Golden, weight) {}

        internal Golden(
            DogKind kind,
            int weight,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        ) : base(kind, weight, additionalBinaryDataProperties) {}
    }
```

Should generate Snake as abstract base with fixed enum discriminator

```csharp src/Generated/Models/Snake.cs class Snake
public abstract partial class Snake
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        private protected Snake(SnakeKind kind, int length)
        {
            Kind = kind;
            Length = length;
        }

        internal Snake(SnakeKind kind, int length, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Kind = kind;
            Length = length;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        internal SnakeKind Kind { get; set; }
        public int Length { get; set; }
    }
```

Should generate Cobra as a derived class with SnakeKind.Cobra discriminator

```csharp src/Generated/Models/Cobra.cs class Cobra
public partial class Cobra : Snake
    {
        public Cobra(int length) : base(SnakeKind.Cobra, length) {}

        internal Cobra(
            SnakeKind kind,
            int length,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        ) : base(kind, length, additionalBinaryDataProperties) {}
    }
```

Should generate SnakeKind as a fixed enum

```csharp src/Generated/Models/SnakeKind.cs enum SnakeKind
public enum SnakeKind
    {
        /// <summary> Cobra. </summary>
        Cobra
    }
```

Should generate UnknownDog as internal fallback with default discriminator guard

```csharp src/Generated/Models/UnknownDog.cs class UnknownDog
internal partial class UnknownDog : Dog
    {
        internal UnknownDog(
            DogKind kind,
            int weight,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        ) : base(kind != default ? kind : "unknown", weight, additionalBinaryDataProperties) {}
    }
```

Should generate UnknownSnake as internal fallback with default discriminator guard

```csharp src/Generated/Models/UnknownSnake.cs class UnknownSnake
internal partial class UnknownSnake : Snake
    {
        internal UnknownSnake(
            SnakeKind kind,
            int length,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        ) : base(kind != default ? kind : "unknown", length, additionalBinaryDataProperties) {}
    }
```
