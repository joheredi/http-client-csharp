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

  /**
   * Verifies that dictionary (Record<T>) path parameters use IDictionary<string, T>
   * in protocol method signatures instead of falling back to string.
   *
   * Why this test matters:
   * - Before this fix, dict types in getProtocolTypeExpression fell through to the
   *   default case returning "string". This caused a mismatch between convenience
   *   methods (IDictionary<string, int>) and protocol methods (string), leading to
   *   CS1503 compilation errors when the convenience method called the protocol method.
   * - The protocol method must accept the same dict type so overload resolution works.
   */
  it("generates IDictionary<string, T> for dict path parameters", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/items/{param}")
      @get op getItem(@path param: Record<int32>): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol method param should be IDictionary<string, int>, not string
    expect(clientFile).toContain("IDictionary<string, int> param");

    // Should have the using directive for System.Collections.Generic
    expect(clientFile).toContain("using System.Collections.Generic;");

    // Dict params are reference types → need assertion
    expect(clientFile).toContain(
      "Argument.AssertNotNull(param, nameof(param));",
    );
  });

  /**
   * Verifies that dictionary (Record<T>) query parameters use IDictionary<string, T>
   * in protocol method signatures.
   *
   * Why this test matters:
   * - Query parameters with dict types had the same bug as path parameters —
   *   getProtocolTypeExpression returned "string" instead of IDictionary<string, T>.
   * - Both protocol and convenience methods must agree on the type for C# overload
   *   resolution to work correctly.
   */
  it("generates IDictionary<string, T> for dict query parameters", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/items")
      @get op listItems(@query param: Record<int32>): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol method param should be IDictionary<string, int>, not string
    expect(clientFile).toContain("IDictionary<string, int> param");

    // Should have the using directive for System.Collections.Generic
    expect(clientFile).toContain("using System.Collections.Generic;");
  });

  /**
   * Verifies that multiline @doc text on parameters produces valid XML doc
   * comments where every continuation line starts with `///` in protocol methods.
   *
   * Why this test matters:
   * - Protocol method XML doc blocks include parameter descriptions from @doc.
   *   If these span multiple lines, continuation lines must have `///` prefix
   *   or the generated C# won't compile.
   * - The [Protocol Method] summary description could also be multiline.
   */
  it("formats multiline @doc parameter descriptions with /// on each line", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op test(
        @doc("""
          A long description that spans multiple lines because
          it contains detailed information about the parameter
          and its expected usage.
          """)
        @query detail: string,
      ): void;
    `);
    expect(diagnostics).toHaveLength(0);
    const clientFile = Object.values(outputs).find((o) =>
      o.includes("class TestServiceClient\n"),
    )!;
    // Each continuation line in the param doc must start with ///
    expect(clientFile).toContain("/// it contains detailed");
    expect(clientFile).toContain("/// and its expected");
    // Must NOT have bare continuation lines without ///
    expect(clientFile).not.toMatch(/\n\s+it contains/);
  });

  /**
   * Verifies that OASIS repeatability headers (Repeatability-Request-ID and
   * Repeatability-First-Sent) are excluded from protocol method signatures.
   *
   * These headers are auto-populated at runtime and must not be exposed to
   * SDK consumers. The protocol method should only take RequestOptions.
   */
  it("excludes repeatability headers from protocol method signatures", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @post op testOp(
        @header("Repeatability-Request-ID") repeatabilityRequestID: string,
        @header("Repeatability-First-Sent") repeatabilityFirstSent: utcDateTime,
      ): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol method signature should only have RequestOptions
    expect(clientFile).toContain("TestOp(RequestOptions options)");
    expect(clientFile).toContain("TestOpAsync(RequestOptions options)");

    // No repeatability params in the protocol methods
    expect(clientFile).not.toContain("repeatabilityRequestID");
    expect(clientFile).not.toContain("repeatabilityRequestId");
    expect(clientFile).not.toContain("repeatabilityFirstSent");
  });

  /**
   * Validates that C# reserved keyword parameter names are escaped with `@` prefix.
   *
   * This is critical because TypeSpec specs (e.g., special-words) can define
   * parameters named `and`, `as`, `class`, `for`, `return`, etc. These are
   * C# reserved keywords and produce syntax errors if emitted without `@`:
   *   `string class` → CS1001 syntax error
   *   `string @class` → valid C#
   *
   * The fix requires escaping in THREE places:
   * 1. Parameter declarations (via name policy in `<Parameter>` component)
   * 2. Argument lists in method body (e.g., `CreateRequest(@class, options)`)
   * 3. Validation statements (e.g., `Argument.AssertNotNullOrEmpty(@class, nameof(@class))`)
   */
  it("escapes C# reserved keyword parameter names with @ prefix", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test/{class}")
      @get op testOp(@path \`class\`: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Parameter declaration must use @class (escaped keyword)
    expect(clientFile).toContain("string @class, RequestOptions options");

    // Argument list in method body must use @class
    expect(clientFile).toContain("CreateTestOpRequest(@class, options)");

    // Validation must use @class
    expect(clientFile).toContain(
      "Argument.AssertNotNullOrEmpty(@class, nameof(@class))",
    );

    // RestClient method should also have @class in parameter
    const restClientFile =
      outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClientFile).toBeDefined();
    expect(restClientFile).toContain("string @class");
  });

  /**
   * Validates that hyphenated HTTP header parameter names are converted to valid
   * camelCase C# identifiers in protocol method bodies.
   *
   * Protocol methods use raw string interpolation for argument lists passed to
   * CreateXxxRequest() and Argument.Assert* validation. Without applying the
   * C# naming policy, a header like `x-ms-test-header` would appear as-is,
   * which C# interprets as `x - ms - test - header` (subtraction), causing
   * CS0103 errors for each segment.
   *
   * This test ensures the naming policy is applied consistently in:
   * - Parameter declarations (handled by Alloy's Method component)
   * - Validation statements (raw string in method body)
   * - CreateXxxRequest argument list (raw string in method body)
   * - XML documentation
   */
  it("converts hyphenated header param names to camelCase in protocol methods", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test/{id}")
      @get op testOp(@path id: string, @header("x-ms-test-header") xMsTestHeader: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol method parameter declaration uses camelCase
    expect(clientFile).toContain("string xMsTestHeader");

    // Validation uses camelCase name
    expect(clientFile).toContain(
      "Argument.AssertNotNullOrEmpty(xMsTestHeader, nameof(xMsTestHeader))",
    );

    // CreateRequest call uses camelCase name
    expect(clientFile).toContain("CreateTestOpRequest(id, xMsTestHeader,");

    // No raw hyphenated name should appear as an identifier
    expect(clientFile).not.toMatch(/\bx-ms-test-header\b/);

    // XML doc param reference uses camelCase name
    expect(clientFile).toContain('<param name="xMsTestHeader">');
  });

  /**
   * Verifies that optional path parameters do NOT get `= default` in protocol
   * method signatures (to avoid overload ambiguity with convenience methods)
   * but also do NOT get Argument.Assert* validation.
   *
   * Protocol methods must keep `string name` (required signature) while the
   * convenience method has `string name = default`. This prevents CS0121
   * ambiguity errors when calling the method with a single argument.
   */
  it("generates optional path params without default value and no assertion in protocol methods", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/things{/name}")
      @get op getOptional(@path name?: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"] ?? "";

    // Protocol method must NOT have = default for path param (avoids overload ambiguity)
    expect(clientFile).toContain(
      "string name, RequestOptions options",
    );

    // No assertion in protocol method for optional path params
    // Find protocol method bodies (after "RequestOptions options")
    const protocolSections = clientFile.split("RequestOptions options)");
    // Check each protocol method body
    for (let i = 1; i < protocolSections.length; i++) {
      const body = protocolSections[i].slice(0, protocolSections[i].indexOf("}"));
      expect(body).not.toContain("Argument.AssertNotNullOrEmpty");
      expect(body).not.toContain("Argument.AssertNotNull");
    }
  });
});
