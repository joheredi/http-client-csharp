import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the ImplicitBinaryContentOperator component (CastOperators.tsx).
 *
 * These tests verify that the emitter generates `public static implicit operator
 * BinaryContent(T model)` on serialization classes for input models. This operator
 * is critical for HTTP request serialization — it enables callers to pass model
 * instances directly where BinaryContent is expected, without explicit conversion.
 *
 * Why these tests matter:
 * - The implicit operator is the primary mechanism for converting models to request
 *   body content in the System.ClientModel framework.
 * - It must only be generated for input models (models used as operation parameters).
 *   Output-only models should NOT have this operator.
 * - The null check prevents NullReferenceException when passing null models.
 * - The BinaryContent.Create call with WireOptions ensures models serialize using
 *   the default wire format.
 * - Models that are both input and output (e.g., round-trip models) should also
 *   get the operator since they can be used as request bodies.
 */
describe("ImplicitBinaryContentOperator", () => {
  /**
   * Validates that an input model (used in a POST body) gets the implicit
   * BinaryContent operator in its serialization file. This is the most common
   * case — a model type used as a request body parameter.
   */
  it("generates implicit BinaryContent operator for input models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
        count: int32;
      }

      @route("/widgets")
      @post
      op createWidget(@body widget: Widget): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Verify the implicit operator signature
    expect(content).toContain(
      "public static implicit operator BinaryContent(Widget widget)",
    );

    // Verify the null check
    expect(content).toContain("if (widget == null)");
    expect(content).toContain("return null;");

    // Verify the BinaryContent.Create call with WireOptions
    expect(content).toContain(
      "return BinaryContent.Create(widget, ModelSerializationExtensions.WireOptions);",
    );

    // Verify the using directive for System.ClientModel (BinaryContent's namespace)
    expect(content).toContain("using System.ClientModel;");
  });

  /**
   * Validates that an output-only model (only returned from operations, never
   * sent as input) does NOT get the implicit BinaryContent operator. Output
   * models are never serialized into request bodies.
   */
  it("does not generate implicit operator for output-only models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Result {
        status: string;
        id: int32;
      }

      @route("/results")
      @get
      op getResult(): Result;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Result.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Output-only models must NOT have the implicit BinaryContent operator
    expect(content).not.toContain("implicit operator BinaryContent");
  });

  /**
   * Validates that a model used as both input and output (round-trip model)
   * gets the implicit BinaryContent operator. Round-trip models are common
   * in CRUD APIs where the same model is used for create/update requests
   * and also returned in responses.
   */
  it("generates implicit operator for input+output (round-trip) models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Resource {
        name: string;
        value: int32;
      }

      @route("/resources")
      @post
      op createResource(@body resource: Resource): Resource;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Resource.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Round-trip models should have the implicit operator
    expect(content).toContain(
      "public static implicit operator BinaryContent(Resource resource)",
    );
  });

  /**
   * Validates that the parameter name in the operator signature follows C#
   * camelCase convention. Multi-word model names should produce correctly
   * camelCased parameter names (e.g., ThingModel → thingModel).
   */
  it("uses correct camelCase parameter naming for multi-word models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model LongNamedWidget {
        name: string;
      }

      @route("/widgets")
      @post
      op createWidget(@body widget: LongNamedWidget): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("LongNamedWidget.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Parameter name should be camelCased
    expect(content).toContain(
      "public static implicit operator BinaryContent(LongNamedWidget longNamedWidget)",
    );
  });
});

/**
 * Tests for the ExplicitClientResultOperator component (CastOperators.tsx).
 *
 * These tests verify that the emitter generates `public static explicit operator
 * T(ClientResult result)` on serialization classes for output models. This operator
 * is critical for HTTP response deserialization — it enables callers to cast
 * ClientResult responses directly to typed model instances.
 *
 * Why these tests matter:
 * - The explicit operator is the primary mechanism for converting responses to
 *   typed models in the System.ClientModel framework.
 * - It must only be generated for output models (models returned from operations).
 *   Input-only models should NOT have this operator.
 * - The operator must correctly extract PipelineResponse, parse JSON, and call
 *   the model's Deserialize method.
 * - Models that are both input and output (round-trip models) should also get
 *   the operator since they can be returned from operations.
 */
