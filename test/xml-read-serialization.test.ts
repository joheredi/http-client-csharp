import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the XML read (deserialization) path components.
 *
 * These tests verify that the emitter generates correct XML deserialization
 * methods for models used with `application/xml` content type:
 * - `DeserializeXxx(XElement, ModelReaderWriterOptions)` — core XML deserialization
 * - `PersistableModelCreateCore` — format dispatcher with `case "X":` for XML
 * - Attribute and element matching loops
 * - Array, dictionary, enum, and nested model deserialization
 *
 * Why these tests matter:
 * - XML deserialization is required for models transported via `application/xml`
 * - The generated code must match the legacy emitter's patterns (separate attribute
 *   and element loops, explicit casts, XElement LINQ-to-XML API)
 * - XML has distinct deserialization patterns from JSON (casts vs .GetXxx(),
 *   XElement.Attributes() vs EnumerateObject(), namespace handling)
 */
describe("XML Read Path", () => {
  /**
   * Validates that XML-only models get the DeserializeXxx method.
   * This is the core XML deserialization entry point.
   */
  it("generates DeserializeXxx method for XML-only models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        name: string;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();
    const content = outputs[fileKey!];

    // Should contain the Deserialize method signature
    expect(content).toMatch(
      /internal static XmlPayload DeserializeXmlPayload\(XElement element, ModelReaderWriterOptions options\)/,
    );
    // Should have null check
    expect(content).toContain("if (element == null)");
    expect(content).toContain("return null;");
  });

  /**
   * Validates that PersistableModelCreateCore includes case "X" for XML models
   * with the MemoryStream + XElement.Load pattern.
   */
  it("generates PersistableModelCreateCore with XML case", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        name: string;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // PersistableModelCreateCore should have XML read case
    expect(content).toMatch(/PersistableModelCreateCore[\s\S]*?case "X":/);
    // Should use data.ToStream() + XElement.Load
    expect(content).toContain("data.ToStream()");
    expect(content).toContain(
      "XElement.Load(dataStream, LoadOptions.PreserveWhitespace)",
    );
    // Should call DeserializeXmlPayload
    expect(content).toContain(
      "DeserializeXmlPayload(XElement.Load(dataStream, LoadOptions.PreserveWhitespace), options)",
    );
  });

  /**
   * Validates that string and int properties are deserialized with explicit casts.
   * XML deserialization uses `(string)child` and `(int)child` patterns.
   */
  it("deserializes string and int properties with explicit casts", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        name: string;
        count: int32;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Element matching loop
    expect(content).toContain("foreach (var child in element.Elements())");
    expect(content).toContain("string localName = child.Name.LocalName;");
    // String property uses (string) cast
    expect(content).toMatch(
      /if \(localName == "name"\)\s*\{\s*name = \(string\)child;/,
    );
    // Int property uses (int) cast
    expect(content).toMatch(
      /if \(localName == "count"\)\s*\{\s*count = \(int\)child;/,
    );
  });

  /**
   * Validates that the constructor return statement includes all properties
   * plus additionalBinaryDataProperties.
   */
  it("generates constructor return with all properties", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        name: string;
        count: int32;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Should have return new with all params
    expect(content).toContain(
      "return new XmlPayload(name, count, additionalBinaryDataProperties);",
    );
  });

  /**
   * Validates that variable declarations are generated for all properties.
   * Each property gets a `Type varName = default;` declaration.
   */
  it("generates variable declarations for all properties", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        name: string;
        enabled: boolean;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Variable declarations
    expect(content).toContain("string name = default;");
    expect(content).toContain("bool enabled = default;");
    expect(content).toContain(
      "IDictionary<string, BinaryData> additionalBinaryDataProperties = new ChangeTrackingDictionary<string, BinaryData>();",
    );
  });

  /**
   * Validates that JSON-only models do NOT get XML deserialization methods.
   * The DeserializeXxx method in JSON-only models uses JsonElement, not XElement.
   */
  it("does not generate XML deserialization for JSON-only models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model JsonPayload {
        name: string;
      }

      @route("/test")
      @post op submit(@body body: JsonPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("JsonPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Should have JSON deserialize but not XML
    expect(content).toContain("DeserializeJsonPayload(JsonElement element");
    expect(content).not.toContain("XElement element");
    // PersistableModelCreateCore should NOT have case "X"
    expect(content).not.toMatch(/PersistableModelCreateCore[\s\S]*?case "X":/);
  });

  /**
   * Validates that the deserialization method continues after each property match.
   * Each property match block must end with `continue;` to avoid falling through.
   */
  it("generates continue after each property match", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        name: string;
        count: int32;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Each property match block should end with continue
    expect(content).toMatch(/name = \(string\)child;\s*continue;/);
    expect(content).toMatch(/count = \(int\)child;\s*continue;/);
  });

  /**
   * Validates that nested model properties call the static Deserialize method.
   * Nested models use `ModelName.DeserializeModelName(child, options)` pattern.
   */
  it("deserializes nested model properties", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model NestedModel {
        foo: string;
      }

      model XmlPayload {
        nested: NestedModel;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Nested model deserialization calls static Deserialize method
    expect(content).toContain(
      "NestedModel.DeserializeNestedModel(child, options)",
    );
  });

  /**
   * Validates that using System.Xml.Linq is auto-generated when XElement is referenced.
   * This ensures the generated code has the correct `using` directives.
   */
  it("generates using System.Xml.Linq for XML models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        name: string;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Should have using for XElement
    expect(content).toContain("using System.Xml.Linq;");
  });

  /**
   * Validates that XML-only models get a DeserializationConstructor.
   * This is the internal constructor used by the deserialization method.
   * Previously, this was only generated for JSON models.
   */
  it("generates deserialization constructor for XML-only models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        name: string;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Should have the internal deserialization constructor (parameterless)
    expect(content).toMatch(/internal XmlPayload\(\)/);
  });

  /**
   * Validates that boolean properties use explicit (bool) cast.
   */
  it("deserializes boolean properties with bool cast", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        enabled: boolean;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    expect(content).toMatch(/enabled = \(bool\)child;/);
  });

  /**
   * Validates that float and double properties use appropriate casts.
   */
  it("deserializes float and double properties", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        score: float32;
        value: float64;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    expect(content).toContain("score = (float)child;");
    expect(content).toContain("value = (double)child;");
  });

  /**
   * Validates that the DeserializeXxx method for XML-only models does NOT
   * contain unresolved symbols. This catches broken refkey usage.
   */
  it("does not produce unresolved symbols", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        name: string;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Must never contain unresolved symbol markers
    expect(content).not.toContain("<Unresolved Symbol:");
  });
});
