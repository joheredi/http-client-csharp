/**
 * Generates Mockable{LibName}{Scope}.cs files for ARM management resources.
 *
 * Each mockable provider class wraps ARM resource operations for a specific scope
 * (ArmClient, ResourceGroup, Subscription, Tenant, ManagementGroup). These classes:
 *
 * - Extend ArmResource
 * - Provide a protected parameterless constructor (for mocking)
 * - Provide an internal constructor (ArmClient, ResourceIdentifier)
 * - Expose resource collection getters (GetXxxs)
 * - Expose singular resource getters (GetXxx/GetXxxAsync) via collection delegation
 * - Expose singleton resource getters (GetXxxSettings) via Id.AppendProviderResource
 *
 * The Extension class delegates to these mockable providers so that consumers
 * can mock individual operations in unit tests.
 *
 * Ground truth: Extensions/ directory in Mgmt-TypeSpec Generated output.
 *
 * @module
 */

import { Children, code, refkey } from "@alloy-js/core";
import { ClassDeclaration, Namespace, SourceFile } from "@alloy-js/csharp";
import type {
  SdkHttpOperation,
  SdkMethodParameter,
  SdkServiceMethod,
} from "@azure-tools/typespec-client-generator-core";
import {
  ArmResourceSchema,
  ArmProviderSchema,
  NonResourceMethod,
  ResourceScope,
  ResourceOperationKind,
} from "../../utils/resource-metadata.js";
import { Azure, AzureCore, AzureCorePipeline } from "../../builtins/azure.js";
import { AzureResourceManager } from "../../builtins/azure-arm.js";
import { System } from "../../builtins/system.js";
import {
  SystemThreading,
  SystemThreadingTasks,
} from "../../builtins/system-threading.js";
import { armResourceRefkey } from "./ResourceFile.js";
import { armCollectionRefkey } from "./CollectionFile.js";
import {
  buildMethodLookup,
  getDefaultApiVersion,
  getOperationMethodName,
} from "./ResourceFile.js";
import { extractVariableSegments } from "./ResourceFile.js";
import { useEmitterContext } from "../../contexts/emitter-context.js";
import { getLicenseHeader } from "../../utils/header.js";
import { efCsharpRefkey } from "../../utils/refkey.js";
import { getAllClients, getSimpleClientName } from "../../utils/clients.js";

// ─── Well-known refkey prefix for mockable provider classes ──────────────────

/**
 * Symbol prefix for mockable provider class refkeys.
 * Used to create deterministic refkeys that ExtensionsFile can reference.
 */
const MOCKABLE_PROVIDER_PREFIX = Symbol.for("arm-mockable-provider");

/**
 * Creates a refkey for a mockable provider class keyed by scope name.
 * This enables the ExtensionsFile to reference mockable classes
 * without holding component instances.
 */
export function mockableProviderRefkey(scopeName: string) {
  return refkey(MOCKABLE_PROVIDER_PREFIX, scopeName);
}

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Describes which ARM scopes are needed and what resources belong to each.
 */
export interface ScopeResources {
  /** Scope name matching ResourceScope enum value or "ArmClient". */
  scopeName: string;
  /** Display name for the scope parameter (e.g., "resourceGroupResource"). */
  scopeParamName: string;
  /** Resources that have collections in this scope. */
  resources: ArmResourceSchema[];
  /** Non-resource methods assigned to this scope. */
  nonResourceMethods: NonResourceMethod[];
}

export interface MockableProviderFileProps {
  /** The scope for this mockable provider (e.g., "ArmClient", "ResourceGroup"). */
  scope: ScopeResources;
  /** The library name (e.g., "Azure.Generator.MgmtTypeSpec.Tests"). */
  libraryName: string;
}

// ─── Scope Categorization ────────────────────────────────────────────────────

/**
 * Categorizes ARM resources into their respective mockable scopes.
 *
 * - ArmClient: ALL resources get a GetXxxResource(id) method
 * - ResourceGroup: Resources with ResourceGroup scope get collection + singular getters
 * - Subscription: Resources with subscription-level List operations
 * - Tenant: Resources with Tenant scope
 * - ManagementGroup: Resources with ManagementGroup scope
 *
 * Non-resource methods are also grouped by their operationScope into the
 * appropriate scope entry. A scope with only non-resource methods (no resources)
 * still gets an entry so a MockableProvider file is generated for it.
 *
 * Returns only scopes that have at least one resource or non-resource method.
 */
