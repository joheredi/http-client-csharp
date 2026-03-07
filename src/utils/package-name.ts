import {
  type SdkClientType,
  type SdkContext,
  type SdkEnumType,
  type SdkHttpOperation,
  type SdkModelType,
  UsageFlags,
} from "@azure-tools/typespec-client-generator-core";

/**
 * C# reserved words and common type names that conflict when used as namespace segments.
 * Namespace segments matching these cause ambiguous references in generated code.
 *
 * "Type", "Array", and "Enum" are sourced from the legacy emitter's
 * InputNamespace.InvalidNamespaceSegments list.
 *
 * "File" is added because `System.IO.File` and model types named `File`
 * (e.g., TypeSpec.Http.File) cause CS0118 errors when a namespace segment
 * named `File` shadows the type in child namespaces (see type/file spec).
 */
const INVALID_NAMESPACE_SEGMENTS: ReadonlySet<string> = new Set([
  "Type",
  "Array",
  "Enum",
  "File",
]);

/**
 * Well-known .NET BCL type names that cause CS0104 ambiguous reference errors
 * when a generated type shares the same short name.
 *
 * When a generated client, model, or enum has one of these names, unqualified
 * references to it become ambiguous with the system type brought in by
 * `using System;` or other implicit imports. Components that generate type
 * references should use the fully-qualified namespace path for these types
 * instead of relying on Alloy's short-name + `using` resolution.
 *
 * This set covers the types most likely to collide in practice:
 * - `Object` → `System.Object` (alias `object`)
 * - `Enum` → `System.Enum`
 * - `Type` → `System.Type`
 * - `Array` → `System.Array`
 * - `File` → `System.IO.File`
 * - `Action` → `System.Action`
 * - `Attribute` → `System.Attribute`
 * - `Exception` → `System.Exception`
 */
const SYSTEM_TYPE_NAMES: ReadonlySet<string> = new Set([
  "Object",
  "Enum",
  "Type",
  "Array",
  "File",
  "Action",
  "Attribute",
  "Exception",
  "ContinuationToken",
]);

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
    .map((segment) =>
      segment.length > 0
        ? segment.charAt(0).toUpperCase() + segment.slice(1)
        : segment,
    )
    .join(".");
}

/**
 * Checks whether a type name collides with a well-known .NET system type.
 *
 * When a generated type (client, model, or enum) has a name matching one of
 * these system types, unqualified references to it become ambiguous with
 * the system type (CS0104). Components should use fully-qualified references
 * for these types instead of relying on short-name + `using` resolution.
 *
 * @param name - The type name to check (e.g., "Object", "Enum").
 * @returns `true` if the name collides with a known system type.
 */
export function isSystemTypeNameCollision(name: string): boolean {
  return SYSTEM_TYPE_NAMES.has(name);
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
  return namespace
    .split(".")
    .filter((segment) => INVALID_NAMESPACE_SEGMENTS.has(segment));
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

  return resolveRootNamespace(sdkContext);
}

/**
 * Resolves the root C# namespace for generated code.
 *
 * Unlike {@link resolvePackageName}, this ignores the explicit `package-name` emitter option
 * and always derives the namespace from the TCGC SdkPackage. This is important for versioned
 * projects where `package-name` includes a version suffix (e.g., `Versioning.Foo.V2`) but
 * the TCGC client namespace does not (e.g., `Versioning.Foo`).
 *
 * Infrastructure helper files (Argument.cs, Optional.cs, etc.) must use this namespace so
 * they are accessible from client code without extra `using` directives.
 *
 * Resolution priority:
 * 1. First client namespace from TCGC SdkPackage
 * 2. First namespace from TCGC SdkPackage
 * 3. Cross-language package ID from TCGC
 * 4. Fallback to `"UnknownPackage"`
 */
