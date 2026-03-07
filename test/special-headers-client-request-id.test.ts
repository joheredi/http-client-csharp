import { describe, expect, it } from "vitest";
import { AzureHttpTester, HttpTester } from "./test-host.js";

/**
 * Tests for Azure special header: x-ms-client-request-id.
 *
 * When flavor is "azure", the x-ms-client-request-id header parameter should
 * be stripped from all method signatures (protocol, convenience, and
 * CreateRequest). The Azure HttpPipeline policy automatically handles this
 * header for request correlation — exposing it as a parameter would be
 * redundant and inconsistent with Azure SDK conventions.
 *
 * Ground truth: the legacy emitter's ClientRequestIdHeaderVisitor strips this
 * parameter from Azure client methods. See:
 * submodules/azure-sdk-for-net/.../Visitors/ClientRequestIdHeaderVisitor.cs
 *
 * For unbranded flavor, x-ms-client-request-id should remain as a normal
 * header parameter since there is no automatic pipeline policy handling it.
 */
describe("x-ms-client-request-id special header", () => {
  /**
   * Validates that Azure flavor strips x-ms-client-request-id from the
   * client method signatures. The Azure HttpPipeline policy automatically
   * sets this header on every request, so the SDK should not expose it.
   *
   * Verifies:
   * - Protocol method (RequestContext overload) has no clientRequestId param
   * - Convenience method (CancellationToken overload) has no clientRequestId param
   * - REST client CreateRequest has no clientRequestId param
   * - The header is NOT auto-injected in CreateRequest (pipeline handles it)
   */
  it("strips x-ms-client-request-id from Azure client method signatures", async () => {
    const [{ outputs }, diagnostics] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get
      op testOp(@header("x-ms-client-request-id") clientRequestId?: string): void;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    // Check the client file — protocol and convenience methods
    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol method should only have RequestContext/RequestOptions, not clientRequestId
    // The method signature should be like: Get(RequestContext options) or Get(RequestOptions options)
    expect(clientFile).not.toContain("clientRequestId");

    // Check the REST client file — CreateRequest method
    const restClientFile =
      outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClientFile).toBeDefined();

    // CreateRequest should not have clientRequestId parameter
    expect(restClientFile).not.toContain("clientRequestId");

    // The header should NOT be auto-injected (Azure pipeline policy handles it)
    expect(restClientFile).not.toContain("x-ms-client-request-id");
  });

  /**
   * Validates that unbranded flavor preserves x-ms-client-request-id as a
   * normal header parameter. Without Azure's HttpPipeline, there is no
   * automatic mechanism to set this header, so it must be user-accessible.
   */
  it("preserves x-ms-client-request-id for unbranded flavor", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get
      op testOp(@header("x-ms-client-request-id") clientRequestId?: string): void;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    // Check the client file — should have clientRequestId in protocol method
    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();
    expect(clientFile).toContain("clientRequestId");

    // Check the REST client file — CreateRequest should have the parameter
    const restClientFile =
      outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClientFile).toBeDefined();
    expect(restClientFile).toContain("clientRequestId");
    expect(restClientFile).toContain("x-ms-client-request-id");
  });

  /**
   * Validates that repeatability special headers still work correctly
   * alongside the new x-ms-client-request-id stripping. Both header types
   * are special, but repeatability headers are auto-populated with runtime
   * values (GUID, timestamp) while x-ms-client-request-id is not.
   *
   * This regression test ensures the refactoring to centralize special
   * header logic doesn't break the existing repeatability mechanism.
   */
  it("repeatability headers are still stripped and auto-populated", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @post
      op testOp(
        @header("Repeatability-Request-ID") repeatRequestId?: string,
        @header("Repeatability-First-Sent") repeatFirstSent?: string,
        @body body: string,
      ): void;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    // Check client file — repeatability headers should NOT appear as params
    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();
    expect(clientFile).not.toContain("repeatRequestId");
    expect(clientFile).not.toContain("repeatFirstSent");

    // Check REST client — headers should be auto-populated with runtime values
    const restClientFile =
      outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClientFile).toBeDefined();
    // Repeatability headers should still be auto-populated with Guid and DateTimeOffset
    expect(restClientFile).toContain("Repeatability-Request-ID");
    expect(restClientFile).toContain("Guid.NewGuid()");
    expect(restClientFile).toContain("Repeatability-First-Sent");
    expect(restClientFile).toContain("DateTimeOffset.Now");
  });

  /**
   * Validates that when both x-ms-client-request-id and other normal headers
   * exist on the same operation, only x-ms-client-request-id is stripped in
   * Azure flavor while other headers are preserved.
   */
  it("strips only x-ms-client-request-id, preserves other headers in Azure flavor", async () => {
    const [{ outputs }, diagnostics] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get
      op testOp(
        @header("x-ms-client-request-id") clientRequestId?: string,
        @header("x-custom-header") customHeader?: string,
      ): void;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // x-ms-client-request-id should be stripped
    expect(clientFile).not.toContain("clientRequestId");

    // x-custom-header should be preserved
    expect(clientFile).toContain("customHeader");
  });
});
