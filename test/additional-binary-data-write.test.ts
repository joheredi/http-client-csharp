import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the AdditionalBinaryDataWrite component.
 *
 * These tests verify that the emitter generates the additional binary data
 * serialization block at the end of `JsonModelWriteCore` for root models.
 * This block writes unknown JSON properties stored in `_additionalBinaryDataProperties`
 * back to JSON during round-trip serialization.
 *
 * Why these tests matter:
 * - Round-trip serialization fidelity: models must preserve unknown JSON properties
 *   they received during deserialization, so that serializing the model back to JSON
 *   includes properties the model class doesn't know about.
 * - The guard `options.Format != "W"` prevents writing additional data in wire format.
 * - The `#if NET6_0_OR_GREATER` preprocessor directive selects between WriteRawValue
 *   (modern .NET) and JsonDocument.Parse fallback (older frameworks).
 * - Only root models should render this block — derived models inherit the field
 *   and the base class handles writing it.
 */
describe("AdditionalBinaryDataWrite", () => {
  /**
   * Validates that the additional binary data serialization block appears
   * in JsonModelWriteCore for a simple root model. The block should include
   * the format guard, null check, foreach loop, and preprocessor conditional.
   */
  it("generates additional binary data write block for root model", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();
    const content = outputs[fileKey!];

    // The if guard checks both format and null
    expect(content).toContain(
      '((options.Format != "W") && (_additionalBinaryDataProperties != null))',
    );

    // The foreach loop iterates the dictionary
    expect(content).toContain(
      "foreach (var item in _additionalBinaryDataProperties)",
    );

    // WritePropertyName for each unknown property's key
    expect(content).toContain("writer.WritePropertyName(item.Key);");

    // Preprocessor directive for version-specific code
    expect(content).toContain("#if NET6_0_OR_GREATER");
    expect(content).toContain("writer.WriteRawValue(item.Value);");

    // Fallback path for older frameworks
    expect(content).toContain("#else");
    expect(content).toContain(
      "JsonDocument document = JsonDocument.Parse(item.Value)",
    );
    expect(content).toContain(
      "JsonSerializer.Serialize(writer, document.RootElement);",
    );
    expect(content).toContain("#endif");
  });

  /**
   * Validates that the additional binary data block appears AFTER the known
   * property writes. This ordering is critical because the model's own
   * properties must be serialized first, then unknown properties follow.
   */
  it("renders additional binary data after property writes", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
        count: int32;
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Verify ordering: property writes come before additional binary data
    const lastPropertyWrite = content.lastIndexOf(
      "writer.WriteNumberValue(Count);",
    );
    const additionalDataStart = content.indexOf(
      "_additionalBinaryDataProperties != null",
    );
    expect(lastPropertyWrite).toBeLessThan(additionalDataStart);
    expect(lastPropertyWrite).toBeGreaterThan(-1);
    expect(additionalDataStart).toBeGreaterThan(-1);
  });

  /**
   * Validates that derived models do NOT generate the additional binary data
   * block. Derived models inherit _additionalBinaryDataProperties from their
   * root base class, and the base class's JsonModelWriteCore writes it.
   * Including it in derived models would cause double-writing.
   */
  it("does not generate additional binary data block for derived model", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @discriminator("kind")
      model Pet {
        kind: string;
        name: string;
      }

      model Dog extends Pet {
        kind: "dog";
        breed: string;
      }

      @route("/test")
      op test(): Pet;
    `);

    expect(diagnostics).toHaveLength(0);

    const dogFileKey = Object.keys(outputs).find((k) =>
      k.endsWith("/Dog.Serialization.cs"),
    );
    expect(dogFileKey).toBeDefined();
    const dogContent = outputs[dogFileKey!];

    // Derived model should NOT have the additional binary data loop
    expect(dogContent).not.toContain("_additionalBinaryDataProperties != null");
    expect(dogContent).not.toContain(
      "foreach (var item in _additionalBinaryDataProperties)",
    );

    // But it should still have base.JsonModelWriteCore (which handles it)
    expect(dogContent).toContain("base.JsonModelWriteCore(writer, options);");
  });

  /**
   * Validates that the abstract base model in a discriminated hierarchy
   * DOES generate the additional binary data block, since it's the root
   * model that owns the _additionalBinaryDataProperties field.
   */
  it("generates additional binary data block for abstract base model", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @discriminator("kind")
      model Pet {
        kind: string;
        name: string;
      }

      model Dog extends Pet {
        kind: "dog";
        breed: string;
      }

      @route("/test")
      op test(): Pet;
    `);

    expect(diagnostics).toHaveLength(0);

    const petFileKey = Object.keys(outputs).find((k) =>
      k.endsWith("/Pet.Serialization.cs"),
    );
    expect(petFileKey).toBeDefined();
    const petContent = outputs[petFileKey!];

    // Base model SHOULD have the additional binary data loop
    expect(petContent).toContain("_additionalBinaryDataProperties != null");
    expect(petContent).toContain(
      "foreach (var item in _additionalBinaryDataProperties)",
    );
    expect(petContent).toContain("#if NET6_0_OR_GREATER");
    expect(petContent).toContain("writer.WriteRawValue(item.Value);");
  });

  /**
   * Validates that the using statement in the fallback path uses the
   * `using` disposal pattern correctly — `using (JsonDocument document = ...)`
   * with a block body, not the simplified `using var` form (which requires
   * C# 8.0 and doesn't match the legacy emitter output).
   */
  it("uses block-scoped using statement in fallback path", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Verify it uses the block-form using statement (not using var)
    expect(content).toMatch(
      /using\s*\(\s*JsonDocument\s+document\s*=\s*JsonDocument\.Parse\(item\.Value\)\s*\)/,
    );
  });

  /**
   * Validates that the additional binary data block is inside the
   * JsonModelWriteCore method (between the method signature and closing brace),
   * not outside it or in a different method.
   */
  it("is contained within JsonModelWriteCore method", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Find the JsonModelWriteCore method signature
    const methodStart = content.indexOf("void JsonModelWriteCore(");
    expect(methodStart).toBeGreaterThan(-1);

    // Find the additional binary data block
    const additionalDataBlock = content.indexOf(
      "_additionalBinaryDataProperties != null",
    );
    expect(additionalDataBlock).toBeGreaterThan(methodStart);

    // The additional data block should be before JsonModelCreateCore
    // (the next protected method after JsonModelWriteCore in golden ordering)
    const nextMethod = content.indexOf("JsonModelCreateCore");
    expect(additionalDataBlock).toBeLessThan(nextMethod);
  });

  /**
   * Validates that the generated file still includes the using directives
   * needed for the additional binary data types (System.Text.Json for
   * JsonDocument and JsonSerializer).
   */
  it("includes using directive for System.Text.Json", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    expect(content).toContain("using System.Text.Json;");
  });
});
