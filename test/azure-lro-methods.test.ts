import { describe, expect, it } from "vitest";
import { AzureHttpTester, HttpTester } from "./test-host.js";

/**
 * Tests for Azure-flavored LRO (Long-Running Operation) method generation.
 *
 * When `flavor === "azure"`, LRO operations generate Azure SDK-specific
 * return types and parameters:
 * - Protocol methods return `Operation<BinaryData>` (or `Operation` for void)
 * - Convenience methods return `Operation<T>` (or `Operation` for void)
 * - Both prepend `WaitUntil waitUntil` as the first parameter
 * - Protocol bodies call `ProtocolOperationHelpers.ProcessMessage[Async]()`
 * - Convenience bodies call protocol method then
 *   `ProtocolOperationHelpers.Convert()`
 *
 * These tests ensure the LRO transformation is applied ONLY for Azure flavor
 * and that unbranded LRO methods remain unchanged (using standard ClientResult).
 *
 * Note: TCGC only supports `@markAsLro` on operations that return a model.
 * Void-returning LRO (e.g., Delete) uses Azure.Core resource operations which
 * requires the full Azure.Core library import — tested via e2e instead.
 *
 * Ground truth reference: legacy emitter's StandardClient.cs and RpcClient.cs
 * under submodules/azure-sdk-for-net/.../TestProjects/Spector/http/azure/core/lro/
 */
