import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the XML write path components.
 *
 * These tests verify that the emitter generates correct XML serialization
 * methods for models used with `application/xml` content type:
 * - `WriteXml` — private method that wraps `XmlModelWriteCore` with element tags
 * - `XmlModelWriteCore` — protected virtual method that writes properties as XML
 * - `PersistableModelWriteCore` — format dispatcher with `case "X":` for XML
 * - `PersistableModelInterfaceMethods` — `GetFormatFromOptions` returns "X"
 *
 * Why these tests matter:
 * - XML serialization is required for models transported via `application/xml`
 * - The generated code must match the legacy emitter's golden file patterns
 * - XML has distinct patterns from JSON (attributes vs elements, wrapped/unwrapped arrays)
 */
describe("XML Write Path", () => {
  /**
   * Validates that XML-only models get the XmlModelWriteCore method signature.
   * This is the core XML serialization method that writes model properties.
   */
  it("generates XmlModelWriteCore method for XML-only models", async () => {
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

    // Should contain the XmlModelWriteCore method
    expect(content).toContain("XmlModelWriteCore");
    expect(content).toMatch(
      /protected virtual void XmlModelWriteCore\(XmlWriter writer, ModelReaderWriterOptions options\)/,
    );
  });

  /**
   * Validates that the WriteXml private method is generated for XML models.
   * WriteXml wraps XmlModelWriteCore with optional element start/end tags.
   */
  it("generates WriteXml private method for XML-only models", async () => {
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

    // Should contain the WriteXml method
    expect(content).toMatch(
      /private void WriteXml\(XmlWriter writer, ModelReaderWriterOptions options, string nameHint\)/,
    );
    // Should call XmlModelWriteCore inside
    expect(content).toContain("XmlModelWriteCore(writer, options)");
    // Should conditionally wrap with element tags
    expect(content).toContain("writer.WriteStartElement(nameHint)");
    expect(content).toContain("writer.WriteEndElement()");
  });

  /**
   * Validates that PersistableModelWriteCore includes case "X" for XML models
   * with the MemoryStream + XmlWriter pattern.
   */
  it("generates PersistableModelWriteCore with XML case", async () => {
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

    // Should have XML case in PersistableModelWriteCore
    expect(content).toContain('case "X":');
    // Should create MemoryStream and XmlWriter
    expect(content).toContain("new MemoryStream(256)");
    expect(content).toContain(
      "XmlWriter.Create(stream, ModelSerializationExtensions.XmlWriterSettings)",
    );
    // Should call WriteXml with the model's root element name
    expect(content).toContain('WriteXml(writer, options, "XmlPayload")');
    // PersistableModelWriteCore should NOT have JSON case for XML-only models
    // (note: PersistableModelCreateCore may still have case "J" until task 6.2.1)
    expect(content).toMatch(/PersistableModelWriteCore[\s\S]*?case "X":/);
  });

  /**
   * Validates that GetFormatFromOptions returns "X" for XML-only models.
   * This is critical because PersistableModelWriteCore resolves "W" format
   * through GetFormatFromOptions.
   */
  it('returns "X" for GetFormatFromOptions on XML-only models', async () => {
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

    // GetFormatFromOptions should return "X" for XML-only models
    expect(content).toMatch(/GetFormatFromOptions.*=> "X"/);
  });

  /**
   * Validates that the using directive for System.Xml is generated
   * when XML serialization methods reference XmlWriter.
   */
  it("generates using System.Xml directive", async () => {
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

    expect(content).toContain("using System.Xml;");
    expect(content).toContain("using System.IO;");
  });

  /**
   * Validates that XmlModelWriteCore writes string properties as XML elements.
   * String properties should use writer.WriteStartElement + writer.WriteValue
   * + writer.WriteEndElement.
   */
  it("writes string properties as XML elements", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        name: string;
        description: string;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Should write string properties as elements
    expect(content).toContain('writer.WriteStartElement("name")');
    expect(content).toContain("writer.WriteValue(Name)");
    expect(content).toContain("writer.WriteEndElement()");
    expect(content).toContain('writer.WriteStartElement("description")');
    expect(content).toContain("writer.WriteValue(Description)");
  });

  /**
   * Validates that integer properties are written with writer.WriteValue.
   */
  it("writes integer properties as XML elements", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
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

    expect(content).toContain('writer.WriteStartElement("count")');
    expect(content).toContain("writer.WriteValue(Count)");
    expect(content).toContain("writer.WriteEndElement()");
  });

  /**
   * Validates that boolean properties are written with writer.WriteValue.
   */
  it("writes boolean properties as XML elements", async () => {
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

    expect(content).toContain('writer.WriteStartElement("enabled")');
    expect(content).toContain("writer.WriteValue(Enabled)");
  });

  /**
   * Validates that optional properties are wrapped in Optional.IsDefined guards.
   * This prevents serializing properties that haven't been set by the user.
   */
  it("wraps optional properties in Optional.IsDefined guard", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlPayload {
        name: string;
        description?: string;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Optional property should be wrapped in guard
    expect(content).toContain("Optional.IsDefined(Description)");
    // Required property should NOT be wrapped
    expect(content).not.toContain("Optional.IsDefined(Name)");
  });

  /**
   * Validates that XmlModelWriteCore includes format validation.
   * The method should throw FormatException if the format is not "X".
   */
  it("includes format validation in XmlModelWriteCore", async () => {
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

    expect(content).toContain('if (format != "X")');
    expect(content).toContain("throw new FormatException");
    expect(content).toContain("does not support writing");
  });

  /**
   * Validates that JSON models still work correctly and don't get XML methods.
   * JSON-only models should not have XmlModelWriteCore or WriteXml.
   */
  it("does not generate XML methods for JSON-only models", async () => {
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

    // JSON-only models should NOT have XML methods
    expect(content).not.toContain("XmlModelWriteCore");
    expect(content).not.toContain("WriteXml");
    // Should still have JSON methods
    expect(content).toContain("JsonModelWriteCore");
    // GetFormatFromOptions should return "J"
    expect(content).toMatch(/GetFormatFromOptions.*=> "J"/);
  });

  /**
   * Validates dual-format models (JSON + XML) get both format cases
   * in PersistableModelWriteCore and the XML write methods.
   */
  it("generates both JSON and XML cases for dual-format models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model DualPayload {
        name: string;
      }

      @route("/json")
      @post op submitJson(@body body: DualPayload): DualPayload;

      @route("/xml")
      @post op submitXml(@header("content-type") contentType: "application/xml", @body body: DualPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("DualPayload.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Should have both format cases
    expect(content).toContain('case "J":');
    expect(content).toContain('case "X":');
    // Should have both JSON and XML methods
    expect(content).toContain("JsonModelWriteCore");
    expect(content).toContain("XmlModelWriteCore");
    expect(content).toContain("WriteXml");
    // Dual-format models with JSON should return "J" from GetFormatFromOptions
    expect(content).toMatch(/GetFormatFromOptions.*=> "J"/);
  });

  /**
   * Validates that model properties that are themselves models are written
   * using writer.WriteObjectValue which delegates to the nested model's
   * serialization.
   */
  it("writes nested model properties with WriteObjectValue", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model NestedModel {
        value: string;
      }

      model ParentModel {
        child: NestedModel;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: ParentModel): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("ParentModel.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Nested models should use WriteObjectValue
    expect(content).toContain('writer.WriteStartElement("child")');
    expect(content).toContain("writer.WriteObjectValue(Child, options)");
    expect(content).toContain("writer.WriteEndElement()");
  });
});
