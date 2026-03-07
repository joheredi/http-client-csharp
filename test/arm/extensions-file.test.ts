/**
 * Unit tests for ARM Extensions and Mockable Provider generation.
 *
 * These tests validate that the emitter generates correct ARM extension files:
 *
 * 1. MockableProviderFile: Generates Mockable{LibName}{Scope}.cs files
 *    - ArmClient scope: GetXxxResource(ResourceIdentifier id)
 *    - ResourceGroup scope: Collection getters + singular getters (async/sync)
 *
 * 2. ExtensionsFile: Generates {LibName}Extensions.cs static class
 *    - Private mockable provider getters via GetCachedClient
 *    - Public static extension methods delegating to mockable providers
 *
 * Ground truth: Extensions/ directory in Mgmt-TypeSpec Generated output.
 *
 * @module
 */
import { describe, expect, it } from "vitest";
import { MgmtTester } from "../test-host.js";

/**
 * TypeSpec fixture for a tracked ARM resource with standard CRUD operations.
 * Uses the same Baz resource as resource-file and collection-file tests
 * to validate extension method generation.
 */
const trackedResourceSpec = `
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
  }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Finds a generated file by suffix from the outputs record.
 * Throws a clear error if the file isn't found.
 */
function findFile(outputs: Record<string, string>, suffix: string): string {
  const key = Object.keys(outputs).find((k) => k.endsWith(suffix));
  if (!key) {
    const available = Object.keys(outputs)
      .filter((k) => k.includes("Extensions") || k.includes("Mockable"))
      .join("\n  ");
    throw new Error(
      `File ending with "${suffix}" not found.\nExtension-related files:\n  ${available}`,
    );
  }
  return outputs[key];
}

// ─── MockableArmClient Tests ─────────────────────────────────────────────────

describe("ARM Mockable ArmClient generation", () => {
  /**
   * Validates that a MockableXxxArmClient.cs file is generated.
   * This is the fundamental ArmClient scope mockable provider — every ARM
   * emitter output must include it when resources are detected.
   */
  it("generates a MockableArmClient file", async () => {
    const [{ outputs }, diagnostics] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const errors = diagnostics.filter((d) => d.code !== "deprecated");
    expect(errors).toHaveLength(0);

    const key = Object.keys(outputs).find(
      (k) => k.includes("Mockable") && k.includes("ArmClient"),
    );
    expect(key).toBeDefined();
  });

  /**
   * Validates the mockable ArmClient class extends ArmResource.
   * This is the standard ARM pattern for mockable provider classes.
   */
  it("extends ArmResource", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) => k.includes("Mockable") && k.includes("ArmClient"),
    )!;
    const content = outputs[key];

    expect(content).toContain(": ArmResource");
  });

  /**
   * Validates the protected mocking constructor exists.
   * Required for testing frameworks that create mock instances.
   */
  it("has protected mocking constructor", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) => k.includes("Mockable") && k.includes("ArmClient"),
    )!;
    const content = outputs[key];

    expect(content).toMatch(/protected Mockable\w+ArmClient\(\)/);
  });

  /**
   * Validates the internal constructor with ArmClient and ResourceIdentifier params.
   * This constructor is used internally by the cached client pattern.
   */
  it("has internal constructor with ArmClient and ResourceIdentifier", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) => k.includes("Mockable") && k.includes("ArmClient"),
    )!;
    const content = outputs[key];

    expect(content).toMatch(
      /internal Mockable\w+ArmClient\(ArmClient client, ResourceIdentifier id\)/,
    );
  });

  /**
   * Validates GetBazResource(ResourceIdentifier id) method is generated.
   * Each resource must have a GetXxxResource method in the ArmClient scope.
   */
  it("generates GetXxxResource method for Baz", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) => k.includes("Mockable") && k.includes("ArmClient"),
    )!;
    const content = outputs[key];

    expect(content).toContain("GetBazResource(ResourceIdentifier id)");
    expect(content).toContain("BazResource.ValidateResourceId(id)");
    expect(content).toContain("new BazResource(Client, id)");
  });

  /**
   * Validates the Mocking namespace is used for mockable classes.
   * The ground truth places mockables in {LibName}.Mocking namespace.
   */
  it("uses Mocking sub-namespace", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) => k.includes("Mockable") && k.includes("ArmClient"),
    )!;
    const content = outputs[key];

    expect(content).toContain(".Mocking");
  });
});

// ─── MockableResourceGroupResource Tests ─────────────────────────────────────

describe("ARM Mockable ResourceGroupResource generation", () => {
  /**
   * Validates that a MockableXxxResourceGroupResource.cs file is generated
   * for RG-scoped resources.
   */
  it("generates a MockableResourceGroupResource file", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const key = Object.keys(outputs).find(
      (k) => k.includes("Mockable") && k.includes("ResourceGroupResource"),
    );
    expect(key).toBeDefined();
  });

  /**
   * Validates the collection getter: GetBazs() → returns BazCollection via GetCachedClient.
   * This is the primary entry point for listing resources within a scope.
   */
  it("generates collection getter GetBazs()", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) => k.includes("Mockable") && k.includes("ResourceGroupResource"),
    )!;
    const content = outputs[key];

    expect(content).toContain("GetBazs()");
    expect(content).toContain("BazCollection");
    expect(content).toContain("GetCachedClient");
  });

  /**
   * Validates the async singular getter: GetBazAsync(string bazName, CancellationToken).
   * Delegates to collection.GetAsync() with the resource name parameter.
   */
  it("generates async singular getter GetBazAsync", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) => k.includes("Mockable") && k.includes("ResourceGroupResource"),
    )!;
    const content = outputs[key];

    expect(content).toContain("GetBazAsync(string bazName");
    expect(content).toContain("CancellationToken cancellationToken = default");
    expect(content).toContain("GetBazs().GetAsync(bazName, cancellationToken)");
    expect(content).toContain(".ConfigureAwait(false)");
  });

  /**
   * Validates the sync singular getter: GetBaz(string bazName, CancellationToken).
   * Delegates to collection.Get() with the resource name parameter.
   */
  it("generates sync singular getter GetBaz", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) => k.includes("Mockable") && k.includes("ResourceGroupResource"),
    )!;
    const content = outputs[key];

    // Sync getter should NOT have async/await keywords
    expect(content).toContain(
      "GetBaz(string bazName, CancellationToken cancellationToken = default)",
    );
    expect(content).toContain("GetBazs().Get(bazName, cancellationToken)");
  });

  /**
   * Validates that singular getters have [ForwardsClientCalls] attribute.
   * This attribute is required by the Azure SDK design guidelines.
   */
  it("marks singular getters with [ForwardsClientCalls]", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) => k.includes("Mockable") && k.includes("ResourceGroupResource"),
    )!;
    const content = outputs[key];

    expect(content).toContain("ForwardsClientCalls");
  });

  /**
   * Validates argument validation in singular getters.
   * The resource name parameter must be validated as not null or empty.
   */
  it("validates resource name argument", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) => k.includes("Mockable") && k.includes("ResourceGroupResource"),
    )!;
    const content = outputs[key];

    expect(content).toContain("Argument.AssertNotNullOrEmpty(bazName");
  });
});

// ─── Extensions File Tests ───────────────────────────────────────────────────

describe("ARM Extensions file generation", () => {
  /**
   * Validates that an Extensions.cs file is generated.
   * This is the main entry point for ARM extension methods.
   */
  it("generates an Extensions file", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const key = Object.keys(outputs).find(
      (k) =>
        k.includes("Extensions/") &&
        !k.includes("Mockable") &&
        k.endsWith("Extensions.cs"),
    );
    expect(key).toBeDefined();
  });

  /**
   * Validates the Extensions class is static and partial.
   * The ground truth uses `public static partial class {LibName}Extensions`.
   */
  it("generates static partial class", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) =>
        k.includes("Extensions/") &&
        !k.includes("Mockable") &&
        k.endsWith("Extensions.cs"),
    )!;
    const content = outputs[key];

    expect(content).toContain("public static partial class");
    expect(content).toContain("Extensions");
  });

  /**
   * Validates private mockable getter for ArmClient scope.
   * Uses GetCachedClient with ResourceIdentifier.Root.
   */
  it("generates private mockable ArmClient getter", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) =>
        k.includes("Extensions/") &&
        !k.includes("Mockable") &&
        k.endsWith("Extensions.cs"),
    )!;
    const content = outputs[key];

    expect(content).toContain("GetCachedClient");
    expect(content).toContain("ResourceIdentifier.Root");
  });

  /**
   * Validates private mockable getter for ResourceGroup scope.
   * Uses GetCachedClient with the scope resource's Id.
   */
  it("generates private mockable ResourceGroup getter", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) =>
        k.includes("Extensions/") &&
        !k.includes("Mockable") &&
        k.endsWith("Extensions.cs"),
    )!;
    const content = outputs[key];

    expect(content).toContain("resourceGroupResource.Id");
  });

  /**
   * Validates ArmClient extension method: GetBazResource(this ArmClient, ResourceIdentifier).
   * Must have Argument.AssertNotNull and delegate to mockable provider.
   */
  it("generates ArmClient extension for GetBazResource", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) =>
        k.includes("Extensions/") &&
        !k.includes("Mockable") &&
        k.endsWith("Extensions.cs"),
    )!;
    const content = outputs[key];

    expect(content).toContain("GetBazResource(this ArmClient client");
    expect(content).toContain("Argument.AssertNotNull(client, nameof(client))");
  });

  /**
   * Validates ResourceGroup extension: GetBazs(this ResourceGroupResource).
   * Collection getter extension that delegates to mockable provider.
   */
  it("generates ResourceGroup collection getter extension", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) =>
        k.includes("Extensions/") &&
        !k.includes("Mockable") &&
        k.endsWith("Extensions.cs"),
    )!;
    const content = outputs[key];

    expect(content).toContain(
      "GetBazs(this ResourceGroupResource resourceGroupResource)",
    );
    expect(content).toContain("Argument.AssertNotNull(resourceGroupResource");
  });

  /**
   * Validates ResourceGroup extension: GetBazAsync(this ResourceGroupResource, string, CancellationToken).
   * Async singular getter extension with [ForwardsClientCalls].
   */
  it("generates ResourceGroup async singular getter extension", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) =>
        k.includes("Extensions/") &&
        !k.includes("Mockable") &&
        k.endsWith("Extensions.cs"),
    )!;
    const content = outputs[key];

    expect(content).toContain(
      "GetBazAsync(this ResourceGroupResource resourceGroupResource, string bazName",
    );
    expect(content).toContain("ForwardsClientCalls");
    expect(content).toContain(".ConfigureAwait(false)");
  });

  /**
   * Validates ResourceGroup extension: GetBaz(this ResourceGroupResource, string, CancellationToken).
   * Sync singular getter extension with [ForwardsClientCalls].
   */
  it("generates ResourceGroup sync singular getter extension", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) =>
        k.includes("Extensions/") &&
        !k.includes("Mockable") &&
        k.endsWith("Extensions.cs"),
    )!;
    const content = outputs[key];

    expect(content).toContain(
      "GetBaz(this ResourceGroupResource resourceGroupResource, string bazName",
    );
  });

  /**
   * Validates that the Extensions class is in the main namespace (not Mocking).
   * The ground truth places Extensions in the library's root namespace.
   */
  it("uses main namespace (not Mocking)", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) =>
        k.includes("Extensions/") &&
        !k.includes("Mockable") &&
        k.endsWith("Extensions.cs"),
    )!;
    const content = outputs[key];

    // The Extensions class should be in the main namespace.
    // Mockable references should point to the Mocking namespace.
    expect(content).not.toMatch(/^namespace.*\.Mocking/m);
  });

  /**
   * Validates that the Extensions file includes mocking hint XML doc comments.
   * Each extension method should document which mockable method to use for testing.
   */
  it("includes mocking hints in XML documentation", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    const key = Object.keys(outputs).find(
      (k) =>
        k.includes("Extensions/") &&
        !k.includes("Mockable") &&
        k.endsWith("Extensions.cs"),
    )!;
    const content = outputs[key];

    expect(content).toContain("Mocking");
    expect(content).toContain("To mock this method");
  });

  /**
   * Validates no unresolved symbol references in any generated extension file.
   * This is a critical correctness check — unresolved refkeys indicate broken
   * cross-file reference resolution.
   */
  it("has no unresolved symbol references", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const extensionKeys = Object.keys(outputs).filter(
      (k) => k.includes("Extensions") || k.includes("Mockable"),
    );

    for (const key of extensionKeys) {
      expect(outputs[key]).not.toContain("Unresolved Symbol");
    }
  });
});
