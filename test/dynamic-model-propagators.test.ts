import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for patch propagator generation in dynamic (JSON Merge Patch) models.
 *
 * When a dynamic model has properties whose type tree contains other dynamic
 * models (e.g., `Resource` with `children: Resource[]`), the serialization
 * constructor calls `_patch.SetPropagators(PropagateSet, PropagateGet)` and
 * `PropagateGet`/`PropagateSet` methods are generated in the serialization
 * partial class.
 *
 * These propagator methods enable the `JsonPatch` to delegate get/set
 * operations to nested dynamic model patches when a JSON path navigates
 * through nested dynamic model properties (arrays, dicts, or direct refs).
 *
 * Why these tests matter:
 * - Without propagators, changes to nested dynamic models are not tracked
 *   by the parent model's patch, breaking JSON Merge Patch semantics.
 * - The propagator pattern must exactly match the legacy emitter's output
 *   for Azure SDK compatibility.
 */
describe("DynamicModelPropagators", () => {
  /**
   * Validates that a dynamic model with a self-referencing array property
   * generates the SetPropagators call in the serialization constructor.
   * This is the signal that propagation is needed — it connects PropagateGet
   * and PropagateSet methods to the JsonPatch instance.
   */
  it("generates SetPropagators call for model with dynamic model array", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
        children?: Resource[];
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const modelFile = outputs["src/Generated/Models/Resource.cs"];
    expect(modelFile).toBeDefined();

    // SetPropagators call should be present in serialization constructor
    expect(modelFile).toContain(
      "_patch.SetPropagators(PropagateSet, PropagateGet);",
    );
  });

  /**
   * Validates that a dynamic model WITHOUT nested dynamic model properties
   * does NOT generate SetPropagators or propagator methods.
   * For example, a model with only string properties has no nested dynamic
   * models to propagate changes to.
   */
  it("does not generate SetPropagators for model without dynamic model properties", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model SimpleResource {
        name: string;
        description?: string;
      }

      @route("/resources")
      @patch op updateResource(@body body: SimpleResource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const modelFile = outputs["src/Generated/Models/SimpleResource.cs"];
    expect(modelFile).toBeDefined();

    // No SetPropagators — model has no nested dynamic model properties
    expect(modelFile).not.toContain("SetPropagators");
    // But should still have in JsonPatch patch parameter
    expect(modelFile).toContain("in JsonPatch patch");
    expect(modelFile).toContain("_patch = patch;");

    const serFile =
      outputs["src/Generated/Models/SimpleResource.Serialization.cs"];
    expect(serFile).toBeDefined();

    // No PropagateGet/PropagateSet methods
    expect(serFile).not.toContain("PropagateGet");
    expect(serFile).not.toContain("PropagateSet");
  });

  /**
   * Validates that PropagateGet method is generated with correct signature
   * and structure for a model with an array of dynamic models.
   *
   * PropagateGet navigates the JSON path to find the nested dynamic model
   * patch and reads the encoded value from it.
   */
  it("generates PropagateGet method for array property", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
        children?: Resource[];
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = outputs["src/Generated/Models/Resource.Serialization.cs"];
    expect(serFile).toBeDefined();

    // PropagateGet method signature
    expect(serFile).toContain(
      "private bool PropagateGet(ReadOnlySpan<byte> jsonPath, out JsonPatch.EncodedValue value)",
    );

    // Navigation: SliceToStartOfPropertyName + property name check
    expect(serFile).toContain(
      "ReadOnlySpan<byte> local = jsonPath.SliceToStartOfPropertyName();",
    );
    expect(serFile).toContain('if (local.StartsWith("children"u8))');

    // Array navigation: TryGetIndex
    expect(serFile).toContain(
      "if (!currentSlice.TryGetIndex(out int index, out int bytesConsumed))",
    );

    // Delegate to nested model's patch: TryGetEncodedValue
    expect(serFile).toContain(
      'Children[index].Patch.TryGetEncodedValue([.. "$"u8, .. currentSlice.Slice(bytesConsumed)], out value)',
    );

    // Wrapped in SCME0001 pragma
    const propagateGetStart = serFile.indexOf("PropagateGet(");
    const beforePropagateGet = serFile.substring(
      Math.max(0, propagateGetStart - 200),
      propagateGetStart,
    );
    expect(beforePropagateGet).toContain("#pragma warning disable SCME0001");
  });

  /**
   * Validates that PropagateSet method is generated with correct signature
   * and structure for a model with an array of dynamic models.
   *
   * PropagateSet navigates the JSON path to find the nested dynamic model
   * patch and sets the value on it.
   */
  it("generates PropagateSet method for array property", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
        children?: Resource[];
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = outputs["src/Generated/Models/Resource.Serialization.cs"];
    expect(serFile).toBeDefined();

    // PropagateSet method signature
    expect(serFile).toContain(
      "private bool PropagateSet(ReadOnlySpan<byte> jsonPath, JsonPatch.EncodedValue value)",
    );

    // Navigation: same as PropagateGet
    expect(serFile).toContain('if (local.StartsWith("children"u8))');

    // Array navigation: TryGetIndex
    expect(serFile).toContain(
      "if (!currentSlice.TryGetIndex(out int index, out int bytesConsumed))",
    );

    // Delegate to nested model's patch: Patch.Set + return true
    expect(serFile).toContain(
      'Children[index].Patch.Set([.. "$"u8, .. currentSlice.Slice(bytesConsumed)], value);',
    );
    expect(serFile).toContain("return true;");
  });

  /**
   * Validates that the serialization constructor uses `in JsonPatch patch`
   * instead of `IDictionary<string, BinaryData> additionalBinaryDataProperties`
   * for dynamic models.
   *
   * This is a fundamental change: dynamic models track changes via JsonPatch
   * instead of a dictionary of additional properties.
   */
  it("uses JsonPatch in serialization constructor instead of additionalBinaryDataProperties", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const modelFile = outputs["src/Generated/Models/Resource.cs"];
    expect(modelFile).toBeDefined();

    // Should use in JsonPatch patch
    expect(modelFile).toContain("in JsonPatch patch)");
    expect(modelFile).toContain("_patch = patch;");

    // Should NOT have additionalBinaryDataProperties
    expect(modelFile).not.toContain("additionalBinaryDataProperties");
    expect(modelFile).not.toContain("_additionalBinaryDataProperties");
  });

  /**
   * Validates that the serialization constructor is wrapped in
   * SCME0001 pragma to suppress experimental API warnings from JsonPatch usage.
   */
  it("wraps serialization constructor in SCME0001 pragma", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const modelFile = outputs["src/Generated/Models/Resource.cs"];
    expect(modelFile).toBeDefined();

    // Find the serialization constructor
    const ctorIndex = modelFile.indexOf("in JsonPatch patch)");
    expect(ctorIndex).toBeGreaterThan(0);

    // SCME0001 pragma should wrap the constructor
    const beforeCtor = modelFile.substring(
      Math.max(0, ctorIndex - 200),
      ctorIndex,
    );
    expect(beforeCtor).toContain("#pragma warning disable SCME0001");

    const afterCtor = modelFile.substring(ctorIndex, ctorIndex + 500);
    expect(afterCtor).toContain("#pragma warning restore SCME0001");
  });
});

