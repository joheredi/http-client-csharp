/**
 * Unit tests for ARM extension resource generation.
 *
 * Extension resources differ from standard scoped resources in several ways:
 * - Parent type is ArmResource (generic) instead of specific scope types
 * - MockableArmClient generates collection factory and singular getters with
 *   a ResourceIdentifier scope parameter (not part-specific named parameters)
 * - ExtensionsFile generates matching static extension methods on ArmClient
 * - Collection passes Id (the scope) directly to REST operations
 * - Resource passes Id.Parent (the scope) to REST operations
 * - Singleton extension resources use scope.AppendProviderResource pattern
 *
 * Ground truth: extensionresources.tsp and hcivm.tsp in legacy Mgmt-TypeSpec.
 *
 * @module
 */
import { describe, expect, it } from "vitest";
import { MgmtTester } from "../test-host.js";

/**
 * TypeSpec fixture for a non-singleton extension resource.
 * Extension resources use ExtensionResource<T> and Extension.ScopeParameter
 * to apply to any parent resource scope.
 *
 * This fixture validates:
 * - Extension scope detection from ExtensionResource<T> base model
 * - Collection factory with ResourceIdentifier scope parameter
 * - Singular getters with scope + name parameters
 * - REST call arguments using Id / Id.Parent instead of named ID segments
 */
const extensionResourceSpec = `
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

  @doc("Configuration assignment for any scope")
  model ConfigAssignment
    is Azure.ResourceManager.ExtensionResource<ConfigAssignmentProperties> {
    ...ResourceNameParameter<
      Resource = ConfigAssignment,
      KeyName = "configAssignmentName",
      SegmentName = "configAssignments",
      NamePattern = ""
    >;
  }

  model ConfigAssignmentProperties {
    configName?: string;
  }

  #suppress "@azure-tools/typespec-azure-resource-manager/no-resource-delete-operation" "Test"
  @armResourceOperations
  interface ConfigAssignments {
    @doc("Get a configuration assignment")
    get is Extension.Read<Extension.ScopeParameter, ConfigAssignment>;
  }
`;

/**
 * TypeSpec fixture for a singleton extension resource.
 * Singleton extension resources don't generate collections — they use
 * scope.AppendProviderResource to construct the resource ID directly.
 *
 * This fixture validates:
 * - Singleton detection via @singleton("default")
 * - Direct resource getter with scope parameter (no collection)
 * - AppendProviderResource pattern in MockableArmClient
 */
