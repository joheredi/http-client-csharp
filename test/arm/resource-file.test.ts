/**
 * Unit tests for ARM Resource class generation (ResourceFile component).
 *
 * These tests validate that the emitter generates correct `{Resource}Resource.cs`
 * files for detected ARM resources. The ground truth is BazResource.cs from the
 * Mgmt-TypeSpec test project.
 *
 * Tests verify:
 * - Resource class extends ArmResource
 * - Static ResourceType field with correct ARM type string
 * - HasData/Data properties with lazy-load guard
 * - Constructors (mocking, data, identifier)
 * - CreateResourceIdentifier factory method
 * - ValidateResourceId with [Conditional("DEBUG")]
 * - CRUD operations (Get, Update, Delete) with diagnostic scope pattern
 * - Correct using directives for Azure.ResourceManager types
 *
 * @module
 */
import { describe, expect, it } from "vitest";
import { MgmtTester } from "../test-host.js";

/**
 * TypeSpec fixture for a tracked ARM resource with standard CRUD operations.
 * Models a ResourceGroup-scoped resource with Get (non-LRO), Update (LRO),
 * and Delete (LRO) operations matching the BazResource ground truth pattern.
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

describe("ARM Resource class generation", () => {
  /**
   * Validates that the emitter generates a BazResource.cs file when given
   * a tracked ARM resource with CRUD operations. This is the primary
   * acceptance criterion for task 19.2a.
   */
  it("generates a Resource class file for a tracked ARM resource", async () => {
    const [{ outputs }, diagnostics] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);
    // Filter out deprecation warnings from ARM templates — they come from
    // the TypeSpec ARM library and are not under our control
    const errors = diagnostics.filter((d) => d.code !== "deprecated");
    expect(errors).toHaveLength(0);

    // Find the generated BazResource.cs file
    const resourceFileKey = Object.keys(outputs).find((k) =>
      k.endsWith("BazResource.cs"),
    );
    expect(resourceFileKey).toBeDefined();

    const content = outputs[resourceFileKey!];
    expect(content).toBeDefined();
  });

  /**
   * Validates the class declaration extends ArmResource.
   * This is the fundamental ARM resource pattern — every resource class
   * must inherit from ArmResource to get access to Id, Pipeline, Client, etc.
   */
  it("generates class extending ArmResource", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    expect(content).toContain("public partial class BazResource : ArmResource");
  });

  /**
   * Validates the ResourceType static field matches the ARM resource type string.
   * This field is used for resource type validation and API version resolution.
   */
  it("generates ResourceType static field", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    expect(content).toContain(
      'public static readonly ResourceType ResourceType = "MgmtTypeSpec/bazs"',
    );
  });

  /**
   * Validates the HasData/Data property pattern with lazy-load guard.
   * HasData indicates whether the resource was loaded with data.
   * Data throws InvalidOperationException if HasData is false.
   */
  it("generates HasData and Data properties", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    expect(content).toContain("public virtual bool HasData { get; }");
    // The model type may be in a Models sub-namespace
    expect(content).toMatch(/public virtual .+Baz Data/);
    expect(content).toContain(
      "The current instance does not have data, you must call Get first.",
    );
  });

  /**
   * Validates the three constructor patterns:
   * 1. Protected parameterless constructor for mocking
   * 2. Internal data constructor that sets HasData = true
   * 3. Internal identifier constructor with diagnostics and rest client init
   */
  it("generates mocking and data constructors", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    // Mocking constructor
    expect(content).toContain("protected BazResource()");

    // Data constructor - model may be Baz or BazData depending on naming
    expect(content).toMatch(
      /internal BazResource\(ArmClient client, .+Baz data\) : this\(client, data\.Id\)/,
    );
    expect(content).toContain("HasData = true;");
    expect(content).toContain("_data = data;");

    // Identifier constructor
    expect(content).toContain(
      "internal BazResource(ArmClient client, ResourceIdentifier id) : base(client, id)",
    );
    expect(content).toContain("TryGetApiVersion(ResourceType, out string");
    expect(content).toContain("ValidateResourceId(id);");
  });

  /**
   * Validates CreateResourceIdentifier generates a static factory method
   * that constructs a ResourceIdentifier from path parameters.
   */
  it("generates CreateResourceIdentifier static method", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    expect(content).toContain(
      "public static ResourceIdentifier CreateResourceIdentifier(",
    );
    expect(content).toContain("string subscriptionId");
    expect(content).toContain("string resourceGroupName");
    expect(content).toContain("string bazName");
    expect(content).toContain("new ResourceIdentifier(resourceId)");
  });

  /**
   * Validates ValidateResourceId is marked with [Conditional("DEBUG")]
   * so it only runs in debug builds.
   */
  it("generates ValidateResourceId with Conditional DEBUG", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    // The attribute may render as [Conditional("DEBUG")] or [ConditionalAttribute("DEBUG")]
    expect(content).toMatch(/\[Conditional(Attribute)?\("DEBUG"\)\]/);
    expect(content).toContain(
      "internal static void ValidateResourceId(ResourceIdentifier id)",
    );
  });

  /**
   * Validates the Get operation generates async and sync method pairs
   * with the diagnostic scope pattern. Get is a non-LRO operation that
   * returns Response<BazResource>.
   */
  it("generates Get operation with async/sync pair and diagnostic scope", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    // Async Get
    expect(content).toContain("GetAsync(CancellationToken cancellationToken");
    expect(content).toContain('CreateScope("BazResource.Get")');
    expect(content).toContain("scope.Start()");
    expect(content).toContain(
      "await Pipeline.ProcessMessageAsync(message, context).ConfigureAwait(false)",
    );

    // Sync Get
    expect(content).toContain("Get(CancellationToken cancellationToken");
    expect(content).toContain("Pipeline.ProcessMessage(message, context)");

    // Return type wrapping
    expect(content).toContain("new BazResource(Client, response.Value)");
  });

  /**
   * Validates the Update operation generates sync/async methods with body param.
   * With sync ARM templates, Update returns Response<BazResource> (not LRO).
   */
  it("generates Update operation with body parameter", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    // Async Update
    expect(content).toContain("UpdateAsync(");
    expect(content).toContain('CreateScope("BazResource.Update")');

    // Sync Update
    expect(content).toContain("Update(");
  });

  /**
   * Validates the Delete operation generates sync/async methods without body.
   * With sync ARM templates, Delete returns Response<BazResource> (not LRO).
   */
  it("generates Delete operation without body", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    // Async Delete
    expect(content).toContain("DeleteAsync(");
    expect(content).toContain('CreateScope("BazResource.Delete")');

    // Delete should NOT have body parameter assertion
    const deleteSection = extractMethodSection(content, "DeleteAsync");
    if (deleteSection) {
      expect(deleteSection).not.toContain("AssertNotNull(data");
    }
  });

  /**
   * Validates that required using directives are present for ARM types.
   * The SourceFile component auto-generates usings from referenced library types.
   */
  it("generates correct using directives", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    expect(content).toContain("using Azure.ResourceManager;");
    expect(content).toContain("using Azure.Core.Pipeline;");
    expect(content).toContain("using Azure;");
    expect(content).toContain("using Azure.Core;");
  });

  /**
   * Validates that the generated output does NOT contain unresolved symbols.
   * Rule 9999999: output must never have `<Unresolved Symbol: refkey[...]>`.
   */
  it("has no unresolved symbol references", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    expect(content).not.toContain("<Unresolved Symbol:");
  });

  /**
   * Validates that the class XML doc comment references the correct types.
   */
  it("generates class XML doc with resource description", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    expect(content).toContain(
      "A class representing a Baz along with the instance operations",
    );
  });

  /**
   * Validates that the resource ID pattern is correctly used in
   * CreateResourceIdentifier to build the full resource path.
   */
  it("uses correct resource ID pattern in CreateResourceIdentifier", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(trackedResourceSpec);

    const content = getResourceFile(outputs, "BazResource.cs");

    expect(content).toContain(
      "/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/MgmtTypeSpec/bazs/{bazName}",
    );
  });
});

// ─── Test Utilities ──────────────────────────────────────────────────────────

/**
 * Finds and returns the content of a resource file from the emitter outputs.
 * Throws if the file is not found.
 */
function getResourceFile(
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

/**
 * Extracts a method section from the generated C# content.
 * Returns the text from the method signature to its closing brace.
 */
function extractMethodSection(
  content: string,
  methodName: string,
): string | null {
  const startIndex = content.indexOf(methodName);
  if (startIndex === -1) return null;

  // Find the method's opening brace
  let braceCount = 0;
  let started = false;
  let endIndex = startIndex;
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === "{") {
      braceCount++;
      started = true;
    }
    if (content[i] === "}") {
      braceCount--;
      if (started && braceCount === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  return content.substring(startIndex, endIndex);
}
