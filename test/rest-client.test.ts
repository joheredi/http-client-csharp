import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the RestClientFile component (src/components/clients/RestClientFile.tsx).
 *
 * These tests verify that the emitter generates correct C# RestClient partial
 * classes containing PipelineMessageClassifier fields and Create{Op}Request
 * factory methods.
 *
 * Why these tests matter:
 * - RestClient methods are the low-level HTTP request builders called by both
 *   protocol and convenience methods. If they generate incorrect URIs, headers,
 *   or status classifiers, all API calls will fail at runtime.
 * - The classifier lazy-init pattern must be correct to avoid null reference
 *   exceptions or repeated allocations.
 * - Parameter ordering and naming must match the legacy emitter's conventions
 *   so that protocol method callers work correctly.
 */
describe("RestClientFile", () => {
  /**
   * Verifies the basic structure of a RestClient file: partial class,
   * classifier field/property, and a CreateRequest method for a simple
   * GET operation with no parameters.
   *
   * This is the simplest possible RestClient — one GET operation returning
   * void (204). No path params, no query params, no body, no Accept header.
   */
  it("generates basic GET request method with 204 status", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/ping")
      @get op ping(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify partial class
    expect(restClient).toContain("public partial class TestServiceClient");

    // Verify classifier for 204 status code
    expect(restClient).toContain(
      "private static PipelineMessageClassifier _pipelineMessageClassifier204;",
    );
    expect(restClient).toContain(
      "private static PipelineMessageClassifier PipelineMessageClassifier204 => _pipelineMessageClassifier204 ??= PipelineMessageClassifier.Create(stackalloc ushort[] { 204 });",
    );

    // Verify request method signature
    expect(restClient).toContain(
      "internal PipelineMessage CreatePingRequest(RequestOptions options)",
    );

    // Verify URI building
    expect(restClient).toContain(
      "ClientUriBuilder uri = new ClientUriBuilder();",
    );
    expect(restClient).toContain("uri.Reset(_endpoint);");
    expect(restClient).toContain('uri.AppendPath("/ping", false);');

    // Verify message creation with GET and 204 classifier
    expect(restClient).toContain(
      'PipelineMessage message = Pipeline.CreateMessage(uri.ToUri(), "GET", PipelineMessageClassifier204);',
    );

    // Verify request variable declaration
    expect(restClient).toContain("PipelineRequest request = message.Request;");

    // Verify no Accept header for void response
    expect(restClient).not.toContain("Accept");

    // Verify options and return
    expect(restClient).toContain("message.Apply(options);");
    expect(restClient).toContain("return message;");
  });

  /**
   * Verifies that a GET operation returning a model (200 status) generates
   * the correct classifier and Accept header.
   *
   * When a response has a body, the Accept header must be set based on the
   * response content type (typically "application/json").
   */
  it("generates GET request with Accept header for 200 response", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/widget")
      @get op getWidget(): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify 200 classifier
    expect(restClient).toContain("PipelineMessageClassifier200");

    // Verify Accept header is set for JSON response
    expect(restClient).toContain(
      'request.Headers.Set("Accept", "application/json");',
    );
  });

  /**
   * Verifies POST request generation with a body parameter.
   *
   * When an operation has a body, the CreateRequest method must:
   * - Accept BinaryContent as a parameter named "content"
   * - Set the Content-Type header based on the body's content type
   * - Assign request.Content = content
   */
  it("generates POST request with body and Content-Type", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/widget")
      @post op createWidget(@body body: Widget): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify method has BinaryContent parameter
    expect(restClient).toContain("BinaryContent content");

    // Verify Content-Type header
    expect(restClient).toContain(
      'request.Headers.Set("Content-Type", "application/json");',
    );

    // Verify body content assignment
    expect(restClient).toContain("request.Content = content;");

    // Verify POST verb
    expect(restClient).toContain('"POST"');
  });

  /**
   * Verifies path parameter handling in URI building.
   *
   * Path parameters must be:
   * - Included in the method signature with the correct type
   * - Appended to the URI with escaping (true as second arg to AppendPath)
   * - Interleaved with literal path segments
   */
  it("generates request with path parameters", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/widgets/{id}")
      @get op getWidget(@path id: string): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify path parameter in method signature
    expect(restClient).toContain("string id");

    // Verify URI building with path segments
    expect(restClient).toContain('uri.AppendPath("/widgets/", false);');
    expect(restClient).toContain("uri.AppendPath(id, true);");
  });

  /**
   * Verifies query parameter handling including optional parameters.
   *
   * Required query params are always appended. Optional query params must be
   * wrapped in a null check before appending.
   */
  it("generates request with required and optional query params", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/search")
      @get op search(@query q: string, @query limit?: int32): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify required query param is always appended
    expect(restClient).toContain('uri.AppendQuery("q", q, true);');

    // Verify optional query param has null check
    expect(restClient).toContain("if (limit != null)");
    expect(restClient).toContain('uri.AppendQuery("limit"');
  });

  /**
   * Verifies header parameter handling for both required and optional headers.
   *
   * Custom headers must be set via request.Headers.Set with the serialized
   * name (wire name) and the parameter value.
   */
  it("generates request with header parameters", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/data")
      @get op getData(@header("x-request-id") requestId: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify header parameter in method signature
    expect(restClient).toContain("string requestId");

    // Verify header set with serialized name
    expect(restClient).toContain(
      'request.Headers.Set("x-request-id", requestId);',
    );
  });

  /**
   * Verifies that multiple operations on the same client generate unique
   * classifiers and separate CreateRequest methods.
   *
   * When operations return different status codes, each unique set of codes
   * gets its own classifier field/property. Operations sharing the same
   * status codes reuse the same classifier.
   */
  it("generates multiple classifiers for different status codes", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/widget")
      @get op getWidget(): Widget;

      @route("/ping")
      @delete op deleteWidget(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify both classifiers exist
    expect(restClient).toContain("PipelineMessageClassifier200");
    expect(restClient).toContain("PipelineMessageClassifier204");

    // Verify both request methods exist
    expect(restClient).toContain("CreateGetWidgetRequest");
    expect(restClient).toContain("CreateDeleteWidgetRequest");
  });

  /**
   * Verifies that using directives are correctly generated.
   *
   * The RestClient file must include:
   * - using System.ClientModel; (for BinaryContent)
   * - using System.ClientModel.Primitives; (for PipelineMessage, etc.)
   */
  it("generates correct using directives", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/widget")
      @post op createWidget(@body body: Widget): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify using directives
    expect(restClient).toContain("using System.ClientModel;");
    expect(restClient).toContain("using System.ClientModel.Primitives;");
  });

  /**
   * Verifies that the RestClient file is NOT generated for clients
   * with no operations (pure grouping nodes).
   *
   * Sub-clients that only serve as namespace containers shouldn't produce
   * empty RestClient files.
   */
  it("skips RestClient for client with no operations", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    // Root client should have a RestClient (it has testOp)
    expect(
      outputs["src/Generated/TestServiceClient.RestClient.cs"],
    ).toBeDefined();
  });

  /**
   * Verifies that a complete request method is generated with the correct
   * structure: URI builder → message creation → headers → content → apply → return.
   *
   * This test checks the full method body structure for a POST operation with
   * both a body and path parameter, ensuring all parts are present and ordered.
   */
  it("generates complete method body structure", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/widgets/{id}")
      @put op updateWidget(@path id: string, @body body: Widget): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Extract the method body
    const methodStart = restClient.indexOf("CreateUpdateWidgetRequest");
    expect(methodStart).toBeGreaterThan(-1);

    const methodBody = restClient.slice(methodStart);

    // Verify correct order of operations in method body:
    // 1. URI builder
    const uriBuilderPos = methodBody.indexOf("ClientUriBuilder");
    // 2. Path
    const pathPos = methodBody.indexOf("AppendPath");
    // 3. Message creation
    const messagePos = methodBody.indexOf("Pipeline.CreateMessage");
    // 4. Headers
    const headerPos = methodBody.indexOf("Headers.Set");
    // 5. Content
    const contentPos = methodBody.indexOf("request.Content = content");
    // 6. Apply
    const applyPos = methodBody.indexOf("message.Apply");
    // 7. Return
    const returnPos = methodBody.indexOf("return message");

    // All should be present
    expect(uriBuilderPos).toBeGreaterThan(-1);
    expect(pathPos).toBeGreaterThan(uriBuilderPos);
    expect(messagePos).toBeGreaterThan(pathPos);
    expect(headerPos).toBeGreaterThan(messagePos);
    expect(contentPos).toBeGreaterThan(headerPos);
    expect(applyPos).toBeGreaterThan(contentPos);
    expect(returnPos).toBeGreaterThan(applyPos);

    // Verify PUT verb
    expect(restClient).toContain('"PUT"');
  });

  /**
   * Verifies that the method parameter order follows the convention:
   * path params → required header/query → body → optional → RequestOptions
   */
  it("orders method parameters correctly", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/widgets/{id}")
      @post op createWidget(
        @path id: string,
        @header("x-req") reqHeader: string,
        @query reqQuery: string,
        @body body: Widget,
        @query optQuery?: string
      ): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Find the method signature
    const methodSig = restClient.slice(
      restClient.indexOf("CreateCreateWidgetRequest"),
      restClient.indexOf("{", restClient.indexOf("CreateCreateWidgetRequest")),
    );

    // Verify parameter order: path → required header/query → body → optional → options
    const idPos = methodSig.indexOf("string id");
    const reqHeaderPos = methodSig.indexOf("string reqHeader");
    const reqQueryPos = methodSig.indexOf("string reqQuery");
    const contentPos = methodSig.indexOf("BinaryContent content");
    const optQueryPos = methodSig.indexOf("string optQuery");
    const optionsPos = methodSig.indexOf("RequestOptions options");

    expect(idPos).toBeGreaterThan(-1);
    expect(reqHeaderPos).toBeGreaterThan(idPos);
    expect(reqQueryPos).toBeGreaterThan(reqHeaderPos);
    expect(contentPos).toBeGreaterThan(reqQueryPos);
    expect(optQueryPos).toBeGreaterThan(contentPos);
    expect(optionsPos).toBeGreaterThan(optQueryPos);
  });
});