describe("DynamicModelDeserialization", () => {
  /**
   * Validates that the DeserializeXxx method for dynamic models accepts
   * a BinaryData data parameter (used to initialize the JsonPatch).
   *
   * This parameter receives the raw binary data that was used to create
   * the JsonDocument, enabling the patch to track the original state.
   */
  it("DeserializeXxx has BinaryData data parameter for dynamic models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = outputs["src/Generated/Models/Resource.Serialization.cs"];
    expect(serFile).toBeDefined();

    // Method signature has BinaryData data parameter
    expect(serFile).toContain(
      "internal static Resource DeserializeResource(JsonElement element, BinaryData data, ModelReaderWriterOptions options)",
    );
  });

  /**
   * Validates that the deserialization method creates a JsonPatch from
   * the raw binary data. This patch instance tracks all property changes
   * and is passed to the model constructor.
   */
  it("creates JsonPatch from BinaryData in deserialization", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = outputs["src/Generated/Models/Resource.Serialization.cs"];
    expect(serFile).toBeDefined();

    // JsonPatch variable initialization
    expect(serFile).toContain(
      "JsonPatch patch = new JsonPatch(data is null ? ReadOnlyMemory<byte>.Empty : data.ToMemory());",
    );
  });

  /**
   * Validates that unknown properties are captured into the patch via
   * `patch.Set(...)` instead of the `additionalBinaryDataProperties`
   * dictionary used by non-dynamic models.
   */
  it("captures unknown properties via patch.Set", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = outputs["src/Generated/Models/Resource.Serialization.cs"];
    expect(serFile).toBeDefined();

    // Unknown property capture via patch.Set
    expect(serFile).toContain(
      'patch.Set([.. "$."u8, .. Encoding.UTF8.GetBytes(prop.Name)], prop.Value.GetUtf8Bytes());',
    );

    // Should NOT use additionalBinaryDataProperties
    expect(serFile).not.toContain("additionalBinaryDataProperties");
  });

  /**
   * Validates that PersistableModelCreateCore passes `data` to the
   * DeserializeXxx method so the patch can be initialized with the
   * original binary data.
   */
  it("PersistableModelCreateCore passes data to DeserializeXxx", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = outputs["src/Generated/Models/Resource.Serialization.cs"];
    expect(serFile).toBeDefined();

    // PersistableModelCreateCore passes data
    expect(serFile).toContain(
      "return DeserializeResource(document.RootElement, data, options);",
    );
  });

  /**
   * Validates that JsonModelCreateCore passes null for data when calling
   * DeserializeXxx (since Utf8JsonReader doesn't have the raw binary data).
   */
  it("JsonModelCreateCore passes null for data to DeserializeXxx", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = outputs["src/Generated/Models/Resource.Serialization.cs"];
    expect(serFile).toBeDefined();

    // JsonModelCreateCore passes null for data
    expect(serFile).toContain(
      "return DeserializeResource(document.RootElement, null, options);",
    );
  });

  /**
   * Validates that nested dynamic model deserialization passes
   * GetUtf8Bytes() as the data parameter. When deserializing an array
   * of dynamic models, each item needs its own BinaryData for its patch.
   */
  it("nested dynamic model deserialization passes GetUtf8Bytes", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
        children?: Resource[];
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = outputs["src/Generated/Models/Resource.Serialization.cs"];
    expect(serFile).toBeDefined();

    // Nested array items pass GetUtf8Bytes() as data
    expect(serFile).toContain(
      "Resource.DeserializeResource(item, item.GetUtf8Bytes(), options)",
    );
  });
});

