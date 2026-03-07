/**
 * ARM resource detection from TypeSpec definitions.
 *
 * This module is the main entry point for detecting Azure Resource Manager
 * resources from TypeSpec API definitions. It produces an {@link ArmProviderSchema}
 * that downstream components use to generate ARM resource classes, collections,
 * and CRUD operations.
 *
 * Two detection modes are supported:
 *
 * 1. **New mode** (`use-legacy-resource-detection: false`): Uses the standardized
 *    `resolveArmResources` API from `@azure-tools/typespec-azure-resource-manager`.
 *    This is the recommended approach for new TypeSpec specs.
 *
 * 2. **Legacy mode** (`use-legacy-resource-detection: true`, default): Uses
 *    heuristic-based detection by scanning SDK method decorators and URL path
 *    patterns. This handles edge cases for non-standard ARM resources (custom
 *    resources, legacy services converted from Swagger to TypeSpec).
 *
 * Both modes share the same post-processing pipeline defined in
 * {@link module:resource-metadata} to ensure consistent output.
 *
 * @module
 */

import type { Program, Model, Operation, DecoratorApplication } from "@typespec/compiler";
import { getNamespaceFullName } from "@typespec/compiler";
import type {
  SdkClientType,
  SdkContext,
  SdkHttpOperation,
  SdkMethod,
  SdkModelType,
  SdkServiceMethod,
  SdkServiceOperation,
  TCGCContext,
} from "@azure-tools/typespec-client-generator-core";
import {
  getCrossLanguageDefinitionId,
  getClientType,
} from "@azure-tools/typespec-client-generator-core";
import type {
  ResolvedResource,
  ResourceType,
  ArmResourceOperation,
} from "@azure-tools/typespec-azure-resource-manager";
import { resolveArmResources as resolveArmResourcesFromLibrary } from "@azure-tools/typespec-azure-resource-manager";

import {
  calculateResourceTypeFromPath,
  findLongestPrefixMatch,
  getLastPathSegment,
  getOperationScopeFromPath,
  getResourceTypeSegment,
  isPrefix,
  isVariableSegment,
} from "./arm-path-utils.js";
import {
  type ArmProviderSchema,
  type ArmResourceSchema,
  type NonResourceMethod,
  type ParentResourceLookupContext,
  type ResourceMethod,
  type ResourceMetadata,
  ResourceOperationKind,
  ResourceScope,
  assignNonResourceMethodsToResources,
  postProcessArmResources,
  sortResourceMethods,
} from "./resource-metadata.js";

// Re-export types that downstream consumers need
export type {
  ArmProviderSchema,
  ArmResourceSchema,
  NonResourceMethod,
  ResourceMetadata,
  ResourceMethod,
};
export { ResourceOperationKind, ResourceScope };

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Detects ARM resources from a TypeSpec program and returns a unified provider schema.
 *
 * This is the main entry point for resource detection. It delegates to either
 * the new `resolveArmResources` API or the legacy heuristic-based detection
 * depending on the `useLegacyDetection` flag.
 *
 * @param program             - The compiled TypeSpec program.
 * @param sdkContext           - The TCGC SDK context with clients, models, and enums.
 * @param useLegacyDetection   - When `true`, uses legacy heuristic detection; otherwise uses
 *                               the standardized `resolveArmResources` API.
 * @returns The detected ARM provider schema.
 */
export function detectArmResources(
  program: Program,
  sdkContext: SdkContext<any, SdkHttpOperation>,
  useLegacyDetection: boolean,
): ArmProviderSchema {
  if (!useLegacyDetection) {
    return resolveArmResourcesNewMode(program, sdkContext);
  } else {
    return buildArmProviderSchemaLegacy(program, sdkContext);
  }
}

// ─── New Mode: resolveArmResources API ───────────────────────────────────────

/**
 * Detects ARM resources using the standardized `resolveArmResources` API from
 * `@azure-tools/typespec-azure-resource-manager`.
 *
 * This function wraps the standard API and converts its output to our internal
 * {@link ArmProviderSchema} format for consistency with the legacy mode.
 *
 * @param program    - The compiled TypeSpec program.
 * @param sdkContext  - The TCGC SDK context.
 * @returns The ARM provider schema.
 */
