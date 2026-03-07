/**
 * Generates the {LibName}Extensions.cs static class for ARM management resources.
 *
 * The Extensions class provides static extension methods on ARM scope types
 * (ArmClient, ResourceGroupResource, SubscriptionResource, etc.) that delegate
 * to the corresponding Mockable{LibName}{Scope} provider classes.
 *
 * This pattern enables mock-friendly ARM SDK design: consumers can mock the
 * mockable provider class methods in unit tests, while the extension methods
 * provide a convenient static API for production code.
 *
 * Ground truth: {LibName}Extensions.cs in Mgmt-TypeSpec Generated Extensions/ directory.
 *
 * @module
 */

import { Children, code } from "@alloy-js/core";
import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import {
  ArmProviderSchema,
  ResourceScope,
  ResourceOperationKind,
} from "../../utils/resource-metadata.js";
import {
  AzureResourceManager,
  AzureResourceManagerResources,
  AzureResourceManagerManagementGroups,
} from "../../builtins/azure-arm.js";
import { AzureCore } from "../../builtins/azure.js";
import { armResourceRefkey } from "./ResourceFile.js";
import { armCollectionRefkey } from "./CollectionFile.js";
import {
  ScopeResources,
  categorizeResourcesByScope,
  getMockableClassName,
} from "./MockableProviderFile.js";
import { extractVariableSegments } from "./ResourceFile.js";
import { useEmitterContext } from "../../contexts/emitter-context.js";
import { getLicenseHeader } from "../../utils/header.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtensionsFileProps {
  /** The ARM provider schema with all detected resources. */
  schema: ArmProviderSchema;
  /** The library name (e.g., "Azure.Generator.MgmtTypeSpec.Tests"). */
  libraryName: string;
}

// ─── Name Helpers ────────────────────────────────────────────────────────────

/**
 * Generates the extensions class name from the library name.
 * E.g., "Azure.Generator.MgmtTypeSpec.Tests" → "AzureGeneratorMgmtTypeSpecTestsExtensions"
 */
