import type { SdkHeaderParameter } from "@azure-tools/typespec-client-generator-core";
import type { Children } from "@alloy-js/core";
import { Azure } from "../builtins/azure.js";

/**
 * Bit flags for identifying which conditional request headers are present
 * on an HTTP operation. Used to determine the grouping strategy.
 *
 * Mirrors the legacy MatchConditionsHeadersVisitor's RequestConditionHeaders enum.
 */
export enum ConditionalHeaderFlags {
  None = 0,
  IfMatch = 1,
  IfNoneMatch = 2,
  IfModifiedSince = 4,
  IfUnmodifiedSince = 8,
}

/**
 * The conditional header grouping type for an Azure operation.
 *
 * - "none": No conditional headers present, or not Azure flavor
 * - "etag": Single If-Match or If-None-Match → ETag? parameter
 * - "matchConditions": Both If-Match + If-None-Match (no time headers) → MatchConditions parameter
 * - "requestConditions": Any time-based header present → RequestConditions parameter
 */
export type ConditionalGroupType =
  | "none"
  | "etag"
  | "matchConditions"
  | "requestConditions";

/**
 * Result of analyzing an operation's conditional headers.
 * Contains the grouping type, replacement parameter info, and the
 * original header parameters that were grouped.
 */
export interface ConditionalHeaderGrouping {
  /** The grouping type determined by the combination of conditional headers. */
  type: ConditionalGroupType;
  /** Bit flags for which conditional headers are present. */
  flags: ConditionalHeaderFlags;
  /** The header parameters that are conditional (should be replaced by the grouped param). */
  conditionalParams: SdkHeaderParameter[];
  /**
   * The replacement parameter name. For ETag, keeps the original param name.
   * For MatchConditions/RequestConditions, uses the standard name.
   */
  paramName: string;
  /** The C# type expression (Alloy refkey) for the grouped parameter. */
  paramType: Children;
}

/**
 * Mapping from serialized header name (lowercase) to the corresponding
 * conditional header flag. Only these 4 HTTP conditional request headers
 * trigger grouping behavior.
 */
const conditionalHeaderMap = new Map<string, ConditionalHeaderFlags>([
  ["if-match", ConditionalHeaderFlags.IfMatch],
  ["if-none-match", ConditionalHeaderFlags.IfNoneMatch],
  ["if-modified-since", ConditionalHeaderFlags.IfModifiedSince],
  ["if-unmodified-since", ConditionalHeaderFlags.IfUnmodifiedSince],
]);

/**
 * Checks if a header parameter is a conditional request header
 * (If-Match, If-None-Match, If-Modified-Since, If-Unmodified-Since).
 * Detection is by serialized header name, case-insensitive.
 *
 * @param param - The SDK header parameter to check.
 */
export function isConditionalHeaderParam(param: SdkHeaderParameter): boolean {
  return conditionalHeaderMap.has(param.serializedName.toLowerCase());
}

/**
 * Scans an operation's header parameters and determines which conditional
 * request headers are present. Returns a bit-flag combination.
 *
 * @param headerParams - All header parameters for an HTTP operation.
 */
export function detectConditionalHeaders(
  headerParams: SdkHeaderParameter[],
): ConditionalHeaderFlags {
  let flags = ConditionalHeaderFlags.None;
  for (const param of headerParams) {
    const flag = conditionalHeaderMap.get(param.serializedName.toLowerCase());
    if (flag !== undefined) {
      flags |= flag;
    }
  }
  return flags;
}

/**
 * Determines the grouping type based on which conditional headers are present.
 *
 * Rules (matching the legacy MatchConditionsHeadersVisitor):
 * - Any time-based header (If-Modified-Since or If-Unmodified-Since) → RequestConditions
 * - Both If-Match AND If-None-Match (no time) → MatchConditions
 * - Single If-Match or If-None-Match only → ETag
 * - No conditional headers → None
 *
 * @param flags - Bit flags from detectConditionalHeaders.
 */