function resolveArmResourcesNewMode(
  program: Program,
  sdkContext: SdkContext<any, SdkHttpOperation>,
): ArmProviderSchema {
  const provider = resolveArmResourcesFromLibrary(program);

  // Convert resolved resources to our schema format
  const resources: ArmResourceSchema[] = [];
  const processedResources = new Set<string>();
  const schemaToResolvedResource = new Map<
    ArmResourceSchema,
    ResolvedResource
  >();

  if (provider.resources) {
    for (const resolvedResource of provider.resources) {
      const modelId = getCrossLanguageDefinitionId(
        sdkContext as TCGCContext,
        resolvedResource.type,
      );
      if (!modelId) continue;

      // Deduplicate by model + path combination
      const resourceKey = `${modelId}|${resolvedResource.resourceInstancePath}`;
      if (processedResources.has(resourceKey)) continue;
      processedResources.add(resourceKey);

      const metadata = convertResolvedResourceToMetadata(
        sdkContext,
        resolvedResource,
      );

      const resource: ArmResourceSchema = {
        resourceModelId: modelId,
        metadata,
      };
      resources.push(resource);
      schemaToResolvedResource.set(resource, resolvedResource);
    }
  }

  // Assign list operations to the correct resources using prefix matching.
  // The ARM library may assign lists to the wrong resource when the same
  // model has multiple resources with different path segments.
  assignListOperationsToResources(sdkContext, resources, schemaToResolvedResource);

  // Build parent lookup context
  const nonResourceMethods: NonResourceMethod[] = [];
  const validResourceMap = new Map<string, ArmResourceSchema>();
  for (const r of resources.filter(
    (r) => r.metadata.resourceIdPattern !== "",
  )) {
    const resolvedR = schemaToResolvedResource.get(r);
    if (resolvedR) {
      validResourceMap.set(resolvedR.resourceInstancePath, r);
    }
  }

  const parentLookup: ParentResourceLookupContext = {
    getParentResource: (
      resource: ArmResourceSchema,
    ): ArmResourceSchema | undefined => {
      const resolved = schemaToResolvedResource.get(resource);
      if (!resolved) return undefined;

      let parent = resolved.parent;
      while (parent) {
        const parentResource = validResourceMap.get(
          parent.resourceInstancePath,
        );
        if (parentResource) return parentResource;
        parent = parent.parent;
      }
      return undefined;
    },
  };

  // Shared post-processing
  const filteredResources = postProcessArmResources(
    resources,
    nonResourceMethods,
    parentLookup,
  );

  // Add provider operations as non-resource methods
  if (provider.providerOperations) {
    for (const operation of provider.providerOperations) {
      const methodId = getMethodIdFromOperation(sdkContext, operation.operation);
      if (!methodId) continue;

      nonResourceMethods.push({
        methodId,
        operationPath: operation.path,
        operationScope: getOperationScopeFromPath(operation.path),
      });
    }
  }

  // Collect operations not recognized by the ARM library
  const includedOperationIds = new Set<string>();
  for (const resource of filteredResources) {
    for (const method of resource.metadata.methods) {
      includedOperationIds.add(method.methodId);
    }
  }
  for (const nonResourceMethod of nonResourceMethods) {
    includedOperationIds.add(nonResourceMethod.methodId);
  }

  const allSdkClients = getAllSdkClients(sdkContext);
  for (const client of allSdkClients) {
    for (const method of client.methods) {
      if (method.kind !== "basic") continue;
      const methodId = method.crossLanguageDefinitionId;
      if (includedOperationIds.has(methodId)) continue;

      const operation = (method as SdkServiceMethod<SdkHttpOperation>)
        .operation;
      if (!operation || !operation.path) continue;

      nonResourceMethods.push({
        methodId,
        operationPath: operation.path,
        operationScope: getOperationScopeFromPath(operation.path),
      });
    }
  }

  // Assign non-resource methods to resources
  assignNonResourceMethodsToResources(filteredResources, nonResourceMethods);

  return {
    resources: filteredResources,
    nonResourceMethods,
  };
}

/**
 * Converts a `ResolvedResource` from the ARM library to our `ResourceMetadata` format.
 */
