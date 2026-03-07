import { describe, expect, it } from "vitest";
import { AzureHttpTester, HttpTester } from "./test-host.js";

/**
 * Tests for Azure conditional request header grouping (Task 17.7b).
 *
 * When flavor is "azure", operations with conditional request headers
 * (If-Match, If-None-Match, If-Modified-Since, If-Unmodified-Since) should
 * group these individual parameters into composite Azure SDK types:
 *
 * - Single If-Match or If-None-Match → ETag? parameter
 * - Both If-Match + If-None-Match → MatchConditions parameter
 * - Any + If-Modified-Since/If-Unmodified-Since → RequestConditions parameter
 *
 * Ground truth: the legacy emitter's MatchConditionsHeadersVisitor. See:
 * submodules/azure-sdk-for-net/.../Visitors/MatchConditionsHeadersVisitor.cs
 *
 * For unbranded flavor, conditional headers remain as individual parameters.
 */
describe("conditional header grouping", () => {
  /**
   * Validates that Azure flavor replaces a single If-Match header with an
   * ETag? parameter. The ETag type is a value type (struct), so it needs to
   * be nullable (ETag?) for optional parameters.
   *
   * In CreateRequest, the ETag value is unpacked as:
   *   if (ifMatch != null) { request.Headers.Set("If-Match", ifMatch.Value.ToString()); }
   */
  it("single If-Match → ETag? parameter (Azure)", async () => {
    const [{ outputs }, diagnostics] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @post op testOp(@header("If-Match") ifMatch?: string): void;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"] ?? "";
    const restClient =
      outputs["src/Generated/TestServiceClient.RestClient.cs"] ?? "";

    // Protocol method should have ETag? parameter, not string ifMatch
    expect(clientFile).toContain("ETag?");
    expect(clientFile).not.toMatch(/string\s+ifMatch/);

    // CreateRequest should unpack ETag via .Value.ToString()
    expect(restClient).toContain("ifMatch.Value.ToString()");
    expect(restClient).toContain('request.Headers.Set("If-Match"');
  });

  /**
   * Validates that Azure flavor replaces a single If-None-Match header with
   * an ETag? parameter. Same logic as If-Match but with the If-None-Match
   * header name.
   */
  it("single If-None-Match → ETag? parameter (Azure)", async () => {
    const [{ outputs }, diagnostics] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @post op testOp(@header("If-None-Match") ifNoneMatch?: string): void;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"] ?? "";
    const restClient =
      outputs["src/Generated/TestServiceClient.RestClient.cs"] ?? "";

    // Should use ETag? type
    expect(clientFile).toContain("ETag?");
    expect(clientFile).not.toMatch(/string\s+ifNoneMatch/);

    // CreateRequest should unpack ETag
    expect(restClient).toContain("ifNoneMatch.Value.ToString()");
    expect(restClient).toContain('request.Headers.Set("If-None-Match"');
  });

  /**
   * Validates that Azure flavor groups If-Match + If-None-Match into a single
   * MatchConditions parameter. When both ETag-based conditional headers are
   * present (but no time-based headers), MatchConditions is used.
   *
   * In CreateRequest, MatchConditions is unpacked via:
   *   if (matchConditions != null) { request.Headers.Add(matchConditions); }
   */
  it("If-Match + If-None-Match → MatchConditions parameter (Azure)", async () => {
    const [{ outputs }, diagnostics] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(
        @header("If-Match") ifMatch?: string,
        @header("If-None-Match") ifNoneMatch?: string,
      ): void;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"] ?? "";
    const restClient =
      outputs["src/Generated/TestServiceClient.RestClient.cs"] ?? "";

    // Should have MatchConditions parameter, not individual strings
    expect(clientFile).toContain("MatchConditions");
    expect(clientFile).not.toMatch(/string\s+ifMatch/);
    expect(clientFile).not.toMatch(/string\s+ifNoneMatch/);

    // CreateRequest should use request.Headers.Add(matchConditions)
    expect(restClient).toContain("request.Headers.Add(matchConditions)");
    expect(restClient).not.toContain('request.Headers.Set("If-Match"');
    expect(restClient).not.toContain('request.Headers.Set("If-None-Match"');
  });

  /**
   * Validates that Azure flavor groups all conditional headers into
   * RequestConditions when any time-based header is present.
   * RequestConditions extends MatchConditions with IfModifiedSince/IfUnmodifiedSince.
   *
   * In CreateRequest:
   *   if (requestConditions != null) { request.Headers.Add(requestConditions); }
   */
  it("If-Match + If-Modified-Since → RequestConditions parameter (Azure)", async () => {
    const [{ outputs }, diagnostics] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(
        @header("If-Match") ifMatch?: string,
        @header("If-None-Match") ifNoneMatch?: string,
        @header("If-Modified-Since") ifModifiedSince?: utcDateTime,
        @header("If-Unmodified-Since") ifUnmodifiedSince?: utcDateTime,
      ): void;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"] ?? "";
    const restClient =
      outputs["src/Generated/TestServiceClient.RestClient.cs"] ?? "";

    // Should have RequestConditions parameter
    expect(clientFile).toContain("RequestConditions");
    // Should NOT have individual header parameters
    expect(clientFile).not.toMatch(/string\s+ifMatch/);
    expect(clientFile).not.toMatch(/DateTimeOffset\?\s+ifModifiedSince/);

    // CreateRequest should use request.Headers.Add(requestConditions)
    expect(restClient).toContain("request.Headers.Add(requestConditions)");
  });

  /**
   * Validates that a single If-Modified-Since header (without any ETag
   * headers) is grouped into RequestConditions, not kept as an individual
   * DateTimeOffset? parameter. Time-based headers always use RequestConditions.
   */
  it("single If-Modified-Since → RequestConditions parameter (Azure)", async () => {
    const [{ outputs }, diagnostics] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/check")
      @head op checkModified(
        @header("If-Modified-Since") ifModifiedSince?: utcDateTime,
      ): void;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"] ?? "";
    const restClient =
      outputs["src/Generated/TestServiceClient.RestClient.cs"] ?? "";

    // Should have RequestConditions parameter
    expect(clientFile).toContain("RequestConditions");
    expect(clientFile).not.toMatch(/DateTimeOffset\?\s+ifModifiedSince/);

    // CreateRequest should use request.Headers.Add(requestConditions)
    expect(restClient).toContain("request.Headers.Add(requestConditions)");
  });

  /**
   * Validates that protocol methods add ArgumentException validation for
   * conditional header properties that the operation does not support.
   *
   * When RequestConditions is used but the operation only supports a subset
   * of the 4 conditional headers, the protocol method should throw for
   * unsupported properties to prevent callers from setting them.
   */
  it("protocol method validates unsupported conditional headers (Azure)", async () => {
    const [{ outputs }, diagnostics] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/check")
      @head op checkModified(
        @header("If-Match") ifMatch?: string,
        @header("If-Modified-Since") ifModifiedSince?: utcDateTime,
      ): void;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"] ?? "";

    // Should validate unsupported headers: If-None-Match and If-Unmodified-Since
    expect(clientFile).toContain("requestConditions?.IfNoneMatch != null");
    expect(clientFile).toContain("requestConditions?.IfUnmodifiedSince != null");
    expect(clientFile).toContain("ArgumentException");

    // Should NOT validate supported headers
    expect(clientFile).not.toContain("requestConditions?.IfMatch != null");
    expect(clientFile).not.toContain("requestConditions?.IfModifiedSince != null");
  });

  /**
   * Validates that unbranded flavor retains individual conditional header
   * parameters without any grouping. Conditional header grouping is
   * Azure-specific behavior.
   */
  it("unbranded flavor retains individual conditional header parameters", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(
        @header("If-Match") ifMatch?: string,
        @header("If-None-Match") ifNoneMatch?: string,
        @header("If-Modified-Since") ifModifiedSince?: utcDateTime,
      ): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"] ?? "";
    const restClient =
      outputs["src/Generated/TestServiceClient.RestClient.cs"] ?? "";

    // Unbranded should keep individual header parameters
    expect(clientFile).toContain("ifMatch");
    expect(clientFile).toContain("ifNoneMatch");
    expect(clientFile).toContain("ifModifiedSince");

    // Should NOT have Azure conditional types
    expect(clientFile).not.toContain("MatchConditions");
    expect(clientFile).not.toContain("RequestConditions");
    expect(clientFile).not.toContain("ETag");

    // CreateRequest should set headers individually
    expect(restClient).toContain('request.Headers.Set("If-Match"');
    expect(restClient).toContain('request.Headers.Set("If-None-Match"');
    expect(restClient).toContain('request.Headers.Set("If-Modified-Since"');
  });
});