describe("DynamicModelFactory", () => {
  /**
   * Validates that the model factory method for dynamic models uses
   * `default` instead of `additionalBinaryDataProperties: null` as the
   * last argument. The `default` value initializes a default JsonPatch.
   */
  it("uses default instead of additionalBinaryDataProperties: null", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const factoryFile = outputs["src/Generated/TestServiceModelFactory.cs"];
    expect(factoryFile).toBeDefined();

    // Dynamic model factory uses default
    expect(factoryFile).toContain("default)");

    // Should NOT reference additionalBinaryDataProperties
    expect(factoryFile).not.toContain("additionalBinaryDataProperties");
  });
});

describe("DynamicModelInfrastructure", () => {
  /**
   * Validates that the ModelSerializationExtensions file includes
   * dynamic model extension methods (GetUtf8Bytes, SliceToStartOfPropertyName,
   * etc.) when dynamic models are present.
   *
   * These extension methods are required by the propagator methods and
   * the patch deserialization code.
   */
  it("generates dynamic extension methods when dynamic models exist", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const extFile =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(extFile).toBeDefined();

    // Dynamic extension methods
    expect(extFile).toContain(
      "public static BinaryData GetUtf8Bytes(this JsonElement element)",
    );
    expect(extFile).toContain(
      "public static ReadOnlySpan<byte> SliceToStartOfPropertyName(this ReadOnlySpan<byte> jsonPath)",
    );
    expect(extFile).toContain(
      "public static bool TryGetIndex(this ReadOnlySpan<byte> indexSlice, out int index, out int bytesConsumed)",
    );
    expect(extFile).toContain(
      "public static string GetFirstPropertyName(this ReadOnlySpan<byte> jsonPath, out int bytesConsumed)",
    );
    expect(extFile).toContain(
      "public static ReadOnlySpan<byte> GetRemainder(this ReadOnlySpan<byte> jsonPath, int index)",
    );

    // Required usings for dynamic methods
    expect(extFile).toContain("using System.Buffers.Text;");
    expect(extFile).toContain("using System.Text;");
  });

  /**
   * Validates that the ModelSerializationExtensions file does NOT include
   * dynamic extension methods when no dynamic models exist.
   * This prevents generating unnecessary code.
   */
  it("does not generate dynamic extension methods without dynamic models", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const extFile =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(extFile).toBeDefined();

    // Dynamic extension methods should NOT be present
    expect(extFile).not.toContain("GetUtf8Bytes");
    expect(extFile).not.toContain("SliceToStartOfPropertyName");
    expect(extFile).not.toContain("TryGetIndex");
    expect(extFile).not.toContain("GetFirstPropertyName");
    // GetRemainder is also a method on JsonPatch builtin, so check full signature
    expect(extFile).not.toContain("GetRemainder(this ReadOnlySpan<byte>");

    // Dynamic-only usings should not be present
    expect(extFile).not.toContain("using System.Buffers.Text;");
  });
});
