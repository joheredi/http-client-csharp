import { describe, expect, it } from "vitest";
import { AzureHttpTester, HttpTester } from "./test-host.js";

/**
 * Tests for Azure-flavored pipeline type infrastructure in ClientFile and
 * ClientPipelineExtensionsFile components.
 *
 * These tests verify that when the emitter `flavor` is set to `"azure"`,
 * generated C# code uses Azure.Core.Pipeline types (HttpPipeline, HttpMessage,
 * HttpPipelineBuilder, etc.) instead of System.ClientModel types (ClientPipeline,
 * PipelineMessage, etc.).
 *
 * Why these tests matter:
 * - Azure SDK consumers expect Azure.Core types in the public API surface.
 *   Using wrong pipeline types (e.g., ClientPipeline in Azure SDK) would
 *   make the generated library incompatible with Azure SDK conventions.
 * - The `virtual` modifier on Pipeline property is required for Azure mocking patterns.
 * - ClientDiagnostics is essential for Azure distributed tracing support.
 * - Sub-client constructors must receive ClientDiagnostics for unified tracing.
 */
describe("Azure pipeline types - ClientFile", () => {
  /**
   * Verifies that Azure-flavored root client uses HttpPipeline instead of
   * ClientPipeline for the Pipeline property, and that the property is virtual
   * (required for Azure SDK mocking patterns with Moq/NSubstitute).
   */
  it("generates Pipeline property with HttpPipeline type and virtual modifier", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Azure uses HttpPipeline with virtual modifier
    expect(clientFile).toContain(
      "public virtual HttpPipeline Pipeline { get; }",
    );

    // Should NOT contain unbranded pipeline type
    expect(clientFile).not.toContain("ClientPipeline Pipeline");
  });

  /**
   * Verifies that Azure-flavored client generates a ClientDiagnostics property
   * for distributed tracing support. This is an internal property that sub-clients
   * use for unified tracing across the client hierarchy.
   */
  it("generates ClientDiagnostics property for Azure flavor", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toContain(
      "internal ClientDiagnostics ClientDiagnostics { get; }",
    );
  });

  /**
   * Verifies that Azure-flavored root client with API key auth uses
   * AzureKeyCredential (not ApiKeyCredential) and builds the pipeline
   * with HttpPipelineBuilder.Build() (not ClientPipeline.Create()).
   */
  it("generates Azure API key auth with AzureKeyCredential and HttpPipelineBuilder", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @useAuth(ApiKeyAuth<ApiKeyLocation.header, "x-api-key">)
      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Azure uses AzureKeyCredential, not ApiKeyCredential
    expect(clientFile).toContain("AzureKeyCredential _keyCredential");

    // Pipeline is built with HttpPipelineBuilder.Build, not ClientPipeline.Create
    expect(clientFile).toContain("HttpPipelineBuilder.Build(options");
    expect(clientFile).not.toContain("ClientPipeline.Create(");

    // Auth policy uses AzureKeyCredentialPolicy, not ApiKeyAuthenticationPolicy
    expect(clientFile).toContain(
      "new AzureKeyCredentialPolicy(_keyCredential, AuthorizationHeader)",
    );

    // ClientDiagnostics is initialized in the constructor
    expect(clientFile).toContain(
      "ClientDiagnostics = new ClientDiagnostics(options, true)",
    );
  });

  /**
   * Verifies that Azure-flavored root client with OAuth2 auth uses
   * TokenCredential (not AuthenticationTokenProvider) and stores scopes
   * as a static string[] (not Dictionary<string, object>[] flows).
   */
  it("generates Azure OAuth2 auth with TokenCredential and AuthorizationScopes", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @useAuth(OAuth2Auth<[{
        type: OAuth2FlowType.implicit,
        authorizationUrl: "https://login.example.com/authorize",
        refreshUrl: "https://login.example.com/refresh",
        tokenUrl: "https://login.example.com/token"
      }]>)
      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Azure uses TokenCredential, not AuthenticationTokenProvider
    expect(clientFile).toContain("TokenCredential _tokenCredential");

    // Azure uses string[] AuthorizationScopes, not Dictionary<string, object>[] _flows
    expect(clientFile).toContain(
      "private static readonly string[] AuthorizationScopes",
    );
    expect(clientFile).not.toContain("Dictionary<string, object>[] _flows");

    // Auth policy uses BearerTokenAuthenticationPolicy, not BearerTokenPolicy
    expect(clientFile).toContain(
      "new BearerTokenAuthenticationPolicy(_tokenCredential, AuthorizationScopes)",
    );

    // Pipeline is built with HttpPipelineBuilder.Build
    expect(clientFile).toContain("HttpPipelineBuilder.Build(options");
  });

  /**
   * Verifies that Azure-flavored sub-client constructor accepts
   * (ClientDiagnostics, HttpPipeline, Uri) instead of (ClientPipeline, Uri).
   * This ensures sub-clients inherit diagnostics for unified tracing.
   */
  it("generates sub-client constructor with ClientDiagnostics parameter for Azure", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/sub")
      interface SubOperations {
        @route("/op")
        @get op getItem(): void;
      }
    `);

    const subClientFile = outputs["src/Generated/SubOperations.cs"];
    expect(subClientFile).toBeDefined();

    // Azure sub-client constructor takes (ClientDiagnostics, HttpPipeline, Uri)
    expect(subClientFile).toContain(
      "internal SubOperations(ClientDiagnostics clientDiagnostics, HttpPipeline pipeline, Uri endpoint)",
    );

    // Body assigns ClientDiagnostics
    expect(subClientFile).toContain("ClientDiagnostics = clientDiagnostics;");

    // Sub-client has its own ClientDiagnostics property
    expect(subClientFile).toContain(
      "internal ClientDiagnostics ClientDiagnostics { get; }",
    );

    // Sub-client Pipeline is also virtual for Azure
    expect(subClientFile).toContain(
      "public virtual HttpPipeline Pipeline { get; }",
    );

    // Doc comments for sub-client constructor params
    expect(subClientFile).toContain(
      '/// <param name="clientDiagnostics"> The ClientDiagnostics is used to provide tracing support for the client library. </param>',
    );
  });

  /**
   * Verifies that Azure-flavored sub-client factory methods pass
   * ClientDiagnostics as the first constructor argument.
   */
  it("generates sub-client factory methods passing ClientDiagnostics for Azure", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/sub")
      interface SubOperations {
        @route("/op")
        @get op getItem(): void;
      }
    `);

    const rootClientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(rootClientFile).toBeDefined();

    // Factory method passes ClientDiagnostics, Pipeline, _endpoint
    expect(rootClientFile).toContain(
      "new SubOperations(ClientDiagnostics, Pipeline, _endpoint)",
    );
  });

  /**
   * Verifies that unbranded (non-Azure) flavor is NOT affected by Azure changes.
   * The Pipeline property should remain non-virtual with ClientPipeline type,
   * and there should be no ClientDiagnostics property.
   */
  it("unbranded flavor continues to use System.ClientModel types unchanged", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Unbranded uses ClientPipeline without virtual
    expect(clientFile).toContain("public ClientPipeline Pipeline { get; }");
    // Pipeline property specifically should NOT be virtual for unbranded
    expect(clientFile).not.toContain("virtual ClientPipeline Pipeline");

    // No ClientDiagnostics for unbranded
    expect(clientFile).not.toContain("ClientDiagnostics");
    expect(clientFile).not.toContain("HttpPipeline");
  });

  /**
   * Verifies the Azure using directives are correctly generated.
   * Azure clients need `using Azure;`, `using Azure.Core;`, and
   * `using Azure.Core.Pipeline;` for their pipeline infrastructure.
   */
  it("generates correct Azure using directives", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @useAuth(ApiKeyAuth<ApiKeyLocation.header, "x-api-key">)
      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Azure-specific using directives
    expect(clientFile).toContain("using Azure;");
    expect(clientFile).toContain("using Azure.Core.Pipeline;");
  });
});

