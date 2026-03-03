import type { SdkContext } from "@azure-tools/typespec-client-generator-core";

/**
 * C# reserved words and common type names that conflict when used as namespace segments.
 * Namespace segments matching these cause ambiguous references in generated code.
 *
 * Sourced from the legacy emitter's InputNamespace.InvalidNamespaceSegments list.
 */
const INVALID_NAMESPACE_SEGMENTS: ReadonlySet<string> = new Set(["Type", "Array", "Enum"]);

/**
 * Converts a raw package name string into a valid C# namespace identifier.
 *
 * The conversion follows the legacy emitter's `getClientNamespaceStringHelper` logic:
 * 1. Replace hyphens with dots (kebab-case segments become separate namespace parts)
 * 2. Capitalize the first character of each dot-separated segment
 *
 * @example
 * toNamespace("client-plane-generated") // "Client.Plane.Generated"
 * toNamespace("client.plane.generated") // "Client.Plane.Generated"
 * toNamespace("Azure.AI.ContentSafety") // "Azure.AI.ContentSafety" (already valid)
 */
export function toNamespace(name: string): string {
  // Replace hyphens with dots, then capitalize the first letter of each segment
  const dotted = name.replace(/-/g, ".");
  return dotted
    .split(".")
    .map((segment) => (segment.length > 0 ? segment.charAt(0).toUpperCase() + segment.slice(1) : segment))
    .join(".");
}

/**
 * Returns namespace segments that conflict with C# reserved words or common type names.
 *
 * These segments (e.g., "Type", "Array", "Enum") cause ambiguous references in generated
 * code when used as namespace parts. Consumers can use this to emit diagnostics or
 * adjust the generated namespace.
 *
 * @param namespace - A dot-separated C# namespace string (e.g., "My.Type.Service")
 * @returns An array of segments that conflict with reserved words. Empty if no conflicts.
 */
export function getInvalidNamespaceSegments(namespace: string): string[] {
  return namespace.split(".").filter((segment) => INVALID_NAMESPACE_SEGMENTS.has(segment));
}

/**
 * Resolves the package name for the generated C# library.
 *
 * When the `package-name` emitter option is provided, it is converted to a valid C# namespace
 * using {@link toNamespace} (e.g., `"my-service"` becomes `"My.Service"`).
 *
 * Resolution priority:
 * 1. Explicit `package-name` emitter option (converted to valid C# namespace)
 * 2. First client namespace from TCGC SdkPackage
 * 3. First namespace from TCGC SdkPackage
 * 4. Cross-language package ID from TCGC
 * 5. Fallback to `"UnknownPackage"`
 */
export function resolvePackageName(
  sdkContext: SdkContext,
  packageNameOption?: string,
): string {
  if (packageNameOption) {
    return toNamespace(packageNameOption);
  }

  const clients = sdkContext.sdkPackage.clients;
  if (clients.length > 0 && clients[0].namespace) {
    return clients[0].namespace;
  }

  const namespaces = sdkContext.sdkPackage.namespaces;
  if (namespaces.length > 0 && namespaces[0].fullName) {
    return namespaces[0].fullName;
  }

  const packageId = sdkContext.sdkPackage.crossLanguagePackageId;
  if (packageId) {
    return packageId;
  }

  return "UnknownPackage";
}