function convertResolvedResourceToMetadata(
  sdkContext: SdkContext<any, SdkHttpOperation>,
  resolvedResource: ResolvedResource,
): ResourceMetadata {
  const methods: ResourceMethod[] = [];
  const resourceScope = convertScopeToResourceScope(resolvedResource.scope);
  let resourceIdPattern = "";

  // Convert lifecycle operations
  if (resolvedResource.operations.lifecycle) {
    const lifecycle = resolvedResource.operations.lifecycle;

    if (lifecycle.read) {
      for (const readOp of lifecycle.read) {
        const methodId = getMethodIdFromOperation(
          sdkContext,
          readOp.operation,
        );
        if (methodId) {
          methods.push({
            methodId,
            kind: ResourceOperationKind.Read,
            operationPath: readOp.path,
            operationScope: resourceScope,
            resourceScope: calculateResourceScopeFromResolved(
              readOp.path,
              resolvedResource,
            ),
          });
          if (!resourceIdPattern) {
            resourceIdPattern = readOp.path;
          }
        }
      }
    }

    if (lifecycle.createOrUpdate) {
      for (const createOp of lifecycle.createOrUpdate) {
        const methodId = getMethodIdFromOperation(
          sdkContext,
          createOp.operation,
        );
        if (methodId) {
          methods.push({
            methodId,
            kind: ResourceOperationKind.Create,
            operationPath: createOp.path,
            operationScope: resourceScope,
            resourceScope: calculateResourceScopeFromResolved(
              createOp.path,
              resolvedResource,
            ),
          });
        }
      }
    }

    if (lifecycle.update) {
      for (const updateOp of lifecycle.update) {
        const methodId = getMethodIdFromOperation(
          sdkContext,
          updateOp.operation,
        );
        if (methodId) {
          methods.push({
            methodId,
            kind: ResourceOperationKind.Update,
            operationPath: updateOp.path,
            operationScope: resourceScope,
            resourceScope: calculateResourceScopeFromResolved(
              updateOp.path,
              resolvedResource,
            ),
          });
        }
      }
    }

    if (lifecycle.delete) {
      for (const deleteOp of lifecycle.delete) {
        const methodId = getMethodIdFromOperation(
          sdkContext,
          deleteOp.operation,
        );
        if (methodId) {
          methods.push({
            methodId,
            kind: ResourceOperationKind.Delete,
            operationPath: deleteOp.path,
            operationScope: resourceScope,
            resourceScope: calculateResourceScopeFromResolved(
              deleteOp.path,
              resolvedResource,
            ),
          });
        }
      }
    }
  }

  // Convert action operations
  if (resolvedResource.operations.actions) {
    for (const actionOp of resolvedResource.operations.actions) {
      const methodId = getMethodIdFromOperation(
        sdkContext,
        actionOp.operation,
      );
      if (methodId) {
        methods.push({
          methodId,
          kind: ResourceOperationKind.Action,
          operationPath: actionOp.path,
          operationScope: resourceScope,
          resourceScope: calculateResourceScopeFromResolved(
            actionOp.path,
            resolvedResource,
          ),
        });
      }
    }
  }

  const resourceType = formatResourceType(resolvedResource.resourceType);

  return {
    resourceIdPattern,
    resourceType,
    methods,
    resourceScope,
    parentResourceId: undefined,
    parentResourceModelId: undefined,
    singletonResourceName: extractSingletonName(
      resolvedResource.resourceInstancePath,
    ),
    resourceName: resolvedResource.resourceName,
  };
}

/**
 * Converts a scope value from the ARM library to our `ResourceScope` enum.
 */
function convertScopeToResourceScope(
  scope: string | ResolvedResource | undefined,
): ResourceScope {
  if (!scope) {
    return ResourceScope.ResourceGroup;
  }

  if (typeof scope === "string") {
    switch (scope) {
      case "Tenant":
        return ResourceScope.Tenant;
      case "Subscription":
        return ResourceScope.Subscription;
      case "ResourceGroup":
        return ResourceScope.ResourceGroup;
      case "ManagementGroup":
        return ResourceScope.ManagementGroup;
      case "Scope":
      case "ExternalResource":
        return ResourceScope.Extension;
      default:
        return ResourceScope.ResourceGroup;
    }
  }

  // If scope is a ResolvedResource, it's an extension resource
  return ResourceScope.Extension;
}

/**
 * Calculates the resource scope path for an operation within a resolved resource.
 * Walks up the parent chain to find the most specific matching path prefix.
 */
function calculateResourceScopeFromResolved(
  operationPath: string,
  resolvedResource: ResolvedResource,
): string | undefined {
  if (isPrefix(resolvedResource.resourceInstancePath, operationPath)) {
    return resolvedResource.resourceInstancePath;
  }

  let parent = resolvedResource.parent;
  while (parent) {
    if (isPrefix(parent.resourceInstancePath, operationPath)) {
      return parent.resourceInstancePath;
    }
    parent = parent.parent;
  }

  return undefined;
}

/**
 * Formats a `ResourceType` to its string representation.
 * Example: `{ provider: "Microsoft.Foo", types: ["bars", "bazzes"] }` → `"Microsoft.Foo/bars/bazzes"`
 */
function formatResourceType(resourceType: ResourceType): string {
  return `${resourceType.provider}/${resourceType.types.join("/")}`;
}

/**
 * Extracts the singleton resource name from a path if the last segment is a
 * fixed string (not a parameter). Singletons have paths like `.../default`
 * instead of `.../\{name\}`.
 */
function extractSingletonName(path: string): string | undefined {
  const segments = path.split("/").filter((s) => s.length > 0);
  const lastSegment = segments[segments.length - 1];

  if (lastSegment && !isVariableSegment(lastSegment)) {
    return lastSegment;
  }
  return undefined;
}

/**
 * Assigns list operations from resolved resources to the correct
 * `ArmResourceSchema` entries using prefix matching.
 *
 * The ARM library may assign list operations to the wrong resource when the same
 * model has multiple resources with different path segments. This function
 * reassigns them using path matching for correctness.
 */
