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
import type {
  SdkClientType,
  SdkHttpOperation,
  SdkMethodParameter,
} from "@azure-tools/typespec-client-generator-core";
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
import { Azure, AzureCore } from "../../builtins/azure.js";
import {
  SystemThreading,
  SystemThreadingTasks,
} from "../../builtins/system-threading.js";
import { armResourceRefkey } from "./ResourceFile.js";
import { armCollectionRefkey } from "./CollectionFile.js";
import { buildMethodLookup, getOperationMethodName } from "./ResourceFile.js";
import {
  ScopeResources,
  categorizeResourcesByScope,
  getMockableClassName,
} from "./MockableProviderFile.js";
import { extractVariableSegments } from "./ResourceFile.js";
import { useEmitterContext } from "../../contexts/emitter-context.js";
import { getLicenseHeader } from "../../utils/header.js";
import { efCsharpRefkey } from "../../utils/refkey.js";

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
  const { options, sdkPackage, packageName } = ctx;

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
          {buildNonResourceExtensions(
            scopes,
            libraryName,
            sdkPackage,
            packageName,
          )}
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
 *
 * For ALL resources:
 *   - GetXxxResource(this ArmClient, ResourceIdentifier id)
 *
 * For non-singleton extension resources:
 *   - GetXxxs(this ArmClient, ResourceIdentifier scope) — collection factory
 *   - GetXxx(this ArmClient, ResourceIdentifier scope, string name, CancellationToken) — sync
 *   - GetXxxAsync(this ArmClient, ResourceIdentifier scope, string name, CancellationToken) — async
 *
 * For singleton extension resources:
 *   - GetXxx(this ArmClient, ResourceIdentifier scope) — direct resource via scope
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
    const { metadata } = resource;
    const resourceName = metadata.resourceName;
    const resourceClassName = `${resourceName}Resource`;
    const resourceRef = armResourceRefkey(resource.resourceModelId);

    // GetXxxResource(this ArmClient, ResourceIdentifier id) — all resources
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

    // Extension-scoped resources get additional scope-based extension methods
    if (metadata.resourceScope === ResourceScope.Extension) {
      if (metadata.singletonResourceName) {
        // Singleton extension: GetXxx(this ArmClient, ResourceIdentifier scope)
        methods.push(code`
/// <summary>
/// Gets an object representing a <see cref="${resourceClassName}"/> along with the instance operations that can be performed on it in the ArmClient
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.Get${resourceName}(${AzureCore.ResourceIdentifier})"/> instead. </description>
/// </item>
/// </summary>
/// <param name="client"> The <see cref="ArmClient"/> the method will execute against. </param>
/// <param name="scope"> The scope that the resource will apply against. </param>
/// <exception cref="ArgumentNullException"> <paramref name="client"/> is null. </exception>
/// <returns> Returns a <see cref="${resourceClassName}"/> object. </returns>
public static ${resourceRef} Get${resourceName}(this ${AzureResourceManager.ArmClient} client, ${AzureCore.ResourceIdentifier} scope)
{
    ${AzureCore.Argument}.AssertNotNull(client, nameof(client));

    return Get${mockableClassName}(client).Get${resourceName}(scope);
}
`);
      } else {
        // Non-singleton extension: collection factory + singular getters
        const collectionRef = armCollectionRefkey(resource.resourceModelId);
        const variableSegments = extractVariableSegments(
          metadata.resourceIdPattern,
        );
        const resourceNameParam =
          variableSegments[variableSegments.length - 1];

        const getMethod = metadata.methods.find(
          (m) => m.kind === ResourceOperationKind.Read,
        );

        // Collection factory extension
        methods.push(code`
/// <summary>
/// Gets a collection of <see cref="${collectionRef}"/> objects within the specified scope.
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.Get${pluralize(resourceName)}(${AzureCore.ResourceIdentifier})"/> instead. </description>
/// </item>
/// </summary>
/// <param name="client"> The <see cref="ArmClient"/> the method will execute against. </param>
/// <param name="scope"> The scope of the resource collection to get. </param>
/// <exception cref="ArgumentNullException"> <paramref name="client"/> is null. </exception>
/// <returns> Returns a collection of <see cref="${resourceClassName}"/> objects. </returns>
public static ${collectionRef} Get${pluralize(resourceName)}(this ${AzureResourceManager.ArmClient} client, ${AzureCore.ResourceIdentifier} scope)
{
    ${AzureCore.Argument}.AssertNotNull(client, nameof(client));

    return Get${mockableClassName}(client).Get${pluralize(resourceName)}(scope);
}
`);

        // Singular getter extensions with scope parameter
        if (getMethod) {
          // Sync
          methods.push(code`
/// <summary>
/// Get a ${resourceName}
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.Get${resourceName}(${AzureCore.ResourceIdentifier}, string, CancellationToken)"/> instead. </description>
/// </item>
/// </summary>
/// <param name="client"> The <see cref="ArmClient"/> the method will execute against. </param>
/// <param name="scope"> The scope of the resource collection to get. </param>
/// <param name="${resourceNameParam}"> The name of the ${resourceClassName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="client"/> is null. </exception>
[${AzureResourceManager.ForwardsClientCalls}]
public static ${code`Response<${resourceRef}>`} Get${resourceName}(this ${AzureResourceManager.ArmClient} client, ${AzureCore.ResourceIdentifier} scope, string ${resourceNameParam}, CancellationToken cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(client, nameof(client));

    return Get${mockableClassName}(client).Get${resourceName}(scope, ${resourceNameParam}, cancellationToken);
}
`);

          // Async
          methods.push(code`
/// <summary>
/// Get a ${resourceName}
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.Get${resourceName}Async(${AzureCore.ResourceIdentifier}, string, CancellationToken)"/> instead. </description>
/// </item>
/// </summary>
/// <param name="client"> The <see cref="ArmClient"/> the method will execute against. </param>
/// <param name="scope"> The scope of the resource collection to get. </param>
/// <param name="${resourceNameParam}"> The name of the ${resourceClassName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="client"/> is null. </exception>
[${AzureResourceManager.ForwardsClientCalls}]
public static async Task<${code`Response<${resourceRef}>`}> Get${resourceName}Async(this ${AzureResourceManager.ArmClient} client, ${AzureCore.ResourceIdentifier} scope, string ${resourceNameParam}, CancellationToken cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(client, nameof(client));

    return await Get${mockableClassName}(client).Get${resourceName}Async(scope, ${resourceNameParam}, cancellationToken).ConfigureAwait(false);
}
`);
        }
      }
    }
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

