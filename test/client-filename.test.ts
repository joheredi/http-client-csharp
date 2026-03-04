import { describe, expect, it } from "vitest";
import type {
  SdkClientType,
  SdkHttpOperation,
} from "@azure-tools/typespec-client-generator-core";
import { getClientFileName } from "../src/utils/clients.js";

/**
 * Tests for the getClientFileName utility (src/utils/clients.ts).
 *
 * This utility computes unique filenames for client classes based on their
 * position in the hierarchy. Without unique filenames, sub-clients that share
 * the same short name (e.g., "Standard" under different parents) would
 * collide to a single output file.
 *
 * Why these tests matter:
 * - Filename collisions cause entire client classes to be silently dropped,
 *   resulting in CS0234/CS0246 compilation errors in the generated C# project.
 * - The hierarchical naming convention must match the legacy emitter's pattern
 *   (e.g., PathParametersLabelExpansionStandard.cs).
 */
describe("getClientFileName", () => {
  /** Helper to create a minimal mock client for testing. */
  function mockClient(
    name: string,
    parent?: SdkClientType<SdkHttpOperation>,
  ): SdkClientType<SdkHttpOperation> {
    return { name, parent } as SdkClientType<SdkHttpOperation>;
  }

  /** Identity function used as the name converter in tests. */
  const identity = (n: string) => n;

  /**
   * Root clients (no parent) should return just their own class name.
   * These are the top-level entry points like "TestServiceClient".
   */
  it("returns class name for root client", () => {
    const root = mockClient("TestServiceClient");
    expect(getClientFileName(root, identity)).toBe("TestServiceClient");
  });

  /**
   * Direct children of the root should return just their own name (no prefix),
   * since there's only one non-root ancestor (themselves).
   * This matches the legacy emitter: PathParameters.cs (not RoutesClientPathParameters.cs).
   */
  it("returns short name for direct child of root", () => {
    const root = mockClient("RoutesClient");
    const child = mockClient("PathParameters", root);
    expect(getClientFileName(child, identity)).toBe("PathParameters");
  });

  /**
   * Grandchildren (depth 2) should concatenate parent + own name.
   * E.g., LabelExpansion under PathParameters → "PathParametersLabelExpansion".
   */
  it("concatenates parent names for depth-2 sub-client", () => {
    const root = mockClient("RoutesClient");
    const parent = mockClient("PathParameters", root);
    const child = mockClient("LabelExpansion", parent);
    expect(getClientFileName(child, identity)).toBe(
      "PathParametersLabelExpansion",
    );
  });

  /**
   * Great-grandchildren (depth 3) should concatenate all non-root ancestors.
   * E.g., Standard under LabelExpansion under PathParameters →
   * "PathParametersLabelExpansionStandard".
   */
  it("concatenates all ancestors for depth-3 sub-client", () => {
    const root = mockClient("RoutesClient");
    const l1 = mockClient("PathParameters", root);
    const l2 = mockClient("LabelExpansion", l1);
    const l3 = mockClient("Standard", l2);
    expect(getClientFileName(l3, identity)).toBe(
      "PathParametersLabelExpansionStandard",
    );
  });

  /**
   * Siblings at the same depth but under different parents produce unique names.
   * This is the critical case: "Standard" under LabelExpansion vs "Standard"
   * under MatrixExpansion must produce different filenames.
   */
  it("produces unique names for siblings with same short name", () => {
    const root = mockClient("RoutesClient");
    const pathParams = mockClient("PathParameters", root);
    const label = mockClient("LabelExpansion", pathParams);
    const matrix = mockClient("MatrixExpansion", pathParams);
    const labelStandard = mockClient("Standard", label);
    const matrixStandard = mockClient("Standard", matrix);

    expect(getClientFileName(labelStandard, identity)).toBe(
      "PathParametersLabelExpansionStandard",
    );
    expect(getClientFileName(matrixStandard, identity)).toBe(
      "PathParametersMatrixExpansionStandard",
    );
    // They must be different
    expect(getClientFileName(labelStandard, identity)).not.toBe(
      getClientFileName(matrixStandard, identity),
    );
  });

  /**
   * The toClassName callback should be applied to each segment in the path.
   * This ensures the name policy transforms each name correctly.
   */
  it("applies toClassName callback to each segment", () => {
    const root = mockClient("RoutesClient");
    const parent = mockClient("path-params", root);
    const child = mockClient("label-exp", parent);
    const toUpper = (n: string) => n.toUpperCase();

    expect(getClientFileName(child, toUpper)).toBe("PATH-PARAMSLABEL-EXP");
  });
});
