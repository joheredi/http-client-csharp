import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for JsonModelCreateCore component.
 *
 * These tests verify that the emitter generates the `JsonModelCreateCore` method
 * in the model's `.Serialization.cs` file. This method is the core deserialization
 * entry point called by `IJsonModel<T>.Create`:
 *
 * ```csharp
 * protected virtual Widget JsonModelCreateCore(ref Utf8JsonReader reader, ModelReaderWriterOptions options)
 * {
 *     string format = options.Format == "W" ? ((IPersistableModel<Widget>)this).GetFormatFromOptions(options) : options.Format;
 *     if (format != "J")
 *     {
 *         throw new FormatException($"The model {nameof(Widget)} does not support reading '{format}' format.");
 *     }
 *     using JsonDocument document = JsonDocument.ParseValue(ref reader);
 *     return DeserializeWidget(document.RootElement, options);
 * }
 * ```
 *
 * Why these tests matter:
 * - `JsonModelCreateCore` is the bridge between `IJsonModel<T>.Create` (the interface
 *   entry point) and the static `Deserialize{Model}` method. Without it, models cannot
 *   be deserialized from a `Utf8JsonReader`.
 * - The method uses `JsonDocument.ParseValue(ref reader)` (not `JsonDocument.Parse(data)`)
 *   because it receives a `ref Utf8JsonReader`, which is the streaming JSON API.
 * - Format validation ensures unsupported formats are rejected before attempting parse.
 * - Derived models must use `override` (not `virtual`) and return the root base type
 *   for polymorphic deserialization compatibility — same pattern as `PersistableModelCreateCore`.
 */
describe("JsonModelCreateCore", () => {
  /**
   * Validates that JsonModelCreateCore is generated for a root model with
   * `protected virtual` modifier and the model's own type as the return type.
   * Root models declare the virtual method that derived models will override.
   */
  it("generates protected virtual method for root model", async () => {
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

    expect(content).toContain(
      "protected virtual Widget JsonModelCreateCore(ref Utf8JsonReader reader, ModelReaderWriterOptions options)",
    );
  });

  /**
   * Validates the format resolution pattern: resolves "W" (wire) format by
   * calling GetFormatFromOptions via IPersistableModel<T> cast, then validates
   * the format is "J" (JSON). This is the standard System.ClientModel pattern.
   */
  it("includes format resolution and validation", async () => {
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
    const content = outputs[fileKey!];

    // Format resolution via IPersistableModel<T>.GetFormatFromOptions
    expect(content).toContain(
      'string format = options.Format == "W" ? ((IPersistableModel<Widget>)this).GetFormatFromOptions(options) : options.Format;',
    );

    // Format validation
    expect(content).toContain('if (format != "J")');
  });

  /**
   * Validates that JsonModelCreateCore uses `JsonDocument.ParseValue(ref reader)`
   * to parse the Utf8JsonReader into a JsonDocument, then delegates to the
   * static Deserialize method. This is distinct from PersistableModelCreateCore
   * which uses `JsonDocument.Parse(data)` for BinaryData.
   */
  it("parses reader with JsonDocument.ParseValue and calls Deserialize", async () => {
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
    const content = outputs[fileKey!];

    // Uses ParseValue with ref reader (not Parse with BinaryData)
    expect(content).toContain(
      "using JsonDocument document = JsonDocument.ParseValue(ref reader);",
    );

    // Delegates to static Deserialize method
    expect(content).toContain(
      "return DeserializeWidget(document.RootElement, options);",
    );
  });

  /**
   * Validates that JsonModelCreateCore throws FormatException for unsupported
   * formats with the model name in the error message. Uses "reading" (not "writing")
   * in the message since this is a deserialization method.
   */
  it("throws FormatException for unsupported formats", async () => {
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
    const content = outputs[fileKey!];

    expect(content).toContain(
      "throw new FormatException($\"The model {nameof(Widget)} does not support reading '{format}' format.\");",
    );
  });

  /**
   * Validates that derived models use `protected override` and return the ROOT
   * base type, not the derived type. This matches the PersistableModelCreateCore
   * pattern — the virtual method on the root declares the return type, and all
   * overrides must match it.
   */
  it("generates protected override with root base type for derived model", async () => {
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
        breed: string;
      }

      @route("/test")
      op test(): Pet;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Dog.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();
    const content = outputs[fileKey!];

    // Return type must be root base type (Pet), not derived type (Dog)
    expect(content).toContain(
      "protected override Pet JsonModelCreateCore(ref Utf8JsonReader reader, ModelReaderWriterOptions options)",
    );
  });

  /**
   * Validates that derived models still call their own Deserialize method,
   * not the base model's. Each model deserializes its own property set.
   */
  it("calls own Deserialize method for derived model", async () => {
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
        breed: string;
      }

      @route("/test")
      op test(): Pet;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Dog.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    expect(content).toContain(
      "return DeserializeDog(document.RootElement, options);",
    );
  });

  /**
   * Validates that derived models use their own model name in the
   * IPersistableModel<T> cast for format resolution.
   */
  it("uses own model name in IPersistableModel cast for derived model", async () => {
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
        breed: string;
      }

      @route("/test")
      op test(): Pet;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Dog.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Must use Dog (own model name), not Pet (base model)
    expect(content).toContain(
      "((IPersistableModel<Dog>)this).GetFormatFromOptions(options)",
    );
  });

  /**
   * Validates deep inheritance: return type should be the ROOT base type,
   * not the immediate parent. For Dog → Pet → Animal, the return type is Animal.
   */
  it("returns root base type for deep inheritance chains", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @discriminator("kind")
      model Animal {
        kind: string;
        name: string;
      }

      model Pet extends Animal {
        kind: "pet";
        domestic: boolean;
      }

      @route("/test")
      op test(): Animal;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Pet.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();
    const content = outputs[fileKey!];

    // Pet → Animal: return type must be Animal (root)
    expect(content).toContain(
      "protected override Animal JsonModelCreateCore(ref Utf8JsonReader reader, ModelReaderWriterOptions options)",
    );
  });
});