// ─── Non-resource Extension Methods ──────────────────────────────────────────

/**
 * Generates public static extension methods for non-resource operations.
 *
 * Each non-resource method gets an async and sync extension method wrapper
 * that delegates to the corresponding mockable provider method. This follows
 * the ARM SDK design pattern where static extension methods provide the
 * consumer-facing API while mockable provider classes enable unit testing.
 */
function buildNonResourceExtensions(
  scopes: ScopeResources[],
  libraryName: string,
  sdkPackage: {
    clients: readonly SdkClientType<SdkHttpOperation>[];
  },
  _packageName: string,
): Children {
  const methods: Children[] = [];
  const methodLookup = buildMethodLookup(sdkPackage);

  for (const scope of scopes) {
    if (!scope.nonResourceMethods || scope.nonResourceMethods.length === 0) {
      continue;
    }

    const mockableClassName = getMockableClassName(
      libraryName,
      scope.scopeName,
    );
    const scopeTypeRef = getScopeTypeRef(scope.scopeName);
    const paramName = scope.scopeParamName;

    for (const nrm of scope.nonResourceMethods) {
      const tcgcMethod = methodLookup.get(nrm.methodId);
      if (!tcgcMethod) continue;

      const methodName = getOperationMethodName(tcgcMethod.name);

      // Filter user-facing parameters, excluding header params
      const headerMethodParamNames = new Set<string>();
      if (tcgcMethod.operation?.parameters) {
        for (const httpParam of tcgcMethod.operation.parameters) {
          if (
            httpParam.kind === "header" &&
            httpParam.correspondingMethodParams
          ) {
            for (const cp of httpParam.correspondingMethodParams) {
              if (cp.kind === "method") {
                headerMethodParamNames.add(cp.name);
              }
            }
          }
        }
      }

      const userParams = tcgcMethod.parameters.filter(
        (p: SdkMethodParameter) =>
          !p.onClient &&
          !p.isApiVersionParam &&
          !headerMethodParamNames.has(p.name),
      );

      // Identify body params via the HTTP operation
      const bodyMethodParamNames = new Set<string>();
      const httpBodyParam = tcgcMethod.operation?.bodyParam;
      if (httpBodyParam?.correspondingMethodParams) {
        for (const cp of httpBodyParam.correspondingMethodParams) {
          if (cp.kind === "method") {
            bodyMethodParamNames.add(cp.name);
          }
        }
      }

      const bodyParam = userParams.find((p: SdkMethodParameter) =>
        bodyMethodParamNames.has(p.name),
      );
      const nonBodyParams = userParams.filter(
        (p: SdkMethodParameter) => !bodyMethodParamNames.has(p.name),
      );

      // Determine response model refkey
      let responseModelRef: Children | undefined;
      const responseType = tcgcMethod.response?.type;
      if (responseType && "__raw" in responseType && responseType.__raw) {
        responseModelRef = efCsharpRefkey(
          responseType.__raw as import("@typespec/compiler").Type,
        );
      }

      // Build parameter declarations for extension method
      const extParamDecls = buildExtNonResourceParamDecls(
        scope.scopeName,
        scopeTypeRef,
        paramName,
        nonBodyParams,
        bodyParam,
      );

      // Build forwarding args (just param names, not types)
      const fwdArgs = buildExtNonResourceForwardArgs(
        scope.scopeName,
        nonBodyParams,
        bodyParam,
      );

      const hasResponseModel = responseModelRef !== undefined;

      // Async extension method
      if (hasResponseModel) {
        methods.push(code`
/// <summary>
/// ${methodName}
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.${methodName}Async"/> instead. </description>
/// </item>
/// </summary>
/// <param name="${paramName}"> The <see cref="${scope.scopeName === "ArmClient" ? "ArmClient" : getScopeResourceCref(scope.scopeName)}"/> the method will execute against. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${paramName}"/> is null. </exception>
public static async ${SystemThreadingTasks.Task}<${code`${Azure.Response}<${responseModelRef}>`}> ${methodName}Async(this ${scopeTypeRef} ${paramName}, ${extParamDecls}${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(${paramName}, nameof(${paramName}));

    return await Get${mockableClassName}(${paramName}).${methodName}Async(${fwdArgs}cancellationToken).ConfigureAwait(false);
}
`);

        // Sync extension method
        methods.push(code`
/// <summary>
/// ${methodName}
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.${methodName}"/> instead. </description>
/// </item>
/// </summary>
/// <param name="${paramName}"> The <see cref="${scope.scopeName === "ArmClient" ? "ArmClient" : getScopeResourceCref(scope.scopeName)}"/> the method will execute against. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${paramName}"/> is null. </exception>
public static ${code`${Azure.Response}<${responseModelRef}>`} ${methodName}(this ${scopeTypeRef} ${paramName}, ${extParamDecls}${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(${paramName}, nameof(${paramName}));

    return Get${mockableClassName}(${paramName}).${methodName}(${fwdArgs}cancellationToken);
}
`);
      } else {
        // Void/untyped response
        methods.push(code`
/// <summary>
/// ${methodName}
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.${methodName}Async"/> instead. </description>
/// </item>
/// </summary>
/// <param name="${paramName}"> The <see cref="${scope.scopeName === "ArmClient" ? "ArmClient" : getScopeResourceCref(scope.scopeName)}"/> the method will execute against. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${paramName}"/> is null. </exception>
public static async ${SystemThreadingTasks.Task}<${Azure.Response}> ${methodName}Async(this ${scopeTypeRef} ${paramName}, ${extParamDecls}${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(${paramName}, nameof(${paramName}));

    return await Get${mockableClassName}(${paramName}).${methodName}Async(${fwdArgs}cancellationToken).ConfigureAwait(false);
}
`);

        methods.push(code`
/// <summary>
/// ${methodName}
/// <item>
/// <term> Mocking. </term>
/// <description> To mock this method, please mock <see cref="${mockableClassName}.${methodName}"/> instead. </description>
/// </item>
/// </summary>
/// <param name="${paramName}"> The <see cref="${scope.scopeName === "ArmClient" ? "ArmClient" : getScopeResourceCref(scope.scopeName)}"/> the method will execute against. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${paramName}"/> is null. </exception>
public static ${Azure.Response} ${methodName}(this ${scopeTypeRef} ${paramName}, ${extParamDecls}${SystemThreading.CancellationToken} cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNull(${paramName}, nameof(${paramName}));

    return Get${mockableClassName}(${paramName}).${methodName}(${fwdArgs}cancellationToken);
}
`);
      }
    }
  }

  return methods;
}