function assignListOperationsToResources(
  sdkContext: SdkContext<any, SdkHttpOperation>,
  resources: ArmResourceSchema[],
  schemaToResolvedResource: Map<ArmResourceSchema, ResolvedResource>,
): void {
  // Precompute resources grouped by model ID
  const resourcesByModelId = new Map<string, ArmResourceSchema[]>();
  for (const r of resources) {
    const existing = resourcesByModelId.get(r.resourceModelId);
    if (existing) {
      existing.push(r);
    } else {
      resourcesByModelId.set(r.resourceModelId, [r]);
    }
  }

  for (const [resource, resolvedResource] of schemaToResolvedResource) {
    if (!resolvedResource.operations.lists) continue;

    const modelId = resource.resourceModelId;
    const resourcesForModel = resourcesByModelId.get(modelId) ?? [];

    for (const listOp of resolvedResource.operations.lists) {
      const methodId = getMethodIdFromOperation(
        sdkContext,
        listOp.operation,
      );
      if (!methodId) continue;

      let targetResource: ArmResourceSchema | undefined;

      if (resourcesForModel.length === 1) {
        targetResource = resourcesForModel[0];
      } else {
        // Multiple resources for the same model — use prefix matching
        targetResource = findLongestPrefixMatch(
          listOp.path,
          resourcesForModel,
          (r) => {
            const pattern = r.metadata.resourceIdPattern;
            if (!pattern) return undefined;
            const lastSlash = pattern.lastIndexOf("/");
            return lastSlash > 0 ? pattern.substring(0, lastSlash) : undefined;
          },
        );

        // Fall back to type segment matching
        if (!targetResource) {
          const listLastSegment = getLastPathSegment(listOp.path);
          if (listLastSegment) {
            targetResource = resourcesForModel.find((r) => {
              const typeSegment = getResourceTypeSegment(
                r.metadata.resourceIdPattern,
              );
              return (
                typeSegment?.toLowerCase() === listLastSegment.toLowerCase()
              );
            });
          }
        }
      }

      // Fall back to the ARM library's original assignment
      if (!targetResource) {
        targetResource = resource;
      }

      targetResource.metadata.methods.push({
        methodId,
        kind: ResourceOperationKind.List,
        operationPath: listOp.path,
        operationScope: getOperationScopeFromPath(listOp.path),
        resourceScope: undefined,
      });
    }
  }
}

// ─── Legacy Mode: Heuristic-based Detection ──────────────────────────────────

/** ARM decorator names used for resource model identification. */
const ARM_RESOURCE_INTERNAL =
  "Azure.ResourceManager.Private.@armResourceInternal";
const ARM_RESOURCE_WITH_PARAMETER =
  "Azure.ResourceManager.@armResourceWithParameter";
const CUSTOM_AZURE_RESOURCE =
  "Azure.ResourceManager.Legacy.@customAzureResource";
const SINGLETON_DECORATOR = "Azure.ResourceManager.@singleton";
const TENANT_RESOURCE = "Azure.ResourceManager.@tenantResource";
const SUBSCRIPTION_RESOURCE = "Azure.ResourceManager.@subscriptionResource";
const RESOURCE_GROUP_RESOURCE =
  "Azure.ResourceManager.@resourceGroupResource";
const PARENT_RESOURCE = "TypeSpec.Rest.@parentResource";

/** Decorator names for classifying resource operations. */
const ARM_RESOURCE_READ = "@armResourceRead";
const ARM_RESOURCE_CREATE_OR_UPDATE = "@armResourceCreateOrUpdate";
const ARM_RESOURCE_UPDATE = "@armResourceUpdate";
const ARM_RESOURCE_DELETE = "@armResourceDelete";
const ARM_RESOURCE_LIST = "@armResourceList";
const ARM_RESOURCE_ACTION = "@armResourceAction";
const READS_RESOURCE = "@readsResource";
const EXTENSION_RESOURCE_OPERATION = "@extensionResourceOperation";
const LEGACY_EXTENSION_RESOURCE_OPERATION =
  "@legacyExtensionResourceOperation";
const LEGACY_RESOURCE_OPERATION = "@legacyResourceOperation";
const BUILTIN_RESOURCE_OPERATION = "@builtInResourceOperation";

/**
 * Detects ARM resources using the legacy heuristic-based approach.
 *
 * This function scans all SDK clients and their methods, classifies operations
 * by inspecting TypeSpec decorators, and builds a resource metadata map using
 * a two-pass strategy:
 *
 * - **Pass 1**: CRUD operations establish resource paths.
 * - **Pass 2**: Non-CRUD operations (List, Action) match against established paths.
 *
 * After building the initial map, shared post-processing handles parent
 * relationships, scope assignment, method sorting, and filtering.
 *
 * @param program    - The compiled TypeSpec program.
 * @param sdkContext  - The TCGC SDK context.
 * @returns The ARM provider schema.
 */