export function resolveRootNamespace(sdkContext: SdkContext): string {
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

/**
 * Ensures all models have non-empty namespace strings.
 *
 * TCGC sometimes returns an empty `namespace` for anonymous request models
 * synthesized from spread operations with mixed HTTP decorators (e.g., when
 * an operation combines `@path`, `@header`, and bare properties). The
 * `crossLanguageDefinitionId` for these models follows the pattern
 * `{namespace}.{operationName}.{typeSuffix}.anonymous`, from which the
 * namespace can be reliably extracted.
 *
 * When extraction fails, falls back to the root namespace so generated files
 * always land in a valid C# namespace.
 *
 * @param models - All SDK model types from the TCGC package (mutated in place).
 * @param rootNamespace - The root C# namespace used as a fallback.
 */
export function ensureModelNamespaces(
  models: SdkModelType[],
  rootNamespace: string,
): void {
  for (const model of models) {
    if (!model.namespace) {
      model.namespace = deriveNamespaceFromCrossLanguageId(
        model.crossLanguageDefinitionId,
        rootNamespace,
      );
    }
  }
}

/**
 * Derives a C# namespace from a TCGC cross-language definition ID.
 *
 * Anonymous request/response models have IDs like
 * `Parameters.Spread.Model.spreadCompositeRequestMix.Request.anonymous`.
 * The namespace is everything before the operation-name segment — i.e.,
 * the ID minus the last three dot-separated parts.
 *
 * @param crossLanguageDefinitionId - The model's TCGC cross-language ID.
 * @param rootNamespace - Fallback when the ID cannot be parsed.
 * @returns A valid C# namespace string.
 */
function deriveNamespaceFromCrossLanguageId(
  crossLanguageDefinitionId: string,
  rootNamespace: string,
): string {
  const parts = crossLanguageDefinitionId.split(".");

  // Pattern: {namespace segments}.{operationName}.{Request|Response}.anonymous
  if (parts.length >= 4 && parts[parts.length - 1] === "anonymous") {
    return parts.slice(0, -3).join(".");
  }

  return rootNamespace;
}

/**
 * Collects namespace segments that must be prefixed with `_` to avoid C# naming conflicts.
 *
 * In C#, a type cannot share its name with a containing namespace segment (CS0118).
 * When a sub-client's name matches the last segment of its namespace (e.g., client
 * "Model" in namespace "Parameters.Spread.Model"), the segment is invalid and must
 * be prefixed.
 *
 * This combines:
 * 1. Static reserved words ("Type", "Array", "Enum") that always conflict
 * 2. Dynamic client names where `lastSegment(client.namespace) === client.name`
 *
 * Mirrors the legacy emitter's `TypeSpecSerialization.AddInvalidNamespaceSegment`
 * + `InputNamespace._knownInvalidNamespaceSegments` logic.
 *
 * @param allClients - All clients (root + sub-clients) from the SDK package.
 * @returns A set of segment strings that must be prefixed with `_` in namespaces.
 */
export function collectInvalidNamespaceSegments(
  allClients: SdkClientType<SdkHttpOperation>[],
): Set<string> {
  const invalid = new Set(INVALID_NAMESPACE_SEGMENTS);
  for (const client of allClients) {
    if (!client.namespace) continue;
    const lastSegment = client.namespace.split(".").pop();
    if (lastSegment && lastSegment === client.name) {
      invalid.add(lastSegment);
    }
  }
  return invalid;
}

/**
 * Transforms a namespace string by prefixing invalid segments with `_`.
 *
 * Each dot-separated segment of the namespace is checked against the set of
 * invalid segments. Matching segments are prefixed with `_` to avoid CS0118
 * errors where a type name matches its containing namespace.
 *
 * @example
 * cleanNamespace("Parameters.Spread.Model", new Set(["Model"]));
 * // Returns "Parameters.Spread._Model"
 *
 * @param ns - A dot-separated C# namespace string.
 * @param invalidSegments - Set of segment strings that need `_` prefix.
 * @returns The cleaned namespace with conflicting segments prefixed.
 */
export function cleanNamespace(
  ns: string,
  invalidSegments: Set<string>,
): string {
  if (!ns) return ns;
  return ns
    .split(".")
    .map((seg) => (invalidSegments.has(seg) ? `_${seg}` : seg))
    .join(".");
}

/**
 * Applies namespace cleaning to all clients, models, and enums in the SDK package.
 *
 * This mutates the `.namespace` property of each object in place, prefixing
 * segments that conflict with client class names or C# reserved words.
 * This must be called after {@link ensureModelNamespaces} so that all models
 * have valid namespace strings before cleaning.
 *
 * Mirrors the legacy emitter's `GetCleanNameSpace` transformation applied
 * during code generation.
 *
 * @param allClients - All clients (root + sub-clients) from the SDK package.
 * @param models - All model types from the SDK package (mutated in place).
 * @param enums - All enum types from the SDK package (mutated in place).
 */
export function cleanAllNamespaces(
  allClients: SdkClientType<SdkHttpOperation>[],
  models: SdkModelType[],
  enums: SdkEnumType[],
): void {
  const invalidSegments = collectInvalidNamespaceSegments(allClients);

  // Only apply if there are dynamic conflicts beyond the static reserved words.
  // Static reserved words (Type, Array, Enum) are always in the set, but if
  // no client names conflict, we still need to clean those from all namespaces.
  for (const client of allClients) {
    if (client.namespace) {
      client.namespace = cleanNamespace(client.namespace, invalidSegments);
    }
  }

  for (const model of models) {
    if (model.namespace) {
      model.namespace = cleanNamespace(model.namespace, invalidSegments);
    }
  }

  for (const enumType of enums) {
    if (enumType.namespace) {
      enumType.namespace = cleanNamespace(enumType.namespace, invalidSegments);
    }
  }
}

/**
 * The namespace segment appended to model/enum namespaces when `model-namespace` is enabled.
 */
const MODELS_NAMESPACE_SEGMENT = "Models";

/**
 * Appends a `.Models` sub-namespace to all model and enum namespaces.
 *
 * When the `model-namespace` emitter option is enabled (default for Azure flavor),
 * model types, enums, and their serialization companions are placed in a
 * `{RootNamespace}.Models` sub-namespace while client types remain in the
 * root namespace. This mirrors the legacy Azure emitter's `NamespaceVisitor`.
 *
 * API version enums (identified by `UsageFlags.ApiVersionEnum`) are excluded
 * and remain in their original namespace, matching the legacy emitter behavior
 * where API version enums stay in the root namespace for client options access.
 *
 * The operation is idempotent — namespaces that already end with `.Models`
 * are not modified.
 *
 * Must be called after {@link cleanAllNamespaces} so that the base namespaces
 * are already cleaned before appending.
 *
 * @param models - All model types from the SDK package (mutated in place).
 * @param enums - All enum types from the SDK package (mutated in place).
 */
export function applyModelSubNamespace(
  models: SdkModelType[],
  enums: SdkEnumType[],
): void {
  for (const model of models) {
    if (model.namespace) {
      model.namespace = appendModelsSegment(model.namespace);
    }
  }

  for (const enumType of enums) {
    // API version enums stay in the root namespace — they are referenced
    // from client options and should not be in the .Models sub-namespace.
    const isApiVersionEnum = (enumType.usage & UsageFlags.ApiVersionEnum) !== 0;
    if (enumType.namespace && !isApiVersionEnum) {
      enumType.namespace = appendModelsSegment(enumType.namespace);
    }
  }
}

/**
 * Appends `.Models` to a namespace string if the last segment is not already `Models`.
 *
 * @param ns - A dot-separated C# namespace string.
 * @returns The namespace with `.Models` appended, or unchanged if already present.
 */
function appendModelsSegment(ns: string): string {
  const segments = ns.split(".");
  if (segments[segments.length - 1] === MODELS_NAMESPACE_SEGMENT) {
    return ns;
  }
  return `${ns}.${MODELS_NAMESPACE_SEGMENT}`;
}