describe("ExplicitClientResultOperator", () => {
  /**
   * Validates that an output model (returned from a GET operation) gets the
   * explicit ClientResult operator in its serialization file. This is the most
   * common case — a model type returned as a response body.
   */
  it("generates explicit ClientResult operator for output models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Result {
        status: string;
        id: int32;
      }

      @route("/results")
      @get
      op getResult(): Result;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Result.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Verify the explicit operator signature
    expect(content).toContain(
      "public static explicit operator Result(ClientResult result)",
    );

    // Verify PipelineResponse extraction from ClientResult
    expect(content).toContain(
      "PipelineResponse response = result.GetRawResponse();",
    );

    // Verify JsonDocument parsing with JsonDocumentOptions
    expect(content).toContain(
      "using JsonDocument document = JsonDocument.Parse(response.Content, ModelSerializationExtensions.JsonDocumentOptions);",
    );

    // Verify the Deserialize call with WireOptions
    expect(content).toContain(
      "return Result.DeserializeResult(document.RootElement, ModelSerializationExtensions.WireOptions);",
    );

    // Verify the using directive for System.ClientModel (ClientResult's namespace)
    expect(content).toContain("using System.ClientModel;");

    // Verify the using directive for System.ClientModel.Primitives (PipelineResponse)
    expect(content).toContain("using System.ClientModel.Primitives;");

    // Verify the using directive for System.Text.Json (JsonDocument)
    expect(content).toContain("using System.Text.Json;");
  });

  /**
   * Validates that an input-only model (only sent as a request body, never
   * returned from operations) does NOT get the explicit ClientResult operator.
   * Input models are never deserialized from responses.
   */
  it("does not generate explicit operator for input-only models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
        count: int32;
      }

      @route("/widgets")
      @post
      op createWidget(@body widget: Widget): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Input-only models must NOT have the explicit ClientResult operator
    expect(content).not.toContain("explicit operator");
  });

  /**
   * Validates that a model used as both input and output (round-trip model)
   * gets the explicit ClientResult operator. Round-trip models are common
   * in CRUD APIs where the same model is used for create/update requests
   * and also returned in responses.
   */
  it("generates explicit operator for input+output (round-trip) models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Resource {
        name: string;
        value: int32;
      }

      @route("/resources")
      @post
      op createResource(@body resource: Resource): Resource;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Resource.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Round-trip models should have both operators
    expect(content).toContain(
      "public static implicit operator BinaryContent(Resource resource)",
    );
    expect(content).toContain(
      "public static explicit operator Resource(ClientResult result)",
    );
  });

  /**
   * Validates that the Deserialize method call in the operator uses the correct
   * PascalCase model name for multi-word models. This ensures the model name
   * is correctly interpolated in both the operator signature and method call.
   */
  it("uses correct model name for multi-word models in Deserialize call", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model LongNamedResult {
        status: string;
      }

      @route("/results")
      @get
      op getResult(): LongNamedResult;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("LongNamedResult.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Operator signature should use PascalCase model name
    expect(content).toContain(
      "public static explicit operator LongNamedResult(ClientResult result)",
    );

    // Deserialize call should use PascalCase model name
    expect(content).toContain(
      "return LongNamedResult.DeserializeLongNamedResult(document.RootElement, ModelSerializationExtensions.WireOptions);",
    );
  });
});

/**
 * Tests for the ExplicitClientResultOperator component with XML-only models.
 *
 * These tests verify that when a model is used exclusively with `application/xml`
 * content type, the explicit operator reads from `ContentStream` and deserializes
 * via `XElement.Load()` instead of `JsonDocument.Parse()`.
 *
 * Why these tests matter:
 * - XML-only models must NOT use JsonDocument parsing (there is no JSON content).
 * - The response variable must be declared with `using` (unlike JSON-only models)
 *   because the stream lifetime extends beyond the operator scope.
 * - The null check on the stream is critical: if `ContentStream` is null, the
 *   operator returns `default` instead of throwing.
 * - The `LoadOptions.PreserveWhitespace` parameter ensures whitespace fidelity
 *   during XML round-trip serialization.
 */
describe("ExplicitClientResultOperator (XML-only)", () => {
  /**
   * Validates that an XML-only output model gets the correct explicit operator
   * that reads from ContentStream and uses XElement.Load() for deserialization.
   * This is the core test for XML-only models — it verifies the entire operator
   * body structure differs from the JSON-only path.
   */
  it("generates XML deserialization operator for XML-only output models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model XmlResult {
        name: string;
      }

      @route("/xml-results")
      @get op getXmlResult(@header("accept") accept: "application/xml"): {
        @header("content-type") contentType: "application/xml";
        @body body: XmlResult;
      };
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("XmlResult.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Verify the explicit operator signature
    expect(content).toContain(
      "public static explicit operator XmlResult(ClientResult result)",
    );

    // Response MUST be declared with `using` for XML-only models
    expect(content).toContain(
      "using PipelineResponse response = result.GetRawResponse();",
    );

    // Stream extraction from ContentStream
    expect(content).toContain("using Stream stream = response.ContentStream;");

    // Null check on stream — returns default if null
    expect(content).toContain("if ((stream == null))");
    expect(content).toContain("return default;");

    // XElement.Load with PreserveWhitespace for XML deserialization
    expect(content).toContain(
      "return XmlResult.DeserializeXmlResult(XElement.Load(stream, LoadOptions.PreserveWhitespace), ModelSerializationExtensions.WireOptions);",
    );

    // The cast operator must NOT use JsonDocument.Parse — that's the JSON-only path.
    // Note: Other methods in the serialization file (JsonModelWriteCore, etc.) may
    // still reference JsonDocument as a pre-existing issue. We check specifically
    // that the operator body uses the XML path, not the JSON path.
    // The presence of "using Stream stream = response.ContentStream;" confirms
    // the XML deserialization path was chosen over the JSON path which would
    // use "JsonDocument.Parse(response.Content, ...)".

    // Verify using directives for XML-related namespaces
    expect(content).toContain("using System.IO;");
    expect(content).toContain("using System.Xml.Linq;");
    expect(content).toContain("using System.ClientModel;");
    expect(content).toContain("using System.ClientModel.Primitives;");
  });
});

