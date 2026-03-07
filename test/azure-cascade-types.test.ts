import { describe, expect, it } from "vitest";
import { AzureHttpTester, HttpTester } from "./test-host.js";

/**
 * Tests for Azure-flavored pipeline type cascading to REST client, protocol methods,
 * convenience methods, paging methods, collection results, infrastructure files,
 * and cast operators.
 *
 * These tests verify task 17.3b: when the emitter `flavor` is set to `"azure"`,
 * all operation-level components use Azure.Core types instead of System.ClientModel
 * types. Each test validates both Azure and unbranded output to ensure flavor
 * isolation (changes to Azure don't affect unbranded).
 *
 * Why these tests matter:
 * - Azure REST clients must use HttpMessage/Request types for consistency with Azure.Core.
 * - Azure protocol methods must return Response and accept RequestContext.
 * - Azure convenience methods must use Response<T> for typed results.
 * - Infrastructure files must use the correct exception and options types per flavor.
 * - Cast operators must use the correct request/response types per flavor.
 */

const basicServiceSpec = `
  using TypeSpec.Http;

  @service
  namespace TestService;

  model Widget {
    id: string;
    name: string;
  }

  @route("/widgets")
  @get op getWidget(@path id: string): Widget;

  @route("/widgets")
  @post op createWidget(@body widget: Widget): Widget;
`;

// === RestClientFile Tests ===
describe("Azure pipeline types - RestClientFile", () => {
  /**
   * Verifies that Azure REST client's CreateRequest methods return HttpMessage
   * instead of PipelineMessage and use Request instead of PipelineRequest.
   * This is essential because Azure's HttpPipeline.CreateMessage() returns HttpMessage.
   */
  it("generates CreateRequest methods with HttpMessage and Request types", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(basicServiceSpec);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    // Azure uses HttpMessage for message variable and return type
    expect(restClient).toContain(
      "HttpMessage message = Pipeline.CreateMessage(",
    );
    expect(restClient).toContain("internal HttpMessage Create");

    // Azure uses Request for the request variable
    expect(restClient).toContain("Request request = message.Request;");

    // Azure uses RequestContext for the options parameter
    expect(restClient).toContain("RequestContext options");

    // Should NOT contain unbranded types
    expect(restClient).not.toContain("PipelineMessage message");
    expect(restClient).not.toContain("PipelineRequest request");
    expect(restClient).not.toContain("RequestOptions options");
  });

  /**
   * Verifies that unbranded RestClient continues to use System.ClientModel types.
   * Ensures flavor isolation — Azure changes don't leak into unbranded output.
   */
  it("unbranded RestClient continues using System.ClientModel types", async () => {
    const [{ outputs }, diagnostics] =
      await HttpTester.compileAndDiagnose(basicServiceSpec);
    expect(diagnostics).toHaveLength(0);

    const restClient = outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClient).toBeDefined();

    expect(restClient).toContain(
      "PipelineMessage message = Pipeline.CreateMessage(",
    );
    expect(restClient).toContain("PipelineRequest request = message.Request;");
    expect(restClient).toContain("RequestOptions options");
    expect(restClient).not.toContain("HttpMessage message");
    // Unbranded uses PipelineRequest, not Azure's bare "Request" type
    expect(restClient).toContain("PipelineRequest request = message.Request;");
  });
});

// === ProtocolMethod Tests ===
describe("Azure pipeline types - ProtocolMethod", () => {
  /**
   * Verifies that Azure protocol methods return Response instead of ClientResult,
   * accept RequestContext instead of RequestOptions, and use HttpMessage in the body.
   * Azure protocol methods return Response directly from ProcessMessage (no FromResponse wrapper).
   */
  it("generates protocol methods with Azure Response and RequestContext types", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(basicServiceSpec);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Azure protocol methods return Response
    expect(clientFile).toContain("public virtual Response GetWidget(");
    expect(clientFile).toContain(
      "public virtual async Task<Response> GetWidgetAsync(",
    );

    // Azure protocol methods accept RequestContext
    expect(clientFile).toContain("RequestContext options");

    // Azure protocol methods use HttpMessage
    expect(clientFile).toContain("using HttpMessage message = Create");

    // Azure protocol methods return Response directly (no FromResponse)
    expect(clientFile).toContain(
      "return Pipeline.ProcessMessage(message, options);",
    );
    expect(clientFile).toContain(
      "return await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false);",
    );

    // Should NOT contain unbranded types in protocol methods
    expect(clientFile).not.toContain("ClientResult GetWidget");
    expect(clientFile).not.toContain("ClientResult.FromResponse");
  });

  /**
   * Verifies that unbranded protocol methods remain unchanged.
   */
  it("unbranded protocol methods continue using ClientResult and RequestOptions", async () => {
    const [{ outputs }, diagnostics] =
      await HttpTester.compileAndDiagnose(basicServiceSpec);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    expect(clientFile).toContain("public virtual ClientResult GetWidget(");
    expect(clientFile).toContain("Task<ClientResult> GetWidgetAsync(");
    expect(clientFile).toContain("RequestOptions options");
    expect(clientFile).toContain("using PipelineMessage message = Create");
    expect(clientFile).toContain(
      "ClientResult.FromResponse(Pipeline.ProcessMessage(",
    );
  });
});

