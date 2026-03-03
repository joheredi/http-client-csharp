import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for patch-aware serialization in dynamic (JSON Merge Patch) models.
 *
 * When a model has the `UsageFlags.JsonMergePatch` flag (from being used with
 * `application/merge-patch+json` content type), the serialization code wraps
 * each property in `Patch.Contains`/`Patch.IsRemoved` checks.
 *
 * Why these tests matter:
 * - JSON Merge Patch serialization is distinct from normal serialization:
 *   only changed properties are written, and collections support element-level
 *   removal via `Patch.IsRemoved`.
 * - The `IJsonModel.Write` method has a root-level `Patch.Contains("$"u8)` check
 *   that short-circuits to write the raw patch value if the entire model was replaced.
 * - The `JsonModelWriteCore` method wraps all property writes in
 *   `#pragma warning disable/restore SCME0001` and ends with `Patch.WriteTo(writer)`.
 */
describe("DynamicModelSerialization", () => {
  /**
   * Validates that the IJsonModel.Write method includes the root-level
   * `Patch.Contains("$"u8)` check that short-circuits serialization when
   * the entire model has been replaced by a patch.
   *
   * This is critical for JSON Merge Patch: when the client sets the entire
   * model to a new value, the patch contains the raw JSON which should be
   * written directly without per-property serialization.
   */
  it("generates root patch check in IJsonModel.Write", async () => {
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

    // Root patch check in IJsonModel.Write
    expect(serFile).toContain("#pragma warning disable SCME0001");
    expect(serFile).toContain('if (Patch.Contains("$"u8))');
    expect(serFile).toContain('writer.WriteRawValue(Patch.GetJson("$"u8));');
    expect(serFile).toContain("#pragma warning restore SCME0001");
  });

  /**
   * Validates that simple required properties are wrapped in
   * `if (!Patch.Contains("$.name"u8))` checks. This ensures that
   * unmodified properties are not written during patch serialization.
   */
  it("wraps required property in Patch.Contains check", async () => {
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

    // Required property wrapped in !Patch.Contains
    expect(serFile).toContain('if (!Patch.Contains("$.name"u8))');
    expect(serFile).toContain('writer.WritePropertyName("name"u8);');
    expect(serFile).toContain("writer.WriteStringValue(Name);");
  });

  /**
   * Validates that optional properties combine the Optional.IsDefined guard
   * with !Patch.Contains using &&. This ensures both conditions are checked:
   * the property must be defined AND not patched.
   */
  it("adds Patch.Contains to optional property guard", async () => {
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

    const serFile = outputs["src/Generated/Models/Resource.Serialization.cs"];
    expect(serFile).toBeDefined();

    // Optional property: guard && !Patch.Contains
    expect(serFile).toContain(
      'if (Optional.IsDefined(Description) && !Patch.Contains("$.description"u8))',
    );
  });

  /**
   * Validates that Patch.WriteTo(writer) is called at the end of
   * JsonModelWriteCore. This flushes any remaining patch operations
   * that weren't handled by per-property checks.
   */
  it("generates Patch.WriteTo at end of JsonModelWriteCore", async () => {
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

    // Patch.WriteTo at end of JsonModelWriteCore
    expect(serFile).toContain("Patch.WriteTo(writer);");
  });

  /**
   * Validates that the _additionalBinaryDataProperties loop is NOT generated
   * for dynamic models. The Patch.WriteTo(writer) call replaces it since
   * the patch tracks all changes including unknown properties.
   */
  it("does not generate _additionalBinaryDataProperties for dynamic models", async () => {
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

    // No _additionalBinaryDataProperties in serialization for dynamic models
    expect(serFile).not.toContain("_additionalBinaryDataProperties");
  });

  /**
   * Validates that non-dynamic models still get the standard
   * _additionalBinaryDataProperties loop (regression test).
   */
  it("non-dynamic models still have _additionalBinaryDataProperties", async () => {
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

    const serFile = outputs["src/Generated/Models/Widget.Serialization.cs"];
    expect(serFile).toBeDefined();

    // Standard models should have _additionalBinaryDataProperties
    expect(serFile).toContain("_additionalBinaryDataProperties");
    // And should NOT have patch-aware serialization
    expect(serFile).not.toContain("Patch.Contains");
    expect(serFile).not.toContain("Patch.WriteTo");
  });

  /**
   * Validates that a dynamic model with a required model property
   * wraps it in !Patch.Contains with WriteObjectValue.
   */
  it("wraps model property in Patch.Contains check", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Inner {
        bar: string;
      }

      model Outer {
        name: string;
        foo: Inner;
      }

      @route("/resources")
      @patch op updateResource(@body body: Outer, @header contentType: "application/merge-patch+json"): void;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = outputs["src/Generated/Models/Outer.Serialization.cs"];
    expect(serFile).toBeDefined();

    // Model property wrapped in !Patch.Contains
    expect(serFile).toContain('if (!Patch.Contains("$.foo"u8))');
    expect(serFile).toContain("writer.WriteObjectValue(Foo, options);");
  });

  /**
   * Validates that the SCME0001 pragma wraps property serialization
   * inside JsonModelWriteCore for dynamic models.
   */
  it("wraps JsonModelWriteCore in SCME0001 pragma", async () => {
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

    // Find the JsonModelWriteCore method
    const writeCoreSectionStart = serFile.indexOf("JsonModelWriteCore");
    expect(writeCoreSectionStart).toBeGreaterThan(0);

    // SCME0001 pragma should appear after the method header, within the method body
    const afterWriteCore = serFile.substring(writeCoreSectionStart);
    expect(afterWriteCore).toContain("#pragma warning disable SCME0001");
    expect(afterWriteCore).toContain("#pragma warning restore SCME0001");
  });

  /**
   * Validates that dynamic model serialization files include `using System.Text;`
   * which is needed for `Encoding.UTF8.GetBytes()` in dictionary per-key patch checks.
   */
  it("includes using System.Text for dynamic models", async () => {
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
    expect(serFile).toContain("using System.Text;");
  });
});