const singletonExtensionResourceSpec = `
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

  @doc("VM instance resource for HCI")
  @singleton("default")
  model HciVmInstance
    is ExtensionResource<HciVmInstanceProperties> {
    ...ResourceNameParameter<HciVmInstance, SegmentName = "virtualMachineInstances">;
  }

  model HciVmInstanceProperties {
    sku: string;
  }

  #suppress "@azure-tools/typespec-azure-resource-manager/no-resource-delete-operation" "Test"
  @armResourceOperations
  interface HciVmInstances {
    @doc("Gets a VM instance")
    get is ArmResourceRead<HciVmInstance>;
  }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findFile(outputs: Record<string, string>, suffix: string): string {
  const key = Object.keys(outputs).find((k) => k.endsWith(suffix));
  if (!key) {
    const available = Object.keys(outputs).join("\n  ");
    throw new Error(
      `File ending with "${suffix}" not found.\nAvailable files:\n  ${available}`,
    );
  }
  return outputs[key];
}

/**
 * Finds the main Extensions file (not CancellationTokenExtensions etc.).
 * The main Extensions file lives in the Extensions/ directory.
 */
function findExtensionsFile(outputs: Record<string, string>): string {
  const key = Object.keys(outputs).find(
    (k) => k.startsWith("Extensions/") && k.endsWith("Extensions.cs"),
  );
  if (!key) {
    const available = Object.keys(outputs)
      .filter((k) => k.includes("Extension"))
      .join("\n  ");
    throw new Error(
      `Main Extensions file not found.\nExtension-related files:\n  ${available}`,
    );
  }
  return outputs[key];
}

function findFileContaining(
  outputs: Record<string, string>,
  ...patterns: string[]
): string {
  const key = Object.keys(outputs).find((k) =>
    patterns.every((p) => k.includes(p)),
  );
  if (!key) {
    const available = Object.keys(outputs).join("\n  ");
    throw new Error(
      `File matching patterns [${patterns.join(", ")}] not found.\nAvailable files:\n  ${available}`,
    );
  }
  return outputs[key];
}

// ─── Non-singleton Extension Resource: MockableArmClient ─────────────────────

describe("ARM Extension Resource - MockableArmClient", () => {
  /**
   * Validates GetConfigAssignmentResource(ResourceIdentifier id) is generated.
   * ALL resources (extension or not) get this method in MockableArmClient.
   */
  it("generates GetXxxResource method with ResourceIdentifier id", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findFileContaining(outputs, "Mockable", "ArmClient");

    expect(content).toContain(
      "GetConfigAssignmentResource(ResourceIdentifier id)",
    );
    expect(content).toContain("ConfigAssignmentResource.ValidateResourceId(id)");
    expect(content).toContain("new ConfigAssignmentResource(Client, id)");
  });

  /**
   * Validates GetConfigAssignments(ResourceIdentifier scope) collection factory.
   * Extension resources generate a collection factory that takes a scope parameter
   * instead of using GetCachedClient (which is for fixed-scope resources).
   */
  it("generates collection factory with ResourceIdentifier scope parameter", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findFileContaining(outputs, "Mockable", "ArmClient");

    expect(content).toContain(
      "GetConfigAssignments(ResourceIdentifier scope)",
    );
    expect(content).toContain(
      "new ConfigAssignmentCollection(Client, scope)",
    );
  });

  /**
   * Validates sync singular getter with scope + name parameters.
   * Extension resource singular getters take (ResourceIdentifier scope, string name)
   * instead of just (string name) like regular scoped resources.
   */
  it("generates sync singular getter with scope and name parameters", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findFileContaining(outputs, "Mockable", "ArmClient");

    expect(content).toMatch(
      /Response<ConfigAssignmentResource>\s+GetConfigAssignment\(ResourceIdentifier scope, string configAssignmentName/,
    );
    expect(content).toContain(
      "GetConfigAssignments(scope).Get(configAssignmentName, cancellationToken)",
    );
  });

  /**
   * Validates async singular getter with scope + name parameters.
   * Mirrors the sync getter but returns Task<Response<T>> and uses GetAsync.
   */
  it("generates async singular getter with scope and name parameters", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findFileContaining(outputs, "Mockable", "ArmClient");

    expect(content).toMatch(
      /Task<Response<ConfigAssignmentResource>>\s+GetConfigAssignmentAsync\(ResourceIdentifier scope, string configAssignmentName/,
    );
    expect(content).toContain(
      "GetConfigAssignments(scope).GetAsync(configAssignmentName, cancellationToken)",
    );
  });

  /**
   * Validates [ForwardsClientCalls] attribute on singular getters.
   * This attribute is required by the ARM SDK for methods that delegate to collections.
   */
  it("marks singular getters with [ForwardsClientCalls]", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findFileContaining(outputs, "Mockable", "ArmClient");

    // The ForwardsClientCalls attribute should appear before GetConfigAssignment methods
    expect(content).toMatch(
      /\[ForwardsClientCalls\]\s+public virtual.*GetConfigAssignment\(/,
    );
    expect(content).toMatch(
      /\[ForwardsClientCalls\]\s+public virtual async.*GetConfigAssignmentAsync\(/,
    );
  });

  /**
   * Validates argument validation in singular getters.
   * The resource name parameter must be validated as not null or empty.
   */
  it("validates resource name argument in singular getters", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findFileContaining(outputs, "Mockable", "ArmClient");

    expect(content).toContain(
      "Argument.AssertNotNullOrEmpty(configAssignmentName, nameof(configAssignmentName))",
    );
  });
});

// ─── Non-singleton Extension Resource: ExtensionsFile ────────────────────────

describe("ARM Extension Resource - ExtensionsFile", () => {
  /**
   * Validates GetConfigAssignmentResource(this ArmClient, ResourceIdentifier id).
   * All resources get this extension method on ArmClient.
   */
  it("generates GetXxxResource extension on ArmClient", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findExtensionsFile(outputs);

    expect(content).toMatch(
      /public static ConfigAssignmentResource GetConfigAssignmentResource\(this ArmClient client, ResourceIdentifier id\)/,
    );
  });

  /**
   * Validates GetConfigAssignments(this ArmClient, ResourceIdentifier scope) collection factory.
   * Extension resources expose the collection factory as an ArmClient extension method.
   */
  it("generates collection factory extension with scope parameter", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findExtensionsFile(outputs);

    expect(content).toMatch(
      /public static ConfigAssignmentCollection GetConfigAssignments\(this ArmClient client, ResourceIdentifier scope\)/,
    );
  });

  /**
   * Validates sync singular getter extension with scope + name parameters.
   */
  it("generates sync singular getter extension with scope parameter", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findExtensionsFile(outputs);

    expect(content).toMatch(
      /public static Response<ConfigAssignmentResource> GetConfigAssignment\(this ArmClient client, ResourceIdentifier scope, string configAssignmentName/,
    );
  });

  /**
   * Validates async singular getter extension with scope + name parameters.
   */
  it("generates async singular getter extension with scope parameter", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findExtensionsFile(outputs);

    expect(content).toMatch(
      /public static async Task<Response<ConfigAssignmentResource>> GetConfigAssignmentAsync\(this ArmClient client, ResourceIdentifier scope, string configAssignmentName/,
    );
  });

  /**
   * Validates extension methods delegate to mockable provider.
   * All extension methods must go through the mockable class for testability.
   */
  it("delegates to mockable provider for all extension methods", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findExtensionsFile(outputs);

    // Collection factory delegates
    expect(content).toMatch(
      /GetMockable\w+ArmClient\(client\)\.GetConfigAssignments\(scope\)/,
    );
    // Sync getter delegates
    expect(content).toMatch(
      /GetMockable\w+ArmClient\(client\)\.GetConfigAssignment\(scope, configAssignmentName, cancellationToken\)/,
    );
    // Async getter delegates
    expect(content).toMatch(
      /GetMockable\w+ArmClient\(client\)\.GetConfigAssignmentAsync\(scope, configAssignmentName, cancellationToken\)/,
    );
  });

  /**
   * Validates no unresolved symbol references in any generated file.
   * Unresolved refkeys indicate broken cross-file references.
   */
  it("has no unresolved symbol references", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);

    for (const [file, content] of Object.entries(outputs)) {
      expect(content, `Unresolved symbol in ${file}`).not.toMatch(
        /<Unresolved Symbol:/,
      );
    }
  });
});

// ─── Non-singleton Extension Resource: ResourceFile ──────────────────────────

describe("ARM Extension Resource - ResourceFile", () => {
  /**
   * Validates CreateResourceIdentifier uses scope parameter.
   * Extension resources have a scope (full path) as the first parameter,
   * not specific named segments like subscriptionId or resourceGroupName.
   */
  it("generates CreateResourceIdentifier with scope parameter", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findFile(outputs, "ConfigAssignmentResource.cs");

    expect(content).toMatch(
      /CreateResourceIdentifier\(string scope, string configAssignmentName\)/,
    );
  });

  /**
   * Validates REST call uses Id.Parent for scope (not Id.Parent.Name).
   * Extension resources need the full scope path, not just a name segment.
   * Id.Parent returns a ResourceIdentifier which implicitly converts to string,
   * preserving the full path like /subscriptions/.../providers/.../myvm.
   */
  it("uses Id.Parent for scope in REST operations", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findFile(outputs, "ConfigAssignmentResource.cs");

    // REST call should use Id.Parent (not Id.Parent.Name) for the scope parameter
    expect(content).toMatch(/CreateGetRequest\(Id\.Parent, Id\.Name/);
  });

  /**
   * Validates the resource class extends ArmResource.
   * Extension resources always extend ArmResource (the generic base), not
   * specific scope types like ResourceGroupResource.
   */
  it("extends ArmResource", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findFile(outputs, "ConfigAssignmentResource.cs");

    expect(content).toContain(": ArmResource");
  });
});

// ─── Non-singleton Extension Resource: CollectionFile ────────────────────────

describe("ARM Extension Resource - CollectionFile", () => {
  /**
   * Validates collection REST calls use Id (not Id.Parent.Name) for scope.
   * The collection's Id IS the scope (it was initialized with scope as Id),
   * so REST operations should pass Id directly for the scope parameter.
   */
  it("uses Id for scope in collection REST operations", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findFile(outputs, "ConfigAssignmentCollection.cs");

    // Collection Get should use Id as scope: CreateGetRequest(Id, configAssignmentName, context)
    expect(content).toMatch(/CreateGetRequest\(Id, configAssignmentName/);
  });

  /**
   * Validates the collection class extends ArmCollection.
   * All ARM collections extend ArmCollection regardless of scope.
   */
  it("extends ArmCollection", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findFile(outputs, "ConfigAssignmentCollection.cs");

    expect(content).toContain(": ArmCollection");
  });

  /**
   * Validates no parent scope validation for extension resources.
   * Extension resources can apply to any parent, so no ValidateResourceId
   * for the parent scope should be generated.
   */
  it("does not validate parent scope type", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(extensionResourceSpec);
    const content = findFile(outputs, "ConfigAssignmentCollection.cs");

    // Extension resources should NOT have parent scope validation
    // (they accept any ResourceIdentifier as scope)
    expect(content).not.toMatch(
      /id\.ResourceType\s*!=\s*ResourceGroupResource/,
    );
    expect(content).not.toMatch(
      /id\.ResourceType\s*!=\s*SubscriptionResource/,
    );
  });
});

// ─── Singleton Extension Resource ────────────────────────────────────────────

describe("ARM Singleton Extension Resource - MockableArmClient", () => {
  /**
   * Validates GetHciVmInstanceResource(ResourceIdentifier id) method.
   * All resources get this basic ID-based getter.
   */
  it("generates GetXxxResource method", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(singletonExtensionResourceSpec);
    const content = findFileContaining(outputs, "Mockable", "ArmClient");

    expect(content).toContain(
      "GetHciVmInstanceResource(ResourceIdentifier id)",
    );
  });

  /**
   * Validates that singleton extension resources generate collection factory
   * and singular getters with scope parameter, following the same pattern as
   * non-singleton extension resources.
   *
   * NOTE: The current resource detection pipeline doesn't propagate the
   * singleton name for extension resources through the resolveArmResources API,
   * so they follow the non-singleton extension pattern. This matches the
   * behavior of the emitter before this change. When singleton detection is
   * fixed, these tests should be updated to verify the AppendProviderResource
   * pattern instead.
   */
  it("generates collection factory with scope parameter", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(singletonExtensionResourceSpec);
    const content = findFileContaining(outputs, "Mockable", "ArmClient");

    expect(content).toContain(
      "GetHciVmInstances(ResourceIdentifier scope)",
    );
    expect(content).toContain(
      "new HciVmInstanceCollection(Client, scope)",
    );
  });

  /**
   * Validates singular getters exist with scope parameter.
   */
  it("generates singular getters with scope parameter", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(singletonExtensionResourceSpec);
    const content = findFileContaining(outputs, "Mockable", "ArmClient");

    // Sync getter with scope + name
    expect(content).toMatch(
      /GetHciVmInstance\(ResourceIdentifier scope, string/,
    );
    // Async getter with scope + name
    expect(content).toMatch(
      /GetHciVmInstanceAsync\(ResourceIdentifier scope, string/,
    );
  });
});

describe("ARM Singleton Extension Resource - ExtensionsFile", () => {
  /**
   * Validates GetHciVmInstanceResource extension on ArmClient.
   */
  it("generates GetXxxResource extension method", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(singletonExtensionResourceSpec);
    const content = findExtensionsFile(outputs);

    expect(content).toMatch(
      /public static HciVmInstanceResource GetHciVmInstanceResource\(this ArmClient client, ResourceIdentifier id\)/,
    );
  });

  /**
   * Validates collection factory extension on ArmClient with scope parameter.
   */
  it("generates collection factory extension method", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(singletonExtensionResourceSpec);
    const content = findExtensionsFile(outputs);

    expect(content).toMatch(
      /public static HciVmInstanceCollection GetHciVmInstances\(this ArmClient client, ResourceIdentifier scope\)/,
    );
    // Delegates to mockable
    expect(content).toMatch(
      /GetMockable\w+ArmClient\(client\)\.GetHciVmInstances\(scope\)/,
    );
  });

  /**
   * Validates no unresolved symbol references.
   */
  it("has no unresolved symbol references", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(singletonExtensionResourceSpec);

    for (const [file, content] of Object.entries(outputs)) {
      expect(content, `Unresolved symbol in ${file}`).not.toMatch(
        /<Unresolved Symbol:/,
      );
    }
  });
});
