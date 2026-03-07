/**
 * Unit tests for ARM tag operations (AddTag, RemoveTag, SetTags).
 *
 * These tests validate that the emitter generates correct tag manipulation
 * methods for ARM resources that support tags. Tag methods follow the
 * dual-path pattern:
 * - Primary: Uses TagResource API (GetTagResource().Get/CreateOrUpdate/Delete)
 * - Secondary: Falls back to resource's Update method
 *
 * Tests verify:
 * - Tag methods generated only for resources with tags property + Read + Update
 * - AddTag/AddTagAsync with key/value parameters
 * - SetTags/SetTagsAsync with IDictionary parameter and Delete-first primary path
 * - RemoveTag/RemoveTagAsync with key parameter
 * - Correct diagnostic scope naming
 * - CanUseTagResource/CanUseTagResourceAsync conditional
 * - No tag methods for ProxyResource (no tags property)
 * - No unresolved symbols in generated output
 *
 * Ground truth: FooResource.cs, ZooResource.cs from Mgmt-TypeSpec test project
 *
 * @module
 */
import { describe, expect, it } from "vitest";
import { MgmtTester } from "../test-host.js";

/**
 * TypeSpec fixture: TrackedResource with Read, Update (PUT-style), and Delete.
 * TrackedResource inherits a tags property (Dictionary<string, string>),
 * so tag methods should be generated.
 */
const taggedResourceSpec = `
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

  model FooProperties {
    description?: string;
  }

  model Foo is TrackedResource<FooProperties> {
    ...ResourceNameParameter<Foo>;
  }

  @armResourceOperations
  interface Foos {
    get is ArmResourceRead<Foo>;
    createOrUpdate is ArmResourceCreateOrReplaceAsync<Foo>;
    update is ArmResourcePatchSync<Foo, FooProperties>;
    delete is ArmResourceDeleteSync<Foo>;
  }
`;

/**
 * TypeSpec fixture: ProxyResource with Read only.
 * ProxyResource does NOT have a tags property, so tag methods
 * should NOT be generated.
 */
const untaggedResourceSpec = `
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

  model WidgetProperties {
    color?: string;
  }

  model Widget is ProxyResource<WidgetProperties> {
    ...ResourceNameParameter<Widget>;
  }

  @armResourceOperations
  interface Widgets {
    get is ArmResourceRead<Widget>;
    createOrUpdate is ArmResourceCreateOrReplaceSync<Widget>;
    delete is ArmResourceDeleteSync<Widget>;
  }
`;