export function categorizeResourcesByScope(
  schema: ArmProviderSchema,
): ScopeResources[] {
  const scopes: ScopeResources[] = [];
  const nonResourceMethods = schema.nonResourceMethods ?? [];

  // Group non-resource methods by scope
  const extensionMethods = nonResourceMethods.filter(
    (m) => m.operationScope === ResourceScope.Extension,
  );
  const rgMethods = nonResourceMethods.filter(
    (m) => m.operationScope === ResourceScope.ResourceGroup,
  );
  const subMethods = nonResourceMethods.filter(
    (m) => m.operationScope === ResourceScope.Subscription,
  );
  const tenantMethods = nonResourceMethods.filter(
    (m) => m.operationScope === ResourceScope.Tenant,
  );
  const mgMethods = nonResourceMethods.filter(
    (m) => m.operationScope === ResourceScope.ManagementGroup,
  );

  // ArmClient scope: ALL resources + extension-scoped non-resource methods
  if (schema.resources.length > 0 || extensionMethods.length > 0) {
    scopes.push({
      scopeName: "ArmClient",
      scopeParamName: "client",
      resources: schema.resources,
      nonResourceMethods: extensionMethods,
    });
  }

  // ResourceGroup scope
  const rgResources = schema.resources.filter(
    (r) => r.metadata.resourceScope === ResourceScope.ResourceGroup,
  );
  if (rgResources.length > 0 || rgMethods.length > 0) {
    scopes.push({
      scopeName: "ResourceGroup",
      scopeParamName: "resourceGroupResource",
      resources: rgResources,
      nonResourceMethods: rgMethods,
    });
  }

  // Subscription scope: resources that have at least one subscription-scoped List operation
  const subResources = schema.resources.filter(
    (r) =>
      r.metadata.resourceScope === ResourceScope.Subscription ||
      r.metadata.methods.some(
        (m) =>
          m.kind === ResourceOperationKind.List &&
          m.operationScope === ResourceScope.Subscription,
      ),
  );
  if (subResources.length > 0 || subMethods.length > 0) {
    scopes.push({
      scopeName: "Subscription",
      scopeParamName: "subscriptionResource",
      resources: subResources,
      nonResourceMethods: subMethods,
    });
  }

  // Tenant scope
  const tenantResources = schema.resources.filter(
    (r) => r.metadata.resourceScope === ResourceScope.Tenant,
  );
  if (tenantResources.length > 0 || tenantMethods.length > 0) {
    scopes.push({
      scopeName: "Tenant",
      scopeParamName: "tenantResource",
      resources: tenantResources,
      nonResourceMethods: tenantMethods,
    });
  }

  // ManagementGroup scope
  const mgResources = schema.resources.filter(
    (r) => r.metadata.resourceScope === ResourceScope.ManagementGroup,
  );
  if (mgResources.length > 0 || mgMethods.length > 0) {
    scopes.push({
      scopeName: "ManagementGroup",
      scopeParamName: "managementGroupResource",
      resources: mgResources,
      nonResourceMethods: mgMethods,
    });
  }

  return scopes;
}

// ─── Name Helpers ────────────────────────────────────────────────────────────

/**
 * Generates the mockable class name for a scope.
 * E.g., "Mockable" + "AzureGeneratorMgmtTypeSpecTests" + "ResourceGroupResource"
 */
export function getMockableClassName(
  libraryName: string,
  scopeName: string,
): string {
  const libNameNoSeparators = libraryName.replace(/\./g, "");
  const scopeSuffix =
    scopeName === "ArmClient" ? "ArmClient" : `${scopeName}Resource`;
  return `Mockable${libNameNoSeparators}${scopeSuffix}`;
}

/**
 * Generates the Mocking sub-namespace name.
 */
