import { describe, expect, it } from "vitest";
import { AzureHttpTester } from "./test-host.js";

/**
 * Tests for the AzurePageableFile component
 * (src/components/collection-results/AzurePageableFile.tsx).
 *
 * These tests verify that Azure-flavored paging operations generate
 * Pageable<T>/AsyncPageable<T> collection result classes instead of
 * CollectionResult/AsyncCollectionResult (used for unbranded).
 *
 * Why these tests matter:
 * - Azure SDK paging uses Azure.Core's Pageable<T>/AsyncPageable<T> base classes
 *   with AsPages() method, NOT System.ClientModel's CollectionResult with GetRawPages().
 * - The generated classes must include DiagnosticScope for distributed tracing.
 * - Protocol variants use Pageable<BinaryData>, convenience use Pageable<T>.
 * - Constructor must chain to base with CancellationToken via `: base(...)`.
 * - The paging methods on the client must return Pageable/AsyncPageable types.
 */
describe("AzurePageableFile", () => {
  /**
   * Verifies that an Azure-flavored paging operation generates 4 collection
   * result files extending the correct Azure.Core base types, and the client
   * methods return Pageable<BinaryData>/AsyncPageable<BinaryData> (protocol)
   * and Pageable<Thing>/AsyncPageable<Thing> (convenience).
   *
   * This is the foundational test — validates the core Azure paging pattern.
   */
  it("generates Azure Pageable classes for a simple paging operation", async () => {
    const [{ outputs }, diagnostics] = await AzureHttpTester.compileAndDiagnose(`
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

    // Verify 4 collection result files are generated
    const collectionResultFiles = Object.keys(outputs).filter((k) =>
      k.includes("CollectionResults"),
    );
    expect(collectionResultFiles).toHaveLength(4);

    // --- Sync protocol: extends Pageable<BinaryData> ---
    const syncProtocol =
      outputs[
        "src/Generated/CollectionResults/TestServiceClientGetThingsCollectionResult.cs"
      ];
    expect(syncProtocol).toBeDefined();
    expect(syncProtocol).toContain(": Pageable<BinaryData>");
    expect(syncProtocol).toContain(
      "public override IEnumerable<Page<BinaryData>> AsPages(",
    );
    expect(syncProtocol).toContain("Page<BinaryData>.FromValues(");
    expect(syncProtocol).toContain("DiagnosticScope scope");
    expect(syncProtocol).toContain(
      ": base(context?.CancellationToken ?? default)",
    );

    // --- Async protocol: extends AsyncPageable<BinaryData> ---
    const asyncProtocol =
      outputs[
        "src/Generated/CollectionResults/TestServiceClientGetThingsAsyncCollectionResult.cs"
      ];
    expect(asyncProtocol).toBeDefined();
    expect(asyncProtocol).toContain(": AsyncPageable<BinaryData>");
    expect(asyncProtocol).toContain(
      "public override async IAsyncEnumerable<Page<BinaryData>> AsPages(",
    );
    expect(asyncProtocol).toContain(
      "await GetNextResponseAsync(pageSizeHint",
    );
    expect(asyncProtocol).toContain("DiagnosticScope scope");

    // --- Sync convenience: extends Pageable<Thing> ---
    const syncConvenience =
      outputs[
        "src/Generated/CollectionResults/TestServiceClientGetThingsCollectionResultOfT.cs"
      ];
    expect(syncConvenience).toBeDefined();
    // Thing is in Models sub-namespace, so the type reference may include the namespace prefix
    expect(syncConvenience).toContain(": Pageable<");
    expect(syncConvenience).toContain("Page<");
    expect(syncConvenience).toContain(".FromValues(");
    // Convenience uses IReadOnlyList<T> cast (no ModelReaderWriter serialization)
    expect(syncConvenience).toContain("IReadOnlyList<");

    // --- Async convenience: extends AsyncPageable<Thing> ---
    const asyncConvenience =
      outputs[
        "src/Generated/CollectionResults/TestServiceClientGetThingsAsyncCollectionResultOfT.cs"
      ];
    expect(asyncConvenience).toBeDefined();
    expect(asyncConvenience).toContain(": AsyncPageable<");
    expect(asyncConvenience).toContain("IReadOnlyList<");
  });

  /**
   * Verifies that Azure paging client methods return Pageable<BinaryData> /
   * AsyncPageable<BinaryData> for protocol and Pageable<T> / AsyncPageable<T>
   * for convenience, NOT CollectionResult / AsyncCollectionResult.
   *
   * This is critical — using the wrong return types breaks Azure SDK consumers.
   */
  it("client methods return Azure Pageable types instead of CollectionResult", async () => {
    const [{ outputs }, diagnostics] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        id: int32;
      }

      model PageItem {
        @pageItems
        items: Item[];
      }

      @route("/items")
      @list
      @get
      op listItems(): PageItem;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol methods return Pageable<BinaryData> / AsyncPageable<BinaryData>
    expect(clientFile).toContain(
      "public virtual Pageable<BinaryData> GetItems(RequestContext options)",
    );
    expect(clientFile).toContain(
      "public virtual AsyncPageable<BinaryData> GetItemsAsync(RequestContext options)",
    );

    // Convenience methods return Pageable<Item> / AsyncPageable<Item>
    // (Item is in Models sub-namespace, so the type reference includes the namespace prefix)
    expect(clientFile).toContain(
      "public virtual Pageable<Models.Item> GetItems(CancellationToken cancellationToken = default)",
    );
    expect(clientFile).toContain(
      "public virtual AsyncPageable<Models.Item> GetItemsAsync(CancellationToken cancellationToken = default)",
    );

    // Return types must be Azure Pageable/AsyncPageable, NOT System.ClientModel CollectionResult.
    // The internal class names still use "CollectionResult" suffix (that's just naming convention).
    expect(clientFile).not.toMatch(
      /public virtual CollectionResult[^O]/,
    );
    expect(clientFile).not.toMatch(
      /public virtual AsyncCollectionResult[^O]/,
    );
  });

  /**
   * Verifies that the next-link paging strategy generates correct AsPages
   * body with URI extraction, while(true) loop, and null-check termination.
   *
   * Next-link is the most common Azure paging pattern (azure/payload/pageable,
   * azure/core/basic, etc.) and must work correctly.
   */
  it("generates next-link paging strategy in AsPages body", async () => {
    const [{ outputs }, diagnostics] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      model WidgetPage {
        @pageItems
        items: Widget[];

        @nextLink
        nextLink?: url;
      }

      @route("/widgets")
      @list
      @get
      op listWidgets(): WidgetPage;
    `);
    expect(diagnostics).toHaveLength(0);

    // Check the sync protocol file for next-link strategy
    const syncFile =
      outputs[
        "src/Generated/CollectionResults/TestServiceClientGetWidgetsCollectionResult.cs"
      ];
    expect(syncFile).toBeDefined();

    // Next-link strategy: starts with null Uri, enters while(true) loop
    expect(syncFile).toContain("Uri nextPage = continuationToken != null");
    expect(syncFile).toContain("while (true)");

    // Extracts next link from response model
    expect(syncFile).toContain("NextLink");

    // GetNextResponse uses initial request or next request based on nextLink
    expect(syncFile).toContain("CreateNextGetWidgetsRequest");
    expect(syncFile).toContain("CreateGetWidgetsRequest");
  });

  /**
   * Verifies that the GetNextResponse method includes DiagnosticScope for
   * distributed tracing, which is required for all Azure SDK operations.
   *
   * Without DiagnosticScope, Azure telemetry (Application Insights, etc.)
   * cannot track paging operation latency and failures.
   */
  it("includes DiagnosticScope in GetNextResponse for tracing", async () => {
    const [{ outputs }, diagnostics] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      model PageWidget {
        @pageItems
        items: Widget[];
      }

      @route("/widgets")
      @list
      @get
      op listWidgets(): PageWidget;
    `);
    expect(diagnostics).toHaveLength(0);

    const syncFile =
      outputs[
        "src/Generated/CollectionResults/TestServiceClientGetWidgetsCollectionResult.cs"
      ];
    expect(syncFile).toBeDefined();

    // DiagnosticScope pattern: create, start, try/catch with Failed
    expect(syncFile).toContain("ClientDiagnostics.CreateScope(");
    expect(syncFile).toContain("scope.Start()");
    expect(syncFile).toContain("scope.Failed(e)");
    expect(syncFile).toContain("throw;");
  });
});
