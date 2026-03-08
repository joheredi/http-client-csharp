/**
 * Unit tests for ARM model bridge methods (FromResponse and ToRequestContent).
 *
 * These tests validate the ArmFromResponse and ArmToRequestContent components
 * that generate serialization bridge methods on ARM model serialization classes.
 *
 * Why these tests matter:
 * - ARM resource/collection/mockable-provider classes call these methods as
 *   static methods: `ModelType.FromResponse(response)` and
 *   `ModelType.ToRequestContent(data)`. If the signatures don't match,
 *   the generated code fails with CS0117 errors (404+ across all ARM specs).
 * - The legacy Azure SDK pattern requires:
 *   - FromResponse: `internal static T FromResponse(Response response)` using
 *     JsonDocumentOptions and WireOptions
 *   - ToRequestContent: `internal static RequestContent ToRequestContent(T model)`
 *     with null check and WireOptions
 * - These methods bridge Azure.Response/RequestContent with IJsonModel<T>
 *   serialization.
 *
 * Ground truth: *.Serialization.cs files in Mgmt-TypeSpec test project
 * (e.g., BarData.Serialization.cs, FooData.Serialization.cs).
 *
 * @module
 */
import { describe, expect, it } from "vitest";
import { MgmtTester } from "../test-host.js";

/**
 * TypeSpec fixture with a tracked ARM resource (Baz) that has both input and
 * output usage. This ensures both FromResponse (output) and ToRequestContent
 * (input) bridge methods are generated on the model's serialization file.
 */
const armResourceSpec = `
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
`;

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

describe("ARM model bridge methods (FromResponse/ToRequestContent)", () => {
  /**
   * Validates that the FromResponse method is generated as internal static
   * with the correct signature. This is the entry point for deserializing
   * ARM response bodies into model instances.
   */
  it("generates internal static FromResponse method", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(armResourceSpec);

    const content = findFile(outputs, "Baz.Serialization");

    expect(content).toContain(
      "internal static Baz FromResponse(Response response)",
    );
  });

  /**
   * Validates that FromResponse uses JsonDocumentOptions for consistent parsing.
   * The legacy pattern uses ModelSerializationExtensions.JsonDocumentOptions
   * (MaxDepth = 256) to avoid stack overflow on deeply nested JSON.
   */
  it("FromResponse uses JsonDocumentOptions for parsing", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(armResourceSpec);

    const content = findFile(outputs, "Baz.Serialization");

    expect(content).toContain(
      "JsonDocument.Parse(response.Content, ModelSerializationExtensions.JsonDocumentOptions)",
    );
  });

  /**
   * Validates that FromResponse delegates to the Deserialize method with
   * WireOptions for correct wire-format deserialization.
   */
  it("FromResponse calls Deserialize with WireOptions", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(armResourceSpec);

    const content = findFile(outputs, "Baz.Serialization");

    expect(content).toContain(
      "DeserializeBaz(document.RootElement, ModelSerializationExtensions.WireOptions)",
    );
  });

  /**
   * Validates that ToRequestContent is generated as a static method (not instance).
   * The legacy pattern uses `internal static RequestContent ToRequestContent(T model)`.
   * Callers use the static form: `ModelType.ToRequestContent(data)`.
   */
  it("generates internal static ToRequestContent method", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(armResourceSpec);

    const content = findFile(outputs, "Baz.Serialization");

    expect(content).toContain(
      "internal static RequestContent ToRequestContent(Baz baz)",
    );
  });

  /**
   * Validates the null check in ToRequestContent. The legacy pattern returns
   * null when the input is null, which is essential for optional body parameters
   * in ARM operations.
   */
  it("ToRequestContent includes null check", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(armResourceSpec);

    const content = findFile(outputs, "Baz.Serialization");

    expect(content).toContain("if (baz == null)");
    expect(content).toContain("return null;");
  });

  /**
   * Validates that ToRequestContent passes WireOptions to WriteObjectValue.
   * This ensures the model is serialized with the correct wire format options,
   * matching the legacy Azure SDK pattern.
   */
  it("ToRequestContent passes WireOptions to WriteObjectValue", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(armResourceSpec);

    const content = findFile(outputs, "Baz.Serialization");

    expect(content).toContain(
      "content.JsonWriter.WriteObjectValue(baz, ModelSerializationExtensions.WireOptions)",
    );
  });

  /**
   * Validates that FromResponse uses a using declaration for JsonDocument
   * to ensure deterministic disposal of the parsed document.
   */
  it("FromResponse uses 'using' declaration for JsonDocument", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(armResourceSpec);

    const content = findFile(outputs, "Baz.Serialization");

    expect(content).toMatch(/using\s+JsonDocument\s+document\s*=/);
  });

  /**
   * Validates that no unresolved symbol references appear in the serialization
   * output. Unresolved symbols indicate broken refkey resolution, which would
   * cause compilation failures.
   */
  it("has no unresolved symbol references in serialization file", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(armResourceSpec);

    const content = findFile(outputs, "Baz.Serialization");

    expect(content).not.toContain("<Unresolved Symbol:");
  });
});
