import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for PersistableModelInterfaceMethods component.
 *
 * These tests verify that the emitter generates the explicit interface
 * implementations for `IPersistableModel<T>` in the model's `.Serialization.cs` file:
 *
 * 1. `BinaryData IPersistableModel<T>.Write(ModelReaderWriterOptions options) => PersistableModelWriteCore(options);`
 * 2. `T IPersistableModel<T>.Create(BinaryData data, ModelReaderWriterOptions options) => PersistableModelCreateCore(data, options);`
 * 3. `string IPersistableModel<T>.GetFormatFromOptions(ModelReaderWriterOptions options) => "J";`
 *
 * Why these tests matter:
 * - These explicit interface methods are the public contract that the System.ClientModel
 *   framework calls to serialize/deserialize models. Without them, models cannot participate
 *   in the ModelReaderWriter serialization pipeline.
 * - The methods must use explicit interface qualification (e.g., `IPersistableModel<T>.Write`)
 *   to be only callable through the interface, matching the legacy emitter's output.
 * - For derived models, the Create method requires a cast from the root base type to the
 *   current model type, since `PersistableModelCreateCore` returns the root type.
 * - GetFormatFromOptions must return "J" for JSON models to indicate JSON wire format.
 */
describe("PersistableModelInterfaceMethods", () => {
  /**
   * Validates that all three explicit IPersistableModel<T> interface methods are
   * generated for a root model with correct signatures and expression bodies.
   * Root models don't need a cast in the Create method since PersistableModelCreateCore
   * returns the same type.
   */
  it("generates all three explicit interface methods for root model", async () => {
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

    // Verify IPersistableModel<Widget>.Write delegates to PersistableModelWriteCore
    expect(content).toContain(
      "BinaryData IPersistableModel<Widget>.Write(ModelReaderWriterOptions options) => PersistableModelWriteCore(options);",
    );

    // Verify IPersistableModel<Widget>.Create delegates to PersistableModelCreateCore (no cast for root model)
    expect(content).toContain(
      "Widget IPersistableModel<Widget>.Create(BinaryData data, ModelReaderWriterOptions options) => PersistableModelCreateCore(data, options);",
    );

    // Verify IPersistableModel<Widget>.GetFormatFromOptions returns "J"
    expect(content).toContain(
      'string IPersistableModel<Widget>.GetFormatFromOptions(ModelReaderWriterOptions options) => "J";',
    );
  });

  /**
   * Validates that derived models include a cast in the Create method.
   * When a model inherits from a base model, PersistableModelCreateCore returns
   * the root base type (for polymorphic override compatibility). The explicit
   * interface implementation must cast that back to the derived type.
   */
  it("generates Create with cast for derived model", async () => {
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

    // Verify Write method (no cast needed for Write, regardless of inheritance)
    expect(dogContent).toContain(
      "BinaryData IPersistableModel<Dog>.Write(ModelReaderWriterOptions options) => PersistableModelWriteCore(options);",
    );

    // Verify Create method has cast from root type to derived type
    expect(dogContent).toContain(
      "Dog IPersistableModel<Dog>.Create(BinaryData data, ModelReaderWriterOptions options) => (Dog)PersistableModelCreateCore(data, options);",
    );

    // Verify GetFormatFromOptions still returns "J"
    expect(dogContent).toContain(
      'string IPersistableModel<Dog>.GetFormatFromOptions(ModelReaderWriterOptions options) => "J";',
    );
  });

  /**
   * Validates that the base model (root of hierarchy) does NOT have a cast
   * in the Create method, since PersistableModelCreateCore returns the same type.
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
      "Pet IPersistableModel<Pet>.Create(BinaryData data, ModelReaderWriterOptions options) => PersistableModelCreateCore(data, options);",
    );
    // Ensure there's no cast
    expect(petContent).not.toContain("(Pet)PersistableModelCreateCore");
  });

  /**
   * Validates the cast pattern for deeply nested inheritance chains.
   * A model two levels deep (Dog → Pet) that has its own derived model
   * (GoldenRetriever → Dog) should still cast since PersistableModelCreateCore
   * returns the root type.
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
      "Dog IPersistableModel<Dog>.Create(BinaryData data, ModelReaderWriterOptions options) => (Dog)PersistableModelCreateCore(data, options);",
    );

    // Root model (Animal) should NOT have a cast
    const animalFileKey = Object.keys(outputs).find((k) =>
      k.includes("Animal.Serialization.cs"),
    );
    expect(animalFileKey).toBeDefined();
    const animalContent = outputs[animalFileKey!];
    expect(animalContent).toContain(
      "Animal IPersistableModel<Animal>.Create(BinaryData data, ModelReaderWriterOptions options) => PersistableModelCreateCore(data, options);",
    );
  });

  /**
   * Validates that the generated using directives include the required namespaces
   * for the explicit interface methods (System and System.ClientModel.Primitives).
   * The builtin refkeys in the code templates should automatically trigger these.
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

    // Verify using directives are generated for the types referenced in the methods
    expect(content).toContain("using System;");
    expect(content).toContain("using System.ClientModel.Primitives;");
  });

  /**
   * Validates that the interface type argument always uses the current model name,
   * not the base model name. Even for derived models, the interface is
   * IPersistableModel<Dog> (not IPersistableModel<Pet>).
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

    // All three methods should use IPersistableModel<Cat>, not IPersistableModel<Pet>
    expect(catContent).toContain("IPersistableModel<Cat>.Write");
    expect(catContent).toContain("IPersistableModel<Cat>.Create");
    expect(catContent).toContain("IPersistableModel<Cat>.GetFormatFromOptions");

    // Should NOT reference the base model in interface qualification
    expect(catContent).not.toContain("IPersistableModel<Pet>.Write");
    expect(catContent).not.toContain("IPersistableModel<Pet>.Create");
    expect(catContent).not.toContain(
      "IPersistableModel<Pet>.GetFormatFromOptions",
    );
  });
});
