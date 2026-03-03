import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the ToBinaryContent component (ToBinaryContent.tsx).
 *
 * These tests verify that the emitter generates `internal BinaryContent ToBinaryContent(string format)`
 * on serialization classes for dual-format (JSON + XML) input models. This method enables
 * convenience methods to serialize models with an explicit format string ("J" for JSON,
 * "X" for XML) instead of relying on the implicit BinaryContent operator.
 *
 * Why these tests matter:
 * - The ToBinaryContent method is the mechanism for format-specific serialization in
 *   convenience methods. Without it, dual-format models cannot be serialized with a
 *   specific format at the call site.
 * - It must only be generated for dual-format models (both JSON AND XML usage flags).
 *   Single-format models should NOT have this method.
 * - The method body must create ModelReaderWriterOptions with the format string and
 *   delegate to BinaryContent.Create(this, options).
 *
 * The legacy emitter generates this in `MrwSerializationTypeDefinition.BuildToBinaryContentMethod()`.
 */
describe("ToBinaryContent", () => {
  /**
   * Validates that a dual-format (JSON + XML) input model gets the ToBinaryContent method.
   * This is the core case — models that support both formats need explicit format selection.
   */
  it("generates ToBinaryContent for dual-format input models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model DualPayload {
        name: string;
      }

      @route("/json")
      @post op submitJson(@body body: DualPayload): void;

      @route("/xml")
      @post op submitXml(@header("content-type") contentType: "application/xml", @body body: DualPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("DualPayload.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Should have the ToBinaryContent method with internal access
    expect(content).toContain(
      "internal BinaryContent ToBinaryContent(string format)",
    );

    // Method body creates ModelReaderWriterOptions with the format parameter
    expect(content).toContain(
      "ModelReaderWriterOptions options = new ModelReaderWriterOptions(format);",
    );

    // Delegates to BinaryContent.Create(this, options)
    expect(content).toContain("return BinaryContent.Create(this, options);");
  });

  /**
   * Validates that JSON-only models do NOT get ToBinaryContent.
   * Single-format models use the implicit BinaryContent operator instead.
   */
  it("does not generate ToBinaryContent for JSON-only models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model JsonOnlyPayload {
        name: string;
      }

      @route("/json")
      @post op submitJson(@body body: JsonOnlyPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("JsonOnlyPayload.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Should NOT have ToBinaryContent for JSON-only models
    expect(content).not.toContain("ToBinaryContent");
  });

  /**
   * Validates that XML-only models do NOT get ToBinaryContent.
   * Single-format models use the implicit BinaryContent operator instead.
   */
  it("does not generate ToBinaryContent for XML-only models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlOnlyPayload {
        name: string;
      }

      @route("/xml")
      @post op submitXml(@header("content-type") contentType: "application/xml", @body body: XmlOnlyPayload): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlOnlyPayload.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Should NOT have ToBinaryContent for XML-only models
    expect(content).not.toContain("ToBinaryContent");
  });

  /**
   * Validates that dual-format round-trip (input + output) models get ToBinaryContent
   * alongside both the implicit BinaryContent operator and the dual-format explicit
   * ClientResult operator.
   */
  it("generates ToBinaryContent for dual-format round-trip models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model RoundTripResource {
        name: string;
        value: int32;
      }

      @route("/json")
      @post op createJson(@body body: RoundTripResource): RoundTripResource;

      @route("/xml")
      @post op createXml(@header("content-type") contentType: "application/xml", @body body: RoundTripResource): {
        @header("content-type") contentType: "application/xml";
        @body body: RoundTripResource;
      };
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("RoundTripResource.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Should have ToBinaryContent for dual-format models
    expect(content).toContain(
      "internal BinaryContent ToBinaryContent(string format)",
    );

    // Should also have implicit BinaryContent operator (input model)
    expect(content).toContain(
      "public static implicit operator BinaryContent(RoundTripResource roundTripResource)",
    );

    // Should also have explicit ClientResult operator with Content-Type sniffing (output model)
    expect(content).toContain(
      "public static explicit operator RoundTripResource(ClientResult result)",
    );
    expect(content).toContain('TryGetValue("Content-Type"');
  });
});

/**
 * Tests for PersistableModelCreateCore XML case output format.
 *
 * These tests validate that the XML case in PersistableModelCreateCore matches
 * the legacy emitter's golden output. The deserialization path uses `data.ToStream()`
 * (not `new MemoryStream(data.ToArray())`) and the variable is named `dataStream`
 * with type `Stream`.
 */
describe("PersistableModelCreateCore XML case", () => {
  /**
   * Validates that the XML case in PersistableModelCreateCore uses `data.ToStream()`
   * with a `Stream` variable named `dataStream`, matching the legacy emitter output.
   */
  it("uses data.ToStream() for XML deserialization", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlModel {
        name: string;
      }

      @route("/test")
      @post op submit(@header("content-type") contentType: "application/xml", @body body: XmlModel): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlModel.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Should use Stream type with dataStream variable name, matching legacy output
    expect(content).toContain("using (Stream dataStream = data.ToStream())");

    // Should use dataStream in XElement.Load call
    expect(content).toContain(
      "XElement.Load(dataStream, LoadOptions.PreserveWhitespace)",
    );

    // Should NOT use the old MemoryStream pattern
    expect(content).not.toContain("new MemoryStream(data.ToArray())");
  });
});
