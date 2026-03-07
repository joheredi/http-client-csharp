/**
 * Unit tests for ARM resource metadata types and post-processing logic.
 *
 * These tests validate the shared post-processing pipeline that both
 * detection modes (legacy and resolveArmResources) use to ensure consistent
 * output. They cover:
 *
 * - Method sorting (CRUD → List → Action, then by ID)
 * - Post-processing: parent population, incomplete resource merging, scope
 *   assignment, filtering of resources without Read operations
 * - Non-resource method assignment to resources via three strategies:
 *   prefix match, model ID match, type segment match
 *
 * These tests use synthetic data (not real TypeSpec programs) to isolate
 * the post-processing logic from the detection logic.
 */
import { describe, expect, it } from "vitest";
import {
  ResourceScope,
  ResourceOperationKind,
  sortResourceMethods,
  postProcessArmResources,
  assignNonResourceMethodsToResources,
  type ArmResourceSchema,
  type ResourceMethod,
  type NonResourceMethod,
  type ParentResourceLookupContext,
} from "../../src/utils/resource-metadata.js";

describe("sortResourceMethods", () => {
  /**
   * Validates deterministic method ordering in generated code.
   * Methods must be sorted by kind (Create→Read→Update→Delete→List→Action)
   * then by methodId alphabetically.
   */
  it("sorts methods by kind then by methodId", () => {
    const methods: ResourceMethod[] = [
      {
        methodId: "z-action",
        kind: ResourceOperationKind.Action,
        operationPath: "/foo",
        operationScope: ResourceScope.ResourceGroup,
      },
      {
        methodId: "a-read",
        kind: ResourceOperationKind.Read,
        operationPath: "/foo",
        operationScope: ResourceScope.ResourceGroup,
      },
      {
        methodId: "m-create",
        kind: ResourceOperationKind.Create,
        operationPath: "/foo",
        operationScope: ResourceScope.ResourceGroup,
      },
      {
        methodId: "b-list",
        kind: ResourceOperationKind.List,
        operationPath: "/foo",
        operationScope: ResourceScope.ResourceGroup,
      },
      {
        methodId: "c-delete",
        kind: ResourceOperationKind.Delete,
        operationPath: "/foo",
        operationScope: ResourceScope.ResourceGroup,
      },
    ];

    sortResourceMethods(methods);

    expect(methods.map((m) => m.kind)).toEqual([
      ResourceOperationKind.Create,
      ResourceOperationKind.Read,
      ResourceOperationKind.Delete,
      ResourceOperationKind.List,
      ResourceOperationKind.Action,
    ]);
  });

  it("sorts alphabetically within the same kind", () => {
    const methods: ResourceMethod[] = [
      {
        methodId: "z-list",
        kind: ResourceOperationKind.List,
        operationPath: "/foo",
        operationScope: ResourceScope.ResourceGroup,
      },
      {
        methodId: "a-list",
        kind: ResourceOperationKind.List,
        operationPath: "/bar",
        operationScope: ResourceScope.Subscription,
      },
    ];

    sortResourceMethods(methods);

    expect(methods.map((m) => m.methodId)).toEqual(["a-list", "z-list"]);
  });
});

