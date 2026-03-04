import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for LRO+Paging (lropaging) method generation.
 *
 * These tests verify that operations classified as `kind: "lropaging"` by TCGC
 * generate the same paging infrastructure as regular paging operations.
 *
 * For the System.ClientModel target (non-Azure), LRO does not affect the method
 * signature or return type — the paging pattern (CollectionResult / AsyncCollectionResult)
 * takes precedence. The LRO metadata is present on the method but does not change
 * the generated code shape.
 *
 * Why these tests matter:
 * - Operations can be both LRO and paging (e.g., a long-running batch operation
 *   that returns paginated results). The emitter must handle these correctly
 *   rather than silently dropping them.
 * - Before this implementation, "lropaging" operations were excluded from ALL
 *   method generators — no client methods or collection result classes were produced.
 * - These tests ensure that lropaging operations produce the same output as
 *   regular paging operations: CollectionResult return types, collection result
 *   classes, and correct method signatures.
 */
describe("LroPagingMethods", () => {
  /**
   * Verifies that an operation with both @markAsLro and @list decorators
   * (which TCGC classifies as kind "lropaging") generates all 4 paging client
   * methods: protocol sync/async + convenience sync/async.
   *
   * This is the foundational test for lropaging support. If this fails,
   * lropaging operations produce no client methods at all.
   */
  it("generates paging methods for lropaging operation", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      model PagedItems {
        @pageItems
        items: Item[];
      }

      @route("/batch-items")
      @list
      @get
      @markAsLro
      op listBatchItems(): PagedItems;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol sync method returns CollectionResult (paging return type, not ClientResult)
    expect(clientFile).toContain(
      "public virtual CollectionResult GetBatchItems(RequestOptions options)",
    );

    // Protocol async method returns AsyncCollectionResult (no async keyword —
    // AsyncCollectionResult is not Task-based; the method just returns a new instance)
    expect(clientFile).toContain(
      "public virtual AsyncCollectionResult GetBatchItemsAsync(RequestOptions options)",
    );

    // Convenience sync method returns CollectionResult<Item>
    expect(clientFile).toContain(
      "public virtual CollectionResult<Item> GetBatchItems(CancellationToken cancellationToken = default)",
    );

    // Convenience async method returns AsyncCollectionResult<Item> (no async keyword —
    // AsyncCollectionResult<T> is not Task-based; the method just returns a new instance)
    expect(clientFile).toContain(
      "public virtual AsyncCollectionResult<Item> GetBatchItemsAsync(",
    );
    expect(clientFile).toContain(
      "CancellationToken cancellationToken = default",
    );
  });

  /**
   * Verifies that lropaging protocol method bodies instantiate collection
   * result classes (not Pipeline.ProcessMessage). This confirms the method
   * follows the paging pattern of delegating to a collection result iterator.
   */
  it("lropaging protocol method body instantiates collection result class", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      model PagedItems {
        @pageItems
        items: Item[];
      }

      @route("/batch-items")
      @list
      @get
      @markAsLro
      op listBatchItems(): PagedItems;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];

    // Protocol sync body instantiates sync collection result
    expect(clientFile).toContain(
      "return new TestServiceClientGetBatchItemsCollectionResult(this, options);",
    );

    // Protocol async body instantiates async collection result
    expect(clientFile).toContain(
      "return new TestServiceClientGetBatchItemsAsyncCollectionResult(this, options);",
    );

    // Should NOT use Pipeline.ProcessMessage (that's for basic/lro methods)
    expect(clientFile).not.toContain(
      "using PipelineMessage message = CreateGetBatchItemsRequest",
    );
  });

  /**
   * Verifies that lropaging operations are NOT generated as regular protocol
   * or convenience methods. The filters in ProtocolMethod.tsx and
   * ConvenienceMethod.tsx must exclude "lropaging" (which they already do).
   *
   * This ensures no duplicate methods with incorrect return types (ClientResult)
   * are generated alongside the correct paging methods (CollectionResult).
   */
  it("does not generate regular protocol/convenience methods for lropaging operations", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      model PagedItems {
        @pageItems
        items: Item[];
      }

      @route("/batch-items")
      @list
      @get
      @markAsLro
      op listBatchItems(): PagedItems;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];

    // Should NOT have ClientResult return type (that's for basic/lro methods)
    expect(clientFile).not.toMatch(
      /public virtual ClientResult GetBatchItems\(/,
    );
    expect(clientFile).not.toMatch(
      /public virtual async Task<ClientResult> GetBatchItemsAsync\(/,
    );
  });

  /**
   * Verifies that lropaging operations generate collection result source files.
   * Each lropaging operation should produce 4 collection result class files,
   * the same as regular paging operations.
   */
  it("generates collection result files for lropaging operations", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      model PagedItems {
        @pageItems
        items: Item[];
      }

      @route("/batch-items")
      @list
      @get
      @markAsLro
      op listBatchItems(): PagedItems;
    `);
    expect(diagnostics).toHaveLength(0);

    // Verify collection result files are generated
    const syncProtocol =
      outputs[
        "src/Generated/CollectionResults/TestServiceClientGetBatchItemsCollectionResult.cs"
      ];
    const asyncProtocol =
      outputs[
        "src/Generated/CollectionResults/TestServiceClientGetBatchItemsAsyncCollectionResult.cs"
      ];
    const syncConvenience =
      outputs[
        "src/Generated/CollectionResults/TestServiceClientGetBatchItemsCollectionResultOfT.cs"
      ];
    const asyncConvenience =
      outputs[
        "src/Generated/CollectionResults/TestServiceClientGetBatchItemsAsyncCollectionResultOfT.cs"
      ];

    expect(syncProtocol).toBeDefined();
    expect(asyncProtocol).toBeDefined();
    expect(syncConvenience).toBeDefined();
    expect(asyncConvenience).toBeDefined();

    // Verify protocol sync extends CollectionResult
    expect(syncProtocol).toContain(
      "class TestServiceClientGetBatchItemsCollectionResult : CollectionResult",
    );

    // Verify protocol async extends AsyncCollectionResult
    expect(asyncProtocol).toContain(
      "class TestServiceClientGetBatchItemsAsyncCollectionResult : AsyncCollectionResult",
    );
  });

  /**
   * Verifies that lropaging operations coexist correctly with regular (non-paging,
   * non-LRO) operations and regular paging operations on the same client.
   * The client should generate appropriate method types for each operation kind.
   */
  it("lropaging methods coexist with regular and paging methods on same client", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core.Legacy;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      model PagedItems {
        @pageItems
        items: Item[];
      }

      // Regular operation
      @route("/items/{id}")
      @get
      op getItem(@path id: string): Item;

      // Regular paging operation
      @route("/items")
      @list
      @get
      op listItems(): PagedItems;

      // LRO+paging operation
      @route("/batch-items")
      @list
      @get
      @markAsLro
      op listBatchItems(): PagedItems;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];

    // Regular operation: ClientResult return type
    expect(clientFile).toContain("public virtual ClientResult GetItem(");

    // Regular paging: CollectionResult return type
    expect(clientFile).toContain(
      "public virtual CollectionResult GetItems(RequestOptions options)",
    );

    // LRO+paging: CollectionResult return type (same as paging)
    expect(clientFile).toContain(
      "public virtual CollectionResult GetBatchItems(RequestOptions options)",
    );
  });
});