export function getMockingNamespace(libraryName: string): string {
  return `${libraryName}.Mocking`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Generates a single Mockable{LibName}{Scope}.cs file.
 *
 * For ArmClient scope: generates GetXxxResource(ResourceIdentifier id) for each resource.
 * For other scopes: generates collection getters and singular resource getters.
 * For all scopes: generates non-resource method implementations (async + sync) if present.
 */
export function MockableProviderFile(props: MockableProviderFileProps) {
  const { scope, libraryName } = props;
  const ctx = useEmitterContext();
  const { options, sdkPackage, packageName } = ctx;

  const header = getLicenseHeader(options);
  const className = getMockableClassName(libraryName, scope.scopeName);
  const mockableRefkey = mockableProviderRefkey(scope.scopeName);
  const mockingNs = getMockingNamespace(libraryName);

  const isArmClient = scope.scopeName === "ArmClient";

  // Build non-resource method rendering data
  const nonResourceData = buildNonResourceRenderData(
    scope.nonResourceMethods,
    sdkPackage,
    className,
    scope.scopeName,
    packageName,
  );

  return (
    <SourceFile path={`Extensions/${className}.cs`}>
      {header}
      <Namespace name={mockingNs}>
        {`/// <summary> A class to add extension methods to <see cref="${isArmClient ? "ArmClient" : `${scope.scopeName}Resource`}"/>. </summary>`}
        <ClassDeclaration
          public
          partial
          name={className}
          refkey={mockableRefkey}
          baseType={AzureResourceManager.ArmResource}
        >
          {buildMockingConstructor(className)}
          {buildInternalConstructor(className)}
          {nonResourceData.length > 0 &&
            buildNonResourceFields(nonResourceData)}
          {isArmClient
            ? buildArmClientMethods(scope.resources)
            : buildScopeMethods(scope.resources, scope.scopeName)}
          {nonResourceData.length > 0 &&
            buildNonResourceOperations(
              nonResourceData,
              scope.scopeName,
              className,
            )}
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}

// ─── Constructor builders ────────────────────────────────────────────────────

/**
 * Generates the protected parameterless constructor for mocking support.
 */
function buildMockingConstructor(className: string): Children {
  return code`
/// <summary> Initializes a new instance of ${className} for mocking. </summary>
protected ${className}()
{
}
`;
}

/**
 * Generates the internal constructor that takes ArmClient and ResourceIdentifier.
 */
function buildInternalConstructor(className: string): Children {
  return code`
/// <summary> Initializes a new instance of <see cref="${className}"/> class. </summary>
/// <param name="client"> The client parameters to use in these operations. </param>
/// <param name="id"> The identifier of the resource that is the target of operations. </param>
internal ${className}(${AzureResourceManager.ArmClient} client, ${AzureCore.ResourceIdentifier} id) : base(client, id)
{
}
`;
}

// ─── ArmClient Methods ──────────────────────────────────────────────────────

/**
 * Generates methods for the ArmClient mockable class.
 *
 * For ALL resources:
 *   - GetXxxResource(ResourceIdentifier id) — validates + constructs resource
 *
 * For non-singleton extension resources (scope = Extension):
 *   - GetXxxs(ResourceIdentifier scope) — returns collection
 *   - GetXxxAsync(ResourceIdentifier scope, string name, CancellationToken) — delegates to collection
 *   - GetXxx(ResourceIdentifier scope, string name, CancellationToken) — delegates to collection
 *
 * For singleton extension resources:
 *   - GetXxx(ResourceIdentifier scope) — returns resource via scope.AppendProviderResource
 */
function buildArmClientMethods(resources: ArmResourceSchema[]): Children {
  const methods: Children[] = [];

  for (const resource of resources) {
    const { metadata } = resource;
    const resourceName = metadata.resourceName;
    const resourceClassName = `${resourceName}Resource`;
    const resourceRef = armResourceRefkey(resource.resourceModelId);

    // GetXxxResource(ResourceIdentifier id) — all resources get this
    methods.push(code`
/// <summary> Gets an object representing a <see cref="${resourceClassName}"/> along with the instance operations that can be performed on it but with no data. </summary>
/// <param name="id"> The resource ID of the resource to get. </param>
/// <returns> Returns a <see cref="${resourceClassName}"/> object. </returns>
public virtual ${resourceRef} Get${resourceClassName}(${AzureCore.ResourceIdentifier} id)
{
    ${resourceRef}.ValidateResourceId(id);
    return new ${resourceRef}(Client, id);
}
`);

    // Extension-scoped resources additionally get scope-based factory methods
    if (metadata.resourceScope === ResourceScope.Extension) {
      if (metadata.singletonResourceName) {
        // Singleton extension: GetXxx(ResourceIdentifier scope) → direct resource
        const typeParts = metadata.resourceType.split("/");
        const providerName = typeParts[0];
        const resourceTypeName = typeParts.slice(1).join("/");

        methods.push(code`
/// <summary> Gets an object representing a <see cref="${resourceClassName}"/> along with the instance operations that can be performed on it in the ArmClient. </summary>
/// <param name="scope"> The scope that the resource will apply against. </param>
/// <returns> Returns a <see cref="${resourceClassName}"/> object. </returns>
public virtual ${resourceRef} Get${resourceName}(${AzureCore.ResourceIdentifier} scope)
{
    return new ${resourceRef}(Client, scope.AppendProviderResource("${providerName}", "${resourceTypeName}", "${metadata.singletonResourceName}"));
}
`);
      } else {
        // Non-singleton extension: collection factory + singular getters with scope
        const collectionRef = armCollectionRefkey(resource.resourceModelId);
        const variableSegments = extractVariableSegments(
          metadata.resourceIdPattern,
        );
        const resourceNameParam =
          variableSegments[variableSegments.length - 1];

        const getMethod = metadata.methods.find(
          (m) => m.kind === ResourceOperationKind.Read,
        );

        // Collection factory: GetXxxs(ResourceIdentifier scope) → new XxxCollection(Client, scope)
        methods.push(code`
/// <summary> Gets a collection of <see cref="${collectionRef}"/> objects within the specified scope. </summary>
/// <param name="scope"> The scope of the resource collection to get. </param>
/// <returns> Returns a collection of <see cref="${resourceClassName}"/> objects. </returns>
public virtual ${collectionRef} Get${pluralize(resourceName)}(${AzureCore.ResourceIdentifier} scope)
{
    return new ${collectionRef}(Client, scope);
}
`);

        // Singular getters with scope parameter (if resource has Read operation)
        if (getMethod) {
          const summary = `Get a ${resourceName}`;

          // Sync
          methods.push(code`
/// <summary> ${summary}. </summary>
/// <param name="scope"> The scope of the resource collection to get. </param>
/// <param name="${resourceNameParam}"> The name of the ${resourceClassName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${resourceNameParam}"/> is null. </exception>
/// <exception cref="ArgumentException"> <paramref name="${resourceNameParam}"/> is an empty string, and was expected to be non-empty. </exception>
[${AzureResourceManager.ForwardsClientCalls}]
public virtual ${code`Response<${resourceRef}>`} Get${resourceName}(${AzureCore.ResourceIdentifier} scope, string ${resourceNameParam}, CancellationToken cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNullOrEmpty(${resourceNameParam}, nameof(${resourceNameParam}));

    return Get${pluralize(resourceName)}(scope).Get(${resourceNameParam}, cancellationToken);
}
`);

          // Async
          methods.push(code`
/// <summary> ${summary}. </summary>
/// <param name="scope"> The scope of the resource collection to get. </param>
/// <param name="${resourceNameParam}"> The name of the ${resourceClassName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${resourceNameParam}"/> is null. </exception>
/// <exception cref="ArgumentException"> <paramref name="${resourceNameParam}"/> is an empty string, and was expected to be non-empty. </exception>
[${AzureResourceManager.ForwardsClientCalls}]
public virtual async Task<${code`Response<${resourceRef}>`}> Get${resourceName}Async(${AzureCore.ResourceIdentifier} scope, string ${resourceNameParam}, CancellationToken cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNullOrEmpty(${resourceNameParam}, nameof(${resourceNameParam}));

    return await Get${pluralize(resourceName)}(scope).GetAsync(${resourceNameParam}, cancellationToken).ConfigureAwait(false);
}
`);
        }
      }
    }
  }

  return methods;
}

// ─── Scope Methods (ResourceGroup, Subscription, Tenant, ManagementGroup) ────

/**
 * Generates collection getters and singular resource getters for a given scope.
 *
 * For each non-singleton resource in scope:
 *   - GetXxxs() → returns collection via GetCachedClient()
 *   - GetXxxAsync(name, cancellationToken) → delegates to collection.GetAsync()
 *   - GetXxx(name, cancellationToken) → delegates to collection.Get()
 *
 * For singleton resources in scope:
 *   - GetXxx() → returns resource via Id.AppendProviderResource()
 */
function buildScopeMethods(
  resources: ArmResourceSchema[],
  scopeName: string,
): Children {
  const methods: Children[] = [];

  for (const resource of resources) {
    const { metadata } = resource;
    const resourceName = metadata.resourceName;

    // For subscription scope, only include resources that have subscription-level List ops
    // (not the collection/singular getter pattern)
    if (
      scopeName === "Subscription" &&
      metadata.resourceScope !== ResourceScope.Subscription
    ) {
      // This resource is here because it has a subscription-level list, not because
      // it's subscription-scoped. Skip collection/singular getters for sub scope.
      continue;
    }

    const resourceClassName = `${resourceName}Resource`;
    const resourceRef = armResourceRefkey(resource.resourceModelId);
    const collectionRef = armCollectionRefkey(resource.resourceModelId);

    if (metadata.singletonResourceName) {
      // Singleton resource: direct resource getter via AppendProviderResource
      const typeParts = metadata.resourceType.split("/");
      const providerName = typeParts[0];
      const resourceTypeName = typeParts.slice(1).join("/");

      methods.push(code`
/// <summary>
/// Get a ${resourceName}
/// <list type="bullet">
/// <item>
/// <term> Resource. </term>
/// <description> <see cref="${resourceClassName}"/>. </description>
/// </item>
/// </list>
/// </summary>
/// <returns> Returns a <see cref="${resourceClassName}"/> object. </returns>
public virtual ${resourceRef} Get${resourceName}()
{
    return new ${resourceRef}(Client, Id.AppendProviderResource("${providerName}", "${resourceTypeName}", "${metadata.singletonResourceName}"));
}
`);
    } else {
      // Normal resource: collection getter + singular getter (async + sync)
      const variableSegments = extractVariableSegments(
        metadata.resourceIdPattern,
      );
      const resourceNameParam = variableSegments[variableSegments.length - 1];

      // Determine the Get operation for doc comment
      const getMethod = metadata.methods.find(
        (m) => m.kind === ResourceOperationKind.Read,
      );

      // Collection getter
      methods.push(code`
/// <summary> Gets a collection of ${pluralize(resourceName)} in the <see cref="${getScopeResourceCref(scopeName)}"/>. </summary>
/// <returns> An object representing collection of ${pluralize(resourceName)} and their operations over a ${resourceClassName}. </returns>
public virtual ${collectionRef} Get${pluralize(resourceName)}()
{
    return GetCachedClient(client => new ${collectionRef}(client, Id));
}
`);

      // Singular getter - Async
      if (getMethod) {
        methods.push(code`
/// <summary>
/// Get a ${resourceName}
/// <list type="bullet">
/// <item>
/// <term> Request Path. </term>
/// <description> ${getMethod.operationPath}. </description>
/// </item>
/// <item>
/// <term> Operation Id. </term>
/// <description> ${getOperationId(getMethod, resource)}. </description>
/// </item>
/// </list>
/// </summary>
/// <param name="${resourceNameParam}"> The name of the ${resourceName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${resourceNameParam}"/> is null. </exception>
/// <exception cref="ArgumentException"> <paramref name="${resourceNameParam}"/> is an empty string, and was expected to be non-empty. </exception>
[${AzureResourceManager.ForwardsClientCalls}]
public virtual async Task<${code`Response<${resourceRef}>`}> Get${resourceName}Async(string ${resourceNameParam}, CancellationToken cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNullOrEmpty(${resourceNameParam}, nameof(${resourceNameParam}));

    return await Get${pluralize(resourceName)}().GetAsync(${resourceNameParam}, cancellationToken).ConfigureAwait(false);
}
`);

        // Singular getter - Sync
        methods.push(code`
/// <summary>
/// Get a ${resourceName}
/// <list type="bullet">
/// <item>
/// <term> Request Path. </term>
/// <description> ${getMethod.operationPath}. </description>
/// </item>
/// <item>
/// <term> Operation Id. </term>
/// <description> ${getOperationId(getMethod, resource)}. </description>
/// </item>
/// </list>
/// </summary>
/// <param name="${resourceNameParam}"> The name of the ${resourceName}. </param>
/// <param name="cancellationToken"> The cancellation token to use. </param>
/// <exception cref="ArgumentNullException"> <paramref name="${resourceNameParam}"/> is null. </exception>
/// <exception cref="ArgumentException"> <paramref name="${resourceNameParam}"/> is an empty string, and was expected to be non-empty. </exception>
[${AzureResourceManager.ForwardsClientCalls}]
public virtual ${code`Response<${resourceRef}>`} Get${resourceName}(string ${resourceNameParam}, CancellationToken cancellationToken = default)
{
    ${AzureCore.Argument}.AssertNotNullOrEmpty(${resourceNameParam}, nameof(${resourceNameParam}));

    return Get${pluralize(resourceName)}().Get(${resourceNameParam}, cancellationToken);
}
`);
      }
    }
  }

  return methods;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Gets the scope resource cref for XML documentation.
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
 * Uses simple "s" suffix unless already ending in "s".
 */
function pluralize(name: string): string {
  if (name.endsWith("s")) return name;
  return `${name}s`;
}

/**
 * Gets the operation ID string for XML doc (e.g., "Bazs_Get").
 */
function getOperationId(
  method: { methodId: string },
  resource: ArmResourceSchema,
): string {
  // The methodId contains the cross-language definition ID. Extract the operation ID
  // by taking the last segment after the last dot.
  const parts = method.methodId.split(".");
  const methodName = parts[parts.length - 1];
  // Build operation ID from rest client name + method name
  return `${pluralize(resource.metadata.resourceName)}_${capitalize(methodName)}`;
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Non-resource Method Types ───────────────────────────────────────────────

/**
 * Pre-computed rendering data for a single non-resource method.
 * Combines the metadata, TCGC method, and REST client information
 * needed to generate the C# method body.
 */
interface NonResourceRenderData {
  /** The non-resource method metadata. */
  metadata: NonResourceMethod;
  /** The TCGC service method definition. */
  tcgcMethod: SdkServiceMethod<SdkHttpOperation>;
  /** PascalCase method name for C#. */
  methodName: string;
  /** Refkey for the REST client class. */
  clientRef: Children;
  /** Simple client name (e.g., "MgmtTypeSpecClient"). */
  clientSimpleName: string;
  /** Prefix for field names (e.g., "mgmtTypeSpecClient"). */
  fieldPrefix: string;
  /** Diagnostics field name (e.g., "_mgmtTypeSpecClientClientDiagnostics"). */
  diagnosticsFieldName: string;
  /** REST client field name (e.g., "_mgmtTypeSpecClientRestClient"). */
  restClientFieldName: string;
  /** User-facing method parameters (filtered from TCGC, excluding scope-derived). */
  userParams: SdkMethodParameter[];
  /** Body parameter, if any. */
  bodyParam?: SdkMethodParameter;
  /** Non-body user parameters. */
  nonBodyParams: SdkMethodParameter[];
  /** The response model refkey, if the method returns a model type. */
  responseModelRef?: Children;
  /** API version string. */
  apiVersion: string;
  /** Namespace for diagnostics. */
  namespace: string;
}

// ─── Non-resource Method Helpers ─────────────────────────────────────────────

/**
 * Builds rendering data for non-resource methods by looking up their
 * TCGC methods and REST clients.
 *
 * Returns an array of NonResourceRenderData for methods that have valid
 * TCGC method definitions. Methods without matching TCGC methods are skipped.
 */
function buildNonResourceRenderData(
  nonResourceMethods: NonResourceMethod[],
  sdkPackage: {
    clients: readonly import("@azure-tools/typespec-client-generator-core").SdkClientType<SdkHttpOperation>[];
  },
  className: string,
  scopeName: string,
  packageName: string,
): NonResourceRenderData[] {
  if (!nonResourceMethods || nonResourceMethods.length === 0) return [];

  const methodLookup = buildMethodLookup(sdkPackage);
  const apiVersion = getDefaultApiVersion(sdkPackage);
  const allClients = getAllClients(
    sdkPackage.clients as import("@azure-tools/typespec-client-generator-core").SdkClientType<SdkHttpOperation>[],
  );

  const result: NonResourceRenderData[] = [];

  for (const nrm of nonResourceMethods) {
    const tcgcMethod = methodLookup.get(nrm.methodId);
    if (!tcgcMethod) continue;

    // Find the REST client containing this method
    let restClient:
      | import("@azure-tools/typespec-client-generator-core").SdkClientType<SdkHttpOperation>
      | undefined;
    for (const client of allClients) {
      const hasMethod = client.methods.some(
        (m) =>
          "crossLanguageDefinitionId" in m &&
          m.crossLanguageDefinitionId === nrm.methodId,
      );
      if (hasMethod) {
        restClient = client;
        break;
      }
    }
    if (!restClient) continue;

    const clientRef = refkey(restClient);
    const clientSimpleName = getSimpleClientName(restClient.name);
    const fieldPrefix =
      clientSimpleName.charAt(0).toLowerCase() + clientSimpleName.slice(1);
    const diagnosticsFieldName = `_${fieldPrefix}ClientDiagnostics`;
    const restClientFieldName = `_${fieldPrefix}RestClient`;
    const ns = restClient.namespace || packageName;

    // Filter user-facing parameters: exclude scope-derived (onClient) and API version
    // Also exclude params that map to HTTP headers (contentType, accept) by checking
    // the HTTP operation's header parameters.
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

    // Identify body params via the HTTP operation's bodyParam.correspondingMethodParams
    const bodyMethodParamNames = new Set<string>();
    const httpBodyParam = tcgcMethod.operation?.bodyParam;
    if (httpBodyParam?.correspondingMethodParams) {
      for (const cp of httpBodyParam.correspondingMethodParams) {
        if (cp.kind === "method") {
          bodyMethodParamNames.add(cp.name);
        }
      }
    }

    // Separate body from non-body params
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

    const methodName = getOperationMethodName(tcgcMethod.name);

    result.push({
      metadata: nrm,
      tcgcMethod,
      methodName,
      clientRef,
      clientSimpleName,
      fieldPrefix,
      diagnosticsFieldName,
      restClientFieldName,
      userParams,
      bodyParam,
      nonBodyParams,
      responseModelRef,
      apiVersion,
      namespace: ns,
    });
  }

  return result;
}

/**
 * Generates REST client and diagnostics field declarations for non-resource methods.
 *
 * Each unique REST client used by non-resource methods gets a pair of lazy-initialized fields:
 * - ClientDiagnostics for distributed tracing
 * - REST client for HTTP request creation
 *
 * Fields use the `??=` null-coalescing assignment pattern for lazy initialization.
 */
function buildNonResourceFields(renderData: NonResourceRenderData[]): Children {
  // Deduplicate by REST client field name (multiple methods may share a REST client)
  const seen = new Set<string>();
  const fields: Children[] = [];

  for (const data of renderData) {
    if (seen.has(data.restClientFieldName)) continue;
    seen.add(data.restClientFieldName);

    fields.push(code`
private ${AzureCorePipeline.ClientDiagnostics} ${data.diagnosticsFieldName};
private ${data.clientRef} ${data.restClientFieldName};
private ${AzureCorePipeline.ClientDiagnostics} ${capitalize(data.fieldPrefix)}ClientDiagnostics => ${data.diagnosticsFieldName} ??= new ${AzureCorePipeline.ClientDiagnostics}("${data.namespace}", ProviderConstants.DefaultProviderNamespace, Diagnostics);
private ${data.clientRef} ${capitalize(data.fieldPrefix)}RestClient => ${data.restClientFieldName} ??= new ${data.clientRef}(${capitalize(data.fieldPrefix)}ClientDiagnostics, Pipeline, Endpoint, "${data.apiVersion}");
`);
  }

  return fields;
}

/**
 * Generates async and sync method implementations for all non-resource methods.
 *
 * Each non-resource method produces a pair of methods following the ARM SDK pattern:
 * - Diagnostic scope wrapping for distributed tracing
 * - RequestContext with CancellationToken
 * - Rest client Create*Request method for HTTP request building
 * - Pipeline.ProcessMessage[Async] for HTTP execution
 * - Response deserialization via FromResponse
 */
function buildNonResourceOperations(
  renderData: NonResourceRenderData[],
  scopeName: string,
  className: string,
): Children {
  const methods: Children[] = [];

  for (const data of renderData) {
    methods.push(buildNonResourceStandardOperation(data, scopeName, className));
  }

  return methods;
}

/**
 * Generates a single non-resource standard (non-LRO, non-pageable) operation
 * with async and sync variants.
 *
 * The method body follows the ARM SDK pattern:
 * 1. Validate required parameters
 * 2. Create diagnostic scope for distributed tracing
 * 3. Build RequestContext with CancellationToken
 * 4. Create HTTP message via REST client
 * 5. Process message through the pipeline
 * 6. Deserialize response and check for null
 * 7. Return typed response or throw RequestFailedException
 */
function buildNonResourceStandardOperation(
  data: NonResourceRenderData,
  scopeName: string,
  className: string,
): Children {
  const { methodName, responseModelRef, metadata } = data;

  const createRequestMethod = `Create${methodName}Request`;
  // Use the capitalized property name for accessing the lazy-initialized field
  const diagPropName = `${capitalize(data.fieldPrefix)}ClientDiagnostics`;
  const restPropName = `${capitalize(data.fieldPrefix)}RestClient`;

  // Build scope name for diagnostic tracing
  const scopeNameForDiag = `${className}.${methodName}`;

  // Build parameter declarations for method signature
  const paramDecls = buildParamDeclarations(data, scopeName);

  // Build Create*Request arguments
  const requestArgs = buildCreateRequestArgs(data, scopeName);

  // Build XML doc
  const xmlDoc = buildNonResourceXmlDoc(
    methodName,
    metadata.operationPath,
    data.apiVersion,
  );

  // Build parameter assertions
  const assertions = buildParamAssertions(data, scopeName);

  // Determine return type
  const hasResponseModel = responseModelRef !== undefined;

  if (hasResponseModel) {
    // Standard operation returning Response<T>
    const asyncMethod = code`

${xmlDoc}
/// <param name="cancellationToken"> The cancellation token to use. </param>
public virtual async ${SystemThreadingTasks.Task}<${code`${Azure.Response}<${responseModelRef}>`}> ${methodName}Async(${paramDecls}${SystemThreading.CancellationToken} cancellationToken = default)
{${assertions}

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagPropName}.CreateScope("${scopeNameForDiag}");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restPropName}.${createRequestMethod}(${requestArgs}context);
        ${Azure.Response} result = await Pipeline.ProcessMessageAsync(message, context).ConfigureAwait(false);
        ${Azure.Response}<${responseModelRef}> response = ${Azure.Response}.FromValue(${responseModelRef}.FromResponse(result), result);
        if (response.Value == null)
        {
            throw new ${Azure.RequestFailedException}(response.GetRawResponse());
        }
        return response;
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

    const syncMethod = code`

${xmlDoc}
/// <param name="cancellationToken"> The cancellation token to use. </param>
public virtual ${code`${Azure.Response}<${responseModelRef}>`} ${methodName}(${paramDecls}${SystemThreading.CancellationToken} cancellationToken = default)
{${assertions}

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagPropName}.CreateScope("${scopeNameForDiag}");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restPropName}.${createRequestMethod}(${requestArgs}context);
        ${Azure.Response} result = Pipeline.ProcessMessage(message, context);
        ${Azure.Response}<${responseModelRef}> response = ${Azure.Response}.FromValue(${responseModelRef}.FromResponse(result), result);
        if (response.Value == null)
        {
            throw new ${Azure.RequestFailedException}(response.GetRawResponse());
        }
        return response;
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

    return code`${asyncMethod}${syncMethod}`;
  }

  // Void/untyped response — return raw Response
  const asyncMethod = code`

${xmlDoc}
/// <param name="cancellationToken"> The cancellation token to use. </param>
public virtual async ${SystemThreadingTasks.Task}<${Azure.Response}> ${methodName}Async(${paramDecls}${SystemThreading.CancellationToken} cancellationToken = default)
{${assertions}

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagPropName}.CreateScope("${scopeNameForDiag}");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restPropName}.${createRequestMethod}(${requestArgs}context);
        return await Pipeline.ProcessMessageAsync(message, context).ConfigureAwait(false);
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  const syncMethod = code`

${xmlDoc}
/// <param name="cancellationToken"> The cancellation token to use. </param>
public virtual ${Azure.Response} ${methodName}(${paramDecls}${SystemThreading.CancellationToken} cancellationToken = default)
{${assertions}

    using ${AzureCorePipeline.DiagnosticScope} scope = ${diagPropName}.CreateScope("${scopeNameForDiag}");
    scope.Start();
    try
    {
        ${Azure.RequestContext} context = new ${Azure.RequestContext}
        {
            CancellationToken = cancellationToken
        };
        ${AzureCorePipeline.HttpMessage} message = ${restPropName}.${createRequestMethod}(${requestArgs}context);
        return Pipeline.ProcessMessage(message, context);
    }
    catch (${System.Exception} e)
    {
        scope.Failed(e);
        throw;
    }
}`;

  return code`${asyncMethod}${syncMethod}`;
}

/**
 * Maps an SdkMethodParameter's type to a C# type expression.
 *
 * Handles model types (via efCsharpRefkey), enum types, and common built-in types.
 * Falls back to "object" for unrecognized types.
 */
function mapParamTypeToRef(param: SdkMethodParameter): Children {
  const type = param.type;
  if (!type) return "object";

  // Handle nullable wrapper
  if (type.kind === "nullable") {
    const innerRef = mapSdkTypeToRef(type.type);
    return code`${innerRef}?`;
  }

  return mapSdkTypeToRef(type);
}

/**
 * Maps an SdkType to a C# type reference.
 */
function mapSdkTypeToRef(
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
    case "bytes":
      return System.BinaryData;
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
    case "duration":
      return "TimeSpan";
    case "plainDate":
      return "DateTimeOffset";
    case "plainTime":
      return "TimeSpan";
    case "utcDateTime":
    case "offsetDateTime":
      return "DateTimeOffset";
    default:
      return "object";
  }
}

/**
 * Builds parameter declarations for the method signature as a rendered string.
 *
 * For Extension/ArmClient scope, adds a ResourceIdentifier scope parameter.
 * Then adds non-body user params, followed by the body param if present.
 *
 * Returns a code fragment suitable for insertion before CancellationToken.
 */
function buildParamDeclarations(
  data: NonResourceRenderData,
  scopeName: string,
): Children {
  const parts: Children[] = [];

  // Extension scope: add ResourceIdentifier scope parameter
  if (scopeName === "ArmClient") {
    parts.push(code`${AzureCore.ResourceIdentifier} scope`);
  }

  // Non-body parameters
  for (const param of data.nonBodyParams) {
    if (!param.name || !param.type) continue;
    const typeRef = mapParamTypeToRef(param);
    const defaultVal = param.optional ? " = default" : "";
    parts.push(code`${typeRef} ${param.name}${defaultVal}`);
  }

  // Body parameter
  if (data.bodyParam) {
    if (data.bodyParam.name && data.bodyParam.type) {
      const typeRef = mapParamTypeToRef(data.bodyParam);
      const defaultVal = data.bodyParam.optional ? " = default" : "";
      parts.push(code`${typeRef} ${data.bodyParam.name}${defaultVal}`);
    }
  }

  if (parts.length === 0) return null;

  // Join with ", " and add trailing ", " before CancellationToken
  const result: Children[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) result.push(", ");
    result.push(parts[i]);
  }
  result.push(", ");
  return result;
}

/**
 * Builds the argument list for the Create*Request REST client call.
 *
 * Order: scope-derived args, non-body params, serialized body, then trailing comma+space.
 * The RequestContext is appended by the caller.
 */
function buildCreateRequestArgs(
  data: NonResourceRenderData,
  scopeName: string,
): string {
  const args: string[] = [];

  // Scope-derived arguments
  if (scopeName === "ArmClient") {
    // Extension scope: pass scope.ToString()
    args.push("scope.ToString()");
  } else if (scopeName === "Subscription") {
    args.push("Guid.Parse(Id.SubscriptionId)");
  } else if (scopeName === "ResourceGroup") {
    args.push("Id.SubscriptionId");
    args.push("Id.ResourceGroupName");
  } else if (scopeName === "ManagementGroup") {
    args.push("Id.Name");
  }
  // Tenant scope: no scope-derived args

  // Non-body method parameters
  for (const param of data.nonBodyParams) {
    args.push(param.name);
  }

  // Body parameter (serialized)
  if (data.bodyParam) {
    const bodyType = data.bodyParam.type;
    const bodyName = data.bodyParam.name;
    // Model types use ToRequestContent for serialization
    if (bodyType.kind === "model") {
      const rawType = (bodyType as { __raw?: unknown }).__raw;
      if (rawType) {
        // Use the model refkey for the serialization call
        args.push(
          `${bodyName} == null ? null : ${bodyName}.ToRequestContent()`,
        );
      } else {
        args.push(bodyName);
      }
    } else {
      args.push(bodyName);
    }
  }

  // Return with trailing comma-space if there are args (context is appended separately)
  return args.length > 0 ? args.join(", ") + ", " : "";
}

/**
 * Builds parameter validation assertions for non-resource methods.
 *
 * Non-null assertions are generated for:
 * - Extension scope: the scope parameter
 * - Required body parameters
 * - Required string parameters (not-null-or-empty)
 */
function buildParamAssertions(
  data: NonResourceRenderData,
  scopeName: string,
): string {
  const assertions: string[] = [];

  if (scopeName === "ArmClient") {
    assertions.push(
      `\n    Argument.AssertNotNullOrEmpty(scope, nameof(scope));`,
    );
  }

  // Required body parameter assertions
  if (data.bodyParam && !data.bodyParam.optional) {
    assertions.push(
      `\n    Argument.AssertNotNull(${data.bodyParam.name}, nameof(${data.bodyParam.name}));`,
    );
  }

  return assertions.join("");
}

/**
 * Builds XML documentation for a non-resource method.
 *
 * Follows the ARM SDK documentation pattern with request path,
 * operation details, and API version information.
 */
function buildNonResourceXmlDoc(
  methodName: string,
  requestPath: string,
  apiVersion: string,
): string {
  return `/// <summary>
/// ${methodName}
/// <list type="bullet">
/// <item>
/// <term> Request Path. </term>
/// <description> ${requestPath}. </description>
/// </item>
/// <item>
/// <term> Default Api Version. </term>
/// <description> ${apiVersion}. </description>
/// </item>
/// </list>
/// </summary>`;
}
