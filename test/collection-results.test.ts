import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the CollectionResultFile component
 * (src/components/collection-results/CollectionResultFile.tsx).
 *
 * These tests verify that the emitter generates correct C# collection result
 * classes for paging operations. Each paging operation produces 4 files:
 * sync/async × protocol/convenience.
 *
 * Why these tests matter:
 * - Collection result classes are the core paging abstraction for SDK consumers.
 * - Incorrect class structure would break pagination iteration patterns.
 * - The generated classes must extend the correct SCM base types and implement
 *   the required methods (GetRawPages, GetContinuationToken, GetValuesFromPage).
 */
describe("CollectionResultFile", () => {
  /**
   * Verifies that a simple paging operation (single page, no next-link or
   * continuation token) generates all 4 collection result file variants.
   * This validates the core component structure, class naming, and file paths.
   */
  it("generates 4 collection result files for a simple paging operation", async () => {
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

    // List all output files for debugging
    const collectionResultFiles = Object.keys(outputs).filter((k) =>
      k.includes("CollectionResults"),
    );

    // Should generate exactly 4 collection result files
    expect(collectionResultFiles).toHaveLength(4);
  });

  /**
   * Verifies the sync protocol collection result class structure.
   * This is the simplest variant: extends CollectionResult (non-generic),
   * has GetRawPages with single yield return, and GetContinuationToken returning null.
   */
  it("generates correct sync protocol collection result", async () => {
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

    // Find the sync protocol file
    const fileName = Object.keys(outputs).find(
      (k) =>
        k.includes("CollectionResult.cs") &&
        !k.includes("Async") &&
        !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify class declaration extends CollectionResult
    expect(content).toContain(": CollectionResult");
    expect(content).not.toContain(": CollectionResult<");

    // Verify internal partial class
    expect(content).toContain("internal partial class");

    // Verify fields
    expect(content).toContain("private readonly TestServiceClient _client;");
    expect(content).toContain("private readonly RequestOptions _options;");

    // Verify constructor
    expect(content).toContain(
      "TestServiceClient client, RequestOptions options",
    );
    expect(content).toContain("_client = client;");
    expect(content).toContain("_options = options;");

    // Verify GetRawPages method signature
    expect(content).toContain(
      "public override IEnumerable<ClientResult> GetRawPages()",
    );

    // Verify single-page yield return pattern
    expect(content).toContain("PipelineMessage message = _client.Create");
    expect(content).toContain("Request(_options);");
    expect(content).toContain(
      "yield return ClientResult.FromResponse(_client.Pipeline.ProcessMessage(message, _options));",
    );

    // Verify GetContinuationToken returns null (single page)
    expect(content).toContain(
      "public override ContinuationToken GetContinuationToken(ClientResult page)",
    );
    expect(content).toContain("return null;");

    // Verify using directives
    expect(content).toContain("using System.ClientModel;");
    expect(content).toContain("using System.ClientModel.Primitives;");
    expect(content).toContain("using System.Collections.Generic;");

    // Verify namespace
    expect(content).toContain("namespace TestService");
  });

  /**
   * Verifies the sync convenience (OfT) collection result class.
   * This variant extends CollectionResult<T> and adds GetValuesFromPage
   * to extract typed items from the page response via a cast.
   */
  it("generates correct sync convenience collection result with GetValuesFromPage", async () => {
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

    // Find the sync convenience file (OfT, not Async)
    const fileName = Object.keys(outputs).find(
      (k) => k.includes("CollectionResultOfT.cs") && !k.includes("Async"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify generic base type
    expect(content).toContain(": CollectionResult<Thing>");

    // Verify GetValuesFromPage method
    expect(content).toContain(
      "protected override IEnumerable<Thing> GetValuesFromPage(ClientResult page)",
    );
    expect(content).toContain("((PageThing)page).Items");
  });

  /**
   * Verifies the async protocol collection result class.
   * This variant extends AsyncCollectionResult and uses GetRawPagesAsync
   * with async/await and ProcessMessageAsync.
   */
  it("generates correct async protocol collection result", async () => {
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

    // Find the async protocol file
    const fileName = Object.keys(outputs).find(
      (k) => k.includes("AsyncCollectionResult.cs") && !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify class extends AsyncCollectionResult
    expect(content).toContain(": AsyncCollectionResult");
    expect(content).not.toContain(": AsyncCollectionResult<");

    // Verify async GetRawPagesAsync
    expect(content).toContain(
      "public override async IAsyncEnumerable<ClientResult> GetRawPagesAsync()",
    );

    // Verify async pipeline call
    expect(content).toContain("await _client.Pipeline.ProcessMessageAsync");
    expect(content).toContain(".ConfigureAwait(false)");
  });

  /**
   * Verifies the async convenience (OfT) collection result class.
   * This variant extends AsyncCollectionResult<T> and adds GetValuesFromPageAsync
   * with foreach/yield return/await Task.Yield() pattern.
   */
  it("generates correct async convenience collection result with GetValuesFromPageAsync", async () => {
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

    // Find the async convenience file
    const fileName = Object.keys(outputs).find((k) =>
      k.includes("AsyncCollectionResultOfT.cs"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify generic async base type
    expect(content).toContain(": AsyncCollectionResult<Thing>");

    // Verify async GetValuesFromPageAsync
    expect(content).toContain(
      "protected override async IAsyncEnumerable<Thing> GetValuesFromPageAsync(ClientResult page)",
    );

    // Verify foreach + yield return + await Task.Yield() pattern
    expect(content).toContain(
      "foreach (Thing item in ((PageThing)page).Items)",
    );
    expect(content).toContain("yield return item;");
    expect(content).toContain("await Task.Yield();");

    // Verify using System.Threading.Tasks
    expect(content).toContain("using System.Threading.Tasks;");
  });

  /**
   * Verifies that non-paging operations do NOT generate collection result files.
   * This ensures the component correctly filters for paging methods only.
   */
  it("does not generate collection result files for non-paging operations", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const collectionResultFiles = Object.keys(outputs).filter((k) =>
      k.includes("CollectionResults"),
    );
    expect(collectionResultFiles).toHaveLength(0);
  });

  /**
   * Verifies XML doc comments are generated on the constructor, GetRawPages,
   * GetContinuationToken, and GetValuesFromPage methods.
   */
  it("generates XML doc comments on all members", async () => {
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

    // Check sync protocol file for doc comments
    const fileName = Object.keys(outputs).find(
      (k) =>
        k.includes("CollectionResult.cs") &&
        !k.includes("Async") &&
        !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Constructor doc
    expect(content).toContain("/// <summary> Initializes a new instance of");
    expect(content).toContain(
      "which is used to iterate over the pages of a collection",
    );

    // GetRawPages doc
    expect(content).toContain(
      "/// <summary> Gets the raw pages of the collection. </summary>",
    );
    expect(content).toContain(
      "/// <returns> The raw pages of the collection. </returns>",
    );

    // GetContinuationToken doc
    expect(content).toContain(
      "/// <summary> Gets the continuation token from the specified page. </summary>",
    );
  });

  /**
   * Verifies that next-link paging generates a while(true) loop in GetRawPages.
   *
   * When a paging response model has a @nextLink property, the GetRawPages method
   * must iterate pages by:
   * 1. Sending the initial request
   * 2. Yielding each ClientResult page
   * 3. Extracting the next-link URI from the response model
   * 4. Checking for null (yield break to terminate)
   * 5. Creating a new request with CreateNext{Op}Request
   *
   * This validates the core next-link paging loop pattern for the sync protocol variant.
   */
  it("generates next-link paging loop in sync protocol GetRawPages", async () => {
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

        @nextLink
        nextLink?: url;
      }

      @route("/things")
      @list
      @get
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    // Find the sync protocol file
    const fileName = Object.keys(outputs).find(
      (k) =>
        k.includes("CollectionResult.cs") &&
        !k.includes("Async") &&
        !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify the while(true) loop structure
    expect(content).toContain("while (true)");

    // Verify initial request creation
    expect(content).toContain(
      "PipelineMessage message = _client.CreateGetThingsRequest(_options);",
    );

    // Verify nextPageUri variable declaration
    expect(content).toContain("Uri nextPageUri = null;");

    // Verify result assignment and yield return
    expect(content).toContain(
      "ClientResult result = ClientResult.FromResponse(_client.Pipeline.ProcessMessage(message, _options));",
    );
    expect(content).toContain("yield return result;");

    // Verify next-link extraction from response model
    expect(content).toContain("nextPageUri = ((PageThing)result).NextLink;");

    // Verify null check termination
    expect(content).toContain("if (nextPageUri == null)");
    expect(content).toContain("yield break;");

    // Verify next request creation
    expect(content).toContain(
      "message = _client.CreateNextGetThingsRequest(nextPageUri, _options);",
    );

    // Verify using System; for Uri type
    expect(content).toContain("using System;");
  });

  /**
   * Verifies that next-link paging generates the correct async while-loop pattern.
   *
   * The async variant must use ProcessMessageAsync with ConfigureAwait(false)
   * and the method must be marked async with IAsyncEnumerable return type.
   * All other loop logic (URI extraction, null check, next request) is identical.
   */
  it("generates next-link paging loop in async protocol GetRawPagesAsync", async () => {
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

        @nextLink
        nextLink?: url;
      }

      @route("/things")
      @list
      @get
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    // Find the async protocol file
    const fileName = Object.keys(outputs).find(
      (k) => k.includes("AsyncCollectionResult.cs") && !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify async method signature
    expect(content).toContain(
      "public override async IAsyncEnumerable<ClientResult> GetRawPagesAsync()",
    );

    // Verify async pipeline call
    expect(content).toContain(
      "await _client.Pipeline.ProcessMessageAsync(message, _options).ConfigureAwait(false)",
    );

    // Verify the while-loop structure
    expect(content).toContain("while (true)");
    expect(content).toContain("nextPageUri = ((PageThing)result).NextLink;");
    expect(content).toContain("if (nextPageUri == null)");
    expect(content).toContain("yield break;");
    expect(content).toContain(
      "message = _client.CreateNextGetThingsRequest(nextPageUri, _options);",
    );
  });

  /**
   * Verifies that next-link paging generates a proper GetContinuationToken body.
   *
   * When next-link segments are present, GetContinuationToken must:
   * 1. Cast the page to the response model and extract the next-link URI
   * 2. If non-null, return ContinuationToken.FromBytes(BinaryData.FromString(...))
   *    using IsAbsoluteUri/AbsoluteUri/OriginalString for URI serialization
   * 3. If null, return null
   *
   * This validates the ContinuationToken creation pattern that enables pagination resumption.
   */
  it("generates next-link GetContinuationToken with URI extraction", async () => {
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

        @nextLink
        nextLink?: url;
      }

      @route("/things")
      @list
      @get
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    // Check the sync protocol file for GetContinuationToken
    const fileName = Object.keys(outputs).find(
      (k) =>
        k.includes("CollectionResult.cs") &&
        !k.includes("Async") &&
        !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify next-link extraction in GetContinuationToken
    expect(content).toContain("Uri nextPage = ((PageThing)page).NextLink;");

    // Verify null check and ContinuationToken creation
    expect(content).toContain("if (nextPage != null)");
    expect(content).toContain(
      "ContinuationToken.FromBytes(BinaryData.FromString(",
    );
    expect(content).toContain(
      "nextPage.IsAbsoluteUri ? nextPage.AbsoluteUri : nextPage.OriginalString",
    );

    // Verify fallback return null
    expect(content).toContain("return null;");
  });

  /**
   * Verifies that next-link convenience variant still generates GetValuesFromPage
   * alongside the next-link GetRawPages loop.
   *
   * The convenience (OfT) variant must have both:
   * - The while(true) next-link loop in GetRawPages
   * - The GetValuesFromPage method that extracts typed items from the page
   */
  it("generates next-link convenience variant with both paging loop and GetValuesFromPage", async () => {
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

        @nextLink
        nextLink?: url;
      }

      @route("/things")
      @list
      @get
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    // Find the sync convenience file
    const fileName = Object.keys(outputs).find(
      (k) => k.includes("CollectionResultOfT.cs") && !k.includes("Async"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify base type is generic
    expect(content).toContain(": CollectionResult<Thing>");

    // Verify next-link while loop is present
    expect(content).toContain("while (true)");
    expect(content).toContain("nextPageUri = ((PageThing)result).NextLink;");

    // Verify GetValuesFromPage is also present
    expect(content).toContain(
      "protected override IEnumerable<Thing> GetValuesFromPage(ClientResult page)",
    );
    expect(content).toContain("((PageThing)page).Items");
  });

  /**
   * Verifies that body-based continuation-token paging generates the correct
   * while(true) loop in sync protocol GetRawPages.
   *
   * When a paging response model has a @continuationToken property in the body,
   * the GetRawPages method must:
   * 1. Call Create{Op}Request with the stored token field (_token) initially
   * 2. Extract the next token from the response body via a cast
   * 3. Check string.IsNullOrEmpty for termination (not null check like next-link)
   * 4. Re-invoke the SAME Create{Op}Request with the extracted nextToken
   *
   * This validates the core body-based continuation-token paging loop.
   */
  it("generates body-based continuation-token paging loop in sync protocol GetRawPages", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        things: Thing[];

        @continuationToken
        nextToken?: string;
      }

      @route("/things")
      @list
      @get
      op listThings(@query @continuationToken token?: string): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    // Find the sync protocol file
    const fileName = Object.keys(outputs).find(
      (k) =>
        k.includes("CollectionResult.cs") &&
        !k.includes("Async") &&
        !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify the _token field is stored
    expect(content).toContain("private readonly string _token;");

    // Verify constructor accepts token parameter
    expect(content).toContain("TestServiceClient client,");
    expect(content).toContain("string token,");
    expect(content).toContain("RequestOptions options");
    expect(content).toContain("_token = token;");

    // Verify initial request uses stored _token
    expect(content).toContain(
      "PipelineMessage message = _client.CreateGetThingsRequest(_token, _options);",
    );

    // Verify while(true) loop
    expect(content).toContain("while (true)");

    // Verify token extraction from response body
    expect(content).toContain("nextToken = ((PageThing)result).NextToken;");

    // Verify string.IsNullOrEmpty check (not null check like next-link)
    expect(content).toContain("if (string.IsNullOrEmpty(nextToken))");
    expect(content).toContain("yield break;");

    // Verify same Create{Op}Request is re-invoked with nextToken (not a CreateNext method)
    expect(content).toContain(
      "message = _client.CreateGetThingsRequest(nextToken, _options);",
    );

    // Verify constructor doc includes token param
    expect(content).toContain('/// <param name="token"></param>');
  });

  /**
   * Verifies that body-based continuation-token paging generates the correct
   * async while(true) loop in GetRawPagesAsync.
   *
   * The async variant must use ProcessMessageAsync with ConfigureAwait(false)
   * and the method must be marked async with IAsyncEnumerable return type.
   * Token extraction and loop logic should match the sync variant.
   */
  it("generates body-based continuation-token paging loop in async protocol GetRawPagesAsync", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        things: Thing[];

        @continuationToken
        nextToken?: string;
      }

      @route("/things")
      @list
      @get
      op listThings(@query @continuationToken token?: string): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    // Find the async protocol file
    const fileName = Object.keys(outputs).find(
      (k) => k.includes("AsyncCollectionResult.cs") && !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify async method signature
    expect(content).toContain(
      "public override async IAsyncEnumerable<ClientResult> GetRawPagesAsync()",
    );

    // Verify async pipeline call
    expect(content).toContain(
      "await _client.Pipeline.ProcessMessageAsync(message, _options).ConfigureAwait(false)",
    );

    // Verify token field and constructor
    expect(content).toContain("private readonly string _token;");
    expect(content).toContain("_token = token;");

    // Verify continuation-token loop structure
    expect(content).toContain("while (true)");
    expect(content).toContain("nextToken = ((PageThing)result).NextToken;");
    expect(content).toContain("if (string.IsNullOrEmpty(nextToken))");

    // Verify same request method is re-used (not CreateNext)
    expect(content).toContain(
      "message = _client.CreateGetThingsRequest(nextToken, _options);",
    );
  });

  /**
   * Verifies that body-based continuation-token generates the correct
   * GetContinuationToken method body.
   *
   * When continuation token segments are from the body, GetContinuationToken must:
   * 1. Cast the page to the response model and extract the token string
   * 2. If !string.IsNullOrEmpty, return ContinuationToken.FromBytes(BinaryData.FromString(...))
   * 3. Otherwise return null (via if/else pattern, not if/return like next-link)
   */
  it("generates body-based continuation-token GetContinuationToken", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        things: Thing[];

        @continuationToken
        nextToken?: string;
      }

      @route("/things")
      @list
      @get
      op listThings(@query @continuationToken token?: string): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    // Check the sync protocol file
    const fileName = Object.keys(outputs).find(
      (k) =>
        k.includes("CollectionResult.cs") &&
        !k.includes("Async") &&
        !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify string extraction from response body
    expect(content).toContain("string nextPage = ((PageThing)page).NextToken;");

    // Verify !string.IsNullOrEmpty check
    expect(content).toContain("if (!string.IsNullOrEmpty(nextPage))");

    // Verify ContinuationToken creation
    expect(content).toContain(
      "ContinuationToken.FromBytes(BinaryData.FromString(nextPage))",
    );

    // Verify else branch returns null
    expect(content).toContain("else");
    expect(content).toContain("return null;");
  });

  /**
   * Verifies that body-based continuation-token convenience variant generates
   * both the paging loop and GetValuesFromPage method.
   *
   * The OfT variant must have the while(true) continuation-token loop in GetRawPages
   * AND the GetValuesFromPage method that extracts typed items via a response cast.
   */
  it("generates body-based continuation-token convenience variant with GetValuesFromPage", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        things: Thing[];

        @continuationToken
        nextToken?: string;
      }

      @route("/things")
      @list
      @get
      op listThings(@query @continuationToken token?: string): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    // Find the sync convenience file
    const fileName = Object.keys(outputs).find(
      (k) => k.includes("CollectionResultOfT.cs") && !k.includes("Async"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify generic base type
    expect(content).toContain(": CollectionResult<Thing>");

    // Verify continuation-token while loop is present
    expect(content).toContain("while (true)");
    expect(content).toContain("nextToken = ((PageThing)result).NextToken;");
    expect(content).toContain("if (string.IsNullOrEmpty(nextToken))");

    // Verify GetValuesFromPage is also present
    expect(content).toContain(
      "protected override IEnumerable<Thing> GetValuesFromPage(ClientResult page)",
    );
    expect(content).toContain("((PageThing)page).Things");

    // Verify token field and constructor
    expect(content).toContain("private readonly string _token;");
    expect(content).toContain("_token = token;");
  });

  /**
   * Verifies that header-based continuation-token paging generates the correct
   * GetRawPages loop with response header extraction.
   *
   * When the continuation token comes from a response header (not body),
   * the extraction uses result.GetRawResponse().Headers.TryGetValue() instead
   * of a response model property cast. The termination and extraction are
   * combined into a single if/else block.
   */
  it("generates header-based continuation-token paging loop", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        things: Thing[];
      }

      @route("/things")
      @list
      @get
      op listThings(
        @query @continuationToken token?: string,
      ): PageThing & {
        @header("next-token") @continuationToken nextToken?: string;
      };
    `);
    expect(diagnostics).toHaveLength(0);

    // Find the sync protocol file
    const fileName = Object.keys(outputs).find(
      (k) =>
        k.includes("CollectionResult.cs") &&
        !k.includes("Async") &&
        !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify header-based extraction using TryGetValue
    expect(content).toContain(
      'result.GetRawResponse().Headers.TryGetValue("next-token", out string value)',
    );

    // Verify combined extraction + termination check
    expect(content).toContain("!string.IsNullOrEmpty(value)");

    // Verify nextToken assignment from header value
    expect(content).toContain("nextToken = value;");

    // Verify else branch with yield break
    expect(content).toContain("else");
    expect(content).toContain("yield break;");

    // Verify same request method is re-used
    expect(content).toContain(
      "message = _client.CreateGetThingsRequest(nextToken, _options);",
    );

    // Verify token field and constructor
    expect(content).toContain("private readonly string _token;");
    expect(content).toContain("_token = token;");
  });

  /**
   * Verifies that header-based continuation-token generates the correct
   * GetContinuationToken method body with header extraction.
   *
   * When the token comes from a response header, GetContinuationToken uses
   * page.GetRawResponse().Headers.TryGetValue() instead of a response model cast.
   */
  it("generates header-based continuation-token GetContinuationToken", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems
        things: Thing[];
      }

      @route("/things")
      @list
      @get
      op listThings(
        @query @continuationToken token?: string,
      ): PageThing & {
        @header("next-token") @continuationToken nextToken?: string;
      };
    `);
    expect(diagnostics).toHaveLength(0);

    // Check the sync protocol file
    const fileName = Object.keys(outputs).find(
      (k) =>
        k.includes("CollectionResult.cs") &&
        !k.includes("Async") &&
        !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Verify header-based extraction in GetContinuationToken
    expect(content).toContain(
      'page.GetRawResponse().Headers.TryGetValue("next-token", out string value)',
    );
    expect(content).toContain("!string.IsNullOrEmpty(value)");

    // Verify ContinuationToken creation from header value
    expect(content).toContain(
      "ContinuationToken.FromBytes(BinaryData.FromString(value))",
    );

    // Verify else branch returns null
    expect(content).toContain("else");
    expect(content).toContain("return null;");
  });

  /**
   * Verifies that when a client is named "ContinuationToken", the generated
   * collection result files use the fully-qualified name
   * `global::System.ClientModel.ContinuationToken` for the SCM type to avoid
   * ambiguity with the client class of the same name. Without this, the C#
   * compiler resolves `ContinuationToken` to the client class instead of the
   * SCM ContinuationToken type, causing compile errors in overrides and static calls.
   */
  it("uses fully-qualified ContinuationToken when client is named ContinuationToken", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Pet {
        id: string;
        name: string;
      }

      @route("/continuation")
      namespace ContinuationToken {
        @route("/list")
        @list
        op listItems(@continuationToken @query token?: string): {
          @pageItems pets: Pet[];
          @continuationToken nextToken?: string;
        };
      }
    `);
    expect(diagnostics).toHaveLength(0);

    // Find a collection result file with the ContinuationToken conflict
    const fileName = Object.keys(outputs).find(
      (k) =>
        k.includes("CollectionResults/ContinuationToken") &&
        k.includes("CollectionResult.cs") &&
        !k.includes("Async") &&
        !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // The class name should use immediate client name (not full hierarchy)
    expect(content).toContain(
      "internal partial class ContinuationTokenGetItems",
    );

    // The return type and static call must use global:: FQN
    expect(content).toContain(
      "public override global::System.ClientModel.ContinuationToken GetContinuationToken",
    );
    expect(content).toContain(
      "global::System.ClientModel.ContinuationToken.FromBytes",
    );

    // The client field should still use the unqualified client class name
    expect(content).toContain("private readonly ContinuationToken _client;");
  });

  /**
   * Verifies that when a client is NOT named "ContinuationToken", the generated
   * collection result files use the unqualified `ContinuationToken` name
   * (via the normal Alloy refkey resolution with `using System.ClientModel;`).
   */
  it("uses unqualified ContinuationToken when client has no naming conflict", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Thing {
        name: string;
      }

      model PageThing {
        @pageItems items: Thing[];
        @nextLink nextLink?: url;
      }

      @route("/things")
      @list
      @get
      op listThings(): PageThing;
    `);
    expect(diagnostics).toHaveLength(0);

    const fileName = Object.keys(outputs).find(
      (k) =>
        k.includes("CollectionResult.cs") &&
        !k.includes("Async") &&
        !k.includes("OfT"),
    );
    expect(fileName).toBeDefined();
    const content = outputs[fileName!];

    // Should use unqualified name (no conflict)
    expect(content).toContain(
      "public override ContinuationToken GetContinuationToken",
    );
    expect(content).not.toContain("global::System.ClientModel.ContinuationToken");
  });
});
