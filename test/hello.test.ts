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
    const [_, diagnostics] = await Tester.compileAndDiagnose(`op test(): void;`);
    expect(diagnostics).toHaveLength(0);
  });

  /**
   * Verifies that an empty HttpClientCSharpOutput produces no output files.
   * The root component is intentionally empty at this stage — child components
   * (models, enums, clients) will be added by later tasks.
   */
  it("produces no output files when empty", async () => {
    const [{ outputs }, diagnostics] = await Tester.compileAndDiagnose(`op test(): void;`);
    expect(diagnostics).toHaveLength(0);
    expect(Object.keys(outputs)).toHaveLength(0);
  });
});