/**
 * Unit tests for [WirePath] attribute generation on model properties.
 *
 * When the `enable-wire-path-attribute` emitter option is true, model
 * properties are annotated with `[WirePath("serializedName")]` indicating
 * their HTTP wire-format path. Flattened properties get dot-notation paths
 * (e.g., `[WirePath("properties.sku")]`).
 *
 * This is an ARM-specific feature used for runtime reflection on model
 * properties. When the option is false (default), no WirePath attributes
 * are emitted.
 *
 * Ground truth: Legacy emitter's WirePathVisitor.cs and generated output in
 * submodules/azure-sdk-for-net/eng/packages/http-client-csharp-mgmt/
 * generator/TestProjects/Local/Mgmt-TypeSpec/src/Generated/
 *
 * @module
 */
import { describe, expect, it } from "vitest";
import { MgmtApiTester } from "./test-host.js";

/**
 * Tester configured with `enable-wire-path-attribute: true` to activate
 * WirePath attribute generation. This is separate from the default
 * MgmtTester because the option defaults to false.
 */
const WirePathTester = MgmtApiTester.emit("http-client-csharp", {
  flavor: "azure",
  management: true,
  "enable-wire-path-attribute": true,
}).importLibraries();

/**
 * Tester with wire path attribute DISABLED (the default).
 * Used to verify that no WirePath attributes appear when the option is off.
 */
const NoWirePathTester = MgmtApiTester.emit("http-client-csharp", {
  flavor: "azure",
  management: true,
  "enable-wire-path-attribute": false,
}).importLibraries();

/**
 * ARM TypeSpec fixture with a tracked resource that has:
 * - Regular (non-flattened) properties
 * - A flattened property (@flattenProperty) with multiple inner properties
 *
 * This exercises both the simple `[WirePath("serializedName")]` path for
 * regular properties and the dot-notation `[WirePath("properties.sku")]`
 * path for flattened properties.
 */