describe("postProcessArmResources", () => {
  const noopParentLookup: ParentResourceLookupContext = {
    getParentResource: () => undefined,
  };

  /**
   * Resources without a resourceIdPattern are "incomplete" — they don't have
   * a URL identity. If they share a model ID with a valid resource, their
   * methods should be merged into the valid sibling.
   */
  it("merges incomplete resources into siblings with matching model ID", () => {
    const validResource: ArmResourceSchema = {
      resourceModelId: "model-1",
      metadata: {
        resourceIdPattern:
          "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}",
        resourceType: "Microsoft.Foo/bars",
        methods: [
          {
            methodId: "read",
            kind: ResourceOperationKind.Read,
            operationPath:
              "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}",
            operationScope: ResourceScope.ResourceGroup,
          },
        ],
        resourceScope: ResourceScope.ResourceGroup,
        resourceName: "Bar",
      },
    };

    const incompleteResource: ArmResourceSchema = {
      resourceModelId: "model-1",
      metadata: {
        resourceIdPattern: "",
        resourceType: "",
        methods: [
          {
            methodId: "list-by-sub",
            kind: ResourceOperationKind.List,
            operationPath: "/subscriptions/{id}/providers/Microsoft.Foo/bars",
            operationScope: ResourceScope.Subscription,
          },
        ],
        resourceScope: ResourceScope.ResourceGroup,
        resourceName: "Bar",
      },
    };

    const nonResourceMethods: NonResourceMethod[] = [];
    const result = postProcessArmResources(
      [validResource, incompleteResource],
      nonResourceMethods,
      noopParentLookup,
    );

    // Should merge the list method into the valid resource
    expect(result).toHaveLength(1);
    expect(result[0].metadata.methods).toHaveLength(2);
    expect(nonResourceMethods).toHaveLength(0);
  });

  /**
   * Non-singleton resources without a Read operation are filtered out.
   * Their methods are moved to the parent resource (as Action) or to
   * non-resource methods if no parent exists.
   */
  it("filters out non-singleton resources without Read operations", () => {
    const parentResource: ArmResourceSchema = {
      resourceModelId: "parent-model",
      metadata: {
        resourceIdPattern:
          "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}",
        resourceType: "Microsoft.Foo/bars",
        methods: [
          {
            methodId: "read",
            kind: ResourceOperationKind.Read,
            operationPath:
              "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}",
            operationScope: ResourceScope.ResourceGroup,
          },
        ],
        resourceScope: ResourceScope.ResourceGroup,
        resourceName: "Bar",
      },
    };

    const noReadResource: ArmResourceSchema = {
      resourceModelId: "child-model",
      metadata: {
        resourceIdPattern:
          "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}/bazzes/{baz}",
        resourceType: "Microsoft.Foo/bars/bazzes",
        methods: [
          {
            methodId: "create",
            kind: ResourceOperationKind.Create,
            operationPath:
              "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}/bazzes/{baz}",
            operationScope: ResourceScope.ResourceGroup,
          },
        ],
        resourceScope: ResourceScope.ResourceGroup,
        parentResourceId: parentResource.metadata.resourceIdPattern,
        parentResourceModelId: "parent-model",
        resourceName: "Baz",
      },
    };

    const nonResourceMethods: NonResourceMethod[] = [];
    const result = postProcessArmResources(
      [parentResource, noReadResource],
      nonResourceMethods,
      noopParentLookup,
    );

    // Only parent should remain; child's create method moved to parent as Action
    expect(result).toHaveLength(1);
    expect(result[0].resourceModelId).toBe("parent-model");
    const actionMethods = result[0].metadata.methods.filter(
      (m) => m.kind === ResourceOperationKind.Action,
    );
    expect(actionMethods).toHaveLength(1);
    expect(actionMethods[0].methodId).toBe("create");
  });

  /**
   * Singleton resources (those with singletonResourceName set) are kept
   * even without a Read operation. This is important because singleton
   * resources like "default" settings exist without Get operations.
   */
  it("keeps singleton resources even without Read operations", () => {
    const singletonResource: ArmResourceSchema = {
      resourceModelId: "singleton-model",
      metadata: {
        resourceIdPattern:
          "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}/settings/default",
        resourceType: "Microsoft.Foo/bars/settings",
        methods: [
          {
            methodId: "create",
            kind: ResourceOperationKind.Create,
            operationPath:
              "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}/settings/default",
            operationScope: ResourceScope.ResourceGroup,
          },
        ],
        resourceScope: ResourceScope.ResourceGroup,
        singletonResourceName: "default",
        resourceName: "Settings",
      },
    };

    const nonResourceMethods: NonResourceMethod[] = [];
    const result = postProcessArmResources(
      [singletonResource],
      nonResourceMethods,
      noopParentLookup,
    );

    expect(result).toHaveLength(1);
    expect(result[0].metadata.singletonResourceName).toBe("default");
  });
});

