import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the Azure namespace.
 *
 * These are Azure SDK types from the Azure.Core NuGet package that are
 * referenced by generated Azure-flavored C# client code. Referencing these
 * symbols in Alloy JSX components automatically generates the correct
 * `using Azure;` directive.
 *
 * Only activated when the emitter `flavor` option is set to `"azure"`.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/azure
 */
export const Azure = createLibrary("Azure", {
  /**
   * Represents an Azure geography region where a resource is deployed
   * (e.g., "WestUS", "EastUS2"). Maps from the TypeSpec scalar
   * `Azure.Core.azureLocation`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.azurelocation
   */
  AzureLocation: {
    kind: "struct",
    members: {},
  },

  /**
   * Represents an HTTP ETag value used for conditional requests.
   * Maps from the TypeSpec scalar `Azure.Core.eTag`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.etag
   */
  ETag: {
    kind: "struct",
    members: {},
  },

  /**
   * Represents a structured error response from an Azure service.
   * Maps from the TypeSpec model `Azure.Core.Foundations.Error`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.responseerror
   */
  ResponseError: {
    kind: "class",
    members: {},
  },
});

/**
 * Alloy library declaration for types in the Azure.Core namespace.
 *
 * These are Azure SDK types from the Azure.Core NuGet package that live
 * in the `Azure.Core` sub-namespace. Referencing these symbols automatically
 * generates the correct `using Azure.Core;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core
 */
export const AzureCore = createLibrary("Azure.Core", {
  /**
   * Represents a fully qualified Azure Resource Manager resource identifier.
   * Maps from the TypeSpec scalar `Azure.Core.armResourceIdentifier`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/azure.core.resourceidentifier
   */
  ResourceIdentifier: {
    kind: "class",
    members: {},
  },
});
