# Should generate polymorphic models with single string discriminator

Validates discriminated polymorphic inheritance where a string `kind` field is
used as the discriminator. Tests abstract base class, concrete derived classes,
derived class with recursive references, and the unknown variant fallback.
Matches Spector `Type.Model.Inheritance.SingleDiscriminator` golden files.

## TypeSpec

```tsp
@service
namespace Type.Model.Inheritance.SingleDiscriminator;

@discriminator("kind")
model Bird {
  kind: string;
  wingspan: int32;
}

model SeaGull extends Bird {
  kind: "seagull";
}

model Sparrow extends Bird {
  kind: "sparrow";
}

model Eagle extends Bird {
  kind: "eagle";
  friends?: Bird[];
  hate?: Record<Bird>;
  partner?: Bird;
}

@route("/model")
@get
op getModel(): Bird;

@route("/model")
@put
op putModel(@body input: Bird): void;
```

## Models

Should generate Bird as an abstract base class with discriminator

```csharp src/Generated/Models/Bird.cs class Bird
public abstract partial class Bird
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        private protected Bird(string kind, int wingspan)
        {
            Kind = kind;
            Wingspan = wingspan;
        }

        internal Bird(string kind, int wingspan, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Kind = kind;
            Wingspan = wingspan;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        internal string Kind { get; set; }
        public int Wingspan { get; set; }
    }
```

Should generate SeaGull as a derived class with fixed discriminator value

```csharp src/Generated/Models/SeaGull.cs class SeaGull
public partial class SeaGull : Bird
    {
        public SeaGull(int wingspan) : base("seagull", wingspan) {}

        internal SeaGull(
            string kind,
            int wingspan,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        ) : base(kind, wingspan, additionalBinaryDataProperties) {}
    }
```

Should generate Sparrow as a derived class with fixed discriminator value

```csharp src/Generated/Models/Sparrow.cs class Sparrow
public partial class Sparrow : Bird
    {
        public Sparrow(int wingspan) : base("sparrow", wingspan) {}

        internal Sparrow(
            string kind,
            int wingspan,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        ) : base(kind, wingspan, additionalBinaryDataProperties) {}
    }
```

Should generate Eagle with recursive Bird references (collections and dictionary)

```csharp src/Generated/Models/Eagle.cs class Eagle
public partial class Eagle : Bird
    {
        public Eagle(int wingspan) : base("eagle", wingspan) {}

        internal Eagle(
            string kind,
            int wingspan,
            IDictionary<string, BinaryData> additionalBinaryDataProperties,
            IList<Bird> friends,
            IDictionary<string, Bird> hate,
            Bird? partner
        ) : base(kind, wingspan, additionalBinaryDataProperties)
        {
            Friends = friends;
            Hate = hate;
            Partner = partner;
        }

        public IList<Bird> Friends { get; }
        public IDictionary<string, Bird> Hate { get; }
        public Bird? Partner { get; set; }
    }
```

Should generate UnknownBird as internal fallback for unrecognized discriminator values

```csharp src/Generated/Models/UnknownBird.cs class UnknownBird
internal partial class UnknownBird : Bird
    {
        internal UnknownBird(
            string kind,
            int wingspan,
            IDictionary<string, BinaryData> additionalBinaryDataProperties
        ) : base(kind ?? "unknown", wingspan, additionalBinaryDataProperties)
        {
        }
    }
```
