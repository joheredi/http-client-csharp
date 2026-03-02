import { describe, it, expect } from "vitest";
import {
  $lib,
  reportDiagnostic,
  createDiagnostic,
  getTracer,
} from "../src/lib.js";

/**
 * Tests for the TypeSpec library definition in src/lib.ts.
 *
 * These tests validate that:
 * 1. The $lib export is a valid TypeSpec library with the correct name
 * 2. All diagnostic codes are registered and have the expected severity
 * 3. The emitter options schema is registered on the library
 * 4. Exported helper functions (reportDiagnostic, createDiagnostic, getTracer) are present
 *
 * This is critical because:
 * - The TypeSpec compiler uses $lib.name to identify the emitter in tspconfig.yaml
 * - Diagnostic codes are used throughout the emitter to report errors/warnings
 * - The options schema enables IDE auto-completion and config validation
 * - Missing or misnamed diagnostics would cause runtime errors when reported
 */
describe("$lib", () => {
  /**
   * The library name must match what users put in tspconfig.yaml under
   * "emit". If this changes, all existing user configs would break.
   */
  it("has the correct library name", () => {
    expect($lib.name).toBe("http-client-csharp");
  });

  /**
   * Verifies the emitter options schema is registered. Without this,
   * the TypeSpec compiler cannot validate emitter options in tspconfig.yaml
   * and IDE auto-completion won't work for option names.
   */
  it("registers the emitter options schema", () => {
    expect($lib.emitter?.options).toBeDefined();
    expect($lib.emitter?.options?.type).toBe("object");
  });

  /**
   * Verifies all expected diagnostic codes are registered. Each diagnostic
   * code is used by different parts of the emitter — missing any would cause
   * a runtime error when that code path tries to report a diagnostic.
   */
  it("registers all expected diagnostic codes", () => {
    const expectedCodes = [
      "no-apiVersion",
      "no-route",
      "general-warning",
      "general-error",
      "unsupported-auth",
      "client-namespace-conflict",
      "unsupported-endpoint-url",
      "unsupported-sdk-type",
      "unsupported-default-value-type",
      "unsupported-cookie-parameter",
      "unsupported-parameter-kind",
      "unsupported-patch-convenience-method",
      "unsupported-service-method",
      "unsupported-continuation-location",
    ];

    const registeredCodes = Object.keys($lib.diagnostics);
    for (const code of expectedCodes) {
      expect(registeredCodes, `missing diagnostic code: ${code}`).toContain(
        code,
      );
    }
  });

  /**
   * Verifies error-severity diagnostics are correctly classified.
   * Error diagnostics cause the TypeSpec compiler to fail the emit process,
   * so incorrect severity would either miss real errors or block valid specs.
   */
  it("classifies error diagnostics correctly", () => {
    const errorCodes = [
      "no-apiVersion",
      "no-route",
      "general-error",
      "unsupported-endpoint-url",
      "unsupported-sdk-type",
      "unsupported-default-value-type",
      "unsupported-cookie-parameter",
      "unsupported-continuation-location",
    ];

    for (const code of errorCodes) {
      const diag = $lib.diagnostics[code];
      expect(diag.severity, `${code} should be error`).toBe("error");
    }
  });

  /**
   * Verifies warning-severity diagnostics are correctly classified.
   * Warning diagnostics don't block emit but inform users of potential issues.
   * Misclassifying a warning as error would block valid TypeSpec specs.
   */
  it("classifies warning diagnostics correctly", () => {
    const warningCodes = [
      "general-warning",
      "unsupported-auth",
      "client-namespace-conflict",
      "unsupported-parameter-kind",
      "unsupported-patch-convenience-method",
      "unsupported-service-method",
    ];

    for (const code of warningCodes) {
      const diag = $lib.diagnostics[code];
      expect(diag.severity, `${code} should be warning`).toBe("warning");
    }
  });

  /**
   * Verifies the unsupported-auth diagnostic has the special
   * 'onlyUnsupportedAuthProvided' message variant. This variant is used
   * when no supported auth scheme is found, and it produces a different
   * message than the generic auth warning.
   */
  it("has unsupported-auth message variants", () => {
    const authDiag = $lib.diagnostics["unsupported-auth"];
    expect(authDiag.messages["default"]).toBeDefined();
    expect(authDiag.messages["onlyUnsupportedAuthProvided"]).toBeDefined();
  });
});

describe("exported helpers", () => {
  /**
   * Verifies that reportDiagnostic and createDiagnostic are functions
   * bound to the library. These are the primary API for emitter code
   * to report problems — if they're not exported, components can't
   * report diagnostics at all.
   */
  it("exports reportDiagnostic as a function", () => {
    expect(typeof reportDiagnostic).toBe("function");
  });

  it("exports createDiagnostic as a function", () => {
    expect(typeof createDiagnostic).toBe("function");
  });

  /**
   * Verifies getTracer is exported. The tracer is used for debug logging
   * scoped to this library.
   */
  it("exports getTracer as a function", () => {
    expect(typeof getTracer).toBe("function");
  });
});