describe("assignNonResourceMethodsToResources", () => {
  /**
   * Strategy 1: Prefix matching. When a non-resource method's path has
   * a proper prefix matching a resource's resourceIdPattern, move it
   * to that resource as an Action.
   */
  it("assigns non-resource methods via prefix matching", () => {
    const resource: ArmResourceSchema = {
      resourceModelId: "model-1",
      metadata: {
        resourceIdPattern:
          "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}",
        resourceType: "Microsoft.Foo/bars",
        methods: [],
        resourceScope: ResourceScope.ResourceGroup,
        resourceName: "Bar",
      },
    };

    const nonResourceMethods: NonResourceMethod[] = [
      {
        methodId: "restart",
        operationPath:
          "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}/restart",
        operationScope: ResourceScope.ResourceGroup,
      },
    ];

    assignNonResourceMethodsToResources([resource], nonResourceMethods);

    // Method should be moved to the resource as Action
    expect(nonResourceMethods).toHaveLength(0);
    expect(resource.metadata.methods).toHaveLength(1);
    expect(resource.metadata.methods[0].kind).toBe(
      ResourceOperationKind.Action,
    );
    expect(resource.metadata.methods[0].methodId).toBe("restart");
  });

  /**
   * Strategy 2: Model ID matching. When prefix matching fails but the
   * method has a resourceModelId, match to a resource with the same model.
   */
  it("assigns non-resource methods via model ID matching", () => {
    const resource: ArmResourceSchema = {
      resourceModelId: "model-1",
      metadata: {
        resourceIdPattern:
          "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}",
        resourceType: "Microsoft.Foo/bars",
        methods: [],
        resourceScope: ResourceScope.ResourceGroup,
        resourceName: "Bar",
      },
    };

    const nonResourceMethods: NonResourceMethod[] = [
      {
        methodId: "list-by-sub",
        operationPath: "/subscriptions/{id}/providers/Microsoft.Foo/bars",
        operationScope: ResourceScope.Subscription,
        resourceModelId: "model-1",
      },
    ];

    assignNonResourceMethodsToResources([resource], nonResourceMethods);

    expect(nonResourceMethods).toHaveLength(0);
    expect(resource.metadata.methods).toHaveLength(1);
    expect(resource.metadata.methods[0].kind).toBe(ResourceOperationKind.List);
  });

  /**
   * Strategy 3: Type segment matching. When both prefix and model ID fail,
   * match the method's last path segment against each resource's type segment.
   * This handles extension resources with structural path mismatches.
   */
  it("assigns non-resource methods via type segment matching", () => {
    const resource: ArmResourceSchema = {
      resourceModelId: "model-1",
      metadata: {
        resourceIdPattern:
          "/subscriptions/{id}/resourceGroups/{rg}/providers/Microsoft.Foo/bars/{barName}",
        resourceType: "Microsoft.Foo/bars",
        methods: [],
        resourceScope: ResourceScope.ResourceGroup,
        resourceName: "Bar",
      },
    };

    const nonResourceMethods: NonResourceMethod[] = [
      {
        methodId: "list-bars",
        operationPath: "/{scope}/providers/Microsoft.Foo/bars",
        operationScope: ResourceScope.Extension,
        // No resourceModelId — will fall through to type segment matching
      },
    ];

    assignNonResourceMethodsToResources([resource], nonResourceMethods);

    expect(nonResourceMethods).toHaveLength(0);
    expect(resource.metadata.methods).toHaveLength(1);
    expect(resource.metadata.methods[0].kind).toBe(ResourceOperationKind.List);
  });
});