function getExtensionsClassName(libraryName: string): string {
  const nameNoSeparators = libraryName.replace(/\./g, "");
  return `${nameNoSeparators}Extensions`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Generates the static Extensions class that provides ARM extension methods.
 *
 * The class contains:
 * 1. Private static getters for each mockable provider scope
 * 2. Public static extension methods on ArmClient (GetXxxResource by ID)
 * 3. Public static extension methods on ResourceGroupResource (collection/singular getters)
 * 4. Public static extension methods on SubscriptionResource (collection/singular getters)
 * 5. Public static extension methods on TenantResource (collection/singular getters)
 * 6. Public static extension methods on ManagementGroupResource (collection/singular getters)
 */
export function ExtensionsFile(props: ExtensionsFileProps) {
  const { schema, libraryName } = props;
  const ctx = useEmitterContext();
  const { options } = ctx;

  const header = getLicenseHeader(options);
  const className = getExtensionsClassName(libraryName);
  const scopes = categorizeResourcesByScope(schema);

  if (scopes.length === 0) {
    return null;
  }

  return (
    <SourceFile path={`Extensions/${className}.cs`}>
      {header}
      <Namespace name={libraryName}>
        {`/// <summary> A class to add extension methods to ${libraryName}. </summary>`}
        <ClassDeclaration public static partial name={className}>
          {buildPrivateGetters(scopes, libraryName)}
          {buildArmClientExtensions(scopes, libraryName)}
          {buildScopeExtensions(scopes, libraryName)}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

// ─── Private Getters ─────────────────────────────────────────────────────────

/**
 * Generates private static methods that create/retrieve cached mockable providers.
 *
 * Each scope gets a method like:
 *   private static MockableXxxResourceGroupResource GetMockableXxxResourceGroupResource(ResourceGroupResource rg) {
 *     return rg.GetCachedClient(client => new MockableXxxResourceGroupResource(client, rg.Id));
 *   }
 */
function buildPrivateGetters(
  scopes: ScopeResources[],
  libraryName: string,
): Children {
  const getters: Children[] = [];

  for (const scope of scopes) {
    const mockableClassName = getMockableClassName(
      libraryName,
      scope.scopeName,
    );
    const scopeTypeRef = getScopeTypeRef(scope.scopeName);
    const paramName = scope.scopeParamName;

    if (scope.scopeName === "ArmClient") {
      // ArmClient scope uses ResourceIdentifier.Root
      getters.push(code`
/// <param name="${paramName}"></param>
private static ${mockableClassName} Get${mockableClassName}(${scopeTypeRef} ${paramName})
{
    return ${paramName}.GetCachedClient(client0 => new ${mockableClassName}(client0, ${AzureCore.ResourceIdentifier}.Root));
}
`);
    } else {
      getters.push(code`
/// <param name="${paramName}"></param>
private static ${mockableClassName} Get${mockableClassName}(${scopeTypeRef} ${paramName})
{
    return ${paramName}.GetCachedClient(client => new ${mockableClassName}(client, ${paramName}.Id));
}
`);
    }
  }

  return getters;
}

// ─── ArmClient Extension Methods ─────────────────────────────────────────────

/**
 * Generates public static extension methods on ArmClient.
 * Each resource gets a GetXxxResource(this ArmClient, ResourceIdentifier id) method.
 */
function buildArmClientExtensions(
  scopes: ScopeResources[],
  libraryName: string,
): Children {
  const armClientScope = scopes.find((s) => s.scopeName === "ArmClient");
  if (!armClientScope) return null;

  const mockableClassName = getMockableClassName(libraryName, "ArmClient");
  const methods: Children[] = [];

  for (const resource of armClientScope.resources) {
    const resourceName = resource.metadata.resourceName;
    const resourceClassName = `${resourceName}Resource`;
    const resourceRef = armResourceRefkey(resource.resourceModelId);

    methods.push(code`
/// <summary>
/// Gets an object representing a <see cref="${resourceClassName}"/> along with the instance operations that can be performed on it but with no data.
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.Get${resourceClassName}(${AzureCore.ResourceIdentifier})"/> instead. </description>
/// </item>
/// </summary>
/// <param name="client"> The <see cref="ArmClient"/> the method will execute against. </param>
/// <param name="id"> The resource ID of the resource to get. </param>
/// <exception cref="ArgumentNullException"> <paramref name="client"/> is null. </exception>
/// <returns> Returns a <see cref="${resourceClassName}"/> object. </returns>
public static ${resourceRef} Get${resourceClassName}(this ${AzureResourceManager.ArmClient} client, ${AzureCore.ResourceIdentifier} id)
{
    ${AzureCore.Argument}.AssertNotNull(client, nameof(client));

    return Get${mockableClassName}(client).Get${resourceClassName}(id);
}
`);
  }

  return methods;
}

// ─── Scope Extension Methods (ResourceGroup, Subscription, Tenant, MgmtGroup) ─

/**
 * Generates public static extension methods for non-ArmClient scopes.
 *
 * For each resource in a scope:
 * - Collection getter: GetXxxs(this ScopeResource scope) → delegates to mockable.GetXxxs()
 * - Singular async getter: GetXxxAsync(this ScopeResource scope, ...) → delegates to mockable.GetXxxAsync()
 * - Singular sync getter: GetXxx(this ScopeResource scope, ...) → delegates to mockable.GetXxx()
 */
function buildScopeExtensions(
  scopes: ScopeResources[],
  libraryName: string,
): Children {
  const methods: Children[] = [];

  for (const scope of scopes) {
    if (scope.scopeName === "ArmClient") continue;

    const mockableClassName = getMockableClassName(
      libraryName,
      scope.scopeName,
    );
    const scopeTypeRef = getScopeTypeRef(scope.scopeName);
    const paramName = scope.scopeParamName;

    for (const resource of scope.resources) {
      const { metadata } = resource;
      const resourceName = metadata.resourceName;

      // For subscription scope, skip resources that are only here for list operations
      if (
        scope.scopeName === "Subscription" &&
        metadata.resourceScope !== ResourceScope.Subscription
      ) {
        continue;
      }

      const resourceClassName = `${resourceName}Resource`;
      const resourceRef = armResourceRefkey(resource.resourceModelId);
      const collectionRef = armCollectionRefkey(resource.resourceModelId);

      if (metadata.singletonResourceName) {
        // Singleton: GetXxx extension method
        methods.push(code`
/// <summary>
/// Get a ${resourceName}
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.Get${resourceName}()"/> instead. </description>
/// </item>
/// </summary>
/// <param name="${paramName}"> The <see cref="${getScopeResourceCref(scope.scopeName)}"/> the method will execute against. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${paramName}"/> is null. </exception>
/// <returns> Returns a <see cref="${resourceClassName}"/> object. </returns>
public static ${resourceRef} Get${resourceName}(this ${scopeTypeRef} ${paramName})
{
    ${AzureCore.Argument}.AssertNotNull(${paramName}, nameof(${paramName}));

    return Get${mockableClassName}(${paramName}).Get${resourceName}();
}
`);
      } else {
        // Normal resource: collection getter + singular getter (async + sync)
        const variableSegments = extractVariableSegments(
          metadata.resourceIdPattern,
        );
        const resourceNameParam = variableSegments[variableSegments.length - 1];
        const getMethod = metadata.methods.find(
          (m) => m.kind === ResourceOperationKind.Read,
        );

        // Collection getter extension
        methods.push(code`
/// <summary>
/// Gets a collection of ${pluralize(resourceName)} in the <see cref="${getScopeResourceCref(scope.scopeName)}"/>
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.Get${pluralize(resourceName)}()"/> instead. </description>
/// </item>
/// </summary>
/// <param name="${paramName}"> The <see cref="${getScopeResourceCref(scope.scopeName)}"/> the method will execute against. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${paramName}"/> is null. </exception>
/// <returns> An object representing collection of ${pluralize(resourceName)} and their operations over a ${resourceClassName}. </returns>
public static ${collectionRef} Get${pluralize(resourceName)}(this ${scopeTypeRef} ${paramName})
{
    ${AzureCore.Argument}.AssertNotNull(${paramName}, nameof(${paramName}));

    return Get${mockableClassName}(${paramName}).Get${pluralize(resourceName)}();
}
`);

        // Singular getter extensions (async + sync)
        if (getMethod) {
          // Async
          methods.push(code`
/// <summary>
/// Get a ${resourceName}
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.Get${resourceName}Async(string, CancellationToken)"/> instead. </description>
/// </item>
/// </summary>
/// <param name="${paramName}"> The <see cref="${getScopeResourceCref(scope.scopeName)}"/> the method will execute against. </param>
/// <param name="${resourceNameParam}"> The name of the ${resourceName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${paramName}"/> is null. </exception>
[${AzureResourceManager.ForwardsClientCalls}]
public static async Task<${code`Response<${resourceRef}>`}> Get${resourceName}Async(this ${scopeTypeRef} ${paramName}, string ${resourceNameParam}, CancellationToken cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(${paramName}, nameof(${paramName}));

    return await Get${mockableClassName}(${paramName}).Get${resourceName}Async(${resourceNameParam}, cancellationToken).ConfigureAwait(false);
}
`);

          // Sync
          methods.push(code`
/// <summary>
/// Get a ${resourceName}
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.Get${resourceName}(string, CancellationToken)"/> instead. </description>
/// </item>
/// </summary>
/// <param name="${paramName}"> The <see cref="${getScopeResourceCref(scope.scopeName)}"/> the method will execute against. </param>
/// <param name="${resourceNameParam}"> The name of the ${resourceName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${paramName}"/> is null. </exception>
[${AzureResourceManager.ForwardsClientCalls}]
public static ${code`Response<${resourceRef}>`} Get${resourceName}(this ${scopeTypeRef} ${paramName}, string ${resourceNameParam}, CancellationToken cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(${paramName}, nameof(${paramName}));

    return Get${mockableClassName}(${paramName}).Get${resourceName}(${resourceNameParam}, cancellationToken);
}
`);
        }
      }
    }
  }

  return methods;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Gets the Alloy type reference for a scope name.
 * Returns the appropriate ARM library symbol for automatic `using` generation.
 */
function getScopeTypeRef(scopeName: string): Children {
  switch (scopeName) {
    case "ArmClient":
      return AzureResourceManager.ArmClient;
    case "ResourceGroup":
      return AzureResourceManagerResources.ResourceGroupResource;
    case "Subscription":
      return AzureResourceManagerResources.SubscriptionResource;
    case "Tenant":
      return AzureResourceManagerResources.TenantResource;
    case "ManagementGroup":
      return AzureResourceManagerManagementGroups.ManagementGroupResource;
    default:
      return scopeName;
  }
}

/**
 * Gets the scope resource cref string for XML documentation.
 */
function getScopeResourceCref(scopeName: string): string {
  switch (scopeName) {
    case "ResourceGroup":
      return "ResourceGroupResource";
    case "Subscription":
      return "SubscriptionResource";
    case "Tenant":
      return "TenantResource";
    case "ManagementGroup":
      return "ManagementGroupResource";
    default:
      return scopeName;
  }
}

/**
 * Pluralizes a resource name for collection method names.
 */
function pluralize(name: string): string {
  if (name.endsWith("s")) return name;
  return `${name}s`;
}
