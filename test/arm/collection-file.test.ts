/**
 * Unit tests for ARM Collection class generation (CollectionFile component).
 *
 * These tests validate that the emitter generates correct `{Resource}Collection.cs`
 * files for detected ARM resources. The ground truth is BazCollection.cs from the
 * Mgmt-TypeSpec test project.
 *
 * Tests verify:
 * - Collection class extends ArmCollection, implements IEnumerable<T> and IAsyncEnumerable<T>
 * - Fields: ClientDiagnostics and REST client
 * - Constructors: mock (protected) and main (internal) with ValidateResourceId
 * - CreateOrUpdate: LRO with WaitUntil, OperationFinalStateVia.AzureAsyncOperation
 * - Get: standard operation returning Response<Resource>
 * - GetAll: AsyncPageable/Pageable with PageableWrapper
 * - Exists: Pipeline.Send with 200/404 switch returning Response<bool>
 * - GetIfExists: Pipeline.Send with NullableResponse/NoValueResponse
 * - Enumerator implementations delegating to GetAll/GetAllAsync
 * - Correct using directives
 * - No unresolved symbol references
 *
 * @module
 */
import { describe, expect, it } from "vitest";
import { MgmtTester, MgmtApiTester } from "../test-host.js";

/**
 * MgmtTester with new detection mode enabled to properly detect
 * LRO operations (CreateOrUpdate) and List operations.
 * Legacy detection does not detect LRO operations (see knowledge.md).
 */
const NewDetectionTester = MgmtApiTester.emit("http-client-csharp", {
  flavor: "azure",
  management: true,
  "use-legacy-resource-detection": false,
}).importLibraries();

/**
 * TypeSpec fixture for a tracked ARM resource with CRUD + List operations.
 * Models a ResourceGroup-scoped resource matching the BazCollection ground truth.
 * Includes List operation to test GetAll generation.
 */
const trackedResourceWithListSpec = `
  using TypeSpec.Rest;
  using TypeSpec.Http;
  using TypeSpec.Versioning;
  using Azure.ResourceManager;

  @armProviderNamespace
  @service(#{title: "MgmtTypeSpec"})
  @versioned(Versions)
  namespace MgmtTypeSpec;

  enum Versions {
    v2024_05_01: "2024-05-01",
  }

  interface Operations extends Azure.ResourceManager.Operations {}

  model BazProperties {
    description?: string;
  }

  model Baz is TrackedResource<BazProperties> {
    ...ResourceNameParameter<Baz>;
  }

  @armResourceOperations
  interface Bazs {
    get is ArmResourceRead<Baz>;
    createOrUpdate is ArmResourceCreateOrReplaceAsync<Baz>;
    update is ArmResourcePatchSync<Baz, BazProperties>;
    delete is ArmResourceDeleteSync<Baz>;
    list is ArmResourceListByParent<Baz>;
  }
`;

