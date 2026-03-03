import type {
  SdkPagingServiceMetadata,
  SdkServiceOperation,
} from "@azure-tools/typespec-client-generator-core";

/**
 * Extracts the continuation token parameter name from paging metadata.
 *
 * The token parameter name comes from the last segment of
 * `continuationTokenParameterSegments`. This matches the approach used
 * in CollectionResultFile to identify which operation parameter carries
 * the continuation token.
 *
 * @returns The token parameter name, or undefined if no continuation token
 *   is configured for this paging method.
 */
export function getContinuationTokenParamName<T extends SdkServiceOperation>(
  metadata: SdkPagingServiceMetadata<T>,
): string | undefined {
  const segments = metadata.continuationTokenParameterSegments;
  if (!segments || segments.length === 0) return undefined;

  // Also check that next-link is not present — legacy emitter precedence:
  // nextLink > continuationToken > single-page
  const nextLinkSegments = metadata.nextLinkSegments;
  if (nextLinkSegments && nextLinkSegments.length > 0) return undefined;

  return segments[segments.length - 1].name;
}

/**
 * Reorders a parameter list so the continuation token parameter comes first.
 *
 * The legacy emitter always places the continuation token parameter before
 * all other query/header parameters in paging method signatures, collection
 * result constructors, and CreateRequest methods. This function moves the
 * token param to index 0 to match that convention.
 *
 * @param params - The parameter list to reorder (not mutated).
 * @param tokenParamName - The name of the continuation token parameter.
 *   If undefined or not found, returns the original array unchanged.
 * @returns A new array with the token parameter first, or the original array
 *   if no reordering is needed.
 */
export function reorderTokenFirst<T extends { name: string }>(
  params: T[],
  tokenParamName: string | undefined,
): T[] {
  if (!tokenParamName) return params;
  const tokenIdx = params.findIndex((p) => p.name === tokenParamName);
  if (tokenIdx <= 0) return params; // already first or not found
  const result = [...params];
  const [tokenParam] = result.splice(tokenIdx, 1);
  result.unshift(tokenParam);
  return result;
}
