import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for JsonModelInterfaceWrite component.
 *
 * These tests verify that the emitter generates the explicit interface
 * implementation `void IJsonModel<T>.Write(Utf8JsonWriter writer, ModelReaderWriterOptions options)`
 * in the model's `.Serialization.cs` file.
 *
 * Why these tests matter:
 * - The `IJsonModel<T>.Write` method is the top-level entry point that the
 *   System.ClientModel framework calls to serialize a model to JSON. Without it,
 *   models cannot be written through the `IJsonModel<T>` interface.
 * - The method must wrap `JsonModelWriteCore` with `WriteStartObject`/`WriteEndObject`
 *   to produce valid JSON objects. Missing delimiters would produce malformed JSON.
 * - Both root and derived models need their own explicit implementation because
 *   `IJsonModel<T>` is parameterized — `IJsonModel<Pet>` and `IJsonModel<Dog>`
 *   are distinct interfaces.
 * - The method body is identical for root and derived models; polymorphic dispatch
 *   happens inside `JsonModelWriteCore` (virtual/override).
 */
describe("JsonModelInterfaceWrite", () => {
  /**
   * Validates that the explicit IJsonModel<T>.Write method is generated for a
   * root model with correct signature, WriteStartObject/WriteEndObject framing,
   * and delegation to JsonModelWriteCore.
   */
  it("generates IJsonModel.Write for root model", async () => {
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

    // Verify the explicit interface method signature
    expect(content).toContain(
      "void IJsonModel<Widget>.Write(Utf8JsonWriter writer, ModelReaderWriterOptions options)",
    );

    // Verify WriteStartObject/WriteEndObject framing around JsonModelWriteCore
    expect(content).toContain("writer.WriteStartObject();");
    expect(content).toContain("JsonModelWriteCore(writer, options);");
    expect(content).toContain("writer.WriteEndObject();");
  });

  /**
   * Validates that derived models also generate their own IJsonModel<T>.Write
   * explicit interface implementation. Since IJsonModel<Dog> is a distinct
   * interface from IJsonModel<Pet>, the derived model needs its own Write method.
   * The body is identical to the root model — polymorphism is in JsonModelWriteCore.
   */
  it("generates IJsonModel.Write for derived model", async () => {
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

    // Derived model uses its own type as interface argument
    expect(dogContent).toContain(
      "void IJsonModel<Dog>.Write(Utf8JsonWriter writer, ModelReaderWriterOptions options)",
    );

    // Same body structure as root model
    expect(dogContent).toContain("writer.WriteStartObject();");
    expect(dogContent).toContain("JsonModelWriteCore(writer, options);");
    expect(dogContent).toContain("writer.WriteEndObject();");
  });

  /**
   * Validates that the base model in a hierarchy uses its own type name
   * (not the derived type) in the interface qualification.
   */
  it("base model uses its own type in interface qualification", async () => {
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

    const petFileKey = Object.keys(outputs).find((k) =>
      k.includes("Pet.Serialization.cs"),
    );
    expect(petFileKey).toBeDefined();
    const petContent = outputs[petFileKey!];

    // Base model uses IJsonModel<Pet>, not IJsonModel<Cat>
    expect(petContent).toContain("void IJsonModel<Pet>.Write(");
    expect(petContent).not.toContain("IJsonModel<Cat>.Write");
  });

  /**
   * Validates that the method body follows the exact three-line pattern:
   * WriteStartObject → JsonModelWriteCore → WriteEndObject.
   * This ensures the JSON object framing is correct — missing any of these
   * lines would produce malformed JSON output.
   */
  it("has correct method body structure", async () => {
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

    // Find the IJsonModel.Write method block and verify line order
    const writeStart = content.indexOf("void IJsonModel<Widget>.Write(");
    expect(writeStart).toBeGreaterThan(-1);

    const methodBlock = content.substring(
      writeStart,
      content.indexOf("}", writeStart + 1) + 1,
    );

    // Verify the three statements appear in correct order
    const startObjPos = methodBlock.indexOf("writer.WriteStartObject()");
    const writeCorePos = methodBlock.indexOf(
      "JsonModelWriteCore(writer, options)",
    );
    const endObjPos = methodBlock.indexOf("writer.WriteEndObject()");

    expect(startObjPos).toBeGreaterThan(-1);
    expect(writeCorePos).toBeGreaterThan(startObjPos);
    expect(endObjPos).toBeGreaterThan(writeCorePos);
  });

  /**
   * Validates that the required using directives are generated.
   * The IJsonModel.Write method references types from System.Text.Json
   * (Utf8JsonWriter) and System.ClientModel.Primitives (IJsonModel,
   * ModelReaderWriterOptions), which should trigger automatic using generation.
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

    // System.Text.Json for Utf8JsonWriter
    expect(content).toContain("using System.Text.Json;");
    // System.ClientModel.Primitives for IJsonModel and ModelReaderWriterOptions
    expect(content).toContain("using System.ClientModel.Primitives;");
  });
});
