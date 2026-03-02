import { describe, it, expect } from "vitest";
import { Tester } from "./test-host.js";

/**
 * Tests for the HttpClientCSharpOutput root component.
 *
 * These tests verify that the emitter's root output component correctly
 * configures the Alloy rendering context (C# name policy, format options,
 * TspContext) and can compile TypeSpec input without errors.
 *
 * This is the foundational test — all future emitter output tests depend on
 * this component rendering successfully.
 */
describe("HttpClientCSharpOutput", () => {
  /**
   * Verifies the emitter compiles TypeSpec input without producing diagnostics.
   * This confirms that:
   * 1. The HttpClientCSharpOutput component renders without errors
   * 2. The emitter-framework Output is configured with a valid program
   * 3. The C# name policy and format options are accepted without issues
   */
  it("compiles without diagnostics", async () => {
    const [_result, diagnostics] =
      await Tester.compileAndDiagnose(`op test(): void;`);
    expect(diagnostics).toHaveLength(0);
  });

  /**
   * Verifies that an empty service still produces project scaffolding files
   * (.csproj and .sln) and internal infrastructure files, but no model,
   * enum, or client C# source files.
   */
  it("produces only project scaffolding when empty", async () => {
    const [{ outputs }, diagnostics] =
      await Tester.compileAndDiagnose(`op test(): void;`);
    expect(diagnostics).toHaveLength(0);
    const csFiles = Object.keys(outputs).filter((k) => k.endsWith(".cs"));
    // Infrastructure helper files (Argument, Optional, ChangeTrackingList,
    // ChangeTrackingDictionary) are always generated as standard scaffolding.
    const infraFiles = csFiles.filter((k) => k.includes("/Internal/"));
    expect(infraFiles.length).toBeGreaterThan(0);
    const nonInfraFiles = csFiles.filter((k) => !k.includes("/Internal/"));
    expect(nonInfraFiles).toHaveLength(0);
    expect(Object.keys(outputs).some((k) => k.endsWith(".csproj"))).toBe(true);
    expect(Object.keys(outputs).some((k) => k.endsWith(".sln"))).toBe(true);
  });
});
