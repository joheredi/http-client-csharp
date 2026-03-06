import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for LRO (Long-Running Operation) method generation.
 *
 * These tests verify that operations marked with `@markAsLro` (which sets
 * TCGC method kind to "lro") generate correct client methods. For the
 * System.ClientModel target (non-Azure), LRO methods use the same signatures
 * and return types as basic methods — the LRO behavior (polling, final state
 * retrieval) is not reflected in the method signature layer.
 *
 * Why these tests matter:
 * - LRO operations are a common pattern in cloud APIs. Even though the
 *   System.ClientModel target generates the same signatures as basic methods,
 *   we must verify that LRO operations are not accidentally filtered out or
 *   handled incorrectly by the method generation pipeline.
 * - The `kind: "lro"` discriminator must pass through both ProtocolMethod and
 *   ConvenienceMethod filters correctly.
 * - When an Azure extension is added, these tests serve as a baseline to verify
 *   that LRO-specific return types (e.g., Operation<T>) are layered on top.
 */
describe("LroMethod", () => {
  /**
   * Verifies that an operation marked as LRO generates both sync and async
   * protocol methods with the standard ClientResult return type.
   *
   * The `@markAsLro` decorator forces TCGC to treat the operation as kind "lro".
   * For System.ClientModel, the protocol method signature is identical to a
   * basic operation: ClientResult / Task<ClientResult>.
   *
   * This test ensures LRO methods are not filtered out by the
   * `m.kind !== "paging"` check in ProtocolMethods.
   */
  it("generates protocol methods for LRO operation", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model DeploymentResult {
        id: string;
        status: string;
      }

      @route("/deployments")
      @post
      @markAsLro
      op startDeployment(@body body: DeploymentResult): DeploymentResult;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify sync protocol method — body-only protocol methods get
    // RequestOptions = null since BinaryContent always disambiguates
    // from the convenience method's typed model parameter.
    expect(clientFile).toContain(
      "public virtual ClientResult StartDeployment(BinaryContent content, RequestOptions options = null)",
    );
    expect(clientFile).toContain(
      "using PipelineMessage message = CreateStartDeploymentRequest(content, options);",
    );
    expect(clientFile).toContain(
      "return ClientResult.FromResponse(Pipeline.ProcessMessage(message, options));",
    );

    // Verify async protocol method (may wrap across lines)
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult> StartDeploymentAsync(",
    );
    expect(clientFile).toContain(
      "BinaryContent content, RequestOptions options = null",
    );
    expect(clientFile).toContain(
      "return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));",
    );
  });

  /**
   * Verifies that an LRO operation with `generateConvenient: true` (the default)
   * generates typed convenience methods alongside protocol methods.
   *
   * The convenience method should return `ClientResult<T>` with the final
   * response type, and accept typed parameters (not BinaryContent).
   * This validates that `kind: "lro"` does not interfere with the
   * convenience method generation pipeline.
   *
   * Uses short type names to avoid multi-line wrapping in assertions.
   */
  it("generates convenience methods for LRO operation with model response", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Job {
        id: string;
        status: string;
      }

      @route("/jobs")
      @post
      @markAsLro
      op startJob(@body body: Job): Job;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify sync convenience method — typed params and ClientResult<T>
    expect(clientFile).toContain(
      "public virtual ClientResult<Job> StartJob(Job body, CancellationToken cancellationToken = default)",
    );

    // Verify async convenience method (may wrap across lines due to printWidth)
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult<Job>> StartJobAsync(",
    );
    expect(clientFile).toContain("Job body,");
    expect(clientFile).toContain(
      "CancellationToken cancellationToken = default",
    );

    // Verify convenience delegates to protocol method
    expect(clientFile).toContain(
      "ClientResult result = StartJob(body, cancellationToken.ToRequestOptions());",
    );
    expect(clientFile).toContain(
      "return ClientResult.FromValue((Job)result, result.GetRawResponse());",
    );
  });

  /**
   * Verifies that an LRO operation with path parameters generates methods
   * with the parameters in the correct position and with proper validation.
   *
   * This ensures that the parameter ordering logic (path → required params →
   * body → optional params) works correctly for LRO operations, matching
   * the behavior of basic operations.
   */
  it("generates LRO methods with path and body parameters", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Job {
        name: string;
      }

      @route("/jobs/{id}")
      @put
      @markAsLro
      op replaceJob(@path id: string, @body body: Job): Job;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol method: path param before body
    expect(clientFile).toContain(
      "public virtual ClientResult ReplaceJob(string id, BinaryContent content, RequestOptions options)",
    );
    // Path parameter validation
    expect(clientFile).toContain(
      "Argument.AssertNotNullOrEmpty(id, nameof(id));",
    );

    // Convenience method: typed params with path param first
    expect(clientFile).toContain(
      "public virtual ClientResult<Job> ReplaceJob(string id, Job body, CancellationToken cancellationToken = default)",
    );
  });

  /**
   * Verifies that an LRO operation returning a model with a single property
   * generates methods correctly. TCGC's `@markAsLro` requires the operation
   * to return a model type (void returns produce a warning and are ignored).
   *
   * This test uses a simple model return to verify that the LRO method
   * pipeline handles the response type correctly.
   */
  it("generates LRO methods with simple model return", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Status {
        done: boolean;
      }

      @route("/tasks")
      @post
      @markAsLro
      op startTask(): Status;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol method: standard signature
    expect(clientFile).toContain(
      "public virtual ClientResult StartTask(RequestOptions options)",
    );

    // Async protocol method
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult> StartTaskAsync(RequestOptions options)",
    );

    // Convenience method: returns ClientResult<Status>
    expect(clientFile).toContain(
      "public virtual ClientResult<Status> StartTask(CancellationToken cancellationToken = default)",
    );

    // Async convenience method
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult<Status>> StartTaskAsync(CancellationToken cancellationToken = default)",
    );
  });

  /**
   * Verifies that the RestClient CreateRequest method is generated for LRO
   * operations, following the same pattern as basic operations.
   *
   * The request creation method is the same regardless of whether the operation
   * is LRO or basic — LRO behavior is handled at the method invocation layer,
   * not the request construction layer.
   */
  it("generates CreateRequest method for LRO operation", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Payload {
        data: string;
      }

      @route("/process")
      @post
      @markAsLro
      op startProcessing(@body body: Payload): Payload;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClientFile =
      outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClientFile).toBeDefined();

    // Verify CreateRequest method exists for LRO operation
    expect(restClientFile).toContain(
      "internal PipelineMessage CreateStartProcessingRequest(BinaryContent content, RequestOptions options)",
    );
  });

  /**
   * Verifies that LRO operations with the XML doc pattern include the
   * [Protocol Method] tag in protocol methods and standard exception docs.
   *
   * This ensures the documentation generation pipeline handles LRO methods
   * the same as basic methods — no special LRO-specific XML doc is needed
   * for the System.ClientModel target.
   */
  it("generates XML documentation for LRO methods", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Result {
        ok: boolean;
      }

      @doc("Start a long-running operation.")
      @route("/operations")
      @post
      @markAsLro
      op startOperation(): Result;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol method XML doc includes [Protocol Method] tag
    expect(clientFile).toContain(
      "/// [Protocol Method] Start a long-running operation.",
    );
    expect(clientFile).toContain(
      '/// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>',
    );

    // Convenience method XML doc
    expect(clientFile).toContain(
      "/// <summary> Start a long-running operation. </summary>",
    );
  });
});