const wirePathSpec = `
  using TypeSpec.Rest;
  using TypeSpec.Http;
  using TypeSpec.Versioning;
  using Azure.ResourceManager;
  using Azure.ClientGenerator.Core;
  using Azure.ClientGenerator.Core.Legacy;

  @armProviderNamespace
  @service(#{title: "WirePathTest"})
  @versioned(Versions)
  namespace WirePathTest;

  enum Versions {
    v2024_01_01: "2024-01-01",
  }

  interface Operations extends Azure.ResourceManager.Operations {}

  model WidgetInnerProps {
    /** The SKU of the widget. */
    sku?: string;
    /** Whether the widget is disabled. */
    disabled?: boolean;
  }

  model WidgetProperties {
    /** Description of the widget. */
    description?: string;
    /** Inner properties to flatten. */
    @flattenProperty
    inner: WidgetInnerProps;
  }

  model Widget is TrackedResource<WidgetProperties> {
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
      .filter((k) => k.endsWith(".cs"))
      .join("\n  ");
    throw new Error(
      `File ending with "${suffix}" not found.\nAvailable .cs files:\n  ${available}`,
    );
  }
  return outputs[key];
}

// ─── WirePath Attribute File Generation ──────────────────────────────────────

describe("[WirePath] attribute generation", () => {
  /**
   * When `enable-wire-path-attribute` is true, the emitter should generate
   * the WirePathAttribute.cs internal class file that defines the attribute
   * used on model properties.
   *
   * Why this matters: without the attribute definition, the generated
   * `[WirePath("...")]` annotations would cause C# compilation errors.
   */
  it("generates WirePathAttribute.cs when option is enabled", async () => {
    const [{ outputs }] = await WirePathTester.compileAndDiagnose(wirePathSpec);

    const wirePathAttrFile = findFile(outputs, "WirePathAttribute.cs");
    expect(wirePathAttrFile).toContain(
      "internal partial class WirePathAttribute : Attribute",
    );
    expect(wirePathAttrFile).toContain(
      "AttributeUsage(AttributeTargets.Property)",
    );
    expect(wirePathAttrFile).toContain(
      "public WirePathAttribute(string wirePath)",
    );
    expect(wirePathAttrFile).toContain("private string _wirePath;");
  });

  /**
   * When `enable-wire-path-attribute` is false (default), the emitter
   * should NOT generate the WirePathAttribute.cs file.
   *
   * Why this matters: the attribute file is unnecessary overhead when
   * wire path tracking is not needed.
   */
  it("does not generate WirePathAttribute.cs when option is disabled", async () => {
    const [{ outputs }] =
      await NoWirePathTester.compileAndDiagnose(wirePathSpec);

    const wirePathFile = Object.keys(outputs).find((k) =>
      k.endsWith("WirePathAttribute.cs"),
    );
    expect(wirePathFile).toBeUndefined();
  });

  // ─── Regular Property Wire Path ──────────────────────────────────────────

  /**
   * Regular (non-flattened) model properties should get `[WirePath("serializedName")]`
   * using their serialized wire name. For example, `description` gets
   * `[WirePath("description")]`.
   *
   * Why this matters: ARM SDKs use this attribute at runtime to map C#
   * properties to their JSON wire paths for request/response processing.
   */
  it("emits [WirePath] on regular model properties when enabled", async () => {
    const [{ outputs }] = await WirePathTester.compileAndDiagnose(wirePathSpec);

    const widgetPropsFile = findFile(outputs, "WidgetProperties.cs");

    // The description property should have [WirePath("description")]
    expect(widgetPropsFile).toContain('[WirePath("description")]');
  });

  /**
   * The flattened backing property (the one with `flatten: true` that becomes
   * internal) should also get a `[WirePath]` attribute with its serialized name.
   *
   * Why this matters: even though the backing property is internal, ARM
   * runtime code needs to know its wire path for serialization mapping.
   */
  it("emits [WirePath] on flattened backing properties", async () => {
    const [{ outputs }] = await WirePathTester.compileAndDiagnose(wirePathSpec);

    const widgetPropsFile = findFile(outputs, "WidgetProperties.cs");

    // The inner backing property should have [WirePath("inner")]
    expect(widgetPropsFile).toContain('[WirePath("inner")]');
  });

  // ─── Flattened Property Wire Path ────────────────────────────────────────

  /**
   * Flattened (promoted) properties should get dot-notation wire paths
   * that trace through the flatten hierarchy. For example, a property
   * flattened from `inner.sku` gets `[WirePath("inner.sku")]`.
   *
   * Why this matters: flattened properties have a different wire path
   * than their C# property name suggests. The dot notation preserves
   * the actual JSON structure for runtime mapping.
   */
  it("emits dot-notation [WirePath] on flattened promoted properties", async () => {
    const [{ outputs }] = await WirePathTester.compileAndDiagnose(wirePathSpec);

    const widgetPropsFile = findFile(outputs, "WidgetProperties.cs");

    // Flattened properties should have dot-notation wire paths
    expect(widgetPropsFile).toContain('[WirePath("inner.sku")]');
    expect(widgetPropsFile).toContain('[WirePath("inner.disabled")]');
  });

  // ─── Disabled State ──────────────────────────────────────────────────────

  /**
   * When `enable-wire-path-attribute` is false (default), no model
   * properties should have `[WirePath]` attributes.
   *
   * Why this matters: WirePath is opt-in. The default behavior must not
   * include any WirePath attributes to avoid breaking non-ARM projects.
   */
  it("does not emit [WirePath] when option is disabled", async () => {
    const [{ outputs }] =
      await NoWirePathTester.compileAndDiagnose(wirePathSpec);

    const widgetPropsFile = findFile(outputs, "WidgetProperties.cs");
    expect(widgetPropsFile).not.toContain("[WirePath");
  });

  // ─── No Unresolved Symbols ───────────────────────────────────────────────

  /**
   * The generated output must never contain unresolved symbol markers.
   * This is especially important for the WirePath refkey, which crosses
   * from the Internal/ directory to the Models/ directory.
   *
   * Why this matters: unresolved symbols produce invalid C# code.
   */
  it("does not produce unresolved symbols when wire path is enabled", async () => {
    const [{ outputs }] = await WirePathTester.compileAndDiagnose(wirePathSpec);

    for (const [path, content] of Object.entries(outputs)) {
      expect(content, `Unresolved symbol in ${path}`).not.toContain(
        "<Unresolved Symbol:",
      );
    }
  });
});
