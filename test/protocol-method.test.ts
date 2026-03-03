import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the ProtocolMethod component (src/components/clients/ProtocolMethod.tsx).
 *
 * These tests verify that the emitter generates correct protocol-level C#
 * client methods with sync/async pairs, XML documentation, parameter validation,
 * and the correct Pipeline.ProcessMessage invocation pattern.
 *
 * Why these tests matter:
 * - Protocol methods are the low-level API surface for advanced consumers who
 *   need direct control over HTTP requests and responses.
 * - Incorrect method signatures, missing validation, or wrong ProcessMessage
 *   calls would make the generated SDK unusable for these scenarios.
 * - The sync/async pair pattern is critical — callers expect both variants.
 * - XML docs with [Protocol Method] tag help consumers discover these methods.
 */
describe("ProtocolMethod", () => {
  /**
   * Verifies that a simple GET operation with no parameters produces both
   * sync and async protocol methods with the correct structure.
   *
   * This is the simplest protocol method case: no path/query/header params,
   * no body, just RequestOptions. Validates the core pattern:
   * - Method signature: public virtual [async] {ClientResult|Task<ClientResult>}
   * - Body: using PipelineMessage + ProcessMessage + ClientResult.FromResponse
   */
  it("generates sync and async protocol methods for simple GET", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify sync protocol method
    expect(clientFile).toContain(
      "public virtual ClientResult TestOp(RequestOptions options)",
    );
    expect(clientFile).toContain(
      "using PipelineMessage message = CreateTestOpRequest(options);",
    );
    expect(clientFile).toContain(
      "return ClientResult.FromResponse(Pipeline.ProcessMessage(message, options));",
    );

    // Verify async protocol method
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult> TestOpAsync(RequestOptions options)",
    );
    expect(clientFile).toContain(
      "return ClientResult.FromResponse(await Pipeline.ProcessMessageAsync(message, options).ConfigureAwait(false));",
    );
  });

  /**
   * Verifies that a POST operation with a body parameter generates protocol
   * methods that take BinaryContent and validate it with Argument.AssertNotNull.
   *
   * Body parameters are converted to BinaryContent in protocol methods,
   * allowing callers to pass raw request content. The body is always validated
   * as non-null since the service expects request content.
   */
  it("generates protocol methods with body parameter validation", async () => {
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

    // Verify body parameter becomes BinaryContent
    expect(clientFile).toContain(
      "public virtual ClientResult CreateItem(BinaryContent content, RequestOptions options",
    );

    // Verify Argument.AssertNotNull for BinaryContent
    expect(clientFile).toContain(
      "Argument.AssertNotNull(content, nameof(content));",
    );
  });

  /**
   * Verifies that required string parameters produce both
   * AssertNotNullOrEmpty validation and proper exception documentation.
   *
   * String parameters use AssertNotNullOrEmpty (not just AssertNotNull)
   * because the service would reject empty strings. The XML docs must include
   * both ArgumentNullException and ArgumentException for these params.
   */
  it("generates AssertNotNullOrEmpty for required string params", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/items/{id}")
      @get op getItem(@path id: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify string param uses AssertNotNullOrEmpty
    expect(clientFile).toContain(
      "Argument.AssertNotNullOrEmpty(id, nameof(id));",
    );

    // Verify method signature includes the string param
    expect(clientFile).toContain(
      "public virtual ClientResult GetItem(string id, RequestOptions options)",
    );

    // Verify XML doc has ArgumentNullException
    expect(clientFile).toContain(
      '/// <exception cref="ArgumentNullException"> <paramref name="id"/> is null. </exception>',
    );

    // Verify XML doc has ArgumentException for empty string
    expect(clientFile).toContain(
      '/// <exception cref="ArgumentException"> <paramref name="id"/> is an empty string, and was expected to be non-empty. </exception>',
    );
  });

  /**
   * Verifies that protocol methods include the standard [Protocol Method]
   * XML documentation with the Azure SDK protocol method link.
   *
   * The [Protocol Method] tag in the summary helps consumers identify
   * protocol methods vs. convenience methods. The protocol method link
   * provides documentation on when and how to use them.
   */
  it("generates XML docs with [Protocol Method] tag", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify [Protocol Method] summary prefix
    expect(clientFile).toContain("/// [Protocol Method]");

    // Verify protocol method link
    expect(clientFile).toContain(
      '<see href="https://aka.ms/azsdk/net/protocol-methods">protocol method</see>',
    );

    // Verify ClientResultException doc
    expect(clientFile).toContain(
      '/// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>',
    );

    // Verify returns doc
    expect(clientFile).toContain(
      "/// <returns> The response returned from the service. </returns>",
    );

    // Verify options param doc
    expect(clientFile).toContain(
      '/// <param name="options"> The request options, which can override default behaviors of the client pipeline on a per-call basis. </param>',
    );
  });

  /**
   * Verifies that optional parameters get default values and that
   * RequestOptions gets = null when optional params are present.
   *
   * This ensures callers can omit optional parameters and RequestOptions
   * in their method calls. Without defaults, C# would require all params.
   */
  it("generates defaults for optional parameters", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/items")
      @get op listItems(@query optionalFilter?: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify optional param gets default
    expect(clientFile).toContain("string optionalFilter = default");

    // Verify RequestOptions gets = null when optional params exist
    expect(clientFile).toContain("RequestOptions options = null");
  });

  /**
   * Verifies that protocol methods work correctly with multiple parameter
   * types (path, header, query, body) and the parameter ordering is correct.
   *
   * The parameter order must match the CreateRequest method to ensure
   * arguments are passed correctly: path → required → body → optional → options.
   */
  it("generates protocol methods with mixed parameter types", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/items/{id}")
      @put op updateItem(
        @path id: string,
        @header requiredHeader: string,
        @body body: Item,
        @query optionalTag?: string,
      ): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify parameter order: path → required header → body → optional → options
    // The exact method signature should have all params in correct order
    expect(clientFile).toContain("public virtual ClientResult UpdateItem(");
    expect(clientFile).toContain("string id");
    expect(clientFile).toContain("string requiredHeader");
    expect(clientFile).toContain("BinaryContent content");

    // Verify both AssertNotNullOrEmpty (strings) and AssertNotNull (content)
    expect(clientFile).toContain(
      "Argument.AssertNotNullOrEmpty(id, nameof(id));",
    );
    expect(clientFile).toContain(
      "Argument.AssertNotNullOrEmpty(requiredHeader, nameof(requiredHeader));",
    );
    expect(clientFile).toContain(
      "Argument.AssertNotNull(content, nameof(content));",
    );

    // Verify CreateRequest call includes all params
    expect(clientFile).toContain("CreateUpdateItemRequest(");

    // Verify XML exception docs list multiple params
    expect(clientFile).toContain('<paramref name="id"/>');
    expect(clientFile).toContain('<paramref name="requiredHeader"/>');
    expect(clientFile).toContain('<paramref name="content"/>');
  });

  /**
   * Verifies that the using statement pattern for PipelineMessage is correct.
   *
   * The `using PipelineMessage message = ...` pattern ensures the HTTP
   * message is properly disposed after use. Without the using declaration,
   * there would be a resource leak on every API call.
   */
  it("uses 'using' declaration for PipelineMessage", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify using declaration for PipelineMessage (sync)
    expect(clientFile).toContain(
      "using PipelineMessage message = CreateTestOpRequest(options);",
    );

    // Both sync and async should use 'using' declaration
    const usingCount = (
      clientFile.match(/using PipelineMessage message = /g) || []
    ).length;
    expect(usingCount).toBe(2); // one for sync, one for async
  });

  /**
   * Verifies that async protocol methods use ConfigureAwait(false) on the
   * ProcessMessageAsync call, which is required for library code to avoid
   * deadlocks in synchronization contexts.
   */
  it("uses ConfigureAwait(false) in async methods", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // ConfigureAwait(false) is required for library code
    expect(clientFile).toContain(".ConfigureAwait(false)");
  });

  /**
   * Verifies that the using directive for System.Threading.Tasks is added
   * when async protocol methods are generated, since Task<T> requires it.
   */
  it("adds using System.Threading.Tasks directive", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Task<ClientResult> requires this using
    expect(clientFile).toContain("using System.Threading.Tasks;");
  });

  /**
   * Verifies that array query parameters use IEnumerable<T> in the protocol
   * method signature instead of T[] or flattened string.
   *
   * Collection parameters must use IEnumerable<T> — the broadest input
   * interface — to match the legacy emitter pattern. The Spector golden files
   * (parameters/collection-format) confirm this. Without this fix, collection
   * params would render as "string" (the default fallback), making the method
   * signature incorrect and causing compilation errors in consumer code.
   */
  it("generates IEnumerable<string> for array query parameters", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/items")
      @get op listItems(@query colors: string[]): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol method param should be IEnumerable<string>, not string[] or string
    expect(clientFile).toContain("IEnumerable<string> colors");

    // Should have the using directive for System.Collections.Generic
    expect(clientFile).toContain("using System.Collections.Generic;");

    // Argument.AssertNotNull for the collection param (reference type)
    expect(clientFile).toContain(
      "Argument.AssertNotNull(colors, nameof(colors));",
    );
  });
});
