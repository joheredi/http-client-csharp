import { describe, expect, it } from "vitest";
import {
  toNamespace,
  getInvalidNamespaceSegments,
  resolveRootNamespace,
  resolvePackageName,
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

/**
 * Tests for resolveRootNamespace and resolvePackageName (task 12.2.8).
 *
 * These tests verify that infrastructure files get the correct namespace when
 * generating versioned projects. The `package-name` option includes a version
 * suffix (e.g., "Versioning.Foo.V2") for project file naming, but the code
 * namespace must come from TCGC to match the client code namespace.
 *
 * resolveRootNamespace ignores the explicit package-name option and always
 * uses the TCGC-derived namespace. This ensures infrastructure files
 * (Argument.cs, Optional.cs, etc.) are in the same namespace as client code.
 */
describe("resolveRootNamespace", () => {
  /**
   * When TCGC provides a client namespace, resolveRootNamespace should use it,
   * ignoring any explicit package-name option. This is the core fix for the
   * versioned project namespace mismatch (task 12.2.8).
   */
  it("uses TCGC client namespace, ignoring explicit package-name", () => {
    const mockContext = createMockSdkContext({
      clientNamespace: "Versioning.ReturnTypeChangedFrom",
    });

    // resolvePackageName with explicit option uses the option
    expect(
      resolvePackageName(mockContext, "Versioning.ReturnTypeChangedFrom.V2"),
    ).toBe("Versioning.ReturnTypeChangedFrom.V2");

    // resolveRootNamespace always uses TCGC namespace
    expect(resolveRootNamespace(mockContext)).toBe(
      "Versioning.ReturnTypeChangedFrom",
    );
  });

  /**
   * When no explicit package-name is set, resolvePackageName and
   * resolveRootNamespace should return the same value (TCGC client namespace).
   */
  it("matches resolvePackageName when no explicit option is set", () => {
    const mockContext = createMockSdkContext({
      clientNamespace: "MyService",
    });

    expect(resolvePackageName(mockContext)).toBe("MyService");
    expect(resolveRootNamespace(mockContext)).toBe("MyService");
  });

  /**
   * When TCGC has no clients, falls back to sdkPackage.namespaces.
   */
  it("falls back to sdkPackage namespace when no clients exist", () => {
    const mockContext = createMockSdkContext({
      namespaceName: "Versioning.Added",
    });

    expect(resolveRootNamespace(mockContext)).toBe("Versioning.Added");
  });

  /**
   * When TCGC has neither clients nor namespaces, falls back to crossLanguagePackageId.
   */
  it("falls back to crossLanguagePackageId when no clients or namespaces", () => {
    const mockContext = createMockSdkContext({
      crossLanguagePackageId: "my-cross-lang-id",
    });

    expect(resolveRootNamespace(mockContext)).toBe("my-cross-lang-id");
  });

  /**
   * When TCGC provides nothing, falls back to "UnknownPackage".
   */
  it('falls back to "UnknownPackage" when no metadata available', () => {
    const mockContext = createMockSdkContext({});

    expect(resolveRootNamespace(mockContext)).toBe("UnknownPackage");
  });
});

/**
 * Minimal mock for SdkContext that provides just enough structure
 * for resolvePackageName and resolveRootNamespace to work.
 */
function createMockSdkContext(opts: {
  clientNamespace?: string;
  namespaceName?: string;
  crossLanguagePackageId?: string;
}): any {
  return {
    sdkPackage: {
      clients: opts.clientNamespace
        ? [{ namespace: opts.clientNamespace }]
        : [],
      namespaces: opts.namespaceName
        ? [{ fullName: opts.namespaceName }]
        : [],
      crossLanguagePackageId: opts.crossLanguagePackageId ?? undefined,
    },
  };
}
