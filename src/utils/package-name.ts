import type { SdkContext } from "@azure-tools/typespec-client-generator-core";

/**
 * Resolves the package name for the generated C# library.
 *
 * Resolution priority:
 * 1. Explicit `package-name` emitter option
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
    return packageNameOption;
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
