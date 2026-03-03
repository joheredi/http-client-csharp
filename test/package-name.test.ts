import { describe, expect, it } from "vitest";
import {
  toNamespace,
  getInvalidNamespaceSegments,
} from "../src/utils/package-name.js";

/**
 * Tests for namespace resolution utilities (task 0.3.3).
 *
 * These tests verify that the `toNamespace()` function correctly converts raw package
 * name strings (which may be kebab-case, dot-separated, or mixed-case) into valid
 * C# namespace identifiers. The conversion must match the behavior of the legacy
 * emitter's `getClientNamespaceStringHelper` function.
 *
 * The `getInvalidNamespaceSegments()` function detects namespace segments that conflict
 * with C# reserved words like "Type", "Array", and "Enum", which would cause ambiguous
 * references in generated code.
 */
describe("toNamespace", () => {
  /**
   * Core kebab-case conversion: hyphens become dots, segments get capitalized.
   * This is the primary use case for the `package-name` emitter option.
   * Matches legacy test: getClientNamespaceStringHelper(undefined, "client-plane-generated") === "Client.Plane.Generated"
   */
  it("converts kebab-case to PascalCase with dots", () => {
    expect(toNamespace("client-plane-generated")).toBe(
      "Client.Plane.Generated",
    );
  });

  /**
   * Mixed-case input should still normalize: all segments get their first letter capitalized.
   * Matches legacy test: getClientNamespaceStringHelper(undefined, "client-plane-Generated")
   */
  it("handles mixed case in kebab segments", () => {
    expect(toNamespace("client-plane-Generated")).toBe(
      "Client.Plane.Generated",
    );
    expect(toNamespace("client-Plane-generated")).toBe(
      "Client.Plane.Generated",
    );
  });

  /**
   * Dot-separated input should capitalize each segment without adding extra dots.
   * Matches legacy test: getClientNamespaceStringHelper(undefined, "client.plane.generated")
   */
  it("handles dot-separated input", () => {
    expect(toNamespace("client.plane.generated")).toBe(
      "Client.Plane.Generated",
    );
  });

  /**
   * Already-valid C# namespaces should pass through unchanged.
   * This is important because TCGC-provided namespaces are already valid.
   */
  it("passes through already-valid namespaces unchanged", () => {
    expect(toNamespace("Azure.AI.ContentSafety")).toBe(
      "Azure.AI.ContentSafety",
    );
    expect(toNamespace("MyService")).toBe("MyService");
  });

  /**
   * Single-word package names should just get their first letter capitalized.
   */
  it("capitalizes single-word names", () => {
    expect(toNamespace("myservice")).toBe("Myservice");
    expect(toNamespace("MyService")).toBe("MyService");
  });

  /**
   * Empty string edge case — should return empty string without error.
   */
  it("handles empty string", () => {
    expect(toNamespace("")).toBe("");
  });

  /**
   * Mixed hyphens and dots — hyphens become dots, then all segments capitalize.
   */
  it("handles mixed hyphens and dots", () => {
    expect(toNamespace("azure.ai-content-safety")).toBe(
      "Azure.Ai.Content.Safety",
    );
  });
});

describe("getInvalidNamespaceSegments", () => {
  /**
   * Validates that segments matching C# reserved words are detected.
   * The legacy emitter tracks "Type", "Array", and "Enum" as invalid namespace segments.
   */
  it("detects reserved word conflicts", () => {
    expect(getInvalidNamespaceSegments("My.Type.Service")).toEqual(["Type"]);
    expect(getInvalidNamespaceSegments("My.Array.Handler")).toEqual(["Array"]);
    expect(getInvalidNamespaceSegments("My.Enum.Types")).toEqual(["Enum"]);
  });

  /**
   * Multiple conflicting segments should all be returned.
   */
  it("returns multiple conflicts", () => {
    expect(getInvalidNamespaceSegments("Type.Array.Service")).toEqual([
      "Type",
      "Array",
    ]);
  });

  /**
   * Valid namespaces with no conflicts should return an empty array.
   */
  it("returns empty array for valid namespaces", () => {
    expect(getInvalidNamespaceSegments("Azure.AI.ContentSafety")).toEqual([]);
    expect(getInvalidNamespaceSegments("MyService")).toEqual([]);
  });

  /**
   * Case sensitivity: "type" (lowercase) should NOT be flagged — only exact matches matter.
   * C# is case-sensitive, so only PascalCase matches are conflicts.
   */
  it("is case-sensitive", () => {
    expect(getInvalidNamespaceSegments("My.type.Service")).toEqual([]);
    expect(getInvalidNamespaceSegments("My.array.Service")).toEqual([]);
  });
});
