/**
 * Unit tests for ARM URL path utility functions.
 *
 * These tests validate the foundational path manipulation functions used by
 * the ARM resource detection pipeline. They cover:
 * - Variable segment detection (`{paramName}` patterns)
 * - Path prefix matching (segment-wise, with variable matching)
 * - Resource type extraction from ARM URL patterns
 * - Operation scope classification from URL prefixes
 * - Longest prefix matching for parent-child resource detection
 *
 * These functions are pure (no TypeSpec compiler dependency) and critical
 * for correct ARM resource identification.
 */
import { describe, expect, it } from "vitest";
import {
  isVariableSegment,
  getSharedSegmentCount,
  isPrefix,
  findLongestPrefixMatch,
  getResourceTypeSegment,
  getLastPathSegment,
  calculateResourceTypeFromPath,
  getOperationScopeFromPath,
} from "../../src/utils/arm-path-utils.js";
import { ResourceScope } from "../../src/utils/resource-metadata.js";

describe("isVariableSegment", () => {
  it("detects variable segments wrapped in braces", () => {
    expect(isVariableSegment("{subscriptionId}")).toBe(true);
    expect(isVariableSegment("{resourceGroupName}")).toBe(true);
    expect(isVariableSegment("{a}")).toBe(true);
  });

  it("rejects non-variable segments", () => {
    expect(isVariableSegment("subscriptions")).toBe(false);
    expect(isVariableSegment("providers")).toBe(false);
    expect(isVariableSegment("{")).toBe(false);
    expect(isVariableSegment("}")).toBe(false);
    expect(isVariableSegment("")).toBe(false);
    expect(isVariableSegment("{foo")).toBe(false);
    expect(isVariableSegment("foo}")).toBe(false);
  });
});

describe("getSharedSegmentCount", () => {
  it("counts matching fixed segments", () => {
    expect(
      getSharedSegmentCount(
        "/subscriptions/{id}/resourceGroups",
        "/subscriptions/{id}/resourceGroups/{rg}",
      ),
    ).toBe(3);
  });

  it("treats variable segments as matching each other", () => {
    expect(
      getSharedSegmentCount(
        "/subscriptions/{subId}",
        "/subscriptions/{subscriptionId}",
      ),
    ).toBe(2);
  });

  it("stops at first mismatch", () => {
    expect(
      getSharedSegmentCount(
        "/subscriptions/{id}/foo",
        "/subscriptions/{id}/bar",
      ),
    ).toBe(2);
  });

  it("returns 0 for completely different paths", () => {
    expect(getSharedSegmentCount("/foo", "/bar")).toBe(0);
  });
});

describe("isPrefix", () => {
  it("returns true when left is a prefix of right", () => {
    expect(
      isPrefix(
        "/subscriptions/{id}/resourceGroups",
        "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}",
      ),
    ).toBe(true);
  });

  it("returns true when paths are equal (not a proper prefix)", () => {
    expect(
      isPrefix(
        "/subscriptions/{id}/resourceGroups/{rg}",
        "/subscriptions/{id}/resourceGroups/{rg}",
      ),
    ).toBe(true);
  });

  it("returns false when left is longer than right", () => {
    expect(
      isPrefix(
        "/subscriptions/{id}/resourceGroups/{rg}/providers",
        "/subscriptions/{id}/resourceGroups",
      ),
    ).toBe(false);
  });

  it("returns false when segments don't match", () => {
    expect(isPrefix("/subscriptions/{id}/foo", "/subscriptions/{id}/bar")).toBe(
      false,
    );
  });
});

describe("findLongestPrefixMatch", () => {
  /**
   * Validates that the function selects the longest matching prefix among
   * multiple candidates. This is critical for parent-child resource detection
   * where a child resource path should match the most specific parent.
   */
  it("selects the longest matching candidate", () => {
    const candidates = [
      "/subscriptions/{id}/resourceGroups/{rg}",
      "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}",
      "/subscriptions/{id}",
    ];

    const target =
      "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}/bazzes/{baz}";

    const match = findLongestPrefixMatch(target, candidates, (c) => c);
    expect(match).toBe(candidates[1]);
  });

  it("returns undefined when no candidates match", () => {
    const match = findLongestPrefixMatch("/foo/bar", ["/baz/qux"], (c) => c);
    expect(match).toBeUndefined();
  });

  it("supports proper prefix mode (excludes equal paths)", () => {
    const candidates = ["/foo/bar", "/foo"];
    const match = findLongestPrefixMatch(
      "/foo/bar",
      candidates,
      (c) => c,
      true, // properPrefix
    );
    // Should match /foo (proper prefix) not /foo/bar (equal)
    expect(match).toBe("/foo");
  });
});

