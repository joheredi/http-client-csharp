import { describe, expect, it } from "vitest";
import { AzureHttpTester, HttpTester } from "./test-host.js";

/**
 * Tests for Azure metadata.json file generation.
 *
 * When `flavor === "azure"`, the emitter generates a `metadata.json` file
 * in the output directory root. This file contains API version mappings
 * used by Azure SDK automation to map package versions to supported API
 * versions.
 *
 * The file structure is:
 * ```json
 * {
 *   "apiVersions": {
 *     "ServiceNamespace": "version-string"
 *   }
 * }
 * ```
 *
 * When no API versions are specified (no @versioned decorator), the
 * `apiVersions` object is empty `{}`.
 *
 * Ground truth reference: metadata.json files in
 * submodules/azure-sdk-for-net/.../TestProjects/Local/Basic-TypeSpec/metadata.json
 * submodules/azure-sdk-for-net/.../TestProjects/Spector/http/authentication/api-key/metadata.json
 */
describe("Azure metadata.json generation", () => {
  /**
   * Verifies that metadata.json is generated with correct API version
   * when the TypeSpec service uses the @versioned decorator.
   *
   * This is the primary use case: Azure services declare versions via
   * @versioned, and metadata.json maps the service namespace to the
   * selected API version string.
   */
  it("generates metadata.json with apiVersions for versioned Azure service", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using TypeSpec.Versioning;

      @service
      @versioned(Versions)
      namespace Azure.TestService;

      enum Versions {
        v2024_05_01: "2024-05-01",
      }

      model Item {
        id: string;
        name: string;
      }

      @route("/items")
      @get
      op listItems(): Item[];
    `);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const metadataFile = outputs["metadata.json"];
    expect(metadataFile).toBeDefined();

    const metadata = JSON.parse(metadataFile);
    expect(metadata).toHaveProperty("apiVersions");
    expect(metadata.apiVersions).toHaveProperty(
      "Azure.TestService",
      "2024-05-01",
    );
  });

  /**
   * Verifies that metadata.json has an empty apiVersions object when
   * the service does not use the @versioned decorator.
   *
   * Many Spector test specs don't define versions, so the metadata.json
   * should still be generated but with `{ "apiVersions": {} }`.
   */
  it("generates metadata.json with empty apiVersions for unversioned Azure service", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace Azure.UnversionedService;

      model Status {
        isHealthy: boolean;
      }

      @route("/ping")
      @get
      op ping(): Status;
    `);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const metadataFile = outputs["metadata.json"];
    expect(metadataFile).toBeDefined();

    const metadata = JSON.parse(metadataFile);
    expect(metadata).toHaveProperty("apiVersions");
    expect(metadata.apiVersions).toEqual({});
  });

  /**
   * Verifies that metadata.json is NOT generated when flavor is "unbranded".
   *
   * metadata.json is an Azure-specific automation artifact. Unbranded
   * (System.ClientModel) packages should not include it, as they don't
   * participate in Azure SDK version mapping automation.
   */
  it("does not generate metadata.json for unbranded flavor", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace MyService;

      @route("/ping")
      @get
      op ping(): string;
    `);
    expect(diagnostics).toHaveLength(0);

    expect(outputs["metadata.json"]).toBeUndefined();
  });

  /**
   * Verifies that the metadata.json output is valid JSON with the expected
   * structure and pretty-printed with 2-space indentation, matching the
   * legacy emitter's formatting.
   */
  it("outputs well-formed JSON with 2-space indentation", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace Azure.FormattingTest;

      model Result {
        value: string;
      }

      @route("/test")
      @get
      op test(): Result;
    `);
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const metadataFile = outputs["metadata.json"];
    expect(metadataFile).toBeDefined();

    // Verify it's valid JSON that can be roundtripped
    const parsed = JSON.parse(metadataFile);
    const reformatted = JSON.stringify(parsed, null, 2);
    expect(metadataFile).toBe(reformatted);
  });
});
