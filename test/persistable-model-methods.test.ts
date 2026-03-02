import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for PersistableModelWriteCore and PersistableModelCreateCore components.
 *
 * These tests verify that the emitter generates the format-dispatching methods
 * `PersistableModelWriteCore` and `PersistableModelCreateCore` in the model's
 * `.Serialization.cs` file. These methods are the core entry points for the
 * `IPersistableModel<T>` interface:
 *
 * - `PersistableModelWriteCore` serializes the model to `BinaryData` by dispatching
 *   on the wire format (currently JSON "J", future XML "X").
 * - `PersistableModelCreateCore` deserializes a model from `BinaryData` by parsing
 *   it as a `JsonDocument` and delegating to the static `Deserialize{Model}` method.
 *
 * Why these tests matter:
 * - These methods form the bridge between the `IPersistableModel<T>` interface
 *   and the model's actual serialization logic.
 * - Format validation ensures unsupported formats are rejected with clear errors.
 * - Derived models must use `override` (not `virtual`) and return the root base
 *   type for polymorphic deserialization compatibility.
 * - The format resolution pattern ("W" → GetFormatFromOptions) is critical for
 *   wire-format negotiation in the System.ClientModel framework.
 */
describe("PersistableModelWriteCore", () => {
  /**
   * Validates that the PersistableModelWriteCore method is generated for a root model
   * with the correct signature: `protected virtual BinaryData PersistableModelWriteCore(ModelReaderWriterOptions options)`.
   * Root models must use `virtual` since they are the base of the override chain.
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
      "protected virtual BinaryData PersistableModelWriteCore(ModelReaderWriterOptions options)",
    );
  });

  /**
   * Validates the format resolution pattern in PersistableModelWriteCore.
   * The method must resolve "W" (wire) format by calling GetFormatFromOptions
   * via the IPersistableModel<T> interface cast. This is the standard pattern
   * used by System.ClientModel for format negotiation.
   */
  it("includes format resolution with IPersistableModel cast", async () => {
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
      'string format = options.Format == "W" ? ((IPersistableModel<Widget>)this).GetFormatFromOptions(options) : options.Format;',
    );
  });

  /**
   * Validates that PersistableModelWriteCore dispatches to ModelReaderWriter.Write
   * for JSON format. This is the standard serialization path for JSON models.
   */
  it("dispatches to ModelReaderWriter.Write for JSON format", async () => {
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

    expect(content).toContain('case "J":');
    expect(content).toContain("return ModelReaderWriter.Write(this, options);");
  });

  /**
   * Validates that PersistableModelWriteCore throws FormatException for unsupported
   * formats. The error message must include the model name via nameof() and the
   * format string from options.Format for diagnostics.
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
      "throw new FormatException($\"The model {nameof(Widget)} does not support writing '{options.Format}' format.\");",
    );
  });

  /**
   * Validates that derived models use `protected override` instead of `protected virtual`.
   * This is required because the root model declares PersistableModelWriteCore as virtual,
   * and all derived models must override it in the C# type hierarchy.
   */
  it("generates protected override for derived model", async () => {
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

    expect(content).toContain(
      "protected override BinaryData PersistableModelWriteCore(ModelReaderWriterOptions options)",
    );
  });

  /**
   * Validates that derived models cast to their own IPersistableModel<T> type (not
   * the base model's) in the format resolution. This ensures each model can
   * independently negotiate its supported format.
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

    expect(content).toContain(
      "((IPersistableModel<Dog>)this).GetFormatFromOptions(options)",
    );
  });

  /**
   * Validates that the serialization file includes the necessary `using` directives
   * for the types referenced by PersistableModelWriteCore: System (for BinaryData,
   * FormatException) and System.ClientModel.Primitives (for ModelReaderWriterOptions,
   * IPersistableModel, ModelReaderWriter).
   */
  it("generates required using directives", async () => {
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

    expect(content).toContain("using System;");
    expect(content).toContain("using System.ClientModel.Primitives;");
  });
});

describe("PersistableModelCreateCore", () => {
  /**
   * Validates that PersistableModelCreateCore is generated for a root model
   * with the correct signature: the return type should be the model itself
   * since it's the root of the inheritance chain.
   */
  it("generates protected virtual method with model return type for root model", async () => {
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
      "protected virtual Widget PersistableModelCreateCore(BinaryData data, ModelReaderWriterOptions options)",
    );
  });

  /**
   * Validates the JSON deserialization dispatch: PersistableModelCreateCore
   * must parse the BinaryData as a JsonDocument and delegate to the static
   * Deserialize method. This is the standard pattern for JSON model deserialization.
   */
  it("dispatches to JsonDocument.Parse and Deserialize for JSON format", async () => {
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
      "using (JsonDocument document = JsonDocument.Parse(data))",
    );
    expect(content).toContain(
      "return DeserializeWidget(document.RootElement, options);",
    );
  });

  /**
   * Validates that PersistableModelCreateCore throws FormatException for
   * unsupported formats, with model name in the error message.
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
      "throw new FormatException($\"The model {nameof(Widget)} does not support reading '{options.Format}' format.\");",
    );
  });

  /**
   * Validates that derived models use `protected override` and return the ROOT
   * base model type, not the derived type. This is critical for polymorphic
   * deserialization — the virtual method declared on the root must have a
   * consistent return type throughout the hierarchy.
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
      "protected override Pet PersistableModelCreateCore(BinaryData data, ModelReaderWriterOptions options)",
    );
  });

  /**
   * Validates that derived models still call their own Deserialize method,
   * not the base model's. Each model knows how to deserialize its own properties;
   * the base Deserialize handles discriminator dispatch.
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
   * IPersistableModel<T> cast for format resolution, not the base model name.
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

    expect(content).toContain(
      "((IPersistableModel<Dog>)this).GetFormatFromOptions(options)",
    );
  });

  /**
   * Validates that required using directives are generated for
   * PersistableModelCreateCore: System (BinaryData, FormatException),
   * System.Text.Json (JsonDocument), and System.ClientModel.Primitives.
   */
  it("generates required using directives including System.Text.Json", async () => {
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

    expect(content).toContain("using System;");
    expect(content).toContain("using System.Text.Json;");
    expect(content).toContain("using System.ClientModel.Primitives;");
  });

  /**
   * Validates deep inheritance: when a model has multiple levels of inheritance
   * (Dog → Pet → Animal), PersistableModelCreateCore return type should be
   * the ROOT base type (Animal, not Pet), matching the virtual method declaration.
   *
   * Uses a discriminator hierarchy where Dog extends Pet extends Animal,
   * and all are discriminated on "kind". Pet declares its own sub-discriminator
   * value to verify the root traversal logic.
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
      "protected override Animal PersistableModelCreateCore(BinaryData data, ModelReaderWriterOptions options)",
    );
  });
});