describe("Azure LRO Methods", () => {
  /**
   * Verifies that Azure LRO protocol methods return `Operation<BinaryData>`
   * instead of `Response`, with `WaitUntil` as the first parameter.
   *
   * The body should call `ProtocolOperationHelpers.ProcessMessage()` with
   * pipeline, message, diagnostics, scope name, final state via, and waitUntil.
   *
   * This is the foundational Azure LRO pattern — protocol methods provide the
   * raw binary polling operation that convenience methods then convert to typed results.
   */
  it("generates Azure LRO protocol methods with Operation<BinaryData> return type", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
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
      op createJob(@body body: Job): Job;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Sync protocol method: Operation<BinaryData> with WaitUntil
    expect(clientFile).toContain(
      "public virtual Operation<BinaryData> CreateJob(",
    );
    expect(clientFile).toContain("WaitUntil waitUntil,");

    // Body calls ProtocolOperationHelpers.ProcessMessage with correct args
    expect(clientFile).toContain(
      "ProtocolOperationHelpers.ProcessMessage(Pipeline, message, ClientDiagnostics,",
    );
    expect(clientFile).toContain("OperationFinalStateVia.");
    expect(clientFile).toContain("options, waitUntil)");

    // Async protocol method
    expect(clientFile).toContain(
      "public virtual async Task<Operation<BinaryData>> CreateJobAsync(",
    );
    expect(clientFile).toContain(
      "ProtocolOperationHelpers.ProcessMessageAsync(Pipeline, message, ClientDiagnostics,",
    );
  });

  /**
   * Verifies that Azure LRO convenience methods return `Operation<T>` with
   * `WaitUntil` as the first parameter.
   *
   * The body should call the protocol method (forwarding waitUntil), then
   * use `ProtocolOperationHelpers.Convert()` to transform `Operation<BinaryData>`
   * to `Operation<T>` with a deserialization lambda.
   *
   * This matches the legacy emitter's pattern where convenience methods wrap
   * protocol methods with typed deserialization.
   */
  it("generates Azure LRO convenience methods with Operation<T> return type", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
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
      op createJob(@body body: Job): Job;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Sync convenience method: Operation<Job>
    expect(clientFile).toContain("public virtual Operation<Job> CreateJob(");
    expect(clientFile).toContain("WaitUntil waitUntil,");
    expect(clientFile).toContain("Job body,");
    expect(clientFile).toContain(
      "CancellationToken cancellationToken = default",
    );

    // Body calls protocol method then Convert
    expect(clientFile).toContain(
      "Operation<BinaryData> operation = CreateJob(waitUntil,",
    );
    expect(clientFile).toContain("ProtocolOperationHelpers.Convert(operation,");
    expect(clientFile).toContain("response => (Job)response");
    expect(clientFile).toContain(
      'ClientDiagnostics, "TestServiceClient.CreateJob"',
    );

    // Async convenience method
    expect(clientFile).toContain(
      "public virtual async Task<Operation<Job>> CreateJobAsync(",
    );
    expect(clientFile).toContain(
      "Operation<BinaryData> operation = await CreateJobAsync(waitUntil,",
    );
  });

  /**
   * Verifies that LRO methods with multiple parameters (path + body) correctly
   * include WaitUntil as the first parameter while preserving the rest of the
   * parameter order.
   *
   * The parameter order must be: WaitUntil → path params → body → options/CT
   */
  it("generates Azure LRO methods with WaitUntil before path and body params", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/widgets/{id}")
      @put
      @markAsLro
      op createWidget(@path id: string, @body body: Widget): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol: WaitUntil first, then path, then body, then options
    expect(clientFile).toContain(
      "public virtual Operation<BinaryData> CreateWidget(",
    );
    // Verify parameter order by checking the method body uses regex
    // WaitUntil must come before id in the signature
    const protocolMethodMatch = clientFile.match(
      /Operation<BinaryData> CreateWidget\(\s*WaitUntil waitUntil,\s*string id,/s,
    );
    expect(protocolMethodMatch).not.toBeNull();

    // Convenience: WaitUntil first, then path, then typed body, then CT
    const convenienceMethodMatch = clientFile.match(
      /Operation<Widget> CreateWidget\(\s*WaitUntil waitUntil,\s*string id,\s*Widget body,/s,
    );
    expect(convenienceMethodMatch).not.toBeNull();
  });

  /**
   * Verifies that unbranded (non-Azure) LRO methods are NOT affected by the
   * Azure LRO transformation. They should continue to use standard
   * ClientResult / Task<ClientResult> return types without WaitUntil.
   *
   * This is a regression guard — the Azure LRO changes must not alter
   * the behavior when `flavor` is not "azure".
   */
  it("unbranded LRO methods remain unchanged (no Operation<T>, no WaitUntil)", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Job {
        id: string;
      }

      @route("/jobs")
      @post
      @markAsLro
      op createJob(@body body: Job): Job;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Unbranded should NOT have WaitUntil or Operation<T>
    expect(clientFile).not.toContain("WaitUntil");
    expect(clientFile).not.toContain("Operation<");
    expect(clientFile).not.toContain("ProtocolOperationHelpers");

    // Should use standard ClientResult
    expect(clientFile).toContain("public virtual ClientResult CreateJob(");
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult> CreateJobAsync(",
    );
    expect(clientFile).toContain("public virtual ClientResult<Job> CreateJob(");
  });

  /**
   * Verifies that the scope name in ProtocolOperationHelpers calls follows
   * the format "ClientName.MethodName" matching the legacy emitter's
   * distributed tracing convention.
   */
  it("generates correct scope name in ProtocolOperationHelpers calls", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace MyService;

      model Item { id: string; }

      @route("/items")
      @post
      @markAsLro
      op startProcess(@body body: Item): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/MyServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol method scope: "MyServiceClient.StartProcess"
    expect(clientFile).toContain('"MyServiceClient.StartProcess"');

    // Convenience method scope (in Convert call)
    expect(clientFile).toContain(
      'ClientDiagnostics, "MyServiceClient.StartProcess"',
    );
  });

  /**
   * Verifies that Azure LRO methods correctly generate `using` directives
   * for all LRO-related Azure.Core types. The generated file must include
   * `using Azure;` (for Operation, WaitUntil) and `using Azure.Core;`
   * (for OperationFinalStateVia, ProtocolOperationHelpers).
   */
  it("generates correct using directives for LRO types", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Job { id: string; }

      @route("/jobs")
      @post
      @markAsLro
      op createJob(@body body: Job): Job;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Must have using directives for LRO types
    expect(clientFile).toContain("using Azure;");
    expect(clientFile).toContain("using Azure.Core;");
  });
});
