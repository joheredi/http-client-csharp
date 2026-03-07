import { describe, expect, it } from "vitest";
import { AzureHttpTester, HttpTester } from "./test-host.js";

/**
 * Tests for Azure distributed tracing via ClientDiagnostics scope wrapping.
 *
 * When `flavor === "azure"`, standard (non-LRO, non-paging) protocol methods
 * are wrapped with a diagnostic scope that:
 * 1. Creates a scope via `ClientDiagnostics.CreateScope("ClientName.MethodName")`
 * 2. Starts the scope
 * 3. Wraps the method body in try-catch
 * 4. Calls `scope.Failed(e)` on exceptions before re-throwing
 *
 * This ensures Azure SDK telemetry can track individual operations.
 * Convenience methods are NOT wrapped because they delegate to protocol methods
 * which already have the scope.
 *
 * Ground truth reference: BasicTypeSpecClient.cs and PlantOperations.cs from
 * submodules/azure-sdk-for-net/.../TestProjects/Local/Basic-TypeSpec/src/Generated/
 */
describe("Azure Distributed Tracing", () => {
  /**
   * Verifies that Azure protocol methods have a diagnostic scope that wraps
   * the entire method body. This is the core tracing pattern that ensures
   * every protocol-level operation is tracked via OpenTelemetry.
   *
   * The scope name uses "ClientName.MethodName" convention (no "Async" suffix).
   */
  it("wraps Azure protocol methods with DiagnosticScope try-catch", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        id: string;
        name: string;
      }

      @route("/items/{id}")
      @get
      op getItem(@path id: string): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Sync protocol method has diagnostic scope wrapping
    expect(clientFile).toContain(
      'ClientDiagnostics.CreateScope("TestServiceClient.GetItem")',
    );
    expect(clientFile).toContain("scope.Start();");
    expect(clientFile).toContain("try");
    expect(clientFile).toContain("scope.Failed(e);");
    expect(clientFile).toContain("throw;");

    // Verify the using declaration for DiagnosticScope
    expect(clientFile).toContain("using DiagnosticScope scope =");

    // Verify the catch block references Exception
    expect(clientFile).toContain("catch (Exception e)");
  });

  /**
   * Verifies that both sync and async protocol methods share the same scope
   * name (without "Async" suffix), matching the legacy emitter convention.
   *
   * This is important because Azure telemetry groups sync/async calls under
   * the same scope name for consistent metrics and tracing.
   */
  it("uses same scope name for sync and async protocol methods", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item { id: string; }

      @route("/items/{id}")
      @get
      op getItem(@path id: string): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Both sync and async use the same scope name (no "Async" suffix)
    const scopeMatches = clientFile.match(
      /CreateScope\("TestServiceClient\.GetItem"\)/g,
    );
    expect(scopeMatches).toHaveLength(2); // sync + async
  });

  /**
   * Verifies that the Azure.Core.Pipeline using directive is added when
   * DiagnosticScope is used, ensuring the generated code compiles correctly.
   */
  it("adds Azure.Core.Pipeline using for DiagnosticScope", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/ping")
      @get
      op ping(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    expect(clientFile).toContain("using Azure.Core.Pipeline;");
  });

  /**
   * Verifies that validation statements (Argument.Assert*) are placed inside
   * the try block, not outside it. This matches the legacy emitter pattern
   * where all method body code is inside the try-catch scope.
   *
   * If validation were outside the try block, argument exceptions would not
   * be captured by the diagnostic scope's Failed() handler.
   */
  it("places validation inside the try block", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item { id: string; name: string; }

      @route("/items/{id}")
      @get
      op getItem(@path id: string, @header headParam: string): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify the structure: scope.Start() comes before try, validation inside try
    // Find scope.Start() and try to verify ordering
    const scopeStartIdx = clientFile.indexOf("scope.Start();");
    const tryIdx = clientFile.indexOf("try", scopeStartIdx);
    const assertIdx = clientFile.indexOf(
      "Argument.AssertNotNullOrEmpty(id",
      tryIdx,
    );
    const returnIdx = clientFile.indexOf("Pipeline.ProcessMessage(", tryIdx);

    expect(scopeStartIdx).toBeGreaterThan(-1);
    expect(tryIdx).toBeGreaterThan(scopeStartIdx);
    expect(assertIdx).toBeGreaterThan(tryIdx);
    expect(returnIdx).toBeGreaterThan(assertIdx);
  });

  /**
   * Verifies that operation group (sub-client) protocol methods use the
   * operation group class name (not the parent client name) for the scope name.
   *
   * E.g., PlantOperations.GetTree, not BasicTypeSpecClient.GetTree.
   * This matches Azure SDK convention where each operation group has its own
   * diagnostic scope prefix.
   */
  it("uses operation group class name for scope in sub-clients", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Tree { species: string; }

      @route("/plants")
      interface PlantOperations {
        @route("/trees")
        @get
        getTree(): Tree;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    const plantFile = outputs["src/Generated/PlantOperations.cs"];
    expect(plantFile).toBeDefined();

    // Scope name uses the operation group class name
    expect(plantFile).toContain(
      'ClientDiagnostics.CreateScope("PlantOperations.GetTree")',
    );
  });

  /**
   * Regression guard: Verifies that unbranded (non-Azure) protocol methods
   * do NOT have diagnostic scope wrapping. Tracing is an Azure-only feature.
   */
  it("does NOT add diagnostic scope for unbranded flavor", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item { id: string; }

      @route("/items")
      @get
      op listItems(): Item[];
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // No diagnostic scope in unbranded output
    expect(clientFile).not.toContain("DiagnosticScope");
    expect(clientFile).not.toContain("ClientDiagnostics");
    expect(clientFile).not.toContain("scope.Start()");
    expect(clientFile).not.toContain("scope.Failed(e)");
  });

  /**
   * Verifies that convenience methods do NOT have diagnostic scope wrapping.
   * They delegate to protocol methods, which already have the scope, avoiding
   * double-counting in telemetry.
   */
  it("does NOT wrap convenience methods with diagnostic scope", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item { id: string; name: string; }

      @route("/items")
      @post
      op createItem(@body item: Item): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // There should be exactly 2 diagnostic scopes (sync + async protocol methods)
    // NOT 4 (which would mean convenience methods are also wrapped)
    const scopeMatches = clientFile.match(
      /CreateScope\("TestServiceClient\.CreateItem"\)/g,
    );
    expect(scopeMatches).toHaveLength(2);
  });
});
