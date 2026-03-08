/**
 * Unit tests for non-resource method code generation.
 *
 * Non-resource methods are provider-level operations that aren't tied to a specific
 * ARM resource (e.g., checkNameAvailability). They're detected by the resource-detection
 * pipeline and rendered in MockableProvider files + ExtensionsFile.
 *
 * These tests validate:
 * - Non-resource methods appear in the correct scope's MockableProvider file
 * - Async and sync variants are generated with proper diagnostic scopes
 * - REST client fields and lazy initialization are generated
 * - Extension methods delegate to the mockable provider
 * - Body parameters are serialized correctly
 * - Header parameters (contentType, accept) are filtered out
 * - No unresolved symbol references in any generated file
 *
 * Ground truth: Extensions/ directory in Mgmt-TypeSpec Generated output.
 *
 * @module
 */
import { describe, expect, it } from "vitest";
import { MgmtTester } from "../test-host.js";

/**
 * TypeSpec fixture that includes both an ARM resource (Baz) and a non-resource
 * operation (checkNameAvailability). The non-resource operation is at subscription
 * scope, so it should appear in MockableMgmtTypeSpecSubscriptionResource.
 *
 * Why this fixture matters: It validates that the emitter correctly separates
 * resource operations (which go on ResourceFile/CollectionFile) from non-resource
 * operations (which go on MockableProvider/ExtensionsFile).
 */
