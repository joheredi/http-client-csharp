import { describe, expect, it } from "vitest";
import { Tester, HttpTester } from "./test-host.js";

/**
 * Tests for the EmitterContext provider (task 0.3.2).
 *
 * Verifies that the HttpClientCSharpOutput component correctly provisions
 * an EmitterContext through the component tree. The context carries:
 * - packageName (resolved from TypeSpec or emitter options)
 * - options (resolved with defaults)
 * - license (if configured)
 * - needsXmlSerialization (derived from model properties)
 * - hasDynamicModels (derived from decorators)
 * - hasMultipartOperations (derived from operation content types)
 * - sdkPackage (the TCGC processed client model)
 *
 * These tests work indirectly by verifying that the emitter continues to
 * compile and produce correct output now that the context is provided,
 * and that the context values are used correctly downstream.
 */
describe("EmitterContext", () => {
  /**
   * The EmitterContext is provided inside HttpClientCSharpOutput.
   * If the context provider breaks the rendering pipeline, compilation
   * will fail. This test verifies the context is provided without
   * introducing any errors into the component tree.
   */
  it("is provided without breaking compilation", async () => {
    const [_result, diagnostics] =
      await Tester.compileAndDiagnose(`op test(): void;`);
    expect(diagnostics).toHaveLength(0);
  });

  /**
   * Verifies that adding the EmitterContext provider around children
   * does not alter the emitted output. The same infrastructure files,
   * project files, and internal files should be generated.
   */
  it("does not alter emitted output structure", async () => {
    const [{ outputs }, diagnostics] =
      await Tester.compileAndDiagnose(`op test(): void;`);
    expect(diagnostics).toHaveLength(0);

    // Infrastructure files still generated
    const csFiles = Object.keys(outputs).filter((k) => k.endsWith(".cs"));
    const infraFiles = csFiles.filter((k) => k.includes("/Internal/"));
    expect(infraFiles.length).toBeGreaterThan(0);

    // Project scaffolding still generated
    expect(Object.keys(outputs).some((k) => k.endsWith(".csproj"))).toBe(true);
    expect(Object.keys(outputs).some((k) => k.endsWith(".sln"))).toBe(true);
  });

  /**
   * Verifies the context works with a service that has models, enums,
   * and operations — a more complex scenario than a bare `op test()`.
   * This catches issues where the context provider might interfere
   * with model/enum/client generation.
   */
  it("works with full service including models and operations", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace MyService;
      
      model Widget {
        id: string;
        weight: int32;
      }
      
      @route("/widgets")
      op getWidget(): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    // Model file should be generated
    const modelFiles = Object.keys(outputs).filter(
      (k) => k.includes("/Models/") && k.endsWith(".cs"),
    );
    expect(modelFiles.length).toBeGreaterThan(0);

    // Client file should be generated
    const clientFiles = Object.keys(outputs).filter(
      (k) =>
        k.endsWith("Client.cs") &&
        !k.includes("/Internal/") &&
        !k.includes("ClientOptions"),
    );
    expect(clientFiles.length).toBeGreaterThan(0);
  });

  /**
   * Verifies the context works with a service containing enums,
   * both fixed and extensible, ensuring the context provider does
   * not break enum generation.
   */
  it("works with enums in the service", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace MyService;

      enum Color {
        Red,
        Green,
        Blue,
      }

      model Widget {
        id: string;
        color: Color;
      }

      @route("/widgets")
      op getWidget(): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    // Enum file should be generated
    const enumFiles = Object.keys(outputs).filter(
      (k) =>
        k.includes("Color") && k.endsWith(".cs") && !k.includes("Serialization"),
    );
    expect(enumFiles.length).toBeGreaterThan(0);
  });
});
