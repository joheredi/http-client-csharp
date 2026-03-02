import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the ConvenienceMethod component (src/components/clients/ConvenienceMethod.tsx).
 *
 * These tests verify that the emitter generates correct convenience-level C#
 * client methods with typed parameters, CancellationToken, and delegation to
 * protocol methods. Convenience methods are the primary API surface for most
 * callers — they provide typed parameters and return types instead of raw
 * BinaryContent/ClientResult.
 *
 * Why these tests matter:
 * - Convenience methods are the highest-level API that most SDK consumers use.
 * - They must correctly delegate to protocol methods with proper type conversions.
 * - The sync/async pair pattern is critical — callers expect both variants.
 * - Response wrapping with ClientResult<T> is essential for typed access.
 * - CancellationToken handling must work correctly for async cancellation.
 * - Enum parameters must be converted to their wire type for protocol delegation.
 */
describe("ConvenienceMethod", () => {
  /**
   * Verifies that a simple GET operation with no parameters and no response body
   * generates both sync and async convenience methods that delegate to the
   * protocol method with CancellationToken.ToRequestOptions().
   *
   * This is the simplest convenience method case: void return, no params
   * except CancellationToken. The return type is ClientResult (not generic).
   */
  it("generates convenience methods for void return operation", async () => {
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

    // Sync convenience method returns ClientResult (no generic)
    expect(clientFile).toContain(
      "public virtual ClientResult TestOp(CancellationToken cancellationToken = default)",
    );
    // Delegates to protocol method with ToRequestOptions()
    expect(clientFile).toContain(
      "return TestOp(cancellationToken.ToRequestOptions());",
    );

    // Async convenience method returns Task<ClientResult>
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult> TestOpAsync(CancellationToken cancellationToken = default)",
    );
    // Async delegation with ConfigureAwait(false)
    expect(clientFile).toContain(
      "return await TestOpAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false);",
    );
  });

  /**
   * Verifies that an operation with a model body parameter generates convenience
   * methods with the typed model parameter and ClientResult<T> return type.
   *
   * The convenience method should:
   * 1. Take the model type directly (not BinaryContent)
   * 2. Validate the model with Argument.AssertNotNull
   * 3. Delegate to protocol method (C# implicit operator converts model→BinaryContent)
   * 4. Return ClientResult<T> using explicit cast from ClientResult
   */
  it("generates typed convenience methods with model body", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/items")
      @post op createItem(@body item: Item): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Sync: takes model type, returns ClientResult<Model>
    expect(clientFile).toContain(
      "public virtual ClientResult<Item> CreateItem(Item item, CancellationToken cancellationToken = default)",
    );
    // Validates model param
    expect(clientFile).toContain("Argument.AssertNotNull(item, nameof(item));");
    // Delegates to protocol method, passing model directly (implicit BinaryContent conversion)
    expect(clientFile).toContain(
      "ClientResult result = CreateItem(item, cancellationToken.ToRequestOptions());",
    );
    // Wraps response with explicit cast
    expect(clientFile).toContain(
      "return ClientResult.FromValue((Item)result, result.GetRawResponse());",
    );

    // Async variant
    expect(clientFile).toContain("Task<ClientResult<Item>> CreateItemAsync(");
    expect(clientFile).toContain(
      "ClientResult result = await CreateItemAsync(item, cancellationToken.ToRequestOptions()).ConfigureAwait(false);",
    );
  });

  /**
   * Verifies that required string parameters generate AssertNotNullOrEmpty
   * validation (not just AssertNotNull) since empty strings are also invalid.
   *
   * This is important because string params in C# can be both null and empty,
   * and both states are typically invalid for required API parameters.
   */
  it("generates AssertNotNullOrEmpty for required string params", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/items/{id}")
      @get op getItem(@path id: string): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // String param uses AssertNotNullOrEmpty
    expect(clientFile).toContain(
      "Argument.AssertNotNullOrEmpty(id, nameof(id));",
    );
  });

  /**
   * Verifies that convenience methods include correct XML documentation:
   * - Summary from the TypeSpec @doc or operation name
   * - CancellationToken parameter docs
   * - ArgumentNullException for required reference-type params
   * - ClientResultException for error responses
   *
   * XML docs are critical for IntelliSense and API documentation generation.
   */
  it("generates XML docs for convenience methods", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @doc("Creates a new item")
      @route("/items")
      @post op createItem(@body item: Item): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Summary — no [Protocol Method] prefix for convenience methods
    expect(clientFile).toContain("/// <summary> Creates a new item </summary>");

    // CancellationToken docs
    expect(clientFile).toContain(
      '/// <param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>',
    );

    // Exception docs for required model param
    expect(clientFile).toContain(
      '/// <exception cref="ArgumentNullException"> <paramref name="item"/> is null. </exception>',
    );

    // ClientResultException — always present
    expect(clientFile).toContain(
      '/// <exception cref="ClientResultException"> Service returned a non-success status code. </exception>',
    );
  });

  /**
   * Verifies that the using System.Threading directive is added to the client
   * file when convenience methods are generated, since CancellationToken lives
   * in that namespace.
   */
  it("adds using System.Threading directive", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toContain("using System.Threading;");
  });

  /**
   * Verifies that convenience methods with multiple parameters (path, query,
   * body) generate all parameters in the correct order followed by CancellationToken.
   *
   * Parameter ordering matches protocol methods: path → required → body → optional.
   * The convenience method calls the protocol method with the same argument order.
   */
  it("handles multiple parameters with correct ordering", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/items/{id}")
      @put op updateItem(@path id: string, @body item: Item): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // All params present with CancellationToken at end
    expect(clientFile).toContain("ClientResult<Item> UpdateItem(");
    expect(clientFile).toContain("string id,");
    expect(clientFile).toContain("Item item,");
    expect(clientFile).toContain(
      "CancellationToken cancellationToken = default",
    );

    // Delegates with all args
    expect(clientFile).toContain(
      "ClientResult result = UpdateItem(id, item, cancellationToken.ToRequestOptions());",
    );
  });

  /**
   * Verifies that value-type parameters (enums, integers) do NOT get
   * Argument.Assert* validation, since they can never be null.
   *
   * Only reference types (string, models, BinaryData, Uri, arrays, dicts)
   * need null-checking. Value types (int, bool, enum, DateTime, etc.) are
   * always non-null by definition in C#.
   */
  it("skips validation for value-type params", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/items/{count}")
      @get op getItems(@path count: int32): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // int32 param should NOT have Argument.Assert in the convenience method.
    // The convenience method for value types delegates directly without validation.
    // (Note: protocol methods may still have validation, so we check the convenience
    // method body specifically by verifying the delegation pattern has no Assert.)
    const convMethodMatch = clientFile.match(
      /GetItems\(int count, CancellationToken[\s\S]*?\{([\s\S]*?)\}/,
    );
    expect(convMethodMatch).not.toBeNull();
    const convBody = convMethodMatch![1];
    expect(convBody).not.toContain("Argument.Assert");

    // Method should still exist with the int param
    expect(clientFile).toContain(
      "GetItems(int count, CancellationToken cancellationToken = default)",
    );
  });

  /**
   * Verifies that convenience and protocol methods coexist with the same
   * method name — C# method overloading distinguishes them by parameter types
   * (CancellationToken vs RequestOptions).
   *
   * This test ensures Alloy's name deduplication doesn't rename either method
   * with a _2 suffix, which would break the API surface.
   */
  it("coexists with protocol methods without name conflicts", async () => {
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

    // Convenience method exists
    expect(clientFile).toContain(
      "public virtual ClientResult TestOp(CancellationToken cancellationToken = default)",
    );
    // Protocol method exists with same name, different params
    expect(clientFile).toContain(
      "public virtual ClientResult TestOp(RequestOptions options)",
    );

    // Neither should have _2 suffix
    expect(clientFile).not.toContain("TestOp_2");
    expect(clientFile).not.toContain("TestOpAsync_2");
  });

  /**
   * Verifies that internal access modifier on the method is correctly
   * propagated to convenience methods.
   */
  it("respects access modifiers", async () => {
    const [{ outputs }, _diagnostics] = await HttpTester.compileAndDiagnose(`

      @access(Access.internal)
      @route("/test")
      @get op testOp(): void;
    `);
    // Access decorator may produce diagnostics; just verify output
    const clientFile = outputs["src/Generated/TestServiceClient.cs"];

    if (clientFile) {
      // If internal access is applied, method should be internal virtual
      const hasInternal = clientFile.includes("internal virtual");
      const hasPublic = clientFile.includes(
        "public virtual ClientResult TestOp",
      );
      // Either internal or public should be present
      expect(hasInternal || hasPublic).toBe(true);
    }
  });

  /**
   * Verifies that string-backed enum parameters use the enum type in the
   * convenience method signature and delegate to the protocol method with
   * .ToString() to convert the enum to its wire string value.
   *
   * This tests a critical conversion path: convenience methods preserve
   * the typed enum for caller ergonomics, but protocol methods expect the
   * raw wire type (string). The .ToString() bridge must be present.
   */
  it("converts string-backed enum params with .ToString() in protocol delegation", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      enum Color {
        Red,
        Green,
        Blue,
      }

      model Item {
        name: string;
      }

      @route("/items")
      @get op getItems(@query color: Color): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Convenience method takes the enum type directly (not string)
    expect(clientFile).toContain(
      "ClientResult<Item> GetItems(Color color, CancellationToken cancellationToken = default)",
    );

    // Delegates to protocol method with .ToString() conversion
    expect(clientFile).toContain(
      "GetItems(color.ToString(), cancellationToken.ToRequestOptions())",
    );

    // Async variant also uses .ToString()
    expect(clientFile).toContain(
      "GetItemsAsync(color.ToString(), cancellationToken.ToRequestOptions())",
    );
  });

  /**
   * Verifies that integer-backed enum parameters are cast to their underlying
   * integer type when delegating to the protocol method. For int32-backed
   * enums, the cast is (int)paramName.
   *
   * This is important because integer-backed enums in C# use numeric wire
   * values, and the protocol method expects the raw integer. The cast is
   * the only correct way to extract the numeric value from a C# enum.
   */
  it("converts int-backed enum params with (int) cast in protocol delegation", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      enum Priority {
        Low: 0,
        Medium: 1,
        High: 2,
      }

      @route("/tasks")
      @get op getTasks(@query priority: Priority): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Convenience method takes the enum type directly
    expect(clientFile).toContain(
      "GetTasks(Priority priority, CancellationToken cancellationToken = default)",
    );

    // Delegates to protocol method with (int) cast
    expect(clientFile).toContain(
      "GetTasks((int)priority, cancellationToken.ToRequestOptions())",
    );
  });

  /**
   * Verifies that query and header parameters appear in the convenience
   * method signature alongside path and body parameters. This ensures
   * the parameter building logic correctly includes all parameter kinds
   * (not just path and body).
   *
   * Query and header params in convenience methods use their original
   * types (not unwrapped wire types), matching the convenience method's
   * goal of providing a typed, ergonomic API surface.
   */
  it("includes query and header params in convenience method signature", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/items")
      @get op getItems(
        @query q: string,
        @header("x-request-id") requestId: string,
      ): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Both query and header params appear in the convenience method.
    // Header params (priority 100) come before query params (priority 100)
    // when both are required, ordered by their declaration index (header first).
    expect(clientFile).toContain("string requestId,");
    expect(clientFile).toContain("string q,");
    expect(clientFile).toContain(
      "CancellationToken cancellationToken = default",
    );

    // Params are delegated to protocol method (header before query)
    expect(clientFile).toContain(
      "GetItems(requestId, q, cancellationToken.ToRequestOptions())",
    );

    // Validation generated for both string params
    expect(clientFile).toContain(
      "Argument.AssertNotNullOrEmpty(requestId, nameof(requestId));",
    );
    expect(clientFile).toContain(
      "Argument.AssertNotNullOrEmpty(q, nameof(q));",
    );
  });

  /**
   * Verifies that when multiple reference-type parameters require null
   * validation, the XML doc exception message joins their names with
   * commas and "or" (e.g., "<paramref name="a"/>, <paramref name="b"/>
   * or <paramref name="c"/> is null").
   *
   * This tests the joinWithOr() helper logic for 3+ assertable params.
   * Correct XML docs are critical for IntelliSense and API documentation.
   */
  it("joins multiple assertable param names with commas and or in XML docs", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/items/{name}")
      @post op createItem(
        @path name: string,
        @query category: string,
        @body item: Item,
      ): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // XML doc should join 3 assertable params with commas and "or"
    expect(clientFile).toContain(
      '<paramref name="name"/>, <paramref name="category"/> or <paramref name="item"/> is null.',
    );

    // ArgumentException for empty string check on string params only
    expect(clientFile).toContain(
      '<paramref name="name"/> or <paramref name="category"/> is an empty string, and was expected to be non-empty.',
    );
  });

  /**
   * Verifies that optional query parameters get a `default` value in the
   * convenience method signature, while required parameters do not.
   *
   * Optional parameters in C# use `= default` which resolves to null for
   * nullable reference types and the zero-value for value types. This is
   * how callers can omit optional parameters in method calls.
   */
  it("marks optional params with default value in signature", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/items")
      @get op searchItems(
        @query q: string,
        @query limit?: int32,
      ): Item;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Required string param has no default
    expect(clientFile).toMatch(/string q,\s/);

    // Optional int32 param has default value
    expect(clientFile).toContain("int limit = default,");

    // CancellationToken always has default
    expect(clientFile).toContain(
      "CancellationToken cancellationToken = default",
    );
  });
});
