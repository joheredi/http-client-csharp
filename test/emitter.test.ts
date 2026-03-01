import { describe, expect, it } from "vitest";
import { ApiTester, Tester } from "./test-host.js";

/** Tester configured with custom emitter options for options-resolution tests. */
const TesterWithOptions = ApiTester.emit("http-client-csharp", {
  "package-name": "CustomPackage",
  "generate-protocol-methods": false,
});

/**
 * Tests for the $onEmit emitter entry point.
 *
 * These tests verify that $onEmit correctly:
 * 1. Resolves emitter options with defaults
 * 2. Creates a TCGC SdkContext (exercises the full TypeSpec → TCGC → Alloy pipeline)
 * 3. Renders the HttpClientCSharpOutput component tree without errors
 *
 * Unlike the hello.test.ts tests which focus on the HttpClientCSharpOutput component
 * in isolation, these tests exercise the full $onEmit flow including TCGC integration.
 */
describe("$onEmit", () => {
  /**
   * Verifies that the emitter creates a TCGC SdkContext and renders the component
   * tree for a TypeSpec with a @service decorator. This exercises the TCGC service
   * processing pipeline which is the primary use case for the C# emitter.
   *
   * This test is important because createSdkContext processes the TypeSpec program
   * through TCGC to produce an SdkPackage — if this fails, no C# code can be generated.
   */
  it("compiles a service definition through TCGC without errors", async () => {
    const [_, diagnostics] = await Tester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(diagnostics).toHaveLength(0);
  });

  /**
   * Verifies the emitter handles a TypeSpec program with model types.
   * Models are processed by TCGC into SdkModelType entries in the SdkPackage,
   * which downstream components (task 1.2.x) will use to generate C# classes.
   */
  it("compiles a service with models through TCGC", async () => {
    const [_, diagnostics] = await Tester.compileAndDiagnose(`
      @service
      namespace TestService;

      model TestModel {
        name: string;
        age: int32;
      }
    `);
    expect(diagnostics).toHaveLength(0);
  });

  /**
   * Verifies that an empty service produces project scaffolding files
   * (.csproj and .sln) but no C# source files.
   */
  it("produces only project scaffolding for an empty service", async () => {
    const [{ outputs }, diagnostics] = await Tester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(diagnostics).toHaveLength(0);
    const csFiles = Object.keys(outputs).filter((k) => k.endsWith(".cs"));
    expect(csFiles).toHaveLength(0);
    expect(Object.keys(outputs).some((k) => k.endsWith(".csproj"))).toBe(true);
    expect(Object.keys(outputs).some((k) => k.endsWith(".sln"))).toBe(true);
  });

  /**
   * Verifies that the emitter correctly handles custom emitter options.
   * Creates a separate tester with custom options to exercise the
   * resolveOptions() path in $onEmit with user-specified values.
   */
  it("compiles with custom emitter options", async () => {
    const [_, diagnostics] = await TesterWithOptions.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(diagnostics).toHaveLength(0);
  });
});