describe("Azure pipeline types - ClientPipelineExtensionsFile", () => {
  /**
   * Verifies the Azure version of ClientPipelineExtensions uses
   * HttpPipeline extension methods instead of ClientPipeline.
   */
  it("generates Azure ProcessMessageAsync with HttpPipeline and Response", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const content =
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"];
    expect(content).toBeDefined();

    // Azure uses HttpPipeline, HttpMessage, RequestContext, Response
    expect(content).toContain(
      "public static async ValueTask<Response> ProcessMessageAsync(this HttpPipeline pipeline, HttpMessage message, RequestContext context)",
    );
    // Azure uses RequestContext.Parse() for cancellation token extraction
    expect(content).toContain("context.Parse()");
    // Azure passes cancellation token to SendAsync
    expect(content).toContain(
      "await pipeline.SendAsync(message, userCancellationToken)",
    );
    // Azure throws RequestFailedException, not ClientResultException
    expect(content).toContain(
      "throw new RequestFailedException(message.Response)",
    );
    // Azure uses ErrorOptions.NoThrow, not ClientErrorBehaviors.NoThrow
    expect(content).toContain("ErrorOptions.NoThrow");
  });

  /**
   * Verifies the Azure version of synchronous ProcessMessage method.
   */
  it("generates Azure ProcessMessage with HttpPipeline", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const content =
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"];

    expect(content).toContain(
      "public static Response ProcessMessage(this HttpPipeline pipeline, HttpMessage message, RequestContext context)",
    );
    expect(content).toContain("pipeline.Send(message, userCancellationToken)");
  });

  /**
   * Verifies the Azure HEAD-as-bool methods use Response<bool> and
   * Response.FromValue() instead of ClientResult<bool>.
   */
  it("generates Azure ProcessHeadAsBoolMessageAsync with Response<bool>", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const content =
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"];

    expect(content).toContain(
      "public static async ValueTask<Response<bool>> ProcessHeadAsBoolMessageAsync(this HttpPipeline pipeline, HttpMessage message, RequestContext context)",
    );
    expect(content).toContain("Response.FromValue(true, response)");
    expect(content).toContain("Response.FromValue(false, response)");
    expect(content).toContain("new RequestFailedException(response)");
  });

  /**
   * Verifies the Azure HEAD-as-bool sync method.
   */
  it("generates Azure ProcessHeadAsBoolMessage sync variant", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const content =
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"];

    expect(content).toContain(
      "public static Response<bool> ProcessHeadAsBoolMessage(this HttpPipeline pipeline, HttpMessage message, RequestContext context)",
    );
  });

  /**
   * Verifies Azure using directives in the pipeline extensions file.
   */
  it("includes correct Azure using directives", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const content =
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"];

    expect(content).toContain("using Azure;");
    expect(content).toContain("using Azure.Core;");
    expect(content).toContain("using Azure.Core.Pipeline;");
    expect(content).toContain("using System.Threading;");
    expect(content).toContain("using System.Threading.Tasks;");

    // Should NOT contain unbranded using directives
    expect(content).not.toContain("using System.ClientModel;");
    expect(content).not.toContain("using System.ClientModel.Primitives;");
  });

  /**
   * Verifies the unbranded version is still generated correctly.
   * Ensures Azure changes don't break existing unbranded output.
   */
  it("unbranded pipeline extensions remain unchanged", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const content =
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"];

    // Unbranded uses ClientPipeline, PipelineMessage, RequestOptions
    expect(content).toContain(
      "public static async ValueTask<PipelineResponse> ProcessMessageAsync(this ClientPipeline pipeline, PipelineMessage message, RequestOptions options)",
    );
    expect(content).toContain("ClientErrorBehaviors.NoThrow");
    expect(content).toContain("ClientResultException");
    expect(content).not.toContain("HttpPipeline");
    expect(content).not.toContain("RequestFailedException");
  });
});
