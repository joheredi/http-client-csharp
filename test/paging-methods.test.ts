import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the PagingMethods component
 * (src/components/clients/PagingMethods.tsx).
 *
 * These tests verify that the emitter generates correct paging client methods
 * on the client class. Each paging operation produces up to 4 methods:
 * sync/async × protocol/convenience.
 *
 * Why these tests matter:
 * - Paging methods are the primary SDK surface for consumers iterating over
 *   paginated API responses.
 * - The generated methods must return the correct CollectionResult / AsyncCollectionResult
 *   types (not ClientResult) and instantiate the correct collection result class.
 * - Protocol and convenience variants must have correct parameter signatures
 *   to distinguish the overloads (RequestOptions vs CancellationToken).
 * - Paging methods must NOT be generated as regular protocol/convenience methods
 *   (which would produce incorrect return types and bodies).
 */
describe("PagingMethods", () => {
  /**
   * Verifies that a simple paging operation generates all 4 client methods
   * (protocol sync/async + convenience sync/async) on the client class.
   * This is the foundational test — if paging methods aren't generated at all,
   * SDK consumers can't iterate over paginated responses.
   */
  it("generates paging methods on client for a simple paging operation", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        items: Thing[];
      }

      @route("/things")
      @list
      @get
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify protocol sync method returns CollectionResult (not ClientResult)
    expect(clientFile).toContain(
      "public virtual CollectionResult GetThings(RequestOptions options)",
    );

    // Verify protocol async method returns AsyncCollectionResult
    expect(clientFile).toContain(
      "public virtual async AsyncCollectionResult GetThingsAsync(RequestOptions options)",
    );

    // Verify convenience sync method returns CollectionResult<Thing>
    expect(clientFile).toContain(
      "public virtual CollectionResult<Thing> GetThings(CancellationToken cancellationToken = default)",
    );

    // Verify convenience async method returns AsyncCollectionResult<Thing>
    expect(clientFile).toContain(
      "public virtual async AsyncCollectionResult<Thing> GetThingsAsync(CancellationToken cancellationToken = default)",
    );
  });

  /**
   * Verifies that protocol paging method bodies instantiate the correct
   * collection result class with `this` and `options` arguments.
   * The body must NOT call Pipeline.ProcessMessage (that's for non-paging
   * protocol methods). Instead, it delegates to the collection result class
   * which handles the paging iteration internally.
   */
  it("protocol paging method body instantiates collection result class", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        items: Thing[];
      }

      @route("/things")
      @list
      @get
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];

    // Protocol sync body should instantiate sync collection result
    expect(clientFile).toContain(
      "return new TestServiceClientGetThingsCollectionResult(this, options);",
    );

    // Protocol async body should instantiate async collection result
    expect(clientFile).toContain(
      "return new TestServiceClientGetThingsAsyncCollectionResult(this, options);",
    );

    // Should NOT contain pipeline call pattern (that's for non-paging methods)
    // The paging methods delegate to collection result classes, not pipeline
    expect(clientFile).not.toContain(
      "using PipelineMessage message = CreateGetThingsRequest",
    );
  });

  /**
   * Verifies that convenience paging method bodies instantiate the typed
   * collection result class (OfT variant) with CancellationToken conversion.
   * The convenience method converts CancellationToken to RequestOptions
   * via the `.ToRequestOptions()` extension method.
   */
  it("convenience paging method body instantiates typed collection result class", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        items: Thing[];
      }

      @route("/things")
      @list
      @get
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];

    // Convenience sync body should instantiate OfT variant with ToRequestOptions
    expect(clientFile).toContain(
      "return new TestServiceClientGetThingsCollectionResultOfT(this, cancellationToken.ToRequestOptions());",
    );

    // Convenience async body should instantiate async OfT variant with ToRequestOptions
    expect(clientFile).toContain(
      "return new TestServiceClientGetThingsAsyncCollectionResultOfT(this, cancellationToken.ToRequestOptions());",
    );
  });

  /**
   * Verifies that protocol paging methods have correct XML documentation
   * following the [Protocol Method] format. XML docs enable IntelliSense
   * for SDK consumers and must include the protocol method link, parameter
   * descriptions, and exception documentation.
   */
  it("protocol paging methods have correct XML docs", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @doc("List all things")
      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        items: Thing[];
      }

      @route("/things")
      @list
      @get
      @doc("List things in the system")
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];

    // Verify [Protocol Method] tag in summary
    expect(clientFile).toContain("[Protocol Method] List things in the system");

    // Verify protocol method link
    expect(clientFile).toContain(
      'https://aka.ms/azsdk/net/protocol-methods">protocol method</see>',
    );

    // Verify options parameter doc
    expect(clientFile).toContain('<param name="options"> The request options');

    // Verify exception doc
    expect(clientFile).toContain(
      'cref="ClientResultException"> Service returned a non-success status code.',
    );
  });

  /**
   * Verifies that convenience paging methods have correct XML documentation
   * with summary, parameter descriptions, and exception docs. Unlike protocol
   * methods, convenience method docs do NOT have the [Protocol Method] prefix.
   */
  it("convenience paging methods have correct XML docs", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        items: Thing[];
      }

      @route("/things")
      @list
      @get
      @doc("List things in the system")
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];

    // Verify convenience method summary (without [Protocol Method] prefix)
    expect(clientFile).toContain(
      "/// <summary> List things in the system </summary>",
    );

    // Verify CancellationToken parameter doc
    expect(clientFile).toContain(
      '<param name="cancellationToken"> The cancellation token that can be used to cancel the operation. </param>',
    );
  });

  /**
   * Verifies that paging operations are NOT generated as regular protocol
   * or convenience methods. Before this component was added, paging methods
   * would be incorrectly generated with ClientResult return type and
   * Pipeline.ProcessMessage body. This test ensures the filter exclusion works.
   */
  it("does not generate regular protocol/convenience methods for paging operations", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        items: Thing[];
      }

      @route("/things")
      @list
      @get
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];

    // Should NOT have ClientResult return type for paging operations
    // (ClientResult is for non-paging protocol methods)
    expect(clientFile).not.toMatch(/public virtual ClientResult GetThings\(/);
    expect(clientFile).not.toMatch(
      /public virtual async Task<ClientResult> GetThingsAsync\(/,
    );
  });

  /**
   * Verifies that paging methods coexist correctly with regular (non-paging)
   * methods on the same client. The client class should have:
   * - Regular protocol/convenience methods for non-paging operations
   * - Paging-specific methods for paging operations
   * Each set uses the appropriate return types and body patterns.
   */
  it("paging methods coexist with regular methods on same client", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        items: Thing[];
      }

      @route("/things")
      @list
      @get
      op listThings(): PageThing;

      @route("/things/{id}")
      @get
      op getThing(@path id: string): Thing;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];

    // Paging operation: CollectionResult return type
    expect(clientFile).toContain(
      "public virtual CollectionResult GetThings(RequestOptions options)",
    );

    // Regular operation: ClientResult return type (via protocol method)
    expect(clientFile).toContain("public virtual ClientResult GetThing(");
  });

  /**
   * Verifies that the using directives for paging types are properly generated.
   * CollectionResult and AsyncCollectionResult live in System.ClientModel,
   * and CancellationToken lives in System.Threading. These usings must be
   * present for the generated code to compile.
   */
  it("generates correct using directives for paging types", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        items: Thing[];
      }

      @route("/things")
      @list
      @get
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];

    // CollectionResult/AsyncCollectionResult are in System.ClientModel
    expect(clientFile).toContain("using System.ClientModel;");

    // CancellationToken is in System.Threading
    expect(clientFile).toContain("using System.Threading;");
  });

  /**
   * Verifies that the cleanOperationName convention (List → Get) is applied
   * to paging method names. This ensures naming consistency between paging
   * methods and their corresponding request factory methods and collection
   * result class names.
   */
  it("applies cleanOperationName to paging method names", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        items: Thing[];
      }

      @route("/things")
      @list
      @get
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];

    // "list" operations get renamed to "Get" via cleanOperationName
    // "listThings" → "GetThings"
    expect(clientFile).toContain("GetThings(RequestOptions");
    expect(clientFile).toContain("GetThingsAsync(RequestOptions");

    // Should NOT have the raw "List" name
    expect(clientFile).not.toContain("ListThings(RequestOptions");
  });
});
