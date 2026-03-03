import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for dynamic model generation (JSON Merge Patch / RFC 7386).
 *
 * When a model is used with `application/merge-patch+json` content type,
 * TCGC sets the `UsageFlags.JsonMergePatch` flag. Dynamic models receive:
 * - A `_patch` field of type `JsonPatch` with `[Experimental("SCME0001")]`
 * - A `Patch` ref-return property with `[JsonIgnore]`, `[EditorBrowsable(Never)]`,
 *   and `[Experimental("SCME0001")]` attributes
 *
 * The serialization constructor is NOT modified in this phase — that happens
 * in task 7.2.1 when serialization code is updated to use _patch instead of
 * _additionalBinaryDataProperties.
 *
 * Why these tests matter:
 * - JSON Merge Patch is a core Azure SDK pattern for PATCH operations
 * - The generated _patch field and Patch property are required for the
 *   serialization layer (task 7.2.1) to emit only changed properties
 */
describe("DynamicModel", () => {
  /**
   * Validates that a model used in a merge-patch operation gets the `_patch`
   * private field. This field tracks property-level changes for partial
   * updates per RFC 7386.
   *
   * The _additionalBinaryDataProperties field is still present (required by
   * existing serialization code) and will be removed in task 7.2.1.
   */
  it("generates _patch field for merge-patch model", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Resource {
        name: string;
        description?: string;
      }

      @route("/resources")
      @patch op updateResource(@body body: Resource, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const resourceFile = outputs["src/Generated/Models/Resource.cs"];
    expect(resourceFile).toBeDefined();

    // Dynamic model should have _patch field
    expect(resourceFile).toContain("private JsonPatch _patch;");
  });

  /**
   * Validates that the `_patch` field and Patch property are wrapped in
   * `#pragma warning disable SCME0001` to suppress the experimental API
   * diagnostic from `JsonPatch` type usage.
   */
  it("wraps dynamic members in pragma warning disable SCME0001", async () => {
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

    const resourceFile = outputs["src/Generated/Models/Resource.cs"];
    expect(resourceFile).toBeDefined();
    expect(resourceFile).toContain("#pragma warning disable SCME0001");
    expect(resourceFile).toContain("#pragma warning restore SCME0001");
  });

  /**
   * Validates the `Patch` property with ref return type and all required
   * attributes. The ref return allows callers to modify the patch state
   * directly via `model.Patch.Set(...)`.
   *
   * Required attributes:
   * - [JsonIgnore] prevents serialization of the tracking property
   * - [EditorBrowsable(Never)] hides it from IntelliSense
   * - [Experimental("SCME0001")] marks merge-patch API as experimental
   */
  it("generates Patch ref-return property with attributes", async () => {
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

    const resourceFile = outputs["src/Generated/Models/Resource.cs"];
    expect(resourceFile).toBeDefined();

    // Verify the ref-return property
    expect(resourceFile).toContain("public ref JsonPatch Patch => ref _patch;");

    // Verify attributes on the Patch property
    expect(resourceFile).toContain("[JsonIgnore]");
    expect(resourceFile).toContain(
      "[EditorBrowsable(EditorBrowsableState.Never)]",
    );
  });

  /**
   * Validates that the required using directives are generated for the
   * dynamic model members. Without these, the generated code won't compile.
   */
  it("generates required using directives", async () => {
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

    const resourceFile = outputs["src/Generated/Models/Resource.cs"];
    expect(resourceFile).toBeDefined();

    // Required using directives for dynamic model members
    expect(resourceFile).toContain("using System.ClientModel.Primitives;");
    expect(resourceFile).toContain("using System.ComponentModel;");
    expect(resourceFile).toContain("using System.Text.Json.Serialization;");
  });

  /**
   * Validates that non-merge-patch models do NOT get the dynamic model
   * members. This is a regression test to ensure dynamic model detection
   * doesn't affect normal models.
   */
  it("non-merge-patch models do not have _patch or Patch", async () => {
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

    const widgetFile = outputs["src/Generated/Models/Widget.cs"];
    expect(widgetFile).toBeDefined();

    // Standard models should not have dynamic model members
    expect(widgetFile).toContain("_additionalBinaryDataProperties");
    expect(widgetFile).not.toContain("_patch");
    expect(widgetFile).not.toContain("JsonPatch");
    expect(widgetFile).not.toContain("Patch =>");
  });
});