const specWithNonResourceMethod = `
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
  }

  model CheckNameRequest {
    name: string;
    type?: string;
  }

  model CheckNameResponse {
    nameAvailable: boolean;
    reason?: string;
  }

  @route("/subscriptions/{subscriptionId}/providers/MgmtTypeSpec/checkNameAvailability")
  @post
  op checkNameAvailability(
    ...Azure.ResourceManager.Foundations.SubscriptionBaseParameters,
    @body content: CheckNameRequest,
  ): CheckNameResponse;
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Finds a generated file by a partial key match.
 */
function findFile(outputs: Record<string, string>, partial: string): string {
  const key = Object.keys(outputs).find((k) => k.includes(partial));
  if (!key) {
    throw new Error(
      `File containing "${partial}" not found. Available: ${Object.keys(outputs).join(", ")}`,
    );
  }
  return outputs[key];
}

// ─── MockableProvider Non-Resource Method Tests ──────────────────────────────

describe("ARM Mockable Provider non-resource method generation", () => {
  /**
   * Validates that a MockableSubscriptionResource file is generated when
   * a subscription-scoped non-resource method exists, even though the Baz
   * resource is ResourceGroup-scoped. This scope is created solely because
   * the non-resource method targets subscription scope.
   */
  it("generates MockableSubscriptionResource with non-resource method", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(
      outputs,
      "MockableMgmtTypeSpecSubscriptionResource",
    );
    expect(content).toContain("CheckNameAvailability");
  });

  /**
   * Validates that the non-resource method generates REST client fields
   * and lazy initialization properties. Each non-resource method needs
   * a ClientDiagnostics field and a REST client field, both lazily initialized.
   */
  it("generates REST client fields with lazy initialization", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(
      outputs,
      "MockableMgmtTypeSpecSubscriptionResource",
    );

    // Private backing fields
    expect(content).toMatch(/private ClientDiagnostics _\w+ClientDiagnostics/);
    expect(content).toMatch(/private \w+ _\w+RestClient/);

    // Lazy initialization properties using ??=
    expect(content).toContain("??=");
    expect(content).toContain("new ClientDiagnostics");
    expect(content).toContain("Pipeline, Endpoint");
  });

  /**
   * Validates the async method signature follows the ARM SDK pattern:
   * Task<Response<T>> MethodAsync(params, CancellationToken)
   * with the body parameter typed to the request model.
   */
  it("generates async non-resource method with correct signature", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(
      outputs,
      "MockableMgmtTypeSpecSubscriptionResource",
    );

    // Async method with response model type
    expect(content).toContain("CheckNameAvailabilityAsync");
    expect(content).toMatch(/Task<Response<CheckNameResponse>>/);
    expect(content).toContain("CheckNameRequest content");
    expect(content).toContain("CancellationToken cancellationToken = default");
  });

  /**
   * Validates the sync method signature follows the ARM SDK pattern:
   * Response<T> Method(params, CancellationToken)
   * without async/await keywords.
   */
  it("generates sync non-resource method with correct signature", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(
      outputs,
      "MockableMgmtTypeSpecSubscriptionResource",
    );

    // Sync method without Task<>
    expect(content).toMatch(
      /public virtual Response<CheckNameResponse> CheckNameAvailability\(/,
    );
    expect(content).toContain("Pipeline.ProcessMessage(message, context)");
  });

  /**
   * Validates diagnostic scope wrapping for distributed tracing.
   * Non-resource methods must use the mockable class name in the scope name.
   */
  it("wraps non-resource method in diagnostic scope", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(
      outputs,
      "MockableMgmtTypeSpecSubscriptionResource",
    );

    expect(content).toContain("CreateScope(");
    expect(content).toContain(
      "MockableMgmtTypeSpecSubscriptionResource.CheckNameAvailability",
    );
    expect(content).toContain("scope.Start()");
    expect(content).toContain("scope.Failed(e)");
  });

  /**
   * Validates that the Create*Request call uses scope-derived parameters.
   * For subscription scope, subscriptionId should come from Id.SubscriptionId.
   */
  it("uses scope-derived subscription ID in request creation", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(
      outputs,
      "MockableMgmtTypeSpecSubscriptionResource",
    );

    expect(content).toContain("CreateCheckNameAvailabilityRequest");
    expect(content).toContain("Guid.Parse(Id.SubscriptionId)");
  });

  /**
   * Validates that body parameters are serialized via static ToRequestContent().
   * ARM uses the static pattern: ModelType.ToRequestContent(body) — this matches
   * the legacy Azure SDK where ToRequestContent is a static method on the model's
   * serialization partial class.
   */
  it("serializes body parameter with static ToRequestContent", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(
      outputs,
      "MockableMgmtTypeSpecSubscriptionResource",
    );

    // Verify static call pattern: CheckNameRequest.ToRequestContent(content)
    expect(content).toContain("CheckNameRequest.ToRequestContent(content)");
  });

  /**
   * Validates required body parameter assertion.
   * Non-optional body parameters must have Argument.AssertNotNull.
   */
  it("validates required body parameter", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(
      outputs,
      "MockableMgmtTypeSpecSubscriptionResource",
    );

    expect(content).toContain(
      "Argument.AssertNotNull(content, nameof(content))",
    );
  });

  /**
   * Validates that auto-generated HTTP header parameters (contentType, accept)
   * are NOT exposed in the method signature. These are internal HTTP details
   * that shouldn't leak into the consumer-facing API.
   */
  it("filters out contentType and accept header parameters", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(
      outputs,
      "MockableMgmtTypeSpecSubscriptionResource",
    );

    // These header params should NOT appear in the method signature
    expect(content).not.toMatch(
      /CheckNameAvailability(Async)?\([^)]*contentType/,
    );
    expect(content).not.toMatch(/CheckNameAvailability(Async)?\([^)]*accept/);
  });

  /**
   * Validates response deserialization follows the ARM SDK pattern:
   * Response.FromValue(Model.FromResponse(result), result)
   */
  it("deserializes response with FromResponse pattern", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(
      outputs,
      "MockableMgmtTypeSpecSubscriptionResource",
    );

    expect(content).toContain("CheckNameResponse.FromResponse(result)");
    expect(content).toContain("Response.FromValue(");
  });

  /**
   * Validates null response check with RequestFailedException.
   * The ARM SDK pattern requires throwing if the deserialized value is null.
   */
  it("throws RequestFailedException on null response", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(
      outputs,
      "MockableMgmtTypeSpecSubscriptionResource",
    );

    expect(content).toContain("response.Value == null");
    expect(content).toContain("RequestFailedException");
  });
});

// ─── Extensions Non-Resource Method Tests ────────────────────────────────────

describe("ARM Extensions non-resource method generation", () => {
  /**
   * Validates that async extension method is generated for the non-resource
   * operation, delegating to the MockableSubscriptionResource.
   */
  it("generates async extension method for non-resource operation", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(outputs, "MgmtTypeSpecExtensions.cs");

    expect(content).toContain("CheckNameAvailabilityAsync");
    expect(content).toContain("this SubscriptionResource subscriptionResource");
    expect(content).toContain(".ConfigureAwait(false)");
  });

  /**
   * Validates that sync extension method is generated, without async/await.
   */
  it("generates sync extension method for non-resource operation", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(outputs, "MgmtTypeSpecExtensions.cs");

    // Sync method should exist (may span lines due to formatting)
    expect(content).toContain("CheckNameAvailability(");
    // Should have a non-async version returning Response<CheckNameResponse>
    expect(content).toMatch(
      /public static .*Response<.*CheckNameResponse.*> CheckNameAvailability\(/s,
    );
  });

  /**
   * Validates that extension methods delegate to the mockable provider.
   * The pattern is: GetMockableXxx(scope).MethodName(args)
   */
  it("delegates to mockable provider", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(outputs, "MgmtTypeSpecExtensions.cs");

    expect(content).toContain(
      "GetMockableMgmtTypeSpecSubscriptionResource(subscriptionResource).CheckNameAvailabilityAsync(",
    );
  });

  /**
   * Validates that extension methods validate the scope parameter as not null.
   */
  it("validates scope parameter in extension method", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(outputs, "MgmtTypeSpecExtensions.cs");

    expect(content).toContain(
      "Argument.AssertNotNull(subscriptionResource, nameof(subscriptionResource))",
    );
  });

  /**
   * Validates that extension methods include mocking hints in XML documentation.
   */
  it("includes mocking hints in extension method docs", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    const content = findFile(outputs, "MgmtTypeSpecExtensions.cs");

    expect(content).toContain("To mock this method");
    expect(content).toContain(
      "MockableMgmtTypeSpecSubscriptionResource.CheckNameAvailability",
    );
  });

  /**
   * Critical check: no unresolved symbol references in any generated file.
   * Unresolved refkeys indicate broken cross-file reference resolution.
   */
  it("has no unresolved symbol references in any file", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(
      specWithNonResourceMethod,
    );

    for (const key of Object.keys(outputs)) {
      expect(outputs[key]).not.toContain("Unresolved Symbol");
    }
  });
});