// === ConvenienceMethod Tests ===
describe("Azure pipeline types - ConvenienceMethod", () => {
  /**
   * Verifies that Azure convenience methods return Response<T> instead of ClientResult<T>
   * and use Response.FromValue() with the result directly (not result.GetRawResponse()).
   */
  it("generates convenience methods with Azure Response<T> types", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(basicServiceSpec);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Azure convenience methods return Response<T> (Models. prefix from model-namespace)
    expect(clientFile).toContain("public virtual Response<Models.Widget> GetWidget(");
    expect(clientFile).toContain("Task<Response<Models.Widget>> GetWidgetAsync(");

    // Azure convenience methods use Response.FromValue with result directly
    expect(clientFile).toContain("Response.FromValue(");
    expect(clientFile).toContain(", result)");

    // Should NOT contain unbranded types
    expect(clientFile).not.toContain("ClientResult<Widget>");
    expect(clientFile).not.toContain("result.GetRawResponse()");
  });
});

// === Infrastructure File Tests ===
describe("Azure pipeline types - Infrastructure files", () => {
  /**
   * Verifies that the Azure CancellationTokenExtensions file uses RequestContext
   * instead of RequestOptions.
   */
  it("generates CancellationTokenExtensions with RequestContext", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(basicServiceSpec);
    expect(diagnostics).toHaveLength(0);

    const ctFile =
      outputs["src/Generated/Internal/CancellationTokenExtensions.cs"];
    expect(ctFile).toBeDefined();

    // Azure uses RequestContext
    expect(ctFile).toContain("RequestContext ToRequestOptions");
    expect(ctFile).toContain("new RequestContext");

    // Should NOT contain unbranded types
    expect(ctFile).not.toContain("RequestOptions ToRequestOptions");
  });

  /**
   * Verifies that the Azure ErrorResult file uses Response<T>, Response,
   * and RequestFailedException.
   */
  it("generates ErrorResult with Azure Response and RequestFailedException", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @head op testHead(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const errorFile = outputs["src/Generated/Internal/ErrorResult.cs"];
    expect(errorFile).toBeDefined();

    // Azure uses Response<T> as base type
    expect(errorFile).toContain("Response<T>");

    // Azure uses Response for the _response field
    expect(errorFile).toContain("private readonly Response _response;");

    // Azure uses RequestFailedException for the _exception field
    expect(errorFile).toContain(
      "private readonly RequestFailedException _exception;",
    );

    // Should NOT contain unbranded types
    expect(errorFile).not.toContain("ClientResult<T>");
    expect(errorFile).not.toContain("PipelineResponse");
    expect(errorFile).not.toContain("ClientResultException");
  });

  /**
   * Verifies that unbranded infrastructure files remain unchanged.
   */
  it("unbranded ErrorResult continues using ClientResult types", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @head op testHead(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const errorFile = outputs["src/Generated/Internal/ErrorResult.cs"];
    expect(errorFile).toBeDefined();

    expect(errorFile).toContain("ClientResult<T>");
    expect(errorFile).toContain("PipelineResponse");
    expect(errorFile).toContain("ClientResultException");
    expect(errorFile).not.toContain("private readonly Response _response;");
  });
});

// === CastOperators Tests ===
describe("Azure pipeline types - CastOperators", () => {
  /**
   * Verifies that Azure cast operators use RequestContent instead of BinaryContent
   * for the implicit operator and Response instead of ClientResult for the explicit operator.
   */
  it("generates cast operators with Azure types", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(basicServiceSpec);
    expect(diagnostics).toHaveLength(0);

    // Find the Widget serialization file
    const serializationFile =
      outputs["src/Generated/Models/Widget.Serialization.cs"];
    expect(serializationFile).toBeDefined();

    // Azure uses RequestContent for implicit BinaryContent operator
    expect(serializationFile).toContain("implicit operator RequestContent(");

    // Azure uses Response for explicit ClientResult operator
    expect(serializationFile).toContain(
      "explicit operator Widget(Response result)",
    );
    // Azure: response = result (no GetRawResponse)
    expect(serializationFile).toContain("Response response = result;");

    // Should NOT contain unbranded types
    expect(serializationFile).not.toContain("implicit operator BinaryContent(");
    expect(serializationFile).not.toContain(
      "explicit operator Widget(ClientResult result)",
    );
  });

  /**
   * Verifies that unbranded cast operators continue using System.ClientModel types.
   */
  it("unbranded cast operators continue using BinaryContent and ClientResult", async () => {
    const [{ outputs }, diagnostics] =
      await HttpTester.compileAndDiagnose(basicServiceSpec);
    expect(diagnostics).toHaveLength(0);

    const serializationFile =
      outputs["src/Generated/Models/Widget.Serialization.cs"];
    expect(serializationFile).toBeDefined();

    expect(serializationFile).toContain("implicit operator BinaryContent(");
    expect(serializationFile).toContain(
      "explicit operator Widget(ClientResult result)",
    );
    expect(serializationFile).toContain(
      "PipelineResponse response = result.GetRawResponse();",
    );
    expect(serializationFile).not.toContain(
      "implicit operator RequestContent(",
    );
    expect(serializationFile).not.toContain("Response response = result;");
  });
});
