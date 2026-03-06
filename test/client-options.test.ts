import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the ClientOptionsFile component.
 *
 * These tests verify that the emitter generates a correct ClientOptions class
 * for versioned TypeSpec services. The generated class must:
 * - Inherit from ClientPipelineOptions
 * - Contain a nested ServiceVersion enum with ordinals starting at 1
 * - Have a LatestVersion const pointing to the last enum member
 * - Include a constructor that maps enum values to version strings
 * - Expose an internal Version property
 *
 * The expected output format matches the legacy C# generator's
 * ClientOptionsProvider golden files.
 */
describe("ClientOptionsFile", () => {
  /**
   * Core integration test: verifies that a versioned TypeSpec service produces
   * the expected {ClientName}Options.cs file with the correct structure.
   *
   * This test validates the complete ClientOptions pipeline:
   * 1. TypeSpec with @versioned → TCGC SdkClientType with apiVersions
   * 2. ClientOptionsFile component renders all parts
   * 3. Output matches legacy golden file format
   *
   * Uses two API versions to verify ordering and ordinal assignment.
   */
  it("generates client options for a versioned service", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using TypeSpec.Versioning;

      @versioned(Versions)
      @service
      namespace WidgetService;

      enum Versions {
        \`2024-01-01\`,
        \`2024-06-01-preview\`,
      }

      model Widget {
        id: string;
        name: string;
      }

      @route("/widgets")
      op listWidgets(): Widget[];
    `);

    // Should have no diagnostics
    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    // Find the generated ClientOptions file
    const optionsKey = Object.keys(outputs).find((k) =>
      k.includes("ClientOptions"),
    );
    expect(optionsKey).toBeDefined();
    expect(optionsKey).toContain("src/Generated/");

    const optionsFile = outputs[optionsKey!];

    // Verify class declaration and base class
    expect(optionsFile).toContain("ClientOptions : ClientPipelineOptions");
    expect(optionsFile).toContain("public partial class");

    // Verify LatestVersion const field points to last version
    expect(optionsFile).toContain(
      "private const ServiceVersion LatestVersion = ServiceVersion.V2024_06_01_Preview",
    );

    // Verify constructor signature with default parameter
    expect(optionsFile).toContain("ServiceVersion version = LatestVersion");

    // Verify switch expression maps enum values to version strings
    expect(optionsFile).toContain('ServiceVersion.V2024_01_01 => "2024-01-01"');
    expect(optionsFile).toContain(
      'ServiceVersion.V2024_06_01_Preview => "2024-06-01-preview"',
    );

    // Verify the default throw arm
    expect(optionsFile).toContain("throw new NotSupportedException()");

    // Verify internal Version property
    expect(optionsFile).toContain("internal string Version { get; }");

    // Verify ServiceVersion enum with ordinals
    expect(optionsFile).toContain("public enum ServiceVersion");
    expect(optionsFile).toContain("V2024_01_01 = 1");
    expect(optionsFile).toContain("V2024_06_01_Preview = 2");

    // Verify XML doc comments
    expect(optionsFile).toContain("/// <summary>");
    expect(optionsFile).toContain("The version of the service to use.");

    // Verify using directives (should include System for NotSupportedException
    // and System.ClientModel.Primitives for ClientPipelineOptions)
    expect(optionsFile).toContain("using System;");
    expect(optionsFile).toContain("using System.ClientModel.Primitives;");
  });

  /**
   * Verifies that single-version services also produce valid ClientOptions.
   *
   * This is an edge case where LatestVersion has only one option.
   * The ServiceVersion enum should have exactly one member with ordinal 1.
   */
  it("generates client options for a single-version service", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using TypeSpec.Versioning;

      @versioned(Versions)
      @service
      namespace SimpleService;

      enum Versions {
        \`2024-01-01\`,
      }

      model Item {
        id: string;
      }

      @route("/items")
      op getItem(): Item;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const optionsKey = Object.keys(outputs).find((k) =>
      k.includes("ClientOptions"),
    );
    expect(optionsKey).toBeDefined();

    const optionsFile = outputs[optionsKey!];

    // Single version: LatestVersion points to the only version
    expect(optionsFile).toContain(
      "private const ServiceVersion LatestVersion = ServiceVersion.V2024_01_01",
    );

    // Enum has exactly one member
    expect(optionsFile).toContain("V2024_01_01 = 1");
    // Should not contain ordinal 2
    expect(optionsFile).not.toContain("= 2");
  });

  /**
   * Verifies that unversioned services generate a simple empty ClientOptions
   * class that extends ClientPipelineOptions, matching the legacy emitter.
   *
   * The legacy emitter generates per-client options types for ALL specs,
   * including unversioned ones. For unversioned specs, the generated class
   * is an empty partial class that simply extends ClientPipelineOptions,
   * providing a type-safe per-client options type that consumers can
   * customize via partial class extensions.
   */
  it("generates empty client options for unversioned service", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace UnversionedService;

      model Thing {
        id: string;
      }

      @route("/things")
      op getThing(): Thing;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    // Should generate a ClientOptions file
    const optionsKey = Object.keys(outputs).find((k) =>
      k.includes("ClientOptions"),
    );
    expect(optionsKey).toBeDefined();
    expect(optionsKey).toContain("src/Generated/");

    const optionsFile = outputs[optionsKey!];

    // Verify class declaration and base class
    expect(optionsFile).toContain(
      "UnversionedServiceClientOptions : ClientPipelineOptions",
    );
    expect(optionsFile).toContain("public partial class");

    // Should use System.ClientModel.Primitives for ClientPipelineOptions
    expect(optionsFile).toContain("using System.ClientModel.Primitives;");

    // Should NOT contain ServiceVersion enum, LatestVersion, or Version property
    expect(optionsFile).not.toContain("ServiceVersion");
    expect(optionsFile).not.toContain("LatestVersion");
    expect(optionsFile).not.toContain("Version");
    expect(optionsFile).not.toContain("NotSupportedException");
  });

  /**
   * Verifies version name formatting follows the legacy convention.
   *
   * Version strings with mixed formats (dashes, dots, named versions)
   * must all produce valid C# enum member names:
   * - "2024-07-16-preview" → V2024_07_16_Preview
   * - "v2.0" → V2_0
   *
   * This test uses preview-style version strings (the most common format
   * in Azure services) to ensure proper handling of dashes and title-casing.
   */
  it("formats version names correctly with dashes and dots", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using TypeSpec.Versioning;

      @versioned(Versions)
      @service
      namespace DashService;

      enum Versions {
        \`2024-07-16-preview\`,
        \`2024-08-16-preview\`,
      }

      model Widget {
        id: string;
      }

      @route("/widgets")
      op getWidget(): Widget;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const optionsKey = Object.keys(outputs).find((k) =>
      k.includes("ClientOptions"),
    );
    expect(optionsKey).toBeDefined();

    const optionsFile = outputs[optionsKey!];

    // Verify dashes are converted to underscores and segments title-cased
    expect(optionsFile).toContain("V2024_07_16_Preview = 1");
    expect(optionsFile).toContain("V2024_08_16_Preview = 2");
    expect(optionsFile).toContain(
      "private const ServiceVersion LatestVersion = ServiceVersion.V2024_08_16_Preview",
    );
  });
});
