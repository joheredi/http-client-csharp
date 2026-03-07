import type { SdkHeaderParameter } from "@azure-tools/typespec-client-generator-core";

/**
 * Base set of header names that are auto-populated at runtime and should not
 * appear in public method signatures, regardless of emitter flavor.
 *
 * Per the OASIS repeatability spec, `Repeatability-Request-ID` gets a new GUID
 * and `Repeatability-First-Sent` gets the current UTC timestamp.
 */
const baseSpecialHeaderNames = new Set([
  "repeatability-request-id",
  "repeatability-first-sent",
]);

/**
 * Additional header names that are special when the emitter flavor is "azure".
 * These headers are automatically managed by the Azure HttpPipeline policy
 * and should not be exposed as method parameters.
 *
 * `x-ms-client-request-id` is auto-set by Azure.Core's pipeline policy for
 * request correlation — SDK methods should not expose it as a parameter.
 * Unlike repeatability headers, it is NOT auto-populated in CreateRequest;
 * the Azure pipeline policy handles it entirely.
 */
const azureSpecialHeaderNames = new Set(["x-ms-client-request-id"]);

/**
 * Checks if a header parameter is a "special" header that should be
 * auto-populated at runtime rather than exposed as a method parameter.
 * Detection is by serialized header name (case-insensitive), matching
 * the legacy emitter's `TryGetSpecialHeaderParam` and
 * `ClientRequestIdHeaderVisitor` behaviour.
 *
 * For unbranded flavor, only OASIS repeatability headers are special.
 * For Azure flavor, `x-ms-client-request-id` is additionally stripped
 * because the Azure HttpPipeline policy handles it automatically.
 *
 * @param param - The SDK header parameter to check.
 * @param flavor - The emitter flavor ("azure" or "unbranded").
 */
export function isSpecialHeaderParam(
  param: SdkHeaderParameter,
  flavor?: string,
): boolean {
  const name = param.serializedName.toLowerCase();
  if (baseSpecialHeaderNames.has(name)) return true;
  if (flavor === "azure" && azureSpecialHeaderNames.has(name)) return true;
  return false;
}