function buildArmProviderSchemaLegacy(
  program: Program,
  sdkContext: SdkContext<any, SdkHttpOperation>,
): ArmProviderSchema {
  const allClients = getAllSdkClients(sdkContext);

  // Build lookup maps
  const serviceMethods = new Map<string, SdkServiceMethod<SdkHttpOperation>>();
  for (const client of allClients) {
    for (const method of client.methods) {
      if (method.kind === "basic") {
        serviceMethods.set(
          method.crossLanguageDefinitionId,
          method as SdkServiceMethod<SdkHttpOperation>,
        );
      }
    }
  }

  const sdkModels = new Map<string, SdkModelType>(
    sdkContext.sdkPackage.models.map((m) => [m.crossLanguageDefinitionId, m]),
  );

  // Find all resource models
  const resourceModelIds = new Set<string>();
  for (const model of sdkContext.sdkPackage.models) {
    if (isResourceModel(model)) {
      resourceModelIds.add(model.crossLanguageDefinitionId);
    }
  }

  // Metadata tracking maps
  const resourcePathToMetadataMap = new Map<string, ResourceMetadata>();
  const resourcePathToClientName = new Map<string, string>();
  const nonResourceMethods = new Map<string, NonResourceMethod>();

  /**
   * Processes a single method: classifies it as a resource operation or non-resource method,
   * and adds it to the appropriate tracking map.
   */
  const processMethod = (
    clientName: string,
    method: SdkServiceMethod<SdkHttpOperation>,
  ) => {
    const serviceMethod = serviceMethods.get(
      method.crossLanguageDefinitionId,
    );
    const { kind, modelId } = parseResourceOperation(serviceMethod, sdkContext);

    if (modelId && kind && resourceModelIds.has(modelId)) {
      let resourcePath = "";
      let foundMatchingResource = false;
      const operationPath = method.operation.path;

      if (isCRUDKind(kind)) {
        resourcePath = operationPath;
        foundMatchingResource = true;
      } else {
        // For non-CRUD: match against existing resource paths for the same model
        const existingPathsForModel: string[] = [];
        const typeMatchCandidates: Array<{ existingPath: string }> = [];

        for (const [existingKey] of resourcePathToMetadataMap) {
          const [existingModelId, existingPath] = existingKey.split("|");
          if (existingModelId === modelId && existingPath) {
            existingPathsForModel.push(existingPath);

            const existingResourceType =
              calculateResourceTypeFromPath(existingPath);
            let operationResourceType = "";
            try {
              operationResourceType =
                calculateResourceTypeFromPath(operationPath);
            } catch {
              // Can't calculate — skip type matching
            }

            if (
              existingResourceType &&
              operationResourceType === existingResourceType
            ) {
              typeMatchCandidates.push({ existingPath });
            }
          }
        }

        // Best prefix match
        const bestPrefixMatch = findLongestPrefixMatch(
          operationPath,
          existingPathsForModel,
          (path) => path.substring(0, path.lastIndexOf("/")),
        );

        if (bestPrefixMatch) {
          resourcePath = bestPrefixMatch;
          foundMatchingResource = true;
        } else if (typeMatchCandidates.length === 1) {
          resourcePath = typeMatchCandidates[0].existingPath;
          foundMatchingResource = true;
        }

        // Unmatched Action operations that look like provider operations → non-resource
        if (!foundMatchingResource && kind === ResourceOperationKind.Action) {
          const model = sdkModels.get(modelId);
          const resourceTypeName = model?.name?.toLowerCase();
          const pathLower = operationPath.toLowerCase();

          if (resourceTypeName && !pathLower.includes(resourceTypeName)) {
            nonResourceMethods.set(method.crossLanguageDefinitionId, {
              methodId: method.crossLanguageDefinitionId,
              operationPath,
              operationScope: getOperationScopeFromPath(operationPath),
            });
            return;
          }
        }

        if (!resourcePath) {
          resourcePath = operationPath;
        }
      }

      // Create or update metadata entry
      const metadataKey = `${modelId}|${resourcePath}`;
      let entry = resourcePathToMetadataMap.get(metadataKey);

      if (!entry) {
        const model = sdkModels.get(modelId);
        if (!resourcePathToClientName.has(metadataKey)) {
          resourcePathToClientName.set(metadataKey, clientName);
        }

        const singletonDecorator = (model?.__raw as Model)?.decorators?.find(
          (d) =>
            d.definition?.name === "@singleton" &&
            (d.decorator as any)?.namespace?.name === "ResourceManager",
        );

        entry = {
          resourceIdPattern: "",
          resourceType: "",
          singletonResourceName: getSingletonResource(singletonDecorator),
          resourceScope: ResourceScope.Tenant,
          methods: [],
          parentResourceId: undefined,
          parentResourceModelId: undefined,
          resourceName: model?.name ?? "Unknown",
        };
        resourcePathToMetadataMap.set(metadataKey, entry);
      }

      entry.methods.push({
        methodId: method.crossLanguageDefinitionId,
        kind,
        operationPath,
        operationScope: getOperationScopeFromPath(operationPath),
      });

      if (!entry.resourceType) {
        try {
          entry.resourceType = calculateResourceTypeFromPath(operationPath);
        } catch {
          // Path doesn't contain a resource type segment
        }
      }
      if (!entry.resourceIdPattern && isCRUDKind(kind)) {
        entry.resourceIdPattern = operationPath;
      }
    } else {
      nonResourceMethods.set(method.crossLanguageDefinitionId, {
        methodId: method.crossLanguageDefinitionId,
        operationPath: method.operation.path,
        operationScope: getOperationScopeFromPath(method.operation.path),
      });
    }
  };

  // Two-pass processing: CRUD first, then non-CRUD
  for (const client of allClients) {
    for (const method of client.methods) {
      if (method.kind !== "basic") continue;
      const serviceMethod = serviceMethods.get(
        method.crossLanguageDefinitionId,
      );
      const { kind } = parseResourceOperation(serviceMethod, sdkContext);
      if (kind && isCRUDKind(kind)) {
        processMethod(
          client.name,
          method as SdkServiceMethod<SdkHttpOperation>,
        );
      }
    }
  }

  for (const client of allClients) {
    for (const method of client.methods) {
      if (method.kind !== "basic") continue;
      const serviceMethod = serviceMethods.get(
        method.crossLanguageDefinitionId,
      );
      const { kind } = parseResourceOperation(serviceMethod, sdkContext);
      if (kind && !isCRUDKind(kind)) {
        processMethod(
          client.name,
          method as SdkServiceMethod<SdkHttpOperation>,
        );
      } else if (!kind) {
        processMethod(
          client.name,
          method as SdkServiceMethod<SdkHttpOperation>,
        );
      }
    }
  }

  // Convert metadata map to ArmResourceSchema[]
  const resources: ArmResourceSchema[] = [];
  for (const [metadataKey, metadata] of resourcePathToMetadataMap) {
    const modelId = metadataKey.split("|")[0];
    resources.push({
      resourceModelId: modelId,
      metadata,
    });
  }

  // Populate parentResourceModelId from decorators
  for (const [metadataKey] of resourcePathToMetadataMap) {
    const modelId = metadataKey.split("|")[0];
    const model = sdkModels.get(modelId);
    const parentModelId = getParentResourceModelId(
      sdkContext,
      model,
    );
    const metadata = resourcePathToMetadataMap.get(metadataKey)!;
    if (parentModelId) {
      metadata.parentResourceModelId = parentModelId;
    }
  }

  // Path-based parent-child detection for same-model multi-path resources
  const allMapEntries = [...resourcePathToMetadataMap.entries()];
  for (const [metadataKey, metadata] of resourcePathToMetadataMap) {
    if (!metadata.parentResourceId && metadata.resourceIdPattern) {
      const bestParent = findLongestPrefixMatch(
        metadata.resourceIdPattern,
        allMapEntries,
        ([key, m]) =>
          key !== metadataKey ? m.resourceIdPattern || undefined : undefined,
        true,
      );
      if (bestParent) {
        metadata.parentResourceId = bestParent[1].resourceIdPattern;
      }
    }
  }

  // Update resourceScope based on decorators or Read method scope
  for (const [metadataKey, metadata] of resourcePathToMetadataMap) {
    const modelId = metadataKey.split("|")[0];
    const model = sdkModels.get(modelId);
    if (model) {
      metadata.resourceScope = getResourceScopeFromModel(
        model,
        metadata.methods,
      );
    }
  }

  // Create parent lookup context
  const parentLookup: ParentResourceLookupContext = {
    getParentResource: (
      resource: ArmResourceSchema,
    ): ArmResourceSchema | undefined => {
      const parentModelId = resource.metadata.parentResourceModelId;
      if (!parentModelId) return undefined;
      for (const r of resources) {
        if (
          r.resourceModelId === parentModelId &&
          r.metadata.resourceIdPattern
        ) {
          return r;
        }
      }
      return undefined;
    },
  };

  const nonResourceMethodsArray: NonResourceMethod[] = Array.from(
    nonResourceMethods.values(),
  );

  // Shared post-processing
  const filteredResources = postProcessArmResources(
    resources,
    nonResourceMethodsArray,
    parentLookup,
  );

  // Assign non-resource methods to resources
  assignNonResourceMethodsToResources(
    filteredResources,
    nonResourceMethodsArray,
  );

  return {
    resources: filteredResources,
    nonResourceMethods: nonResourceMethodsArray,
  };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Checks whether an `SdkModelType` represents an ARM resource by looking for
 * ARM decorator markers on the underlying TypeSpec model or its base hierarchy.
 */
function isResourceModel(model: SdkModelType): boolean {
  const rawModel = model.__raw as Model | undefined;
  if (!rawModel?.decorators) return false;

  // Check for standard ARM resource decorators
  for (const decorator of rawModel.decorators) {
    const fullName = getDecoratorFullName(decorator);
    if (
      fullName === ARM_RESOURCE_INTERNAL ||
      fullName === ARM_RESOURCE_WITH_PARAMETER
    ) {
      return true;
    }
  }

  // Check for @customAzureResource in base model hierarchy
  return hasCustomAzureResourceInHierarchy(rawModel);
}

/**
 * Checks if a model or any of its base models has the `@customAzureResource` decorator.
 * Used for legacy services converted from Swagger to TypeSpec.
 */
function hasCustomAzureResourceInHierarchy(model: Model): boolean {
  let current: Model | undefined = model;
  while (current) {
    if (
      current.decorators.some(
        (d) => getDecoratorFullName(d) === CUSTOM_AZURE_RESOURCE,
      )
    ) {
      return true;
    }
    current = current.baseModel;
  }
  return false;
}

/**
 * Returns the full qualified name of a decorator in the format `"Full.Namespace.@name"`.
 * Uses `getNamespaceFullName` from the TypeSpec compiler to resolve the complete
 * namespace chain (e.g., `"Azure.ResourceManager.Private.@armResourceInternal"`).
 */
function getDecoratorFullName(decorator: DecoratorApplication): string {
  const name = decorator.definition?.name;
  if (!name) return "";

  // Build fully qualified name using the namespace chain
  const ns = decorator.definition?.namespace;
  if (ns) {
    const fullNs = getNamespaceFullName(ns);
    if (fullNs) {
      return `${fullNs}.${name}`;
    }
  }

  return name;
}

/**
 * Returns `true` if the operation kind is a CRUD kind (Create, Read, Update, Delete).
 */
function isCRUDKind(kind: ResourceOperationKind): boolean {
  return [
    ResourceOperationKind.Read,
    ResourceOperationKind.Create,
    ResourceOperationKind.Update,
    ResourceOperationKind.Delete,
  ].includes(kind);
}

/**
 * Parses resource operation information from an SDK method's TypeSpec decorators.
 * Returns the operation kind and the associated resource model ID.
 */
function parseResourceOperation(
  serviceMethod: SdkServiceMethod<SdkHttpOperation> | undefined,
  sdkContext: SdkContext<any, SdkHttpOperation>,
): {
  kind?: ResourceOperationKind;
  modelId?: string;
} {
  const rawOperation = serviceMethod?.__raw;
  if (!rawOperation) return {};

  const decorators =
    "decorators" in rawOperation
      ? (rawOperation as Operation).decorators
      : undefined;
  if (!decorators) return {};

  for (const decorator of decorators) {
    const defName = decorator.definition?.name;
    if (!defName) continue;

    switch (defName) {
      case READS_RESOURCE:
      case ARM_RESOURCE_READ:
        return {
          kind: ResourceOperationKind.Read,
          modelId: getResourceModelIdFromDecorator(sdkContext, decorator),
        };
      case ARM_RESOURCE_CREATE_OR_UPDATE:
        return {
          kind:
            serviceMethod?.operation?.verb === "patch"
              ? ResourceOperationKind.Update
              : ResourceOperationKind.Create,
          modelId: getResourceModelIdFromDecorator(sdkContext, decorator),
        };
      case ARM_RESOURCE_UPDATE:
        return {
          kind: ResourceOperationKind.Update,
          modelId: getResourceModelIdFromDecorator(sdkContext, decorator),
        };
      case ARM_RESOURCE_DELETE:
        return {
          kind: ResourceOperationKind.Delete,
          modelId: getResourceModelIdFromDecorator(sdkContext, decorator),
        };
      case ARM_RESOURCE_LIST:
        return {
          kind: ResourceOperationKind.List,
          modelId: getResourceModelIdFromDecorator(sdkContext, decorator),
        };
      case ARM_RESOURCE_ACTION:
        return {
          kind: ResourceOperationKind.Action,
          modelId: getResourceModelIdFromDecorator(sdkContext, decorator),
        };
      case EXTENSION_RESOURCE_OPERATION:
      case LEGACY_EXTENSION_RESOURCE_OPERATION:
      case LEGACY_RESOURCE_OPERATION:
        return parseExtensionOrLegacyOperation(defName, decorator, sdkContext);
      case BUILTIN_RESOURCE_OPERATION:
        return parseBuiltInResourceOperation(decorator, sdkContext, decorators);
    }
  }
  return {};
}

/**
 * Parses extension/legacy resource operation decorators to extract kind and model ID.
 */
function parseExtensionOrLegacyOperation(
  decoratorName: string,
  decorator: any,
  sdkContext: SdkContext<any, SdkHttpOperation>,
): { kind?: ResourceOperationKind; modelId?: string } {
  const isExtension = decoratorName === EXTENSION_RESOURCE_OPERATION;
  // Extension: args[2] is kind, args[1] is model
  // Legacy/LegacyExtension: args[1] is kind, args[0] is model
  const kindArgIndex = isExtension ? 2 : 1;
  const modelArgIndex = isExtension ? 1 : 0;

  const kindValue = decorator.args[kindArgIndex]?.jsValue;
  const modelValue = decorator.args[modelArgIndex]?.value as Model | undefined;

  const kind = kindStringToResourceOperationKind(kindValue as string);
  if (!kind || !modelValue) return {};

  const modelId = getResourceModelIdCore(sdkContext, modelValue);
  return { kind, modelId };
}

/**
 * Parses `@builtInResourceOperation` decorator.
 * Args: (ParentResource, BuiltInResource, kind, ResourceName?)
 */
function parseBuiltInResourceOperation(
  decorator: any,
  sdkContext: SdkContext<any, SdkHttpOperation>,
  allDecorators: readonly any[],
): { kind?: ResourceOperationKind; modelId?: string } {
  const kindValue = decorator.args[2]?.jsValue as string;
  let kind = kindStringToResourceOperationKind(kindValue);
  if (!kind) return {};

  // Check if Read was overridden with @action
  if (
    kind === ResourceOperationKind.Read &&
    allDecorators.some((d) => d.definition?.name === "@action")
  ) {
    kind = ResourceOperationKind.Action;
  }

  const modelValue = decorator.args[1]?.value as Model | undefined;
  if (!modelValue) return {};

  const modelId = getResourceModelIdCore(sdkContext, modelValue);
  return { kind, modelId };
}

/**
 * Converts a string kind value (e.g., "read", "createOrUpdate") to a `ResourceOperationKind`.
 */
function kindStringToResourceOperationKind(
  value: string | undefined,
): ResourceOperationKind | undefined {
  switch (value) {
    case "read":
      return ResourceOperationKind.Read;
    case "createOrUpdate":
      return ResourceOperationKind.Create;
    case "update":
      return ResourceOperationKind.Update;
    case "delete":
      return ResourceOperationKind.Delete;
    case "list":
      return ResourceOperationKind.List;
    case "action":
      return ResourceOperationKind.Action;
    default:
      return undefined;
  }
}

/**
 * Extracts the resource model's cross-language definition ID from a decorator's
 * first argument (which should be the resource Model type).
 */
function getResourceModelIdFromDecorator(
  sdkContext: SdkContext<any, SdkHttpOperation>,
  decorator: any,
): string | undefined {
  if (!decorator?.args?.[0]?.value) return undefined;
  return getResourceModelIdCore(
    sdkContext,
    decorator.args[0].value as Model,
  );
}

/**
 * Resolves a TypeSpec Model to its SDK model and returns the cross-language definition ID.
 */
function getResourceModelIdCore(
  sdkContext: SdkContext<any, SdkHttpOperation>,
  model: Model,
): string | undefined {
  const sdkModel = getClientType(
    sdkContext as TCGCContext,
    model,
  ) as SdkModelType;
  return sdkModel?.crossLanguageDefinitionId;
}

/**
 * Gets the cross-language definition ID for a TypeSpec Operation.
 */
function getMethodIdFromOperation(
  sdkContext: SdkContext<any, SdkHttpOperation>,
  operation: Operation,
): string | undefined {
  return getCrossLanguageDefinitionId(sdkContext as TCGCContext, operation);
}

/**
 * Looks up the parent resource model ID from the `@parentResource` decorator
 * on the underlying TypeSpec model.
 */
function getParentResourceModelId(
  sdkContext: SdkContext<any, SdkHttpOperation>,
  model: SdkModelType | undefined,
): string | undefined {
  const rawModel = model?.__raw as Model | undefined;
  if (!rawModel?.decorators) return undefined;

  const parentDecorator = rawModel.decorators.find(
    (d) => d.definition?.name === "@parentResource",
  );
  if (!parentDecorator?.args?.[0]?.value) return undefined;

  return getResourceModelIdCore(
    sdkContext,
    parentDecorator.args[0].value as Model,
  );
}

/**
 * Extracts the singleton resource name from the `@singleton` decorator.
 * Returns the `keyValue` argument if present, otherwise `"default"`.
 */
function getSingletonResource(decorator: any): string | undefined {
  if (!decorator) return undefined;
  // The singleton decorator argument may be in different positions depending on the decorator format
  const keyValue =
    decorator.args?.[0]?.jsValue ?? decorator.args?.[0]?.value;
  if (typeof keyValue === "string" && keyValue.length > 0) {
    return keyValue;
  }
  return "default";
}

/**
 * Determines the resource scope from decorator information on the SDK model,
 * falling back to the Read method's operation scope.
 */
function getResourceScopeFromModel(
  model: SdkModelType,
  methods?: ResourceMethod[],
): ResourceScope {
  const rawModel = model.__raw as Model | undefined;
  if (rawModel?.decorators) {
    for (const decorator of rawModel.decorators) {
      const fullName = getDecoratorFullName(decorator);
      if (fullName === TENANT_RESOURCE) return ResourceScope.Tenant;
      if (fullName === SUBSCRIPTION_RESOURCE) return ResourceScope.Subscription;
      if (fullName === RESOURCE_GROUP_RESOURCE)
        return ResourceScope.ResourceGroup;
    }
  }

  // Fall back to Read method's scope
  if (methods) {
    const getMethod = methods.find(
      (m) => m.kind === ResourceOperationKind.Read,
    );
    if (getMethod) {
      return getMethod.operationScope;
    }
  }

  return ResourceScope.ResourceGroup;
}

/**
 * Recursively flattens the SDK client tree into a flat array.
 */
function traverseClient(
  client: SdkClientType<SdkServiceOperation>,
  clients: SdkClientType<SdkServiceOperation>[],
): void {
  clients.push(client);
  if (client.children) {
    for (const child of client.children) {
      traverseClient(child, clients);
    }
  }
}

/**
 * Returns all SDK clients from the SDK package, including nested children.
 */
function getAllSdkClients(
  sdkContext: SdkContext<any, SdkHttpOperation>,
): SdkClientType<SdkServiceOperation>[] {
  const clients: SdkClientType<SdkServiceOperation>[] = [];
  for (const client of sdkContext.sdkPackage.clients) {
    traverseClient(client, clients);
  }
  return clients;
}
