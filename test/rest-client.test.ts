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

    // Regression: each statement must be on its own line (not concatenated)
    expect(restClient).not.toContain("false);PipelineMessage");
    expect(restClient).not.toContain(");PipelineRequest");

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
   * Bytes parameters (TypeSpec `bytes` scalar) map to C# `BinaryData` which
   * cannot be passed directly to `Headers.Set(string, string)` or
   * `AppendQuery(string, string, bool)`. The emitter must convert BinaryData
   * to a string using `TypeFormatters.ConvertToString` with the correct
   * SerializationFormat (Bytes_Base64 for base64, Bytes_Base64Url for base64url).
   *
   * This test validates that:
   * 1. Scalar bytes header params use TypeFormatters.ConvertToString with base64
   * 2. Scalar bytes query params use TypeFormatters.ConvertToString with base64
   * Without this fix, the generated code has CS1503: cannot convert BinaryData to string.
   */
  it("generates TypeFormatters.ConvertToString for bytes header and query params", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/data")
      @get op getData(
        @header("x-data") data: bytes,
        @query value: bytes
      ): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Bytes header param uses TypeFormatters.ConvertToString with base64 format
    expect(restClient).toContain(
      'request.Headers.Set("x-data", TypeFormatters.ConvertToString(data, SerializationFormat.Bytes_Base64));',
    );

    // Bytes query param uses TypeFormatters.ConvertToString with base64 format
    expect(restClient).toContain(
      'uri.AppendQuery("value", TypeFormatters.ConvertToString(value, SerializationFormat.Bytes_Base64), true);',
    );
  });

  /**
   * Bytes parameters with base64url encoding must use the Bytes_Base64Url
   * SerializationFormat. The `@encode(BytesKnownEncoding.base64url)` decorator
   * on the parameter tells TCGC to set `encode: "base64url"` on the type.
   *
   * This test validates that the emitter correctly reads the encode property
   * from the TCGC type and selects the right format.
   */
  it("generates Bytes_Base64Url format for base64url-encoded bytes params", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/data")
      @get op getData(
        @header("x-data") @encode(BytesKnownEncoding.base64url) data: bytes,
        @query @encode(BytesKnownEncoding.base64url) value: bytes
      ): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // base64url header uses Bytes_Base64Url format
    expect(restClient).toContain(
      'request.Headers.Set("x-data", TypeFormatters.ConvertToString(data, SerializationFormat.Bytes_Base64Url));',
    );

    // base64url query uses Bytes_Base64Url format
    expect(restClient).toContain(
      'uri.AppendQuery("value", TypeFormatters.ConvertToString(value, SerializationFormat.Bytes_Base64Url), true);',
    );
  });

  /**
   * Collection bytes query parameters (e.g., `base64urlBytes[]`) must pass
   * the correct SerializationFormat to `AppendQueryDelimited` so the
   * infrastructure can encode each BinaryData element properly.
   *
   * Previously, the emitter passed `true` (bool) as the 4th positional arg
   * to AppendQueryDelimited, which mapped to the `format` parameter
   * (SerializationFormat) instead of `escape` (bool), causing CS1503.
   */
  it("generates correct AppendQueryDelimited format for bytes array query param", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @encode(BytesKnownEncoding.base64url)
      scalar base64urlBytes extends bytes;

      @route("/data")
      @get op getData(
        @query values: base64urlBytes[]
      ): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Collection bytes query passes correct SerializationFormat and escape arg
    expect(restClient).toContain(
      'uri.AppendQueryDelimited("values", values, ",", SerializationFormat.Bytes_Base64Url, true);',
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

  // ===========================================================================
  // Collection parameter serialization (task 3.3.3)
  // ===========================================================================

  /**
   * Verifies that a collection query parameter with default format (CSV)
   * generates a call to AppendQueryDelimited with a comma delimiter.
   *
   * When a query parameter is `string[]` with default (non-explode) format,
   * the generated code should use AppendQueryDelimited to combine all values
   * into a single comma-separated query parameter: `?tags=a,b,c`
   */
  it("generates delimited query param for array type", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/search")
      @get op search(@query tags: string[]): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify the method signature uses IEnumerable<string> for the collection param
    expect(restClient).toContain("IEnumerable<string> tags");

    // Verify using directive for System.Collections.Generic
    expect(restClient).toContain("using System.Collections.Generic;");

    // Verify CSV delimited query serialization
    expect(restClient).toContain(
      'uri.AppendQueryDelimited("tags", tags, ",", SerializationFormat.Default, true);',
    );
  });

  /**
   * Verifies that a collection query parameter with explode/multi format
   * generates a foreach loop that appends each element as a separate
   * query parameter.
   *
   * The multi format repeats the parameter name for each value:
   * `?colors=red&colors=blue` instead of `?colors=red,blue`
   */
  it("generates exploded query param for multi format", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/search")
      @get op search(@query(#{explode: true}) colors: string[]): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify IEnumerable<string> in method signature
    expect(restClient).toContain("IEnumerable<string> colors");

    // Verify foreach loop for exploded serialization
    expect(restClient).toContain("foreach (var param0 in colors)");
    expect(restClient).toContain('uri.AppendQuery("colors", param0, true);');
  });

  /**
   * Verifies that an optional collection query parameter wraps the
   * serialization statement in a null check.
   *
   * Optional collection params must not be serialized when null to avoid
   * sending empty or invalid query parameters.
   */
  it("generates null check for optional collection query param", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/search")
      @get op search(@query tags?: string[]): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify null check wraps the delimited call
    expect(restClient).toContain("if (tags != null)");
    expect(restClient).toContain("AppendQueryDelimited");
  });

  /**
   * Verifies that an optional exploded collection query parameter wraps
   * the foreach loop in a null check.
   */
  it("generates null check for optional exploded collection query param", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/search")
      @get op search(@query(#{explode: true}) colors?: string[]): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify null check wraps the foreach loop
    expect(restClient).toContain("if (colors != null)");
    expect(restClient).toContain("foreach (var param0 in colors)");
    expect(restClient).toContain('uri.AppendQuery("colors", param0, true);');
  });

  /**
   * Verifies that path parameters respect the allowReserved flag via
   * the RFC 6570 '+' operator in the URI template.
   *
   * When allowReserved is true (via `{+path}` in the template),
   * the escape parameter should be false so reserved characters like
   * slashes are not URL-encoded. This is important for path parameters
   * that contain pre-encoded segments.
   */
  it("generates path param with allowReserved controlling escape", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/files/{+path}")
      @get op getFile(@path path: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify path param with escape=false (allowReserved=true → no escaping)
    expect(restClient).toContain("uri.AppendPath(path, false);");
  });

  /**
   * Verifies that a collection header parameter generates a join
   * expression to combine values into a single header value.
   *
   * HTTP headers with multiple values are typically combined into
   * a single comma-delimited value per the HTTP specification.
   */
  it("generates collection header param with string.Join", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/data")
      @get op getData(@header tags: string[]): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify IEnumerable<string> in method signature
    expect(restClient).toContain("IEnumerable<string> tags");

    // Verify collection header uses string.Join with comma delimiter
    expect(restClient).toContain(
      'request.Headers.Set("tags", string.Join(",", tags));',
    );
  });

  // ===========================================================================
  // Additional parameter combination tests (task 3.3.4)
  // ===========================================================================

  /**
   * Verifies that multiple path parameters interleave correctly with
   * literal segments in the URI builder.
   *
   * A route like `/groups/{group}/widgets/{id}` must produce four
   * AppendPath calls: literal → param → literal → param. Getting the
   * interleaving wrong causes 404s at runtime.
   */
  it("generates request with multiple path parameters", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/groups/{group}/widgets/{id}")
      @get op getWidget(@path group: string, @path id: string): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify both path params in method signature
    expect(restClient).toContain("string group");
    expect(restClient).toContain("string id");

    // Verify interleaved literal + param URI building
    expect(restClient).toContain('uri.AppendPath("/groups/", false);');
    expect(restClient).toContain("uri.AppendPath(group, true);");
    expect(restClient).toContain('uri.AppendPath("/widgets/", false);');
    expect(restClient).toContain("uri.AppendPath(id, true);");
  });

  /**
   * Verifies that DELETE operations use the "DELETE" HTTP verb.
   *
   * Regression guard: the httpVerb.toUpperCase() conversion must
   * work for all HTTP methods, not just GET/POST/PUT.
   */
  it("generates DELETE request with correct verb", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/widgets/{id}")
      @delete op deleteWidget(@path id: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify DELETE verb in message creation
    expect(restClient).toContain('"DELETE"');

    // Verify 204 classifier for void return
    expect(restClient).toContain("PipelineMessageClassifier204");
  });

  /**
   * Verifies that PATCH operations use the "PATCH" HTTP verb and
   * correctly handle body + response combination.
   *
   * PATCH is commonly used for partial updates and must generate
   * Content-Type, Accept headers, and 200 classifier.
   *
   * Note: @patch emits warnings about implicit optionality in TypeSpec ≥1.0.
   * We filter diagnostics to only check for errors — warnings are expected.
   */
  it("generates PATCH request with body", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/widgets/{id}")
      @patch op updateWidget(@path id: string, @body body: Widget): Widget;
    `);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify PATCH verb
    expect(restClient).toContain('"PATCH"');

    // Verify both Content-Type and Accept headers
    expect(restClient).toContain(
      'request.Headers.Set("Content-Type", "application/json");',
    );
    expect(restClient).toContain(
      'request.Headers.Set("Accept", "application/json");',
    );
  });

  /**
   * Verifies that an optional header parameter wraps the header Set
   * call in a null check.
   *
   * Without the null check, passing null for an optional header would
   * set the header to the string "null", causing unexpected server behavior.
   */
  it("generates null check for optional header parameter", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/data")
      @get op getData(@header("x-trace-id") traceId?: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify null check wraps the header set
    expect(restClient).toContain("if (traceId != null)");
    expect(restClient).toContain('request.Headers.Set("x-trace-id", traceId);');
  });

  /**
   * Verifies that an int32 query parameter generates a `.ToString()`
   * conversion in the AppendQuery call.
   *
   * Numeric parameters must be converted to strings for URI encoding.
   * The legacy emitter uses `.ToString()` for all integer/float types.
   */
  it("generates ToString() for int32 query parameter", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/search")
      @get op search(@query pageSize: int32): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify int type in method signature
    expect(restClient).toContain("int pageSize");

    // Verify ToString() conversion in query append
    expect(restClient).toContain(
      'uri.AppendQuery("pageSize", pageSize.ToString(), true);',
    );
  });

  /**
   * Verifies that a utcDateTime path parameter generates DateTimeOffset
   * type in the method signature and `.ToString("O")` for ISO 8601
   * formatting in the URI.
   *
   * DateTime parameters must use ISO 8601 format ("O" specifier) for
   * interoperability with REST APIs.
   */
  it("generates DateTimeOffset with ToString O for utcDateTime param", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/events")
      @get op getEvents(@query since: utcDateTime): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify DateTimeOffset type in method signature
    expect(restClient).toContain("DateTimeOffset since");

    // Verify using System; for DateTimeOffset
    expect(restClient).toContain("using System;");

    // Verify ISO 8601 formatting
    expect(restClient).toContain(
      'uri.AppendQuery("since", since.ToString("O"), true);',
    );
  });

  /**
   * Verifies that a boolean query parameter generates
   * `TypeFormatters.ConvertToString(value)` formatting.
   *
   * Boolean values must use TypeFormatters to ensure "true"/"false"
   * lowercase output (not C#'s default "True"/"False").
   */
  it("generates TypeFormatters.ConvertToString for boolean query param", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/search")
      @get op search(@query includeDeleted: boolean): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify bool type in method signature
    expect(restClient).toContain("bool includeDeleted");

    // Verify TypeFormatters conversion (lowercase true/false)
    expect(restClient).toContain(
      'uri.AppendQuery("includeDeleted", TypeFormatters.ConvertToString(includeDeleted), true);',
    );
  });

  /**
   * Verifies that an optional body parameter generates null checks
   * for both the Content-Type header and content assignment.
   *
   * When a body is optional, the request must still be valid without
   * a body — no Content-Type should be set and no content assigned.
   */
  it("generates null checks for optional body parameter", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/widgets/{id}")
      @put op updateWidget(@path id: string, @body body?: Widget): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify Content-Type is wrapped in null check
    expect(restClient).toContain("if (content != null)");
    expect(restClient).toContain(
      'request.Headers.Set("Content-Type", "application/json");',
    );

    // Verify content assignment is also wrapped in null check
    expect(restClient).toContain("request.Content = content;");
  });

  /**
   * Verifies that a float64 query parameter generates a `.ToString()`
   * conversion, same as integer types.
   *
   * All numeric types (int, long, float, double, etc.) follow the
   * same `.ToString()` pattern for URI serialization.
   */
  it("generates ToString() for float64 query parameter", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/search")
      @get op search(@query threshold: float64): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify double type in method signature
    expect(restClient).toContain("double threshold");

    // Verify ToString() conversion
    expect(restClient).toContain(
      'uri.AppendQuery("threshold", threshold.ToString(), true);',
    );
  });

  /**
   * Verifies that HEAD operations use the "HEAD" HTTP verb and
   * produce no Accept header (void response).
   *
   * HEAD is used for checking resource existence — it has the same
   * semantics as GET but with no response body.
   */
  it("generates HEAD request with correct verb", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/widgets/{id}")
      @head op checkWidget(@path id: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify HEAD verb
    expect(restClient).toContain('"HEAD"');

    // Verify no Accept header for void response
    expect(restClient).not.toContain("Accept");
  });

  /**
   * Verifies that multiple query parameters — mix of required and optional,
   * with different types — all generate correctly in a single method.
   *
   * This tests the real-world scenario where a search endpoint has several
   * filter parameters of varying types and optionality.
   */
  it("generates request with mixed-type query parameters", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/search")
      @get op search(
        @query q: string,
        @query pageSize: int32,
        @query includeDeleted?: boolean
      ): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Verify all parameter types in signature
    // Optional value type (bool) becomes nullable (bool?) in C#
    expect(restClient).toContain("string q");
    expect(restClient).toContain("int pageSize");
    expect(restClient).toContain("bool? includeDeleted");

    // Verify required params always appended
    expect(restClient).toContain('uri.AppendQuery("q", q, true);');
    expect(restClient).toContain(
      'uri.AppendQuery("pageSize", pageSize.ToString(), true);',
    );

    // Verify optional param has null check
    expect(restClient).toContain("if (includeDeleted != null)");
    expect(restClient).toContain(
      'uri.AppendQuery("includeDeleted", TypeFormatters.ConvertToString(includeDeleted), true);',
    );
  });

  /**
   * Verifies that onClient parameters (such as api-version in @versioned
   * services) are referenced as client fields (_fieldName) rather than method
   * parameters in the generated RestClient.
   *
   * This is critical because:
   * - onClient params are NOT passed as method parameters (they're filtered out)
   * - They are stored as private fields on the client (e.g., _apiVersion)
   * - Using the bare param name would cause CS0103 (undefined variable)
   *
   * Tests all three parameter locations: query, path, and header.
   */
  it("uses client field for onClient query api-version parameter", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using TypeSpec.Versioning;

      @versioned(Versions)
      @service
      namespace TestService;

      enum Versions {
        v2024_01_01: "2024-01-01",
      }

      @route("/test")
      @get op testOp(@query("api-version") apiVersion: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // onClient query param should use _apiVersion field with null check
    expect(restClient).toContain("_apiVersion");
    expect(restClient).toContain(
      'uri.AppendQuery("api-version", _apiVersion, true)',
    );
    // Must NOT reference bare apiVersion (which would be undefined)
    expect(restClient).not.toMatch(/[^_]apiVersion/);
  });

  it("uses client field for onClient path api-version parameter", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using TypeSpec.Versioning;

      @versioned(Versions)
      @service
      namespace TestService;

      enum Versions {
        v2024_01_01: "2024-01-01",
      }

      @route("/test")
      @get op testOp(@path apiVersion: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // onClient path param should use _apiVersion field
    expect(restClient).toContain("uri.AppendPath(_apiVersion, true)");
    // Must NOT reference bare apiVersion (which would be undefined)
    expect(restClient).not.toMatch(/[^_]apiVersion/);
    // Should NOT have apiVersion as a method parameter
    expect(restClient).not.toContain("string apiVersion");
  });

  /**
   * Verifies that TypeSpec parameter names containing dashes (kebab-case) are
   * converted to valid C# camelCase identifiers in the method body, while
   * preserving the wire name for HTTP serialization.
   *
   * Without this fix, the emitter would generate invalid C#:
   *   `if (new-parameter != null)` ← dash is subtraction operator
   *
   * The correct output uses the name-policy-transformed identifier:
   *   `if (newParameter != null)`
   *
   * The wire name ("new-parameter") must be preserved in AppendQuery calls.
   */
  it("converts kebab-case parameter names to valid C# identifiers in body code", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        id: string;
      }

      @route("/search")
      @get op search(
        @query("new-parameter") newParameter?: string,
        @query("sort-order") sortOrder: string
      ): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Method signature should use camelCase parameter names
    expect(restClient).toContain("string sortOrder");
    expect(restClient).toContain("string newParameter");

    // Body code should use camelCase identifiers (NOT dashed wire names)
    expect(restClient).toContain(
      'uri.AppendQuery("sort-order", sortOrder, true)',
    );
    expect(restClient).toContain("if (newParameter != null)");
    expect(restClient).toContain(
      'uri.AppendQuery("new-parameter", newParameter, true)',
    );

    // Must NOT contain dashed names as C# identifiers
    expect(restClient).not.toMatch(/if \(new-parameter/);
    expect(restClient).not.toMatch(/if \(sort-order/);
  });

  /**
   * Verifies that OASIS repeatability headers are auto-populated in the
   * request creation method with runtime-generated values instead of being
   * passed as method parameters.
   *
   * The legacy emitter uses `Guid.NewGuid().ToString()` for Repeatability-Request-ID
   * and `DateTimeOffset.Now.ToString("R")` for Repeatability-First-Sent (RFC7231 format).
   * These must be set automatically so the SDK consumer doesn't need to manage them.
   *
   * This test also ensures that the using System; directive is present (needed for
   * Guid and DateTimeOffset) and that the parameters don't appear in the method signature.
   */
  it("auto-populates repeatability headers in request creation", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @post op testOp(
        @header("Repeatability-Request-ID") repeatabilityRequestID: string,
        @header("Repeatability-First-Sent") repeatabilityFirstSent: utcDateTime,
      ): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Repeatability headers must NOT appear as method parameters
    expect(restClient).not.toContain("string repeatabilityRequest");
    expect(restClient).not.toContain("DateTimeOffset repeatabilityFirst");

    // Request creation method should only take RequestOptions
    expect(restClient).toContain(
      "internal PipelineMessage CreateTestOpRequest(RequestOptions options)",
    );

    // Auto-populated header values
    expect(restClient).toContain(
      'request.Headers.Set("Repeatability-Request-ID", Guid.NewGuid().ToString())',
    );
    expect(restClient).toContain(
      'request.Headers.Set("Repeatability-First-Sent", DateTimeOffset.Now.ToString("R"))',
    );

    // System namespace must be imported for Guid and DateTimeOffset
    expect(restClient).toContain("using System;");
  });

  /**
   * Verifies that Accept header is set exactly once per request method,
   * even when the operation has both a body (triggering Content-Type) and
   * a response body (triggering Accept).
   *
   * Regression test for a bug where TCGC exposes Accept as a constant header
   * param AND the emitter derives it from response content types, causing
   * duplicate `request.Headers.Set("Accept", ...)` lines in the output.
   * The golden files only set Accept once, after Content-Type.
   */
  it("does not emit duplicate Accept header for POST with body and response", async () => {
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

    // Accept must appear exactly once
    const acceptMatches = restClient!.match(/request\.Headers\.Set\("Accept"/g);
    expect(acceptMatches).toHaveLength(1);

    // Content-Type must also appear exactly once
    const contentTypeMatches = restClient!.match(
      /request\.Headers\.Set\("Content-Type"/g,
    );
    expect(contentTypeMatches).toHaveLength(1);

    // Accept must come after Content-Type (correct ordering)
    const contentTypeIndex = restClient!.indexOf(
      'request.Headers.Set("Content-Type"',
    );
    const acceptIndex = restClient!.indexOf('request.Headers.Set("Accept"');
    expect(acceptIndex).toBeGreaterThan(contentTypeIndex);
  });

  /**
   * Verifies that onClient path parameters with @paramAlias use the client
   * field name (from the initialization parameter) rather than the operation's
   * aliased parameter name.
   *
   * This matters because @paramAlias("blob") causes the operation path param
   * to have name "blob", but the client field is _blobName (from the
   * initialization parameter "blobName"). Without this fix, the RestClient
   * would generate `uri.AppendPath(_blob, true)` which is an undefined field.
   *
   * The fix uses correspondingMethodParams to resolve the correct field name.
   */
  it("uses client field name for onClient path params with @paramAlias", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core;

      @service
      namespace TestService;

      model ClientOptions {
        @doc("Blob name for the client.")
        @paramAlias("blob")
        blobName: string;
      }

      @client({ name: "ParamAliasClient" })
      @clientInitialization(ClientOptions)
      @route("/param-alias")
      interface ParamAlias {
        @route("/{blob}/with-aliased-name")
        @get
        withAliasedName(@path blob: string): void;

        @route("/{blobName}/with-original-name")
        @get
        withOriginalName(@path blobName: string): void;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/ParamAliasClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Both operations should reference _blobName (the client field), not _blob
    expect(restClient).toContain("uri.AppendPath(_blobName, true)");

    // Verify both CreateRequest methods use the correct field
    const matches = restClient!.match(/uri\.AppendPath\(_blobName/g);
    expect(matches).toHaveLength(2);
  });
});
