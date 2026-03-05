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

        /// <summary> Initializes a new instance of <see cref="Pet"/>. </summary>
        /// <param name="name"></param>
        /// <exception cref="ArgumentNullException"> <paramref name="name"/> is null. </exception>
        public Pet(string name)
        {
            Argument.AssertNotNull(name, nameof(name));

            Name = name;
        }

        /// <summary> Initializes a new instance of <see cref="Pet"/>. </summary>
        /// <param name="name"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
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
        /// <summary> Initializes a new instance of <see cref="Cat"/>. </summary>
        /// <param name="name"></param>
        /// <param name="age"></param>
        public Cat(string name, int age) : base(name)
        {
            Age = age;
        }

        /// <summary> Initializes a new instance of <see cref="Cat"/>. </summary>
        /// <param name="name"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        /// <param name="age"></param>
        internal Cat(
            string name,
            IDictionary<string, BinaryData> additionalBinaryDataProperties,
            int age
        ) : base(name, additionalBinaryDataProperties)
        {
            Age = age;
        }

        public int Age { get; set; }
    }
```

Should generate Siamese extending Cat with smart property

```csharp src/Generated/Models/Siamese.cs class Siamese
public partial class Siamese : Cat
    {
        /// <summary> Initializes a new instance of <see cref="Siamese"/>. </summary>
        /// <param name="name"></param>
        /// <param name="age"></param>
        /// <param name="smart"></param>
        public Siamese(string name, int age, bool smart) : base(name, age)
        {
            Smart = smart;
        }

        /// <summary> Initializes a new instance of <see cref="Siamese"/>. </summary>
        /// <param name="name"></param>
        /// <param name="additionalBinaryDataProperties"> Keeps track of any properties unknown to the library. </param>
        /// <param name="age"></param>
        /// <param name="smart"></param>
        internal Siamese(
            string name,
            IDictionary<string, BinaryData> additionalBinaryDataProperties,
            int age,
            bool smart
        ) : base(name, additionalBinaryDataProperties, age)
        {
            Smart = smart;
        }

        public bool Smart { get; set; }
    }
```
