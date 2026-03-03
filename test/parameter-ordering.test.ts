import { describe, expect, it } from "vitest";
import { reorderTokenFirst } from "../src/utils/parameter-ordering.js";

/**
 * Tests for the parameter-ordering utility functions
 * (src/utils/parameter-ordering.ts).
 *
 * These tests verify that the reorderTokenFirst function correctly places
 * the continuation token parameter first in parameter lists. This is critical
 * for matching the legacy emitter's parameter ordering convention where
 * the @continuationToken parameter always comes before other query/header
 * parameters in paging method signatures.
 *
 * Without this ordering, header parameters would appear before query parameters
 * due to the priority-based sorting (headers are iterated before queries),
 * causing the continuation token (often a query param) to appear after headers.
 */
describe("reorderTokenFirst", () => {
  /**
   * When the token parameter is not the first element, it should be moved
   * to index 0. This is the core use case: header params sort before query
   * params, so a continuation token query param ends up after header params.
   */
  it("moves token parameter to first position", () => {
    const params = [
      { name: "foo", type: "string" },
      { name: "token", type: "string" },
      { name: "bar", type: "string" },
    ];
    const result = reorderTokenFirst(params, "token");
    expect(result.map((p) => p.name)).toEqual(["token", "foo", "bar"]);
  });

  /**
   * When the token parameter is already first, the function should return
   * the original array unchanged. This avoids unnecessary array copies.
   */
  it("returns original array when token is already first", () => {
    const params = [
      { name: "token", type: "string" },
      { name: "foo", type: "string" },
    ];
    const result = reorderTokenFirst(params, "token");
    expect(result).toBe(params); // same reference, no copy
  });

  /**
   * When tokenParamName is undefined (no continuation token in this paging
   * method), the function should return the original array unchanged.
   */
  it("returns original array when tokenParamName is undefined", () => {
    const params = [
      { name: "foo", type: "string" },
      { name: "bar", type: "string" },
    ];
    const result = reorderTokenFirst(params, undefined);
    expect(result).toBe(params);
  });

  /**
   * When the token parameter name doesn't match any parameter in the list,
   * the function should return the original array unchanged.
   */
  it("returns original array when token param not found", () => {
    const params = [
      { name: "foo", type: "string" },
      { name: "bar", type: "string" },
    ];
    const result = reorderTokenFirst(params, "token");
    expect(result).toBe(params);
  });

  /**
   * The function must not mutate the input array. A new array should be
   * returned when reordering is needed.
   */
  it("does not mutate the original array", () => {
    const params = [
      { name: "foo", type: "string" },
      { name: "token", type: "string" },
      { name: "bar", type: "string" },
    ];
    const original = [...params];
    reorderTokenFirst(params, "token");
    expect(params).toEqual(original);
  });

  /**
   * When the token is the last parameter, it should still be moved to first.
   */
  it("handles token at the end of the list", () => {
    const params = [
      { name: "foo", type: "string" },
      { name: "bar", type: "string" },
      { name: "token", type: "string" },
    ];
    const result = reorderTokenFirst(params, "token");
    expect(result.map((p) => p.name)).toEqual(["token", "foo", "bar"]);
  });
});