/**
 * Builds parameter declarations for a non-resource extension method.
 *
 * Extension methods have the same parameters as the mockable provider method,
 * but the scope parameter is replaced with `this ScopeType paramName`.
 * For ArmClient scope, includes a ResourceIdentifier scope parameter.
 */
function buildExtNonResourceParamDecls(
  scopeName: string,
  _scopeTypeRef: Children,
  _paramName: string,
  nonBodyParams: SdkMethodParameter[],
  bodyParam?: SdkMethodParameter,
): Children {
  const parts: Children[] = [];

  // Extension/ArmClient scope: add ResourceIdentifier scope parameter
  if (scopeName === "ArmClient") {
    parts.push(code`${AzureCore.ResourceIdentifier} scope`);
  }

  // Non-body parameters
  for (const param of nonBodyParams) {
    if (!param.name || !param.type) continue;
    const typeRef = mapExtParamTypeToRef(param);
    const defaultVal = param.optional ? " = default" : "";
    parts.push(code`${typeRef} ${param.name}${defaultVal}`);
  }

  // Body parameter
  if (bodyParam) {
    if (bodyParam.name && bodyParam.type) {
      const typeRef = mapExtParamTypeToRef(bodyParam);
      const defaultVal = bodyParam.optional ? " = default" : "";
      parts.push(code`${typeRef} ${bodyParam.name}${defaultVal}`);
    }
  }

  if (parts.length === 0) return null;

  const result: Children[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) result.push(", ");
    result.push(parts[i]);
  }
  result.push(", ");
  return result;
}

