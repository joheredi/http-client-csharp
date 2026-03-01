import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for JsonModelInterfaceCreate component.
 *
 * These tests verify that the emitter generates the explicit interface
 * implementation `T IJsonModel<T>.Create(ref Utf8JsonReader reader, ModelReaderWriterOptions options)`
 * in the model's `.Serialization.cs` file.
 *
 * Why these tests matter:
 * - The `IJsonModel<T>.Create` method is the entry point that the System.ClientModel
 *   framework calls to deserialize a model from a `Utf8JsonReader`. Without it,
 *   models cannot be read through the `IJsonModel<T>` interface.
 * - The method delegates to `JsonModelCreateCore` which handles format validation
 *   and actual deserialization.
 * - Both root and derived models need their own explicit implementation because
 *   `IJsonModel<T>` is parameterized — `IJsonModel<Pet>` and `IJsonModel<Dog>`
 *   are distinct interfaces, each requiring its own `Create` method.
 * - For derived models, a cast is needed because `JsonModelCreateCore` returns
 *   the root base type for polymorphic override compatibility.
 */
describe("JsonModelInterfaceCreate", () => {
  /**
   * Validates that the explicit IJsonModel<T>.Create method is generated for a
   * root model with correct signature and delegation to JsonModelCreateCore.
   * Root models don't need a cast since JsonModelCreateCore returns the same type.
   */
  it("generates IJsonModel.Create for root model without cast", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
        count: int32;
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();
    const content = outputs[fileKey!];

    // Verify the explicit interface method with expression body (no cast for root)
    expect(content).toContain(
      "Widget IJsonModel<Widget>.Create(ref Utf8JsonReader reader, ModelReaderWriterOptions options) => JsonModelCreateCore(ref reader, options);",
    );
  });

  /**
   * Validates that derived models include a cast from the root base type to
   * the derived type. Since JsonModelCreateCore returns the root type for
   * polymorphic override compatibility, the explicit interface method must cast.
   */
  it("generates IJsonModel.Create with cast for derived model", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @discriminator("kind")
      model Pet {
        kind: string;
        name: string;
      }

      model Dog extends Pet {
        kind: "dog";
        bark: boolean;
      }

      @route("/test")
      op test(): Pet;
    `);

    expect(diagnostics).toHaveLength(0);

    const dogFileKey = Object.keys(outputs).find((k) =>
      k.includes("Dog.Serialization.cs"),
    );
    expect(dogFileKey).toBeDefined();
    const dogContent = outputs[dogFileKey!];

    // Derived model needs cast from root type (Pet) to Dog
    expect(dogContent).toContain(
      "Dog IJsonModel<Dog>.Create(ref Utf8JsonReader reader, ModelReaderWriterOptions options) => (Dog)JsonModelCreateCore(ref reader, options);",
    );
  });

  /**
   * Validates that the base model in a hierarchy does NOT have a cast
   * in the Create method, since JsonModelCreateCore returns the same type.
   */
  it("generates Create without cast for base model in hierarchy", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @discriminator("kind")
      model Pet {
        kind: string;
        name: string;
      }

      model Dog extends Pet {
        kind: "dog";
        bark: boolean;
      }

      @route("/test")
      op test(): Pet;
    `);

    expect(diagnostics).toHaveLength(0);

    const petFileKey = Object.keys(outputs).find((k) =>
      k.includes("Pet.Serialization.cs"),
    );
    expect(petFileKey).toBeDefined();
    const petContent = outputs[petFileKey!];

    // Root model should NOT have a cast
    expect(petContent).toContain(
      "Pet IJsonModel<Pet>.Create(ref Utf8JsonReader reader, ModelReaderWriterOptions options) => JsonModelCreateCore(ref reader, options);",
    );
    expect(petContent).not.toContain("(Pet)JsonModelCreateCore");
  });

  /**
   * Validates the cast pattern for deeply nested inheritance.
   * A model that inherits from another derived model still needs a cast
   * since JsonModelCreateCore returns the root type.
   */
  it("generates Create with cast for deeply nested derived model", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @discriminator("kind")
      model Animal {
        kind: string;
        name: string;
      }

      model Dog extends Animal {
        kind: "dog";
        bark: boolean;
      }

      @route("/test")
      op test(): Animal;
    `);

    expect(diagnostics).toHaveLength(0);

    const dogFileKey = Object.keys(outputs).find((k) =>
      k.includes("Dog.Serialization.cs"),
    );
    expect(dogFileKey).toBeDefined();
    const dogContent = outputs[dogFileKey!];

    // Derived model needs cast from root type (Animal) to Dog
    expect(dogContent).toContain(
      "Dog IJsonModel<Dog>.Create(ref Utf8JsonReader reader, ModelReaderWriterOptions options) => (Dog)JsonModelCreateCore(ref reader, options);",
    );

    // Root model (Animal) should NOT have a cast
    const animalFileKey = Object.keys(outputs).find((k) =>
      k.includes("Animal.Serialization.cs"),
    );
    expect(animalFileKey).toBeDefined();
    const animalContent = outputs[animalFileKey!];
    expect(animalContent).toContain(
      "Animal IJsonModel<Animal>.Create(ref Utf8JsonReader reader, ModelReaderWriterOptions options) => JsonModelCreateCore(ref reader, options);",
    );
  });

  /**
   * Validates that the interface type argument always uses the current model name,
   * not the base model name. Even for derived models, the interface is
   * IJsonModel<Dog> (not IJsonModel<Pet>).
   */
  it("uses current model name as interface type argument", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @discriminator("kind")
      model Pet {
        kind: string;
        name: string;
      }

      model Cat extends Pet {
        kind: "cat";
        whiskers: int32;
      }

      @route("/test")
      op test(): Pet;
    `);

    expect(diagnostics).toHaveLength(0);

    const catFileKey = Object.keys(outputs).find((k) =>
      k.includes("Cat.Serialization.cs"),
    );
    expect(catFileKey).toBeDefined();
    const catContent = outputs[catFileKey!];

    // Cat file should use IJsonModel<Cat>, not IJsonModel<Pet>
    expect(catContent).toContain("IJsonModel<Cat>.Create(");
    expect(catContent).not.toContain("IJsonModel<Pet>.Create");
  });

  /**
   * Validates that the required using directives are generated.
   * The IJsonModel.Create method references types from System.Text.Json
   * (Utf8JsonReader) and System.ClientModel.Primitives (IJsonModel,
   * ModelReaderWriterOptions).
   */
  it("includes required using directives", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();
    const content = outputs[fileKey!];

    // System.Text.Json for Utf8JsonReader
    expect(content).toContain("using System.Text.Json;");
    // System.ClientModel.Primitives for IJsonModel and ModelReaderWriterOptions
    expect(content).toContain("using System.ClientModel.Primitives;");
  });
});
