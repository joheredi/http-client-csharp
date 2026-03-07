/**
 * Types, enums, and shared post-processing logic for ARM resource metadata.
 *
 * This module defines the data structures used to represent ARM resources detected
 * from TypeSpec definitions. The types form the **ArmProviderSchema** — a unified
 * structure that downstream components consume to generate ARM resource classes,
 * collections, and CRUD operations.
 *
 * Post-processing functions are shared between both detection modes (legacy and
 * resolveArmResources) to ensure consistent behavior.
 *
 * @module
 */

import {
  findLongestPrefixMatch,
  getLastPathSegment,
  getResourceTypeSegment,
  isVariableSegment,
} from "./arm-path-utils.js";

// ─── Enums ───────────────────────────────────────────────────────────────────

/**
 * Deployment scope for an ARM resource.
 * Determines the URL prefix and management hierarchy level.
 */
export enum ResourceScope {
  Tenant = "Tenant",
  Subscription = "Subscription",
  ResourceGroup = "ResourceGroup",
  ManagementGroup = "ManagementGroup",
  Extension = "Extension",
}

/**
 * Kind of ARM resource operation (CRUD + List + Action).
 * Used to classify operations and determine their role in the resource lifecycle.
 */
export enum ResourceOperationKind {
  Action = "Action",
  Create = "Create",
  Delete = "Delete",
  Read = "Read",
  List = "List",
  Update = "Update",
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Describes a single method on an ARM resource (e.g., Get, CreateOrUpdate, List).
 */
export interface ResourceMethod {
  /** Cross-language definition ID of the corresponding SDK method. */
  methodId: string;
  /** Operation kind (Create, Read, Update, Delete, List, Action). */
  kind: ResourceOperationKind;
  /** Full URL path pattern for this operation. */
  operationPath: string;
  /** Deployment scope of this specific operation. */
  operationScope: ResourceScope;
  /**
   * The resource instance path that scopes this method.
   * May be a parent resource's path for list/action operations.
   */
  resourceScope?: string;
}

/**
 * Describes a method that doesn't belong to any detected ARM resource.
 * These are provider-level operations or orphaned methods.
 */
export interface NonResourceMethod {
  /** Cross-language definition ID of the corresponding SDK method. */
  methodId: string;
  /** Full URL path pattern for this operation. */
  operationPath: string;
  /** Deployment scope of this operation. */
  operationScope: ResourceScope;
  /** Cross-language definition ID of the resource model this method originally belonged to. */
  resourceModelId?: string;
}

/**
 * Metadata describing an ARM resource: its identity, operations, scope, and relationships.
 */
export interface ResourceMetadata {
  /**
   * The URL path pattern for this resource's instance operations.
   * Example: `/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}`
   */
  resourceIdPattern: string;
  /**
   * The ARM resource type string.
   * Example: `"Microsoft.Foo/bars"` or `"Microsoft.Foo/bars/bazzes"` for nested resources.
   */
  resourceType: string;
  /** All methods (CRUD, List, Action) associated with this resource. */
  methods: ResourceMethod[];
  /** Deployment scope of the resource itself. */
  resourceScope: ResourceScope;
  /** Resource ID pattern of the parent resource, if this is a child resource. */
  parentResourceId?: string;
  /** Cross-language definition ID of the parent resource's model. */
  parentResourceModelId?: string;
  /** If this is a singleton resource, the fixed name segment (e.g. `"default"`). */
  singletonResourceName?: string;
  /** Display name of the resource (PascalCase, e.g. `"VirtualMachine"`). */
  resourceName: string;
}

/**
 * Represents a single resource entry in the ARM provider schema.
 * Pairs a model identity with its full metadata.
 */
export interface ArmResourceSchema {
  /** Cross-language definition ID of the resource's TypeSpec model. */
  resourceModelId: string;
  /** Full metadata for this resource. */
  metadata: ResourceMetadata;
}

/**
 * Complete ARM provider schema containing all detected resources and non-resource methods.
 * This is the top-level output of the resource detection pipeline.
 */
export interface ArmProviderSchema {
  /** All detected ARM resources. */
  resources: ArmResourceSchema[];
  /** Methods that couldn't be assigned to any resource. */
  nonResourceMethods: NonResourceMethod[];
}

/**
 * Strategy for looking up a resource's parent during post-processing.
 * Different detection modes provide parent information differently
 * (decorators vs. resolved tree).
 */
export interface ParentResourceLookupContext {
  /**
   * Returns the parent resource for a given resource, or `undefined` if none.
   */
  getParentResource(resource: ArmResourceSchema): ArmResourceSchema | undefined;
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

/**
 * Returns the sort order for a resource operation kind.
 * Create first, then other CRUD operations, then List, then Action.
 */
function getKindSortOrder(kind: ResourceOperationKind): number {
  switch (kind) {
    case ResourceOperationKind.Create:
      return 1;
    case ResourceOperationKind.Read:
      return 2;
    case ResourceOperationKind.Update:
      return 3;
    case ResourceOperationKind.Delete:
      return 4;
    case ResourceOperationKind.List:
      return 5;
    case ResourceOperationKind.Action:
      return 6;
    default:
      return 99;
  }
}

/**
 * Sorts resource methods by kind (CRUD → List → Action) then by methodId.
 * Ensures deterministic ordering of methods in generated code.
 *
 * @param methods - Array to sort in-place.
 */
export function sortResourceMethods(methods: ResourceMethod[]): void {
  methods.sort((a, b) => {
    const kindOrderA = getKindSortOrder(a.kind);
    const kindOrderB = getKindSortOrder(b.kind);
    if (kindOrderA !== kindOrderB) {
      return kindOrderA - kindOrderB;
    }
    return a.methodId.localeCompare(b.methodId);
  });
}

// ─── Post-processing ─────────────────────────────────────────────────────────

/**
 * Determines if a resource path can serve as the scope for a list operation.
 * The resource path segments must form a prefix of the list operation's path.
 * Variable segments in corresponding positions are considered matching.
 */
function canBeListResourceScope(
  listPathSegments: string[],
  resourceInstancePathSegments: string[],
): boolean {
  if (listPathSegments.length < resourceInstancePathSegments.length) {
    return false;
  }
  for (let i = 0; i < resourceInstancePathSegments.length; i++) {
    // Both segments are variables → match
    if (
      isVariableSegment(listPathSegments[i]) &&
      isVariableSegment(resourceInstancePathSegments[i])
    ) {
      continue;
    }
    // One is a variable and the other is not → no match
    if (
      isVariableSegment(listPathSegments[i]) ||
      isVariableSegment(resourceInstancePathSegments[i])
    ) {
      return false;
    }
    // Both are fixed strings → must match exactly
    if (listPathSegments[i] !== resourceInstancePathSegments[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Post-processes ARM resources to populate parent IDs, merge incomplete resources,
 * populate resource scopes, sort methods, and filter invalid resources.
 *
 * This shared post-processing step is used by both `resolveArmResources` and
 * `buildArmProviderSchema` to ensure consistent behavior.
 *
 * Processing steps:
 * 1. Separate valid resources (with resourceIdPattern) from incomplete ones
 * 2. Populate parentResourceId using the provided lookup context
 * 3. Merge incomplete resources into parents or siblings
 * 4. Populate resourceScope for all methods (prefix-match against known resources)
 * 5. Special-case scope assignment for list operations
 * 6. Sort methods for deterministic ordering
 * 7. Filter out non-singleton resources without Read operations
 *
 * @param resources        - Initial list of resources to process (may include incomplete entries).
 * @param nonResourceMethods - Array to collect non-resource methods (mutated in place).
 * @param parentLookup     - Strategy for looking up parent resources.
 * @returns Processed list of valid resources.
 */
export function postProcessArmResources(
  resources: ArmResourceSchema[],
  nonResourceMethods: NonResourceMethod[],
  parentLookup: ParentResourceLookupContext,
): ArmResourceSchema[] {
  // Step 1: Separate valid from incomplete resources
  const validResources = resources.filter(
    (r) => r.metadata.resourceIdPattern !== "",
  );
  const incompleteResources = resources.filter(
    (r) => r.metadata.resourceIdPattern === "",
  );

  // Step 2: Populate parentResourceId
  const validResourceMap = new Map<string, ArmResourceSchema>();
  for (const resource of validResources) {
    validResourceMap.set(resource.metadata.resourceIdPattern, resource);
  }

  for (const resource of resources) {
    // Skip if parentResourceId was already set by the caller (e.g., path-based
    // detection in legacy mode). Preserves scope-accurate parent assignments for
    // cross-scope resources where the same model exists at multiple scopes.
    if (resource.metadata.parentResourceId) continue;

    const parentResource = parentLookup.getParentResource(resource);
    if (
      parentResource &&
      validResourceMap.has(parentResource.metadata.resourceIdPattern)
    ) {
      const parent = validResourceMap.get(
        parentResource.metadata.resourceIdPattern,
      );
      if (parent) {
        resource.metadata.parentResourceId = parent.metadata.resourceIdPattern;
        resource.metadata.parentResourceModelId = parent.resourceModelId;
      }
    }
  }

  // Step 3: Merge incomplete resources to parents or siblings
  for (const resource of incompleteResources) {
    const metadata = resource.metadata;
    let merged = false;

    // Try to merge with parent if it exists
    if (metadata.parentResourceModelId) {
      const parent = validResources.find(
        (r) => r.resourceModelId === metadata.parentResourceModelId,
      );
      if (parent) {
        parent.metadata.methods.push(...metadata.methods);
        merged = true;
      }
    }

    if (!merged) {
      // No parent or parent not found — try sibling with same model
      const sibling = validResources.find(
        (r) => r.resourceModelId === resource.resourceModelId,
      );
      if (sibling) {
        sibling.metadata.methods.push(...metadata.methods);
        merged = true;
      }
    }

    // If no merge target, treat all methods as non-resource
    if (!merged) {
      for (const method of metadata.methods) {
        nonResourceMethods.push({
          methodId: method.methodId,
          operationPath: method.operationPath,
          operationScope: method.operationScope,
          resourceModelId: resource.resourceModelId,
        });
      }
    }
  }

  // Step 4: Populate resourceScope for all methods
  for (const resource of validResources) {
    for (const method of resource.metadata.methods) {
      const bestMatch = findLongestPrefixMatch(
        method.operationPath,
        validResources,
        (r) => r.metadata.resourceIdPattern || undefined,
      );
      if (bestMatch) {
        method.resourceScope = bestMatch.metadata.resourceIdPattern;
      }
    }
  }

  // Step 5: Populate resourceScope for list operations specifically
  const listOperations: ResourceMethod[] = [];
  for (const resource of validResources) {
    for (const method of resource.metadata.methods) {
      if (method.kind === ResourceOperationKind.List) {
        listOperations.push(method);
      }
    }
  }

  const resourceInstancePaths: Array<string[]> = validResources.map((r) =>
    r.metadata.resourceIdPattern.split("/").filter((s) => s.length > 0),
  );

  for (const listOp of listOperations) {
    const validCandidates: Array<string[]> = [];
    const listOperationPathSegments = listOp.operationPath
      .split("/")
      .filter((s) => s.length > 0);

    for (const candidatePath of resourceInstancePaths) {
      if (canBeListResourceScope(listOperationPathSegments, candidatePath)) {
        validCandidates.push(candidatePath);
      }
    }

    // Take the longest matching path as the resourceScope
    if (validCandidates.length > 0) {
      validCandidates.sort((a, b) => b.length - a.length);
      listOp.resourceScope = "/" + validCandidates[0].join("/");
    }
  }

  // Step 6: Sort methods in all valid resources for deterministic ordering
  for (const resource of validResources) {
    sortResourceMethods(resource.metadata.methods);
  }

  // Step 7: Filter out resources without Get/Read operations (non-singleton only)
  const filteredResources: ArmResourceSchema[] = [];
  for (const resource of validResources) {
    const hasReadOperation = resource.metadata.methods.some(
      (m) => m.kind === ResourceOperationKind.Read,
    );
    if (!hasReadOperation && !resource.metadata.singletonResourceName) {
      // Move methods to parent resource or to non-resource methods
      let movedToParent = false;

      if (resource.metadata.parentResourceId) {
        const parent = validResources.find(
          (r) =>
            r.metadata.resourceIdPattern === resource.metadata.parentResourceId,
        );
        if (parent) {
          // Convert to Action kind to avoid naming conflicts with parent's own methods
          for (const method of resource.metadata.methods) {
            const movedMethod: ResourceMethod = {
              ...method,
              kind: ResourceOperationKind.Action,
            };
            parent.metadata.methods.push(movedMethod);
          }
          movedToParent = true;
        }
      }

      if (!movedToParent) {
        for (const method of resource.metadata.methods) {
          nonResourceMethods.push({
            methodId: method.methodId,
            operationPath: method.operationPath,
            operationScope: method.operationScope,
            resourceModelId: resource.resourceModelId,
          });
        }
      }
      continue;
    }
    filteredResources.push(resource);
  }

  // Re-sort methods in resources that may have received additional methods
  for (const resource of filteredResources) {
    sortResourceMethods(resource.metadata.methods);
  }

  return filteredResources;
}

/**
 * Assigns non-resource methods to resources based on three matching strategies:
 *
 * 1. **Prefix matching**: If the method's operationPath has a prefix matching a resource's
 *    resourceIdPattern, move it to that resource as an Action.
 * 2. **Resource model ID matching**: If prefix fails but the method has a resourceModelId,
 *    match to a resource with the same model ID as a List operation.
 * 3. **Type segment matching**: Compare the method's last path segment against each
 *    resource's type segment (second-to-last of resourceIdPattern).
 *
 * @param resources          - The list of valid resources (methods may be added).
 * @param nonResourceMethods - The array of non-resource methods (matched ones removed).
 */
export function assignNonResourceMethodsToResources(
  resources: ArmResourceSchema[],
  nonResourceMethods: NonResourceMethod[],
): void {
  const methodsToRemove = new Set<string>();

  for (const method of nonResourceMethods) {
    // Strategy 1: Prefix matching
    const bestMatch = findLongestPrefixMatch(
      method.operationPath,
      resources,
      (r) => r.metadata.resourceIdPattern || undefined,
      true,
    );

    if (bestMatch) {
      bestMatch.metadata.methods.push({
        methodId: method.methodId,
        kind: ResourceOperationKind.Action,
        operationPath: method.operationPath,
        operationScope: method.operationScope,
        resourceScope: bestMatch.metadata.resourceIdPattern,
      });
      methodsToRemove.add(method.methodId);
    } else if (method.resourceModelId) {
      // Strategy 2: Model ID matching
      const match = resources.find(
        (r) => r.resourceModelId === method.resourceModelId,
      );
      if (match) {
        match.metadata.methods.push({
          methodId: method.methodId,
          kind: ResourceOperationKind.List,
          operationPath: method.operationPath,
          operationScope: method.operationScope,
          resourceScope: undefined,
        });
        methodsToRemove.add(method.methodId);
      }
    } else {
      // Strategy 3: Type segment matching
      const lastSegment = getLastPathSegment(method.operationPath);
      if (lastSegment) {
        const match = resources.find((r) => {
          const typeSegment = getResourceTypeSegment(
            r.metadata.resourceIdPattern,
          );
          return typeSegment?.toLowerCase() === lastSegment.toLowerCase();
        });
        if (match) {
          match.metadata.methods.push({
            methodId: method.methodId,
            kind: ResourceOperationKind.List,
            operationPath: method.operationPath,
            operationScope: method.operationScope,
            resourceScope: undefined,
          });
          methodsToRemove.add(method.methodId);
        }
      }
    }
  }

  // Remove matched methods and re-sort
  if (methodsToRemove.size > 0) {
    for (let i = nonResourceMethods.length - 1; i >= 0; i--) {
      if (methodsToRemove.has(nonResourceMethods[i].methodId)) {
        nonResourceMethods.splice(i, 1);
      }
    }

    for (const resource of resources) {
      sortResourceMethods(resource.metadata.methods);
    }
  }
}
