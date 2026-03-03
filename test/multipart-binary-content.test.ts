import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the MultiPartFormDataBinaryContentFile infrastructure component.
 *
 * This file validates that the emitter conditionally generates
 * `MultiPartFormDataBinaryContent.cs` — a helper class that wraps
 * `MultipartFormDataContent` behind the `BinaryContent` abstraction
 * for use in the ClientPipeline send path.
 *
 * The file is generated ONLY when at least one operation uses
 * `multipart/form-data` content type. Without multipart operations,
 * the file must not appear in the output.
 */
describe("MultiPartFormDataBinaryContent", () => {
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

  const filePath = "src/Generated/Internal/MultiPartFormDataBinaryContent.cs";

  /**
   * Verifies the file is NOT generated when no multipart operations exist.
   * This is critical to avoid unnecessary infrastructure files in projects
   * that don't use multipart features.
   */
  it("is not generated when no multipart operations exist", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;

      op test(): void;
    `);

    const key = Object.keys(outputs).find((k) =>
      k.includes("MultiPartFormDataBinaryContent"),
    );
    expect(key).toBeUndefined();
  });

  /**
   * Verifies the file IS generated at the correct internal path when
   * a multipart operation exists. The path must match the legacy emitter's
   * convention: `src/Generated/Internal/MultiPartFormDataBinaryContent.cs`.
   */
  it("is generated at the correct path when multipart operations exist", async () => {
    const [{ outputs }] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);

    const key = Object.keys(outputs).find((k) =>
      k.includes("MultiPartFormDataBinaryContent"),
    );
    expect(key).toBeDefined();
    expect(key).toBe(filePath);
  });

  /**
   * Verifies the generated class declaration has the correct modifiers,
   * name, and base type. The class must be internal partial and inherit
   * from BinaryContent.
   */
  it("generates a class with correct declaration", async () => {
    const [{ outputs }] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);

    const content = outputs[filePath];
    expect(content).toBeDefined();
    expect(content).toContain(
      "internal partial class MultiPartFormDataBinaryContent : BinaryContent",
    );
  });

  /**
   * Verifies the class has the required using statements for its
   * dependencies (System.ClientModel, System.Net.Http, etc.).
   */
  it("includes required using statements", async () => {
    const [{ outputs }] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);

    const content = outputs[filePath];
    expect(content).toContain("using System;");
    expect(content).toContain("using System.ClientModel;");
    expect(content).toContain("using System.IO;");
    expect(content).toContain("using System.Net.Http;");
    expect(content).toContain("using System.Net.Http.Headers;");
    expect(content).toContain("using System.Threading;");
    expect(content).toContain("using System.Threading.Tasks;");
    expect(content).toContain("using System.Globalization;");
  });

  /**
   * Verifies the generated namespace matches the package name derived
   * from the TypeSpec service namespace.
   */
  it("uses the correct namespace", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace My.Custom.Service;

      op upload(
        @header contentType: "multipart/form-data",
        @multipartBody body: {
          name: HttpPart<string>;
        },
      ): void;
    `);

    const content = outputs[filePath];
    expect(content).toContain("namespace My.Custom.Service");
  });

  /**
   * Verifies the class contains Add method overloads for all supported types:
   * string, int, long, float, double, decimal, bool, Stream, byte[], BinaryData.
   * These overloads match the legacy emitter's MultiPartFormDataBinaryContentDefinition.
   */
  it("contains Add method overloads for all supported types", async () => {
    const [{ outputs }] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);

    const content = outputs[filePath];

    // All 10 public Add overloads must exist
    expect(content).toContain("public void Add(string content, string name,");
    expect(content).toContain("public void Add(int content, string name,");
    expect(content).toContain("public void Add(long content, string name,");
    expect(content).toContain("public void Add(float content, string name,");
    expect(content).toContain("public void Add(double content, string name,");
    expect(content).toContain("public void Add(decimal content, string name,");
    expect(content).toContain("public void Add(bool content, string name,");
    expect(content).toContain("public void Add(Stream content, string name,");
    expect(content).toContain("public void Add(byte[] content, string name,");
    expect(content).toContain(
      "public void Add(BinaryData content, string name,",
    );

    // Private Add(HttpContent, ...) delegation method
    expect(content).toContain(
      "private void Add(HttpContent content, string name,",
    );
  });

  /**
   * Verifies the class has the ContentType property, constructor,
   * and essential methods (TryComputeLength, WriteTo, WriteToAsync, Dispose).
   * These are required for the BinaryContent base class contract.
   */
  it("contains constructor, properties, and BinaryContent overrides", async () => {
    const [{ outputs }] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);

    const content = outputs[filePath];

    // Fields
    expect(content).toContain(
      "private readonly MultipartFormDataContent _multipartContent;",
    );
    expect(content).toContain("private static readonly Random _random");
    expect(content).toContain("private static readonly char[] _boundaryValues");

    // Properties
    expect(content).toContain("public string ContentType =>");
    expect(content).toContain("internal HttpContent HttpContent =>");

    // Constructor
    expect(content).toContain("public MultiPartFormDataBinaryContent()");
    expect(content).toContain("new MultipartFormDataContent(CreateBoundary())");

    // BinaryContent overrides
    expect(content).toContain(
      "public override bool TryComputeLength(out long length)",
    );
    expect(content).toContain(
      "public override void WriteTo(Stream stream, CancellationToken cancellationToken = default)",
    );
    expect(content).toContain(
      "public override async Task WriteToAsync(Stream stream, CancellationToken cancellationToken = default)",
    );
    expect(content).toContain("public override void Dispose()");

    // Static helper
    expect(content).toContain(
      "public static void AddContentTypeHeader(HttpContent content, string contentType)",
    );
  });

  /**
   * Verifies that WriteTo and WriteToAsync use #if NET6_0_OR_GREATER
   * preprocessor directives for platform-specific implementations.
   * NET6_0+ uses CopyTo/CopyToAsync with CancellationToken,
   * older frameworks use the non-cancellable overload.
   */
  it("has preprocessor directives in WriteTo methods", async () => {
    const [{ outputs }] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);

    const content = outputs[filePath];
    expect(content).toContain("#if NET6_0_OR_GREATER");
    expect(content).toContain("#else");
    expect(content).toContain("#endif");
  });

  /**
   * Verifies that numeric Add methods use CultureInfo.InvariantCulture
   * for formatting. This ensures consistent number formatting regardless
   * of the host machine's locale settings.
   */
  it("uses InvariantCulture for numeric formatting", async () => {
    const [{ outputs }] =
      await HttpTester.compileAndDiagnose(multipartTypeSpec);

    const content = outputs[filePath];
    expect(content).toContain("CultureInfo.InvariantCulture");
  });
});