describe("ARM tag operations", () => {
  // ─── Detection: tag methods generated only when appropriate ───────────────

  /**
   * Validates that TrackedResource (which has tags property) gets all 6 tag
   * methods generated. This is the primary acceptance criterion.
   */
  it("generates tag methods for TrackedResource with Read and Update", async () => {
    const [{ outputs }, diagnostics] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const errors = diagnostics.filter((d) => d.code !== "deprecated");
    expect(errors).toHaveLength(0);

    const content = getResourceFile(outputs, "FooResource.cs");

    // All 6 tag methods should be present
    expect(content).toContain("AddTagAsync(");
    expect(content).toContain("AddTag(string key");
    expect(content).toContain("SetTagsAsync(");
    expect(content).toContain("SetTags(IDictionary<string, string>");
    expect(content).toContain("RemoveTagAsync(");
    expect(content).toContain("RemoveTag(string key");
  });

  /**
   * Validates that ProxyResource (no tags property) does NOT get tag methods.
   * This prevents generating dead code on resources that don't support tags.
   */
  it("does NOT generate tag methods for ProxyResource (no tags)", async () => {
    const [{ outputs }, diagnostics] =
      await MgmtTester.compileAndDiagnose(untaggedResourceSpec);
    const errors = diagnostics.filter((d) => d.code !== "deprecated");
    expect(errors).toHaveLength(0);

    const content = getResourceFile(outputs, "WidgetResource.cs");

    expect(content).not.toContain("AddTag");
    expect(content).not.toContain("SetTags");
    expect(content).not.toContain("RemoveTag");
  });

  // ─── AddTag method structure ──────────────────────────────────────────────

  /**
   * Validates AddTagAsync has the correct method signature:
   * public virtual async Task<Response<FooResource>> AddTagAsync(string key, string value, CancellationToken)
   */
  it("generates AddTagAsync with correct signature", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");

    expect(content).toMatch(
      /public virtual async Task<Response<FooResource>> AddTagAsync\(string key, string value, CancellationToken cancellationToken = default\)/,
    );
  });

  /**
   * Validates AddTag (sync) has the correct method signature.
   */
  it("generates AddTag sync with correct signature", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");

    expect(content).toMatch(
      /public virtual Response<FooResource> AddTag\(string key, string value, CancellationToken cancellationToken = default\)/,
    );
  });

  /**
   * Validates AddTag has parameter validation (Argument.AssertNotNull for key and value).
   */
  it("generates Argument assertions in AddTag", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");

    const method = extractMethodSection(content, "AddTagAsync(");
    expect(method).not.toBeNull();
    expect(method).toContain("Argument.AssertNotNull(key, nameof(key))");
    expect(method).toContain("Argument.AssertNotNull(value, nameof(value))");
  });

  // ─── Diagnostic scope pattern ────────────────────────────────────────────

  /**
   * Validates that each tag method creates a diagnostic scope with the
   * pattern "ClassName.OperationName" (e.g., "FooResource.AddTag").
   * This is critical for ARM SDK distributed tracing.
   */
  it("generates correct diagnostic scopes for all tag operations", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");

    expect(content).toContain('CreateScope("FooResource.AddTag")');
    expect(content).toContain('CreateScope("FooResource.SetTags")');
    expect(content).toContain('CreateScope("FooResource.RemoveTag")');

    // All should have scope.Start() and scope.Failed(e)
    const addTagMethod = extractMethodSection(content, "AddTagAsync(");
    expect(addTagMethod).toContain("scope.Start()");
    expect(addTagMethod).toContain("scope.Failed(e)");
  });

  // ─── Primary path (TagResource API) ──────────────────────────────────────

  /**
   * Validates the primary path: CanUseTagResourceAsync conditional check.
   * When TagResource API is available, tags are modified via GetTagResource().
   */
  it("generates CanUseTagResource check in primary path", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");

    const asyncMethod = extractMethodSection(content, "AddTagAsync(");
    expect(asyncMethod).toContain("CanUseTagResourceAsync(cancellationToken)");
    expect(asyncMethod).toContain(".ConfigureAwait(false)");

    const syncMethod = extractMethodSection(content, "AddTag(string key");
    expect(syncMethod).toContain("CanUseTagResource(cancellationToken)");
    expect(syncMethod).not.toContain("ConfigureAwait");
  });

  /**
   * Validates primary path: GetTagResource().Get → modify tags → CreateOrUpdate.
   */
  it("generates GetTagResource calls in primary path", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");

    const method = extractMethodSection(content, "AddTagAsync(");
    expect(method).toContain("GetTagResource().GetAsync(cancellationToken)");
    expect(method).toContain("originalTags.Value.Data.TagValues[key] = value");
    expect(method).toContain(
      "GetTagResource().CreateOrUpdateAsync(WaitUntil.Completed",
    );
  });

  /**
   * Validates primary path: re-fetches resource via CreateGetRequest after
   * modifying tags to return updated resource state.
   */
  it("generates CreateGetRequest re-fetch in primary path", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");

    const method = extractMethodSection(content, "AddTagAsync(");
    expect(method).toContain("CreateGetRequest(");
    expect(method).toContain(
      "await Pipeline.ProcessMessageAsync(message, context)",
    );
    expect(method).toContain("new FooResource(Client, response.Value)");
  });

  // ─── SetTags specific behavior ───────────────────────────────────────────

  /**
   * Validates that SetTags deletes existing tags before replacing them
   * in the primary path. This is unique to SetTags — AddTag and RemoveTag
   * do NOT delete first.
   */
  it("generates Delete step in SetTags primary path", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");

    const setTagsMethod = extractMethodSection(content, "SetTagsAsync(");
    expect(setTagsMethod).toContain("GetTagResource().DeleteAsync(");
    expect(setTagsMethod).toContain("ReplaceWith(tags)");

    // AddTag should NOT have Delete
    const addTagMethod = extractMethodSection(content, "AddTagAsync(");
    expect(addTagMethod).not.toContain("DeleteAsync(");
  });

  /**
   * Validates SetTags has correct IDictionary parameter signature.
   */
  it("generates SetTags with IDictionary parameter", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");

    expect(content).toMatch(
      /public virtual async Task<Response<FooResource>> SetTagsAsync\(IDictionary<string, string> tags/,
    );
    expect(content).toContain("Argument.AssertNotNull(tags, nameof(tags))");
  });

  // ─── RemoveTag specific behavior ─────────────────────────────────────────

  /**
   * Validates RemoveTag removes the key from TagValues in primary path.
   */
  it("generates Remove call in RemoveTag primary path", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");

    const method = extractMethodSection(content, "RemoveTagAsync(");
    expect(method).toContain("originalTags.Value.Data.TagValues.Remove(key)");
    expect(method).toContain("Argument.AssertNotNull(key, nameof(key))");
  });

  // ─── Secondary path (Update fallback) ────────────────────────────────────

  /**
   * Validates the secondary path: Get current data → modify tags → Update.
   * This path is taken when CanUseTagResource returns false.
   */
  it("generates Update fallback in secondary path", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");

    const method = extractMethodSection(content, "AddTagAsync(");
    // Gets current data
    expect(method).toContain("GetAsync(cancellationToken: cancellationToken)");
    expect(method).toContain(".Value.Data");
    // Modifies tags on current data
    expect(method).toContain("current.Tags[key] = value");
    // Calls Update
    expect(method).toContain("UpdateAsync(");
  });

  // ─── Using directives ────────────────────────────────────────────────────

  /**
   * Validates that tag methods cause correct using directives to be generated.
   * IDictionary requires System.Collections.Generic, TagResource requires
   * Azure.ResourceManager.Resources.
   */
  it("generates correct using directives for tag types", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");

    expect(content).toContain("using System.Collections.Generic;");
    expect(content).toContain("using Azure.ResourceManager.Resources;");
  });

  // ─── No unresolved symbols ────────────────────────────────────────────────

  /**
   * Critical check: ensures no unresolved refkey references in output.
   * An unresolved symbol means a refkey failed to resolve, which is
   * always a bug.
   */
  it("has no unresolved symbol references", async () => {
    const [{ outputs }] =
      await MgmtTester.compileAndDiagnose(taggedResourceSpec);
    const content = getResourceFile(outputs, "FooResource.cs");
    expect(content).not.toContain("<Unresolved Symbol:");
  });
});

// ─── Test Utilities ──────────────────────────────────────────────────────────

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
 * Extracts a method section from generated C# content.
 * Returns the text from the method signature to its closing brace.
 */
function extractMethodSection(
  content: string,
  methodSignature: string,
): string | null {
  const startIndex = content.indexOf(methodSignature);
  if (startIndex === -1) return null;

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
