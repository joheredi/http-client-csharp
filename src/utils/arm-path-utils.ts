/**
 * Pure utility functions for manipulating ARM resource URL path patterns.
 *
 * These functions operate on URL path strings like:
 *   `/subscriptions/{subscriptionId}/resourceGroups/{rgName}/providers/Microsoft.Foo/bars/{barName}`
 *
 * They support variable segments (e.g. `{subscriptionId}`) and fixed segments
 * (e.g. `subscriptions`, `providers`). Used by the resource detection pipeline
 * to classify operations, determine scopes, and match parent/child resources.
 *
 * @module
 */

import { ResourceScope } from "./resource-metadata.js";

/**
 * Returns `true` if the segment is a URL template variable like `{subscriptionId}`.
 *
 * @param segment - A single path segment (between slashes).
 */
export function isVariableSegment(segment: string): boolean {
  return segment.startsWith("{") && segment.endsWith("}");
}

/**
 * Returns the number of leading shared segments between two paths.
 * Variable segments are treated as matching each other.
 *
 * @param left  - First URL path.
 * @param right - Second URL path.
 */
export function getSharedSegmentCount(left: string, right: string): number {
  const leftSegments = left.split("/").filter((s) => s.length > 0);
  const rightSegments = right.split("/").filter((s) => s.length > 0);
  let count = 0;
  const minLength = Math.min(leftSegments.length, rightSegments.length);
  for (let i = 0; i < minLength; i++) {
    if (
      isVariableSegment(leftSegments[i]) &&
      isVariableSegment(rightSegments[i])
    ) {
      count++;
    } else if (leftSegments[i] === rightSegments[i]) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Returns `true` if `left` is a prefix of `right` (segment-wise).
 * Variable segments match each other.
 *
 * @param left  - The potential prefix path.
 * @param right - The full path to test against.
 */
export function isPrefix(left: string, right: string): boolean {
  const leftSegments = left.split("/").filter((s) => s.length > 0);
  const rightSegments = right.split("/").filter((s) => s.length > 0);
  const sharedCount = getSharedSegmentCount(left, right);
  return (
    sharedCount === leftSegments.length && sharedCount <= rightSegments.length
  );
}

/**
 * Finds the candidate whose extracted path is the longest prefix of `targetPath`.
 *
 * @typeParam T - Type of candidate items.
 * @param targetPath   - The path to match against.
 * @param candidates   - Array of candidates to search.
 * @param getPath      - Extracts a path string from a candidate; return `undefined` to skip.
 * @param properPrefix - When `true`, requires the candidate path to be a *proper* prefix (not equal).
 * @returns The best matching candidate, or `undefined` if none matched.
 */
export function findLongestPrefixMatch<T>(
  targetPath: string,
  candidates: T[],
  getPath: (candidate: T) => string | undefined,
  properPrefix: boolean = false,
): T | undefined {
  let bestMatch: T | undefined;
  let bestSegmentCount = 0;

  for (const candidate of candidates) {
    const candidatePath = getPath(candidate);
    if (!candidatePath) continue;
    if (!isPrefix(candidatePath, targetPath)) continue;
    if (properPrefix && isPrefix(targetPath, candidatePath)) continue;

    const segmentCount = getSharedSegmentCount(candidatePath, targetPath);
    if (segmentCount > bestSegmentCount) {
      bestSegmentCount = segmentCount;
      bestMatch = candidate;
    }
  }
  return bestMatch;
}

/**
 * Gets the resource type segment from a resource ID pattern.
 * This is the second-to-last segment (the collection name), since the last
 * segment is the key variable (e.g. `{barName}`).
 *
 * Example: `".../configurationAssignments/{assignmentName}"` → `"configurationAssignments"`
 *
 * @param resourceIdPattern - The full resource ID pattern path.
 * @returns The type segment, or `undefined` if the pattern is too short or malformed.
 */
export function getResourceTypeSegment(
  resourceIdPattern: string,
): string | undefined {
  const segments = resourceIdPattern.split("/").filter((s) => s !== "");
  if (segments.length < 2) return undefined;

  const lastSegment = segments[segments.length - 1];
  const typeCandidate = segments[segments.length - 2];

  // The last segment must be a variable (e.g. "{name}")
  if (!isVariableSegment(lastSegment)) return undefined;
  // The type segment itself must not be a variable
  if (isVariableSegment(typeCandidate)) return undefined;

  return typeCandidate;
}

/**
 * Gets the last segment of a path.
 * For list operation paths, this is typically the resource type/collection segment.
 *
 * Example: `".../configurationAssignments"` → `"configurationAssignments"`
 *
 * @param path - The URL path.
 */
export function getLastPathSegment(path: string): string | undefined {
  const segments = path.split("/").filter((s) => s !== "");
  if (segments.length === 0) return undefined;
  return segments[segments.length - 1];
}

const ResourceGroupScopePrefix =
  "/subscriptions/{subscriptionId}/resourceGroups";
const SubscriptionScopePrefix = "/subscriptions";
const TenantScopePrefix = "/tenants";
const Providers = "/providers";

/**
 * Extracts the ARM resource type string from a URL path pattern.
 *
 * For a path like:
 *   `/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}/bazzes/{baz}`
 * Returns: `"Microsoft.Foo/bars/bazzes"`
 *
 * Special cases for well-known scope prefixes without `/providers/`:
 * - `/subscriptions/{id}/resourceGroups/...` → `"Microsoft.Resources/resourceGroups"`
 * - `/subscriptions/{id}/...` → `"Microsoft.Resources/subscriptions"`
 * - `/tenants/...` → `"Microsoft.Resources/tenants"`
 *
 * @param path - The full URL path pattern.
 * @throws If the path doesn't contain `/providers/` and isn't a well-known scope path.
 */
export function calculateResourceTypeFromPath(path: string): string {
  const providerIndex = path.lastIndexOf(Providers);
  if (providerIndex === -1) {
    if (path.startsWith(ResourceGroupScopePrefix)) {
      return "Microsoft.Resources/resourceGroups";
    } else if (path.startsWith(SubscriptionScopePrefix)) {
      return "Microsoft.Resources/subscriptions";
    } else if (path.startsWith(TenantScopePrefix)) {
      return "Microsoft.Resources/tenants";
    }
    throw new Error(`Path ${path} doesn't have resource type`);
  }

  return path
    .substring(providerIndex + Providers.length)
    .split("/")
    .reduce((result, current, index) => {
      if (index === 1 || index % 2 === 0)
        return result === "" ? current : `${result}/${current}`;
      else return result;
    }, "");
}

/**
 * Determines the ARM resource scope from an operation's URL path pattern.
 *
 * Scope detection priority:
 * 1. Extension scope: path starts with `/{variable}/providers/` or has multiple `/providers/` segments
 * 2. ResourceGroup scope: `/subscriptions/{id}/resourceGroups/{rg}/`
 * 3. Subscription scope: `/subscriptions/{id}/`
 * 4. ManagementGroup scope: `/providers/Microsoft.Management/managementGroups/{id}/`
 * 5. Tenant scope (default fallback)
 *
 * @param path - The operation's URL path pattern.
 */
export function getOperationScopeFromPath(path: string): ResourceScope {
  // Match any path starting with a variable segment followed by /providers/
  // Covers scope-based operations like /{resourceUri}/providers/..., /{scope}/providers/...
  if (/^\/\{[^}]+\}\/providers\//.test(path)) {
    return ResourceScope.Extension;
  } else if (
    /^\/providers\/Microsoft\.Management\/managementGroups\/\{[^}]+\}\//.test(
      path,
    )
  ) {
    // ManagementGroup check must come BEFORE multi-provider check because
    // ManagementGroup paths can have multiple /providers/ segments
    return ResourceScope.ManagementGroup;
  } else if (hasMultipleProviderSegments(path)) {
    // Paths with multiple /providers/ segments indicate extension resources.
    // Must check BEFORE standard scope patterns since extension paths may
    // start with /subscriptions/ or /providers/ prefixes.
    return ResourceScope.Extension;
  } else if (
    /^\/subscriptions\/\{[^}]+\}\/resourceGroups\/\{[^}]+\}\//.test(path)
  ) {
    return ResourceScope.ResourceGroup;
  } else if (/^\/subscriptions\/\{[^}]+\}\//.test(path)) {
    return ResourceScope.Subscription;
  }
  return ResourceScope.Tenant;
}

/**
 * Checks if a path has multiple `/providers/` segments, indicating an extension
 * resource that extends another ARM resource.
 */
function hasMultipleProviderSegments(path: string): boolean {
  const providerMatches = path.match(/\/providers\//gi);
  return providerMatches !== null && providerMatches.length > 1;
}
