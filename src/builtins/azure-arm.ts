import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the Azure.ResourceManager namespace.
 *
 * These are ARM SDK types from the Azure.ResourceManager NuGet package that are
 * referenced by generated management-plane C# code. Referencing these symbols
 * in Alloy JSX components automatically generates the correct
 * `using Azure.ResourceManager;` directive.
 *
 * Only activated when the emitter `management` option is set to `true`.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/azure.resourcemanager
 */
export const AzureResourceManager = createLibrary("Azure.ResourceManager", {
  /**
   * Base class for ARM resource instances. Provides access to the ARM client,
   * HTTP pipeline, endpoint, diagnostics, and resource identity.
   *
   * All generated `{Resource}Resource` classes extend this type.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.resourcemanager.armresource
   */
  ArmResource: {
    kind: "class",
    members: {},
  },

  /**
   * Entry point for interacting with Azure Resource Manager. Provides
   * `GetResource()` for constructing resource instances from identifiers.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.resourcemanager.armclient
   */
  ArmClient: {
    kind: "class",
    members: {},
  },

  /**
   * Represents an ARM resource type string (e.g., "Microsoft.Compute/virtualMachines").
   * Supports implicit conversion from string literals.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.resourcemanager.models.resourcetype
   */
  ResourceType: {
    kind: "struct",
    members: {},
  },

  /**
   * Represents a long-running ARM operation that returns a typed result.
   * Extends Azure.Operation<T> with ARM-specific polling and rehydration.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.resourcemanager.armoperation-1
   */
  ArmOperation: {
    kind: "class",
    members: {},
  },

  /**
   * Base class for ARM collection resources. Provides enumeration and
   * standard collection operations (Create, Get, List, Exists).
   *
   * All generated `{Resource}Collection` classes extend this type.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.resourcemanager.armcollection
   */
  ArmCollection: {
    kind: "class",
    members: {},
  },
});

/**
 * Alloy library declaration for types in the Azure.ResourceManager.Resources namespace.
 *
 * These represent well-known ARM resource types used as parent scopes
 * (ResourceGroup, Subscription, etc.).
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/azure.resourcemanager.resources
 */
export const AzureResourceManagerResources = createLibrary(
  "Azure.ResourceManager.Resources",
  {
    /**
     * Represents an Azure resource group. Used as parent scope for
     * ResourceGroup-scoped ARM resources.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/azure.resourcemanager.resources.resourcegroupresource
     */
    ResourceGroupResource: {
      kind: "class",
      members: {},
    },

    /**
     * Represents an Azure subscription. Used as parent scope for
     * Subscription-scoped ARM resources.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/azure.resourcemanager.resources.subscriptionresource
     */
    SubscriptionResource: {
      kind: "class",
      members: {},
    },

    /**
     * Represents a tenant-level scope. Used as parent scope for
     * Tenant-scoped ARM resources.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/azure.resourcemanager.resources.tenantresource
     */
    TenantResource: {
      kind: "class",
      members: {},
    },

    /**
     * Represents an ARM tag resource. Used for tag operations
     * (AddTag, SetTags, RemoveTag) on ARM resources.
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/azure.resourcemanager.resources.tagresource
     */
    TagResource: {
      kind: "class",
      members: {},
    },
  },
);