export function getConditionalGroupType(
  flags: ConditionalHeaderFlags,
): ConditionalGroupType {
  if (flags === ConditionalHeaderFlags.None) return "none";

  const hasModificationTime =
    (flags &
      (ConditionalHeaderFlags.IfModifiedSince |
        ConditionalHeaderFlags.IfUnmodifiedSince)) !==
    0;
  if (hasModificationTime) return "requestConditions";

  const hasBothMatch =
    (flags & ConditionalHeaderFlags.IfMatch) !== 0 &&
    (flags & ConditionalHeaderFlags.IfNoneMatch) !== 0;
  if (hasBothMatch) return "matchConditions";

  return "etag";
}

/**
 * Analyzes an operation's header parameters and returns the conditional
 * header grouping information for Azure flavor.
 *
 * For non-Azure flavor, always returns type "none" (no grouping).
 * For Azure flavor, detects conditional headers and determines the
 * appropriate grouping (ETag, MatchConditions, or RequestConditions).
 *
 * @param headerParams - All header parameters for an HTTP operation.
 * @param flavor - The emitter flavor ("azure" or "unbranded").
 */
export function getConditionalHeaderGrouping(
  headerParams: SdkHeaderParameter[],
  flavor?: string,
): ConditionalHeaderGrouping {
  if (flavor !== "azure") {
    return {
      type: "none",
      flags: ConditionalHeaderFlags.None,
      conditionalParams: [],
      paramName: "",
      paramType: "",
    };
  }

  const flags = detectConditionalHeaders(headerParams);
  const type = getConditionalGroupType(flags);

  if (type === "none") {
    return {
      type: "none",
      flags: ConditionalHeaderFlags.None,
      conditionalParams: [],
      paramName: "",
      paramType: "",
    };
  }

  // Collect the actual conditional header parameters
  const conditionalParams = headerParams.filter((p) =>
    isConditionalHeaderParam(p),
  );

  // Determine parameter name and type based on grouping
  switch (type) {
    case "etag": {
      // Single If-Match or If-None-Match → keep original param name, use ETag type
      const param = conditionalParams[0];
      return {
        type,
        flags,
        conditionalParams,
        paramName: param.name,
        paramType: Azure.ETag,
      };
    }
    case "matchConditions":
      return {
        type,
        flags,
        conditionalParams,
        paramName: "matchConditions",
        paramType: Azure.MatchConditions,
      };
    case "requestConditions":
      return {
        type,
        flags,
        conditionalParams,
        paramName: "requestConditions",
        paramType: Azure.RequestConditions,
      };
  }
}

/**
 * Returns the list of conditional header property names that are NOT supported
 * by the operation (present in the grouped type but not in the API spec).
 *
 * Used to generate ArgumentException validation in protocol methods.
 * For example, if an operation has only If-Match + If-Modified-Since,
 * the RequestConditions parameter also exposes IfNoneMatch and IfUnmodifiedSince,
 * but those are unsupported and should throw if the caller sets them.
 *
 * @param flags - Bit flags from detectConditionalHeaders.
 */
export function getUnsupportedConditionProperties(
  flags: ConditionalHeaderFlags,
): Array<{ propertyName: string; headerName: string }> {
  const unsupported: Array<{ propertyName: string; headerName: string }> = [];

  const allProperties: Array<{
    flag: ConditionalHeaderFlags;
    propertyName: string;
    headerName: string;
  }> = [
    {
      flag: ConditionalHeaderFlags.IfMatch,
      propertyName: "IfMatch",
      headerName: "If-Match",
    },
    {
      flag: ConditionalHeaderFlags.IfNoneMatch,
      propertyName: "IfNoneMatch",
      headerName: "If-None-Match",
    },
    {
      flag: ConditionalHeaderFlags.IfModifiedSince,
      propertyName: "IfModifiedSince",
      headerName: "If-Modified-Since",
    },
    {
      flag: ConditionalHeaderFlags.IfUnmodifiedSince,
      propertyName: "IfUnmodifiedSince",
      headerName: "If-Unmodified-Since",
    },
  ];

  for (const prop of allProperties) {
    if ((flags & prop.flag) === 0) {
      unsupported.push({
        propertyName: prop.propertyName,
        headerName: prop.headerName,
      });
    }
  }

  return unsupported;
}
