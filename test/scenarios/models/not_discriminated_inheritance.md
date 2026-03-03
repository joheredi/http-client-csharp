# Should generate models with non-discriminated multi-level inheritance

Validates that a three-level inheritance hierarchy (Pet → Cat → Siamese) produces
the correct class structure with proper `extends` relationships and constructor chains.
Matches Spector `Type.Model.Inheritance.NotDiscriminated` golden files.

## TypeSpec

```tsp
@service
namespace Type.Model.Inheritance.NotDiscriminated;

model Pet {
  name: string;
}

model Cat extends Pet {
  age: int32;
}

model Siamese extends Cat {
  smart: boolean;
}

@route("/valid")
@post
op postValid(@body input: Siamese): void;

@route("/valid")
@get
op getValid(): Siamese;
```

## Models

Should generate Pet as a base class with name property

```csharp src/Generated/Models/Pet.cs class Pet
public partial class Pet
    {
        /// <summary> Keeps track of any properties unknown to the library. </summary>
        private protected readonly IDictionary<string, BinaryData> _additionalBinaryDataProperties;

        public Pet(string name)
        {
            Argument.AssertNotNull(name, nameof(name));

            Name = name;
        }

        internal Pet(string name, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Name = name;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public string Name { get; set; }
    }
```

Should generate Cat extending Pet with age property

```csharp src/Generated/Models/Cat.cs class Cat
public partial class Cat : Pet
    {
        public Cat(int age)
        {
            Age = age;
        }

        internal Cat(int age, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Age = age;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public int Age { get; set; }
    }
```

Should generate Siamese extending Cat with smart property

```csharp src/Generated/Models/Siamese.cs class Siamese
public partial class Siamese : Cat
    {
        public Siamese(bool smart)
        {
            Smart = smart;
        }

        internal Siamese(bool smart, IDictionary<string, BinaryData> additionalBinaryDataProperties)
        {
            Smart = smart;
            _additionalBinaryDataProperties = additionalBinaryDataProperties;
        }

        public bool Smart { get; set; }
    }
```