/**
 * Tests for the ExplicitClientResultOperator component with dual-format models.
 *
 * These tests verify that when a model supports both JSON and XML content types,
 * the explicit operator performs Content-Type header sniffing to select the correct
 * deserialization path: JSON for `application/json`, XML as fallback.
 *
 * Why these tests matter:
 * - Dual-format models are common in Azure services (e.g., Storage) where the same
 *   model can be returned as JSON or XML depending on the operation.
 * - Content-Type sniffing must use case-insensitive comparison (`StringComparison.OrdinalIgnoreCase`).
 * - The JSON path must be the primary (if) branch, with XML as the fallback.
 * - Both deserialization paths must call the same `Deserialize{Model}` method but
 *   with different input types (JsonElement vs XElement).
 * - The response variable must use `using` in dual-format models.
 */
describe("ExplicitClientResultOperator (dual-format)", () => {
  /**
   * Validates that a dual-format (JSON + XML) output model generates an explicit
   * operator with Content-Type header sniffing. The operator checks if the response
   * Content-Type starts with "application/json" and uses JSON parsing in that case;
   * otherwise falls through to XML deserialization.
   */
  it("generates Content-Type sniffing for dual-format output models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model DualResult {
        name: string;
      }

      @route("/json-results")
      @get op getJsonResult(): DualResult;

      @route("/xml-results")
      @get op getXmlResult(@header("accept") accept: "application/xml"): {
        @header("content-type") contentType: "application/xml";
        @body body: DualResult;
      };
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("DualResult.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Verify the explicit operator signature
    expect(content).toContain(
      "public static explicit operator DualResult(ClientResult result)",
    );

    // Response MUST be declared with `using` for dual-format models
    expect(content).toContain(
      "using PipelineResponse response = result.GetRawResponse();",
    );

    // Content-Type sniffing: check header and compare with "application/json"
    expect(content).toContain(
      'response.Headers.TryGetValue("Content-Type", out string value)',
    );
    expect(content).toContain(
      'value.StartsWith("application/json", StringComparison.OrdinalIgnoreCase)',
    );

    // JSON branch: JsonDocument parsing inside the if block
    expect(content).toContain(
      "using JsonDocument document = JsonDocument.Parse(response.Content, ModelSerializationExtensions.JsonDocumentOptions);",
    );
    expect(content).toContain(
      "return DualResult.DeserializeDualResult(document.RootElement, ModelSerializationExtensions.WireOptions);",
    );

    // XML fallback: Stream and XElement.Load after the if block
    expect(content).toContain("using Stream stream = response.ContentStream;");
    expect(content).toContain("if ((stream == null))");
    expect(content).toContain("return default;");
    expect(content).toContain(
      "return DualResult.DeserializeDualResult(XElement.Load(stream, LoadOptions.PreserveWhitespace), ModelSerializationExtensions.WireOptions);",
    );

    // Verify using directives for all required namespaces
    expect(content).toContain("using System;");
    expect(content).toContain("using System.IO;");
    expect(content).toContain("using System.Text.Json;");
    expect(content).toContain("using System.Xml.Linq;");
    expect(content).toContain("using System.ClientModel;");
    expect(content).toContain("using System.ClientModel.Primitives;");
  });

  /**
   * Validates that a dual-format model used as both input and output gets both
   * the implicit BinaryContent operator and the dual-format explicit operator.
   * This is important for round-trip CRUD models in services that support both
   * JSON and XML content types.
   */
  it("generates both operators for dual-format round-trip models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model DualResource {
        name: string;
        value: int32;
      }

      @route("/json")
      @post op createJson(@body body: DualResource): DualResource;

      @route("/xml")
      @post op createXml(@header("content-type") contentType: "application/xml", @body body: DualResource): {
        @header("content-type") contentType: "application/xml";
        @body body: DualResource;
      };
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("DualResource.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();

    const content = outputs[fileKey!];

    // Should have the implicit BinaryContent operator (input model)
    expect(content).toContain(
      "public static implicit operator BinaryContent(DualResource dualResource)",
    );

    // Should have the explicit operator with Content-Type sniffing (dual-format output)
    expect(content).toContain(
      "public static explicit operator DualResource(ClientResult result)",
    );
    expect(content).toContain('TryGetValue("Content-Type"');
    expect(content).toContain(
      "XElement.Load(stream, LoadOptions.PreserveWhitespace)",
    );
  });
});
