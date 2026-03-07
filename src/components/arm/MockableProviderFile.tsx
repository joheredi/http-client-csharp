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
import {
  ArmResourceSchema,
  ArmProviderSchema,
  ResourceScope,
  ResourceOperationKind,
} from "../../utils/resource-metadata.js";
import { AzureResourceManager } from "../../builtins/azure-arm.js";
import { AzureCore } from "../../builtins/azure.js";
import { armResourceRefkey } from "./ResourceFile.js";
import { armCollectionRefkey } from "./CollectionFile.js";
import { useEmitterContext } from "../../contexts/emitter-context.js";
import { extractVariableSegments } from "./ResourceFile.js";
import { getLicenseHeader } from "../../utils/header.js";

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
 * Returns only scopes that have at least one resource.
 */
export function categorizeResourcesByScope(
  schema: ArmProviderSchema,
): ScopeResources[] {
  const scopes: ScopeResources[] = [];

  // ArmClient scope: ALL resources
  if (schema.resources.length > 0) {
    scopes.push({
      scopeName: "ArmClient",
      scopeParamName: "client",
      resources: schema.resources,
    });
  }

  // ResourceGroup scope
  const rgResources = schema.resources.filter(
    (r) => r.metadata.resourceScope === ResourceScope.ResourceGroup,
  );
  if (rgResources.length > 0) {
    scopes.push({
      scopeName: "ResourceGroup",
      scopeParamName: "resourceGroupResource",
      resources: rgResources,
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
  if (subResources.length > 0) {
    scopes.push({
      scopeName: "Subscription",
      scopeParamName: "subscriptionResource",
      resources: subResources,
    });
  }

  // Tenant scope
  const tenantResources = schema.resources.filter(
    (r) => r.metadata.resourceScope === ResourceScope.Tenant,
  );
  if (tenantResources.length > 0) {
    scopes.push({
      scopeName: "Tenant",
      scopeParamName: "tenantResource",
      resources: tenantResources,
    });
  }

  // ManagementGroup scope
  const mgResources = schema.resources.filter(
    (r) => r.metadata.resourceScope === ResourceScope.ManagementGroup,
  );
  if (mgResources.length > 0) {
    scopes.push({
      scopeName: "ManagementGroup",
      scopeParamName: "managementGroupResource",
      resources: mgResources,
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
 */
export function MockableProviderFile(props: MockableProviderFileProps) {
  const { scope, libraryName } = props;
  const ctx = useEmitterContext();
  const { options } = ctx;

  const header = getLicenseHeader(options);
  const className = getMockableClassName(libraryName, scope.scopeName);
  const mockableRefkey = mockableProviderRefkey(scope.scopeName);
  const mockingNs = getMockingNamespace(libraryName);

  const isArmClient = scope.scopeName === "ArmClient";

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
          {isArmClient
            ? buildArmClientMethods(scope.resources)
            : buildScopeMethods(scope.resources, scope.scopeName)}
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
 * Generates GetXxxResource(ResourceIdentifier id) methods for the ArmClient mockable class.
 * Each resource gets a method that validates the resource ID and constructs the resource instance.
 */
function buildArmClientMethods(resources: ArmResourceSchema[]): Children {
  const methods: Children[] = [];

  for (const resource of resources) {
    const resourceName = resource.metadata.resourceName;
    const resourceClassName = `${resourceName}Resource`;
    const resourceRef = armResourceRefkey(resource.resourceModelId);

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
