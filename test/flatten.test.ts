/**
 * Unit tests for property flattening (@flattenProperty support).
 *
 * These tests validate that the emitter generates correct C# code when
 * a model property has `flatten: true` (from TCGC's `@flattenProperty`
 * decorator from `Azure.ClientGenerator.Core.Legacy`). Property flattening
 * unwraps nested model properties into the parent model as computed
 * getter/setter properties, while the original property becomes an internal
 * backing field.
 *
 * This is a critical ARM pattern — e.g., `ProxyResource<T>.properties`
 * is always flattened so users access `resource.Name` directly instead
 * of `resource.Properties.Name`.
 *
 * Key invariant validated here: **serialization is unchanged**. The
 * backing model serializes/deserializes as a nested JSON object. Only
 * the C# model class API surface changes.
 *
 * Ground truth: Generated output in
 * submodules/azure-sdk-for-net/eng/packages/http-client-csharp-mgmt/
 * generator/TestProjects/Local/Mgmt-TypeSpec/src/Generated/
 *
 * @module
 */
import { describe, expect, it } from "vitest";
import { AzureHttpTester, MgmtTester } from "./test-host.js";

/**
 * ARM TypeSpec fixture with explicit `@flattenProperty` on an inner model.
 *
 * Uses `@@flattenProperty` from `Azure.ClientGenerator.Core.Legacy` to flatten
 * `Outer.inner` into the parent model. The `InnerProps` model has multiple
 * public properties, so regular flatten (not safe-flatten) should be used.
 *
 * Expected behavior:
 * - `Outer.inner` becomes `internal InnerProps Inner { get; set; }`
 * - `Outer` gains computed `DisplayName` and `Enabled` properties
 * - Serialization of Outer writes `inner` as a nested object (unchanged)
 */