describe("ARM Collection class generation", () => {
  /**
   * Validates that the emitter generates a BazCollection.cs file.
   * This is the primary existence check for task 19.2b.
   */
  it("generates a Collection class file for a tracked ARM resource", async () => {
    const [{ outputs }, diagnostics] =
      await NewDetectionTester.compileAndDiagnose(trackedResourceWithListSpec);
    const errors = diagnostics.filter((d) => d.code !== "deprecated");
    expect(errors).toHaveLength(0);

    const collectionFileKey = Object.keys(outputs).find((k) =>
      k.endsWith("BazCollection.cs"),
    );
    expect(collectionFileKey).toBeDefined();

    const content = outputs[collectionFileKey!];
    expect(content).toBeDefined();
  });

  /**
   * Validates the class declaration extends ArmCollection and implements
   * IEnumerable<BazResource> and IAsyncEnumerable<BazResource>.
   * This matches the BazCollection.cs ground truth pattern.
   */
  it("generates class extending ArmCollection with enumerable interfaces", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    expect(content).toContain(
      "public partial class BazCollection : ArmCollection",
    );
    expect(content).toContain("IEnumerable<BazResource>");
    expect(content).toContain("IAsyncEnumerable<BazResource>");
  });

  /**
   * Validates that the collection has ClientDiagnostics and REST client fields.
   * These are needed for diagnostic scoping and HTTP operations.
   */
  it("generates private fields for diagnostics and rest client", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    expect(content).toContain(
      "private readonly ClientDiagnostics _bazsClientDiagnostics;",
    );
    expect(content).toContain("private readonly Bazs _bazsRestClient;");
  });

  /**
   * Validates the mock constructor (protected, parameterless) for mocking support.
   */
  it("generates protected mock constructor", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    expect(content).toContain("protected BazCollection()");
  });

  /**
   * Validates the main constructor initializes diagnostics, REST client,
   * and validates the resource ID against the parent scope type.
   * Uses BazResource.ResourceType (the resource class's static field).
   */
  it("generates internal constructor with diagnostics and REST client init", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    expect(content).toContain(
      "internal BazCollection(ArmClient client, ResourceIdentifier id) : base(client, id)",
    );
    expect(content).toContain("TryGetApiVersion(BazResource.ResourceType,");
    expect(content).toContain("new ClientDiagnostics(");
    expect(content).toContain(
      "BazResource.ResourceType.Namespace, Diagnostics)",
    );
    expect(content).toContain("new Bazs(");
    expect(content).toContain("ValidateResourceId(id)");
  });

  /**
   * Validates ValidateResourceId checks against the parent scope type
   * (ResourceGroupResource for RG-scoped resources).
   */
  it("validates resource ID against parent scope type", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    expect(content).toContain('ConditionalAttribute("DEBUG")');
    expect(content).toContain(
      "if (id.ResourceType != ResourceGroupResource.ResourceType)",
    );
  });

  /**
   * Validates the CreateOrUpdate async method has LRO pattern with
   * WaitUntil parameter and OperationFinalStateVia.AzureAsyncOperation.
   * This is the ARM create convention (differs from Update/Delete which use Location).
   */
  it("generates CreateOrUpdate with LRO and AzureAsyncOperation", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    // Async method signature — model resolves with Models prefix when in different namespace
    expect(content).toContain(
      "CreateOrUpdateAsync(WaitUntil waitUntil, string bazName,",
    );
    // Sync method signature
    expect(content).toContain(
      "CreateOrUpdate(WaitUntil waitUntil, string bazName,",
    );
    // LRO operation final state
    expect(content).toContain("OperationFinalStateVia.AzureAsyncOperation");
    // Argument validation
    expect(content).toContain(
      "Argument.AssertNotNullOrEmpty(bazName, nameof(bazName))",
    );
    expect(content).toContain("Argument.AssertNotNull(data, nameof(data))");
    // Diagnostic scope
    expect(content).toContain('"BazCollection.CreateOrUpdate"');
  });

  /**
   * Validates Get async/sync methods with diagnostic scope and resource wrapping.
   * Get takes a resource name parameter and returns Response<BazResource>.
   */
  it("generates Get methods with diagnostic scope", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    // Async method signature
    expect(content).toContain("GetAsync(string bazName,");
    // Sync method signature
    expect(content).toContain("Get(string bazName,");
    // Diagnostic scope
    expect(content).toContain('"BazCollection.Get"');
    // Response wrapping
    expect(content).toContain("new BazResource(Client, response.Value)");
    // Uses ProcessMessageAsync for standard operation
    expect(content).toContain("ProcessMessageAsync(message, context)");
  });

  /**
   * Validates GetAll async/sync methods use AsyncPageable/Pageable with wrappers.
   * GetAll has NO diagnostic scope (paging is lazy).
   */
  it("generates GetAll with pageable wrappers", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    // Return types
    expect(content).toContain("AsyncPageable<BazResource> GetAllAsync(");
    expect(content).toContain("Pageable<BazResource> GetAll(");
    // Wrappers — model type may resolve with namespace prefix
    expect(content).toContain("AsyncPageableWrapper<");
    expect(content).toContain("PageableWrapper<");
    // Converter lambda
    expect(content).toContain("data => new BazResource(Client, data)");
  });

  /**
   * Validates Exists async/sync methods use Pipeline.SendAsync/Send directly
   * with manual status code switching (200/404/default).
   */
  it("generates Exists with Pipeline.Send and status switch", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    // Method signatures
    expect(content).toContain("ExistsAsync(string bazName,");
    expect(content).toContain("Exists(string bazName,");
    // Uses Pipeline.SendAsync (not ProcessMessageAsync)
    expect(content).toContain(
      "Pipeline.SendAsync(message, context.CancellationToken)",
    );
    // Status code switch
    expect(content).toContain("switch (result.Status)");
    expect(content).toContain("case 200:");
    expect(content).toContain("case 404:");
    // Returns bool
    expect(content).toContain(
      "response.Value != null, response.GetRawResponse()",
    );
    // Diagnostic scope
    expect(content).toContain('"BazCollection.Exists"');
  });

  /**
   * Validates GetIfExists async/sync methods return NullableResponse<BazResource>
   * and use NoValueResponse for the 404 case.
   */
  it("generates GetIfExists with NullableResponse and NoValueResponse", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    // Method signatures
    expect(content).toContain(
      "NullableResponse<BazResource>> GetIfExistsAsync(",
    );
    expect(content).toContain("NullableResponse<BazResource> GetIfExists(");
    // NoValueResponse for 404
    expect(content).toContain(
      "new NoValueResponse<BazResource>(response.GetRawResponse())",
    );
    // Diagnostic scope
    expect(content).toContain('"BazCollection.GetIfExists"');
  });

  /**
   * Validates the IEnumerable/IAsyncEnumerable implementations delegate
   * to GetAll/GetAllAsync respectively.
   */
  it("generates enumerator implementations", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    // Generic IEnumerable
    expect(content).toContain(
      "IEnumerator<BazResource> IEnumerable<BazResource>.GetEnumerator()",
    );
    expect(content).toContain("return GetAll().GetEnumerator();");
    // Non-generic IEnumerable
    expect(content).toContain("IEnumerator IEnumerable.GetEnumerator()");
    // IAsyncEnumerable
    expect(content).toContain(
      "IAsyncEnumerator<BazResource> IAsyncEnumerable<BazResource>.GetAsyncEnumerator(",
    );
    expect(content).toContain(
      "return GetAllAsync(cancellationToken: cancellationToken).GetAsyncEnumerator(cancellationToken);",
    );
  });

  /**
   * Validates the collection class has the correct using directives.
   * These should be auto-generated from Alloy builtin references.
   */
  it("includes required using directives", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    expect(content).toContain("using Azure;");
    expect(content).toContain("using Azure.Core;");
    expect(content).toContain("using Azure.Core.Pipeline;");
    expect(content).toContain("using Azure.ResourceManager;");
    expect(content).toContain("using System.Collections;");
    expect(content).toContain("using System.Collections.Generic;");
  });

  /**
   * Critical: Ensures no unresolved refkey symbols in the output.
   * Unresolved symbols indicate broken Alloy references which produce
   * invalid C# code. This test catches any missing library definitions
   * or incorrect refkey usage.
   */
  it("has no unresolved symbol references", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    expect(content).not.toContain("<Unresolved Symbol:");
  });

  /**
   * Validates the class XML doc comment references the correct types
   * and parent scope.
   */
  it("generates class XML doc with collection description", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const content = getCollectionFile(outputs, "BazCollection.cs");

    expect(content).toContain("A class representing a collection of");
    expect(content).toContain('cref="BazResource"');
    expect(content).toContain('cref="ResourceGroupResource"');
  });

  /**
   * Validates that PageableWrapper infrastructure files are generated
   * when management mode is enabled.
   */
  it("generates PageableWrapper infrastructure files", async () => {
    const [{ outputs }] = await NewDetectionTester.compileAndDiagnose(
      trackedResourceWithListSpec,
    );

    const asyncWrapperKey = Object.keys(outputs).find((k) =>
      k.endsWith("AsyncPageableWrapper.cs"),
    );
    const syncWrapperKey = Object.keys(outputs).find(
      (k) =>
        k.endsWith("PageableWrapper.cs") &&
        !k.endsWith("AsyncPageableWrapper.cs"),
    );

    expect(asyncWrapperKey).toBeDefined();
    expect(syncWrapperKey).toBeDefined();

    expect(outputs[asyncWrapperKey!]).toContain(
      "class AsyncPageableWrapper<T, U> : AsyncPageable<U>",
    );
    expect(outputs[syncWrapperKey!]).toContain(
      "class PageableWrapper<T, U> : Pageable<U>",
    );
  });
});

// ─── Test Utilities ──────────────────────────────────────────────────────────

/**
 * Finds and returns the content of a collection file from the emitter outputs.
 * Throws with a descriptive error if the file is not found.
 */
function getCollectionFile(
  outputs: Record<string, string>,
  fileName: string,
): string {
  const key = Object.keys(outputs).find((k) => k.endsWith(fileName));
  if (!key) {
    const available = Object.keys(outputs)
      .filter((k) => k.endsWith(".cs"))
      .join("\n  ");
    throw new Error(
      `File ${fileName} not found in outputs. Available .cs files:\n  ${available}`,
    );
  }
  return outputs[key];
}