describe("getResourceTypeSegment", () => {
  /**
   * The type segment is the collection name (second-to-last segment)
   * in a resource ID pattern. It's used for matching list operations
   * to their parent resources.
   */
  it("extracts the type segment from a standard resource pattern", () => {
    expect(
      getResourceTypeSegment(
        "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}",
      ),
    ).toBe("bars");
  });

  it("returns undefined for singleton patterns (last segment is fixed)", () => {
    expect(
      getResourceTypeSegment(
        "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/default",
      ),
    ).toBeUndefined();
  });

  it("returns undefined for paths too short", () => {
    expect(getResourceTypeSegment("/foo")).toBeUndefined();
  });
});

describe("getLastPathSegment", () => {
  it("returns the last segment of a path", () => {
    expect(getLastPathSegment("/foo/bar/baz")).toBe("baz");
  });

  it("returns undefined for empty path", () => {
    expect(getLastPathSegment("/")).toBeUndefined();
  });
});

describe("calculateResourceTypeFromPath", () => {
  /**
   * Resource type extraction is critical for matching operations to resources.
   * It parses the ARM URL pattern after the last /providers/ segment and
   * extracts the namespace + type segments (skipping variable segments).
   */
  it("extracts resource type from a standard resource group-scoped path", () => {
    expect(
      calculateResourceTypeFromPath(
        "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}",
      ),
    ).toBe("Microsoft.Foo/bars");
  });

  it("extracts nested resource type", () => {
    expect(
      calculateResourceTypeFromPath(
        "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}/bazzes/{baz}",
      ),
    ).toBe("Microsoft.Foo/bars/bazzes");
  });

  it("returns Microsoft.Resources/resourceGroups for RG scope prefix", () => {
    expect(
      calculateResourceTypeFromPath(
        "/subscriptions/{subscriptionId}/resourceGroups/{rg}",
      ),
    ).toBe("Microsoft.Resources/resourceGroups");
  });

  it("returns Microsoft.Resources/subscriptions for subscription scope prefix", () => {
    expect(
      calculateResourceTypeFromPath("/subscriptions/{subscriptionId}"),
    ).toBe("Microsoft.Resources/subscriptions");
  });

  it("throws for paths without providers", () => {
    expect(() => calculateResourceTypeFromPath("/foo/bar")).toThrow(
      "doesn't have resource type",
    );
  });
});

describe("getOperationScopeFromPath", () => {
  /**
   * Scope detection determines the deployment level of an ARM operation.
   * This is used to classify resources and operations for proper code generation.
   */
  it("detects ResourceGroup scope", () => {
    expect(
      getOperationScopeFromPath(
        "/subscriptions/{subId}/resourceGroups/{rgName}/providers/Microsoft.Foo/bars/{name}",
      ),
    ).toBe(ResourceScope.ResourceGroup);
  });

  it("detects Subscription scope", () => {
    expect(
      getOperationScopeFromPath(
        "/subscriptions/{subId}/providers/Microsoft.Foo/bars",
      ),
    ).toBe(ResourceScope.Subscription);
  });

  it("detects Extension scope for scope-parameter paths", () => {
    expect(
      getOperationScopeFromPath(
        "/{resourceUri}/providers/Microsoft.Foo/bars/{name}",
      ),
    ).toBe(ResourceScope.Extension);
  });

  it("detects Extension scope for multi-provider paths", () => {
    expect(
      getOperationScopeFromPath(
        "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Parent/parents/{p}/providers/Microsoft.Child/children/{c}",
      ),
    ).toBe(ResourceScope.Extension);
  });

  it("detects ManagementGroup scope", () => {
    expect(
      getOperationScopeFromPath(
        "/providers/Microsoft.Management/managementGroups/{mgId}/providers/Microsoft.Foo/bars",
      ),
    ).toBe(ResourceScope.ManagementGroup);
  });

  it("defaults to Tenant scope", () => {
    expect(
      getOperationScopeFromPath("/providers/Microsoft.Foo/bars/{barName}"),
    ).toBe(ResourceScope.Tenant);
  });
});