const flattenSpec = `
  using TypeSpec.Rest;
  using TypeSpec.Http;
  using TypeSpec.Versioning;
  using Azure.ResourceManager;
  using Azure.ClientGenerator.Core;
  using Azure.ClientGenerator.Core.Legacy;

  @armProviderNamespace
  @service(#{title: "FlattenTest"})
  @versioned(Versions)
  namespace FlattenTest;

  enum Versions {
    v2024_01_01: "2024-01-01",
  }

  interface Operations extends Azure.ResourceManager.Operations {}

  model InnerProps {
    /** The display name of the widget. */
    displayName?: string;
    /** Whether the widget is enabled. */
    enabled?: boolean;
  }

  model Outer {
    /** Description of the outer model. */
    description?: string;
    /** Inner properties to flatten. */
    @flattenProperty
    inner: InnerProps;
  }

  model Widget is TrackedResource<Outer> {
    ...ResourceNameParameter<Widget>;
  }

  @armResourceOperations
  interface Widgets {
    get is ArmResourceRead<Widget>;
    createOrUpdate is ArmResourceCreateOrReplaceAsync<Widget>;
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
      .filter((k) => k.includes("Models/"))
      .join("\n  ");
    throw new Error(
      `File ending with "${suffix}" not found.\nModel files:\n  ${available}`,
    );
  }
  return outputs[key];
}

// ─── Flattened Backing Property Tests ────────────────────────────────────────

describe("property flattening (@flattenProperty)", () => {
  /**
   * When a property has `flatten: true`, it should become `internal` in the
   * generated C# class. This test validates that the backing property (the
   * original flattened property) loses its `public` access modifier.
   *
   * Why this matters: if the backing property stays public, users would see
   * BOTH the backing property and the promoted properties, which is confusing.
   */
  it("renders backing property as internal when flatten is true", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(flattenSpec);

    const outerFile = findFile(outputs, "Outer.cs");

    // The Inner property should be internal, not public
    expect(outerFile).toContain("internal InnerProps Inner");
    expect(outerFile).not.toMatch(/public\s+InnerProps\s+Inner/);
  });

  /**
   * Flattened properties from the inner model should appear as computed
   * getter/setter properties on the parent model. Each promoted property
   * delegates to the internal backing property.
   *
   * Why this matters: the whole point of flattening is to present a flat
   * API surface. Users access `outer.DisplayName` instead of
   * `outer.Inner.DisplayName`.
   */
  it("promotes inner model properties as computed properties", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(flattenSpec);
    const outerFile = findFile(outputs, "Outer.cs");

    // Should have promoted DisplayName property with getter/setter
    expect(outerFile).toContain("public string? DisplayName");
    expect(outerFile).toContain("Inner is null ? default : Inner.DisplayName");

    // Should have promoted Enabled property with getter/setter
    expect(outerFile).toContain("public bool? Enabled");
    expect(outerFile).toContain("Inner is null ? default : Inner.Enabled");
  });

  /**
   * The computed property setters should lazy-initialize the backing property
   * when it is null, then assign the inner property value. This prevents
   * NullReferenceException when setting a flattened property before the
   * backing property has been initialized.
   *
   * Why this matters: users may create a new instance and set individual
   * properties — the backing model must be auto-created on first write.
   */
  it("generates lazy-init setter for computed properties", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(flattenSpec);
    const outerFile = findFile(outputs, "Outer.cs");

    // The setter should check if Inner is null and initialize it
    expect(outerFile).toContain("if (Inner is null)");
    expect(outerFile).toContain("Inner = new InnerProps();");
  });

  /**
   * For nullable value type properties (like bool?), the setter must use
   * `.Value` to convert from the nullable input to the backing property's
   * value type. This prevents implicit conversion errors in C#.
   *
   * Why this matters: C# requires explicit .Value access when converting
   * from `bool?` to `bool`. Without it, the generated code won't compile.
   */
  it("uses .Value accessor for nullable value type setters", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(flattenSpec);
    const outerFile = findFile(outputs, "Outer.cs");

    // The bool? Enabled setter should use value.Value
    expect(outerFile).toContain("Inner.Enabled = value.Value;");
  });

  /**
   * Non-flattened properties on the same model should render normally
   * (as standard auto-properties), unaffected by the flatten logic.
   *
   * Why this matters: flatten should only affect properties with
   * `flatten: true`, not all properties on the model.
   */
  it("does not affect non-flattened properties", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(flattenSpec);
    const outerFile = findFile(outputs, "Outer.cs");

    // Description should be a normal public auto-property
    expect(outerFile).toContain("public string? Description { get; set; }");
  });

  /**
   * Serialization of the parent model should be unchanged by flattening.
   * The serialization code writes/reads the backing model as a nested
   * JSON object. The computed properties are purely C# API surface.
   *
   * Why this matters: if serialization changed, the wire format would
   * differ from what the server expects, causing API call failures.
   */
  it("does not affect serialization (backing model serializes normally)", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(flattenSpec);
    const serializationFile = findFile(outputs, "Outer.Serialization.cs");

    // Serialization should write the nested "inner" object
    expect(serializationFile).toContain('"inner"');
    // Should reference the inner model's deserialization
    expect(serializationFile).toContain("DeserializeInnerProps");
  });

  /**
   * The inner model (InnerProps) should still be generated normally
   * with its own properties and serialization. Flattening only changes
   * the parent model's API surface, not the inner model itself.
   *
   * Why this matters: the inner model is still used for serialization
   * and needs to maintain its own structure for correct JSON mapping.
   */
  it("generates inner model normally (unchanged by flatten)", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(flattenSpec);
    const innerModelFile = findFile(outputs, "InnerProps.cs");

    // Inner model should have its own normal properties
    expect(innerModelFile).toContain("public string? DisplayName");
    expect(innerModelFile).toContain("public bool? Enabled");
  });

  /**
   * The generated output must never contain unresolved symbol markers.
   * These indicate broken refkey references (e.g., the backing model
   * type reference failed to resolve).
   *
   * Why this matters: unresolved symbols produce invalid C# code that
   * won't compile. This is a critical correctness gate.
   */
  it("does not produce unresolved symbols", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(flattenSpec);

    for (const [path, content] of Object.entries(outputs)) {
      expect(content, `Unresolved symbol in ${path}`).not.toContain(
        "<Unresolved Symbol:",
      );
    }
  });

  /**
   * The doc comments from the inner model's properties should be
   * preserved on the promoted computed properties.
   *
   * Why this matters: documentation helps users understand the API
   * surface without looking at the inner model.
   */
  it("preserves doc comments on promoted properties", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(flattenSpec);
    const outerFile = findFile(outputs, "Outer.cs");

    // Doc comments from InnerProps should appear on promoted properties
    expect(outerFile).toContain("The display name of the widget.");
    expect(outerFile).toContain("Whether the widget is enabled.");
  });
});

// ─── Non-management (data-plane) flatten behavior ────────────────────────────

/**
 * Non-ARM TypeSpec fixture with `@flattenProperty` on a nested model.
 *
 * Mirrors the azure/client-generator-core/flatten-property spec.
 * When `management` is false, model-level flattening should NOT be applied.
 * Properties should remain public on their models (matching legacy behavior).
 *
 * Ground truth: Legacy emitter generates NestedFlattenModel with a PUBLIC
 * `Properties` property of type `ChildFlattenModel`, NOT internal backing +
 * promoted computed properties.
 */
const nonArmFlattenSpec = `
  using TypeSpec.Http;
  using Azure.ClientGenerator.Core;
  using Azure.ClientGenerator.Core.Legacy;

  @service(#{title: "FlattenPropertyTest"})
  namespace FlattenPropertyTest;

  model ChildModel {
    description: string;
    age: int32;
  }

  model ChildFlattenModel {
    summary: string;
    #suppress "@azure-tools/typespec-azure-core/no-legacy-usage" "Testing backcompat"
    @flattenProperty
    properties: ChildModel;
  }

  model NestedFlattenModel {
    name: string;
    #suppress "@azure-tools/typespec-azure-core/no-legacy-usage" "Testing backcompat"
    @flattenProperty
    properties: ChildFlattenModel;
  }

  @route("/nestedFlattenModel")
  @put op putNestedFlattenModel(@body input: NestedFlattenModel): NestedFlattenModel;
`;

describe("property flattening (non-management / data-plane)", () => {
  /**
   * When management is false, model-level flattening should NOT occur.
   * Properties with `@flattenProperty` should remain PUBLIC on the model,
   * not become internal backing fields with promoted computed properties.
   *
   * Why this matters: the legacy C# emitter does not apply model-level
   * flattening for non-ARM specs. The flatten-property spec keeps
   * `Properties` as a public property. Without this guard, a duplicate
   * `Properties` member (CS0102) is generated when the inner model also
   * has a `properties` field.
   *
   * Ground truth: submodules/azure-sdk-for-net/.../flatten-property/
   * src/Generated/Models/NestedFlattenModel.cs — `Properties` is public.
   */
  it("does not flatten properties when management is false", async () => {
    const [{ outputs }] =
      await AzureHttpTester.compileAndDiagnose(nonArmFlattenSpec);
    const nestedFile = findFile(outputs, "NestedFlattenModel.cs");

    // Properties should remain public (not internal)
    expect(nestedFile).toContain("public ChildFlattenModel Properties");
    expect(nestedFile).not.toMatch(/internal\s+ChildFlattenModel\s+Properties/);

    // Should NOT have promoted computed properties from ChildFlattenModel
    expect(nestedFile).not.toContain("Properties is null ? default :");
  });

  /**
   * Verifies no CS0102 (duplicate member) is possible — when flatten is
   * not applied, NestedFlattenModel has exactly one `Properties` member.
   *
   * Why this matters: this was the original bug (CS0102) that blocked the
   * flatten-property spec from building. The internal backing `Properties`
   * and promoted `Properties` from ChildFlattenModel.properties collided.
   */
  it("does not produce duplicate Properties members", async () => {
    const [{ outputs }] =
      await AzureHttpTester.compileAndDiagnose(nonArmFlattenSpec);
    const nestedFile = findFile(outputs, "NestedFlattenModel.cs");

    // Count occurrences of "Properties" as a declared member
    const propertiesDeclarations = nestedFile.match(
      /(?:public|internal)\s+\w+\s+Properties\s*\{/g,
    );
    expect(propertiesDeclarations?.length).toBe(1);
  });

  /**
   * Inner models (ChildFlattenModel, ChildModel) should also keep their
   * properties public when management is false.
   */
  it("inner models keep properties public", async () => {
    const [{ outputs }] =
      await AzureHttpTester.compileAndDiagnose(nonArmFlattenSpec);
    const childFlattenFile = findFile(outputs, "ChildFlattenModel.cs");

    // ChildFlattenModel.Properties should be public
    expect(childFlattenFile).toContain("public ChildModel Properties");
    expect(childFlattenFile).not.toMatch(/internal\s+ChildModel\s+Properties/);
  });

  /**
   * The generated output must never contain unresolved symbol markers.
   */
  it("does not produce unresolved symbols", async () => {
    const [{ outputs }] =
      await AzureHttpTester.compileAndDiagnose(nonArmFlattenSpec);

    for (const [path, content] of Object.entries(outputs)) {
      expect(content, `Unresolved symbol in ${path}`).not.toContain(
        "<Unresolved Symbol:",
      );
    }
  });
});