/**
 * Builds the forwarding argument list for a non-resource extension method.
 * Just the parameter names (no types) in order, with trailing comma-space.
 */
function buildExtNonResourceForwardArgs(
  scopeName: string,
  nonBodyParams: SdkMethodParameter[],
  bodyParam?: SdkMethodParameter,
): string {
  const args: string[] = [];

  if (scopeName === "ArmClient") {
    args.push("scope");
  }

  for (const param of nonBodyParams) {
    args.push(param.name);
  }

  if (bodyParam) {
    args.push(bodyParam.name);
  }

  return args.length > 0 ? args.join(", ") + ", " : "";
}

/**
 * Maps an SdkMethodParameter type to C# for extension method declarations.
 * Uses the same mapping as the mockable provider.
 */
function mapExtParamTypeToRef(param: SdkMethodParameter): Children {
  const type = param.type;
  if (!type) return "object";
  if (type.kind === "nullable") {
    const innerRef = mapExtSdkTypeToRef(type.type);
    return code`${innerRef}?`;
  }
  return mapExtSdkTypeToRef(type);
}

/**
 * Maps an SdkType to a C# type reference for use in extension methods.
 */
function mapExtSdkTypeToRef(
  type: import("@azure-tools/typespec-client-generator-core").SdkType,
): Children {
  switch (type.kind) {
    case "string":
      return "string";
    case "int32":
      return "int";
    case "int64":
      return "long";
    case "float32":
      return "float";
    case "float64":
      return "double";
    case "boolean":
      return "bool";
    case "model": {
      const rawType = (type as { __raw?: import("@typespec/compiler").Type })
        .__raw;
      if (rawType) return efCsharpRefkey(rawType);
      return "object";
    }
    case "enum": {
      const rawType = (type as { __raw?: import("@typespec/compiler").Type })
        .__raw;
      if (rawType) return efCsharpRefkey(rawType);
      return "string";
    }
    default:
      return "object";
  }
}

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
