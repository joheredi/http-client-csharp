/**
 * Tests for Azure.Core scalar serialization in JSON models.
 *
 * Azure.Core defines TypeSpec scalars (eTag, azureLocation, armResourceIdentifier)
 * that extend `string` but map to non-string C# types (ETag, AzureLocation,
 * ResourceIdentifier). The JSON serialization code must use explicit conversions:
 *
 * - **Write path**: `.ToString()` to convert the C# struct/class to a string
 *   for `Utf8JsonWriter.WriteStringValue`. Without this, the compiler reports
 *   CS1503 (e.g., "cannot convert from Azure.ETag to System.DateTime").
 *
 * - **Read path**: Constructor or Parse method to create the C# type from the
 *   JSON string via `GetString()`. Without this, the compiler reports
 *   CS0029 (e.g., "cannot implicitly convert type string to Azure.ETag").
 *
 * These tests verify that the serialization code generator handles these
 * Azure.Core scalars correctly for both JSON write and read paths.
 *
 * Regression tests for: https://github.com/... (task 21.19)
 *
 * @module
 */

import { describe, expect, it } from "vitest";
import { AzureIntegrationTester } from "./test-host.js";

/**
 * Helper to compile a TypeSpec model with an Azure.Core scalar property and
 * return the serialization file content.
 *
 * Uses `AzureIntegrationTester` which registers Azure.Core library and
 * configures `flavor: "azure"` so that Azure.Core scalar overrides are active.
 */
async function compileAzureScalarModel(
  scalarType: string,
  propertyName: string = "prop",
) {
  const [{ outputs }, diagnostics] =
    await AzureIntegrationTester.compileAndDiagnose(`
    using TypeSpec.Http;
    using Azure.Core;

    @service
    namespace TestService;

    model TestModel {
      ${propertyName}: ${scalarType};
    }

    @route("/test")
    op test(): TestModel;
  `);

  expect(diagnostics).toHaveLength(0);

  const serFileKey = Object.keys(outputs).find((k) =>
    k.includes("TestModel.Serialization.cs"),
  );
  expect(serFileKey).toBeDefined();
  return outputs[serFileKey!];
}

describe("Azure.Core scalar serialization", () => {
  describe("eTag (Azure.ETag)", () => {
    /**
     * Verifies that the write path uses `.ToString()` to convert Azure.ETag
     * to a string for `Utf8JsonWriter.WriteStringValue`.
     *
     * Without `.ToString()`, the generated code would be:
     *   `writer.WriteStringValue(Prop);`
     * which fails with CS1503 because Utf8JsonWriter has no overload for ETag.
     *
     * Expected:
     *   `writer.WriteStringValue(Prop.ToString());`
     */
    it("serializes eTag property with .ToString() in write path", async () => {
      const content = await compileAzureScalarModel("eTag");

      expect(content).toContain('writer.WritePropertyName("prop"u8);');
      expect(content).toContain("writer.WriteStringValue(Prop.ToString());");
      // Verify it does NOT generate the broken bare accessor pattern
      expect(content).not.toMatch(
        /WriteStringValue\(Prop\)\s*;/,
      );
    });

    /**
     * Verifies that the read path wraps `GetString()` with `new ETag(...)`
     * to construct the Azure.ETag struct from the deserialized JSON string.
     *
     * Without the wrapper, the generated code would be:
     *   `prop = jsonProperty.Value.GetString();`
     * which fails with CS0029 because string cannot implicitly convert to ETag.
     *
     * Expected:
     *   `prop = new ETag(jsonProperty.Value.GetString());`
     */
    it("deserializes eTag property with new ETag() in read path", async () => {
      const content = await compileAzureScalarModel("eTag");

      expect(content).toContain(
        "prop = new ETag(jsonProperty.Value.GetString());",
      );
      // Verify it does NOT generate the broken bare GetString() assignment
      expect(content).not.toMatch(
        /prop = jsonProperty\.Value\.GetString\(\)\s*;/,
      );
    });
  });

  describe("azureLocation (Azure.AzureLocation)", () => {
    /**
     * Verifies that azureLocation properties use .ToString() for serialization.
     * AzureLocation is a struct wrapping a string, same pattern as ETag.
     */
    it("serializes azureLocation property with .ToString() in write path", async () => {
      const content = await compileAzureScalarModel("azureLocation");

      expect(content).toContain("writer.WriteStringValue(Prop.ToString());");
    });

    /**
     * Verifies that azureLocation properties use new AzureLocation() for deserialization.
     */
    it("deserializes azureLocation property with new AzureLocation() in read path", async () => {
      const content = await compileAzureScalarModel("azureLocation");

      expect(content).toContain(
        "prop = new AzureLocation(jsonProperty.Value.GetString());",
      );
    });
  });

  describe("armResourceIdentifier (Azure.Core.ResourceIdentifier)", () => {
    /**
     * Verifies that armResourceIdentifier properties use .ToString() for serialization.
     * ResourceIdentifier is a class wrapping a string.
     */
    it("serializes armResourceIdentifier property with .ToString() in write path", async () => {
      const content = await compileAzureScalarModel("armResourceIdentifier");

      expect(content).toContain("writer.WriteStringValue(Prop.ToString());");
    });

    /**
     * Verifies that armResourceIdentifier properties use new ResourceIdentifier()
     * for deserialization.
     */
    it("deserializes armResourceIdentifier property with new ResourceIdentifier() in read path", async () => {
      const content = await compileAzureScalarModel("armResourceIdentifier");

      expect(content).toContain(
        "prop = new ResourceIdentifier(jsonProperty.Value.GetString());",
      );
    });
  });

  describe("non-Azure flavor", () => {
    /**
     * Verifies that when the flavor is NOT azure, the eTag scalar is treated
     * as a plain string with no conversion wrappers. This ensures the fix
     * only applies to Azure-flavored specs.
     *
     * In non-Azure mode, the eTag scalar from Azure.Core would not be available,
     * but a plain string property should still work without conversion.
     */
    it("plain string property does not get Azure conversion", async () => {
      // Import HttpTester (non-azure flavor)
      const { HttpTester } = await import("./test-host.js");
      const [{ outputs }, diagnostics] =
        await HttpTester.compileAndDiagnose(`
        using TypeSpec.Http;

        @service
        namespace TestService;

        model TestModel {
          name: string;
        }

        @route("/test")
        op test(): TestModel;
      `);

      expect(diagnostics).toHaveLength(0);
      const serFileKey = Object.keys(outputs).find((k) =>
        k.includes("TestModel.Serialization.cs"),
      );
      expect(serFileKey).toBeDefined();
      const content = outputs[serFileKey!];

      // Plain string should use bare WriteStringValue (no .ToString())
      expect(content).toContain("writer.WriteStringValue(Name);");
      // Plain string should use bare GetString() (no constructor wrapper)
      expect(content).toContain("name = jsonProperty.Value.GetString();");
    });
  });
});
