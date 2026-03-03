import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for multipart/form-data request building in protocol methods and
 * RestClient CreateRequest methods.
 *
 * These tests verify that multipart operations get a dynamic `contentType`
 * string parameter (which carries the multipart boundary) instead of a
 * hardcoded Content-Type header. This matches the legacy emitter's behavior
 * where `MultiPartFormDataBinaryContent.ContentType` is passed at call time.
 *
 * Why these tests matter:
 * - Multipart requests MUST have a dynamic Content-Type header because the
 *   boundary is generated at runtime. Hardcoding "multipart/form-data" would
 *   cause servers to reject the request (missing boundary).
 * - The `contentType` parameter must appear immediately after the `content`
 *   (BinaryContent) parameter in method signatures to match the legacy API.
 * - Both protocol methods and CreateRequest methods must include this parameter.
 */
describe("multipart request building", () => {
  /** Standard multipart TypeSpec snippet for reuse across tests. */
  const multipartTypeSpec = `
    using TypeSpec.Http;

    @service
    namespace TestService;

    op upload(
      @header contentType: "multipart/form-data",
      @multipartBody body: {
        name: HttpPart<string>;
        file: HttpPart<bytes>;
      },
    ): void;
  `;

  /**
   * Verifies that multipart protocol methods include a `contentType` string
   * parameter after the `content` BinaryContent parameter.
   *
   * The legacy emitter adds `ScmKnownParameters.ContentType` as a synthetic
   * parameter for multipart operations. This test ensures the new emitter
   * produces the same method signature pattern:
   * `Upload(BinaryContent content, string contentType, RequestOptions options)`
   */
  it("protocol method has contentType parameter for multipart operation", async () => {
    const [{ outputs }, diagnostics] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Sync method should have: content, contentType, options
    expect(clientFile).toContain("public virtual ClientResult Upload(");
    expect(clientFile).toContain("BinaryContent content,");
    expect(clientFile).toContain("string contentType,");

    // Async method should have the same parameter list
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult> UploadAsync(",
    );
  });

  /**
   * Verifies that the protocol method validates the contentType parameter
   * with Argument.AssertNotNullOrEmpty since it's a required string parameter.
   *
   * Without this validation, callers could pass null/empty contentType which
   * would result in HTTP requests without a proper Content-Type header.
   */
  it("protocol method validates contentType parameter", async () => {
    const [{ outputs }, diagnostics] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // contentType is a required string, so it should use AssertNotNullOrEmpty
    expect(clientFile).toContain(
      "Argument.AssertNotNullOrEmpty(contentType, nameof(contentType));",
    );
  });

  /**
   * Verifies that the protocol method XML docs include the contentType
   * parameter documentation describing its purpose.
   *
   * This helps consumers understand that the contentType must be obtained
   * from MultiPartFormDataBinaryContent.ContentType (includes boundary).
   */
  it("protocol method XML docs include contentType parameter", async () => {
    const [{ outputs }, diagnostics] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    expect(clientFile).toContain(`<param name="contentType">`);
  });

  /**
   * Verifies that the CreateRequest method in RestClient also includes
   * the `contentType` string parameter for multipart operations.
   *
   * The CreateRequest method must accept `contentType` to set the
   * Content-Type header dynamically with the boundary string.
   */
  it("CreateRequest method has contentType parameter for multipart", async () => {
    const [{ outputs }, diagnostics] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);
    expect(diagnostics).toHaveLength(0);

    const restClientFile =
      outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClientFile).toBeDefined();

    // CreateRequest should include content and contentType parameters
    expect(restClientFile).toContain(
      "internal PipelineMessage CreateUploadRequest(BinaryContent content, string contentType, RequestOptions options)",
    );
  });

  /**
   * Verifies that the CreateRequest method uses the `contentType` variable
   * (not a hardcoded string) when setting the Content-Type header for
   * multipart operations.
   *
   * This is critical: the Content-Type must include the boundary which is
   * generated at runtime. Hardcoding "multipart/form-data" would fail.
   */
  it("CreateRequest sets Content-Type from contentType variable for multipart", async () => {
    const [{ outputs }, diagnostics] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);
    expect(diagnostics).toHaveLength(0);

    const restClientFile =
      outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClientFile).toBeDefined();

    // Should use the contentType variable, not a hardcoded string
    expect(restClientFile).toContain(
      'request.Headers.Set("Content-Type", contentType);',
    );

    // Should NOT contain the hardcoded multipart/form-data content type
    expect(restClientFile).not.toContain(
      '"Content-Type", "multipart/form-data"',
    );
  });

  /**
   * Verifies that non-multipart operations still use the hardcoded
   * Content-Type header and do NOT get a contentType parameter.
   *
   * Regression test: only multipart operations should get the dynamic
   * contentType parameter. Regular POST/PUT operations must continue
   * to hardcode the Content-Type based on the body's defaultContentType.
   */
  it("non-multipart operation does not get contentType parameter", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/items")
      @post op createItem(@body body: Item): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Should have content and options, but NOT contentType
    expect(clientFile).toContain(
      "public virtual ClientResult CreateItem(BinaryContent content, RequestOptions options",
    );
    expect(clientFile).not.toContain("string contentType");

    const restClientFile =
      outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClientFile).toBeDefined();

    // Should use hardcoded content type, not a variable
    expect(restClientFile).toContain('"Content-Type", "application/json"');
  });

  /**
   * Verifies that the protocol method passes contentType through to the
   * CreateRequest call for multipart operations.
   *
   * The call chain must be: protocol method → CreateRequest(content, contentType, options)
   * If contentType is dropped in the call, the request will be malformed.
   */
  it("protocol method passes contentType to CreateRequest", async () => {
    const [{ outputs }, diagnostics] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // The CreateRequest call should include contentType
    expect(clientFile).toContain(
      "CreateUploadRequest(content, contentType, options)",
    );
  });

  /**
   * Verifies that the protocol method sets body content for multipart ops.
   *
   * Even though the Content-Type is dynamic, the body content still needs
   * to be assigned to request.Content in the CreateRequest method.
   */
  it("CreateRequest sets request.Content for multipart body", async () => {
    const [{ outputs }, diagnostics] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);
    expect(diagnostics).toHaveLength(0);

    const restClientFile =
      outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClientFile).toBeDefined();

    expect(restClientFile).toContain("request.Content = content;");
  });
});
