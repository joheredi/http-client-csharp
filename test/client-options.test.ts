import { describe, expect, it } from "vitest";
import { AzureHttpTester, HttpTester } from "./test-host.js";

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

  /**
   * Verifies that Azure-flavored versioned services generate client options
   * that extend Azure.Core.ClientOptions instead of
   * System.ClientModel.Primitives.ClientPipelineOptions.
   *
   * This is critical because Azure SDK clients must inherit from Azure.Core.ClientOptions
   * to integrate with the Azure SDK ecosystem (diagnostics, retry policies, etc.).
   * The generated class structure is identical to unbranded, only the base class
   * and using directive differ.
   *
   * Ground truth: submodules/azure-sdk-for-net/.../TestProjects/Local/Basic-TypeSpec/
   *   src/Generated/BasicTypeSpecClientOptions.cs
   */
  it("generates azure client options with ClientOptions base for versioned service", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using TypeSpec.Versioning;

      @versioned(Versions)
      @service
      namespace AzureWidget;

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

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const optionsKey = Object.keys(outputs).find((k) =>
      k.includes("ClientOptions"),
    );
    expect(optionsKey).toBeDefined();

    const optionsFile = outputs[optionsKey!];

    // Azure flavor: base class is Azure.Core.ClientOptions, not ClientPipelineOptions
    expect(optionsFile).toContain("ClientOptions : ClientOptions");
    expect(optionsFile).toContain("public partial class");

    // Azure using directive instead of System.ClientModel.Primitives
    expect(optionsFile).toContain("using Azure.Core;");
    expect(optionsFile).not.toContain("using System.ClientModel.Primitives;");

    // Version structure is identical to unbranded
    expect(optionsFile).toContain(
      "private const ServiceVersion LatestVersion = ServiceVersion.V2024_06_01_Preview",
    );
    expect(optionsFile).toContain("V2024_01_01 = 1");
    expect(optionsFile).toContain("V2024_06_01_Preview = 2");
    expect(optionsFile).toContain("internal string Version { get; }");
  });

  /**
   * Verifies that Azure-flavored unversioned services generate an empty
   * client options class extending Azure.Core.ClientOptions.
   *
   * Ground truth: submodules/azure-sdk-for-net/.../TestProjects/Spector/
   *   http/authentication/api-key/src/Generated/ApiKeyClientOptions.cs
   */
  it("generates azure empty client options with ClientOptions base for unversioned service", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace AzureUnversioned;

      model Thing {
        id: string;
      }

      @route("/things")
      op getThing(): Thing;
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const optionsKey = Object.keys(outputs).find((k) =>
      k.includes("ClientOptions"),
    );
    expect(optionsKey).toBeDefined();

    const optionsFile = outputs[optionsKey!];

    // Azure flavor: extends Azure.Core.ClientOptions
    expect(optionsFile).toContain(
      "AzureUnversionedClientOptions : ClientOptions",
    );
    expect(optionsFile).toContain("public partial class");

    // Azure using directive
    expect(optionsFile).toContain("using Azure.Core;");
    expect(optionsFile).not.toContain("using System.ClientModel.Primitives;");

    // Should NOT contain versioning artifacts
    expect(optionsFile).not.toContain("ServiceVersion");
    expect(optionsFile).not.toContain("LatestVersion");
  });

  /**
   * Verifies that multi-service clients (using @client({ service: [...] }))
   * generate a valid ClientOptions class with version infrastructure.
   *
   * Multi-service clients wrap multiple versioned services into a single
   * combined client. TCGC sets the combined client's apiVersions to []
   * (empty), but the client constructor still references options.Version.
   * The fix collects apiVersions from child clients to generate a
   * ServiceVersion enum and Version property on the combined options class.
   *
   * Without this, the generated CombinedOptions class would be empty,
   * causing a C# compilation error when the client tries to read
   * options.Version.
   *
   * Ground truth: submodules/typespec/packages/http-client-csharp/generator/
   *   TestProjects/Spector/http/service/multi-service/src/Generated/
   *   CombinedClientOptions.cs
   */
  it("generates client options with versions for multi-service client", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using TypeSpec.Versioning;
      using Azure.ClientGenerator.Core;

      namespace MultiService {
        @versioned(VersionsA)
        @service
        @server("http://localhost:3000", "")
        namespace ServiceA {
          enum VersionsA { av1, av2 }

          @route("/service-a/foo")
          interface Foo {
            @route("/test") test(@query("api-version") apiVersion: VersionsA): void;
          }
        }

        @versioned(VersionsB)
        @service
        @server("http://localhost:3000", "")
        namespace ServiceB {
          enum VersionsB { bv1, bv2 }

          @route("/service-b/bar")
          interface Bar {
            @route("/test") test(@query("api-version") apiVersion: VersionsB): void;
          }
        }

        @client({
          service: [ServiceA, ServiceB]
        })
        namespace Combined {}
      }
    `);

    expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    // Find the combined options file
    const optionsKey = Object.keys(outputs).find((k) =>
      k.includes("CombinedOptions"),
    );
    expect(optionsKey).toBeDefined();

    const optionsFile = outputs[optionsKey!];

    // Verify the combined options class has version infrastructure
    // even though the combined client's own apiVersions is empty —
    // versions are collected from children (ServiceA: av1/av2, ServiceB: bv1/bv2)
    expect(optionsFile).toContain("public partial class");
    expect(optionsFile).toContain("CombinedOptions : ClientPipelineOptions");

    // ServiceVersion enum contains all children's versions
    expect(optionsFile).toContain("public enum ServiceVersion");
    expect(optionsFile).toContain("Vav1 = 1");
    expect(optionsFile).toContain("Vav2 = 2");
    expect(optionsFile).toContain("Vbv1 = 3");
    expect(optionsFile).toContain("Vbv2 = 4");

    // LatestVersion points to the last version in the combined list
    expect(optionsFile).toContain(
      "private const ServiceVersion LatestVersion = ServiceVersion.Vbv2",
    );

    // Constructor maps all version enum values to their string values
    expect(optionsFile).toContain('ServiceVersion.Vav1 => "av1"');
    expect(optionsFile).toContain('ServiceVersion.Vav2 => "av2"');
    expect(optionsFile).toContain('ServiceVersion.Vbv1 => "bv1"');
    expect(optionsFile).toContain('ServiceVersion.Vbv2 => "bv2"');

    // Internal Version property is present (referenced by client constructor)
    expect(optionsFile).toContain("internal string Version { get; }");
  });
});
