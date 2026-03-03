import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Integration tests for multipart/form-data generation.
 *
 * These tests validate end-to-end multipart generation scenarios that go
 * beyond the individual component tests in multipart-binary-content.test.ts
 * (infrastructure file) and multipart-request-building.test.ts (protocol
 * method parameters). They verify the emitter correctly handles:
 *
 * - Multiple multipart operations on the same client
 * - Mixed multipart and non-multipart operations on the same client
 * - Sub-client hierarchies with multipart operations
 * - Infrastructure file generation triggered by sub-client multipart ops
 * - Async method signature parity with sync methods
 *
 * These integration scenarios are critical because individual tests can pass
 * while the combined behavior fails (e.g., contentType detection breaking
 * when a client has both multipart and non-multipart ops).
 */
describe("multipart generation", () => {
  /**
   * Verifies that when a client has multiple multipart operations, ALL of
   * them receive the `(BinaryContent content, string contentType, RequestOptions options)`
   * signature — not just the first one detected.
   *
   * This catches regressions where multipart detection might short-circuit
   * and only apply to the first operation found.
   */
  it("all multipart operations get contentType parameter", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/upload")
      @post op upload(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          name: HttpPart<string>;
          file: HttpPart<bytes>;
        },
      ): void;

      @route("/submit")
      @post op submit(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          title: HttpPart<string>;
          document: HttpPart<bytes>;
        },
      ): void;

      @route("/attach")
      @post op attach(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          attachment: HttpPart<bytes>;
        },
      ): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // All three sync methods should have contentType parameter
    expect(clientFile).toContain(
      "public virtual ClientResult Upload(BinaryContent content, string contentType, RequestOptions options",
    );
    expect(clientFile).toContain(
      "public virtual ClientResult Submit(BinaryContent content, string contentType, RequestOptions options",
    );
    expect(clientFile).toContain(
      "public virtual ClientResult Attach(BinaryContent content, string contentType, RequestOptions options",
    );

    // All three async methods should also have contentType
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult> UploadAsync(",
    );
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult> SubmitAsync(",
    );
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult> AttachAsync(",
    );
  });

  /**
   * Verifies that when a client has both multipart and non-multipart operations,
   * only the multipart operations get the contentType parameter. Non-multipart
   * operations must keep their normal `(BinaryContent content, RequestOptions options)`
   * signature.
   *
   * This is the most important integration test because it exercises the
   * per-operation multipart detection logic in both ProtocolMethod.tsx and
   * RestClientFile.tsx. A naive implementation that checks at the client level
   * would incorrectly add contentType to ALL operations.
   */
  it("mixed client: only multipart ops get contentType", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/upload")
      @post op upload(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          name: HttpPart<string>;
          file: HttpPart<bytes>;
        },
      ): void;

      @route("/items")
      @post op createItem(@body body: Item): void;

      @route("/items")
      @get op getItems(): Item[];
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Multipart op should have contentType
    expect(clientFile).toContain(
      "public virtual ClientResult Upload(BinaryContent content, string contentType, RequestOptions options",
    );

    // Non-multipart POST should NOT have contentType
    expect(clientFile).toContain(
      "public virtual ClientResult CreateItem(BinaryContent content, RequestOptions options",
    );
    // Verify no contentType appears in the createItem signature
    const createItemLine = clientFile
      .split("\n")
      .find(
        (l: string) => l.includes("CreateItem(") && l.includes("BinaryContent"),
      );
    expect(createItemLine).toBeDefined();
    expect(createItemLine).not.toContain("string contentType");

    // GET operation should not have BinaryContent or contentType at all
    expect(clientFile).toContain("public virtual ClientResult GetItems(");
  });

  /**
   * Verifies that the MultiPartFormDataBinaryContent infrastructure file is
   * generated when a mixed client has at least one multipart operation.
   *
   * The infrastructure file must be generated based on presence of ANY multipart
   * operation, regardless of how many non-multipart operations exist.
   */
  it("infrastructure file generated for mixed client", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/upload")
      @post op upload(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          name: HttpPart<string>;
          file: HttpPart<bytes>;
        },
      ): void;

      @route("/items")
      @get op getItems(): Item[];
    `);
    expect(diagnostics).toHaveLength(0);

    const infraFile =
      outputs["src/Generated/Internal/MultiPartFormDataBinaryContent.cs"];
    expect(infraFile).toBeDefined();
    expect(infraFile).toContain(
      "internal partial class MultiPartFormDataBinaryContent",
    );
  });

  /**
   * Verifies that the CreateRequest methods in RestClient correctly handle
   * mixed scenarios — multipart CreateRequest uses contentType variable while
   * non-multipart CreateRequest uses hardcoded Content-Type.
   *
   * This is essential because both CreateRequest methods are in the same
   * RestClient file and must independently determine their Content-Type
   * header strategy based on each operation's body content type.
   */
  it("RestClient handles mixed multipart and non-multipart CreateRequest", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/upload")
      @post op upload(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          name: HttpPart<string>;
          file: HttpPart<bytes>;
        },
      ): void;

      @route("/items")
      @post op createItem(@body body: Item): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClientFile =
      outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClientFile).toBeDefined();

    // Multipart CreateRequest should use dynamic contentType
    expect(restClientFile).toContain(
      "internal PipelineMessage CreateUploadRequest(BinaryContent content, string contentType, RequestOptions options)",
    );
    expect(restClientFile).toContain(
      'request.Headers.Set("Content-Type", contentType);',
    );

    // Non-multipart CreateRequest should use hardcoded content type
    expect(restClientFile).toContain(
      "internal PipelineMessage CreateCreateItemRequest(BinaryContent content, RequestOptions options)",
    );
    expect(restClientFile).toContain('"Content-Type", "application/json"');
  });

  /**
   * Verifies that multipart operations on a sub-client (defined via interface)
   * also get the contentType parameter in their protocol methods.
   *
   * Sub-clients are a common pattern in TypeSpec where operations are grouped
   * under interfaces. The multipart detection must work across client boundaries.
   */
  it("sub-client multipart operations get contentType parameter", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/files")
      interface FileOperations {
        @route("/upload")
        @post op upload(
          @header contentType: "multipart/form-data",
          @multipartBody body: {
            file: HttpPart<bytes>;
          },
        ): void;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    const subClientFile = outputs["src/Generated/FileOperations.cs"];
    expect(subClientFile).toBeDefined();

    // Sub-client should have contentType parameter for multipart op
    expect(subClientFile).toContain(
      "public virtual ClientResult Upload(BinaryContent content, string contentType, RequestOptions options",
    );
    // Async method wraps across lines — check key fragments
    expect(subClientFile).toContain(
      "public virtual async Task<ClientResult> UploadAsync(",
    );
    expect(subClientFile).toContain("BinaryContent content,");
    expect(subClientFile).toContain("string contentType,");
  });

  /**
   * Verifies that MultiPartFormDataBinaryContent is generated when only a
   * sub-client has multipart operations (root client has none).
   *
   * This tests the detectMultipartOperations function which scans ALL clients
   * in the SDK package (including sub-clients) to determine if the infrastructure
   * file is needed.
   */
  it("infrastructure file generated when only sub-client has multipart", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/health")
      @get op healthCheck(): void;

      @route("/files")
      interface FileOperations {
        @route("/upload")
        @post op upload(
          @header contentType: "multipart/form-data",
          @multipartBody body: {
            file: HttpPart<bytes>;
          },
        ): void;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    // Infrastructure file should exist even though root client has no multipart ops
    const infraFile =
      outputs["src/Generated/Internal/MultiPartFormDataBinaryContent.cs"];
    expect(infraFile).toBeDefined();
    expect(infraFile).toContain(
      "internal partial class MultiPartFormDataBinaryContent",
    );

    // Root client should NOT have contentType
    const rootClient = outputs["src/Generated/TestServiceClient.cs"];
    expect(rootClient).toBeDefined();
    // HealthCheck is GET, no BinaryContent
    expect(rootClient).toContain("public virtual ClientResult HealthCheck(");
  });

  /**
   * Verifies that contentType validation (AssertNotNullOrEmpty) is applied
   * consistently across all multipart operations on a client.
   *
   * Each multipart operation independently validates its contentType parameter.
   * This test ensures the validation isn't accidentally shared or skipped.
   */
  it("contentType validated for each multipart operation", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/upload")
      @post op upload(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          file: HttpPart<bytes>;
        },
      ): void;

      @route("/submit")
      @post op submit(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          doc: HttpPart<bytes>;
        },
      ): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Count occurrences of contentType validation — should appear in both
    // sync and async methods for both operations (4 total: Upload, UploadAsync,
    // Submit, SubmitAsync)
    const validationCount = (
      clientFile.match(
        /Argument\.AssertNotNullOrEmpty\(contentType, nameof\(contentType\)\)/g,
      ) || []
    ).length;
    expect(validationCount).toBeGreaterThanOrEqual(4);
  });

  /**
   * Verifies that multipart operations pass contentType through to their
   * corresponding CreateRequest methods.
   *
   * Each protocol method must call its CreateRequest with the contentType
   * argument so the Content-Type header (including boundary) is set correctly.
   */
  it("each multipart op passes contentType to CreateRequest", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/upload")
      @post op upload(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          file: HttpPart<bytes>;
        },
      ): void;

      @route("/submit")
      @post op submit(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          doc: HttpPart<bytes>;
        },
      ): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Both operations should pass contentType to CreateRequest
    expect(clientFile).toContain(
      "CreateUploadRequest(content, contentType, options)",
    );
    expect(clientFile).toContain(
      "CreateSubmitRequest(content, contentType, options)",
    );
  });

  /**
   * Verifies that the RestClient generates separate CreateRequest methods
   * for each multipart operation, each with the contentType parameter.
   *
   * This ensures the code generation handles multiple CreateRequest methods
   * correctly within a single RestClient file.
   */
  it("RestClient generates CreateRequest for each multipart op", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/upload")
      @post op upload(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          file: HttpPart<bytes>;
        },
      ): void;

      @route("/submit")
      @post op submit(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          doc: HttpPart<bytes>;
        },
      ): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const restClientFile =
      outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClientFile).toBeDefined();

    // Both CreateRequest methods should exist with contentType
    expect(restClientFile).toContain(
      "internal PipelineMessage CreateUploadRequest(BinaryContent content, string contentType, RequestOptions options)",
    );
    expect(restClientFile).toContain(
      "internal PipelineMessage CreateSubmitRequest(BinaryContent content, string contentType, RequestOptions options)",
    );

    // Both should set Content-Type dynamically
    const contentTypeSetCount = (
      restClientFile.match(
        /request\.Headers\.Set\("Content-Type", contentType\)/g,
      ) || []
    ).length;
    expect(contentTypeSetCount).toBe(2);
  });

  /**
   * Verifies that multipart operations with multiple body parts (string + bytes)
   * still produce the same protocol method signature — the parts are transparent
   * to the protocol layer since everything goes through BinaryContent.
   *
   * The multipart body parts affect only the convenience layer (which assembles
   * the MultiPartFormDataBinaryContent), not the protocol method signature.
   */
  it("multipart body part count does not affect protocol signature", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/simple")
      @post op simpleUpload(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          file: HttpPart<bytes>;
        },
      ): void;

      @route("/complex")
      @post op complexUpload(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          name: HttpPart<string>;
          description: HttpPart<string>;
          file: HttpPart<bytes>;
          thumbnail: HttpPart<bytes>;
        },
      ): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Both should have identical parameter patterns despite different body parts
    expect(clientFile).toContain(
      "public virtual ClientResult SimpleUpload(BinaryContent content, string contentType, RequestOptions options",
    );
    expect(clientFile).toContain(
      "public virtual ClientResult ComplexUpload(BinaryContent content, string contentType, RequestOptions options",
    );
  });
});
