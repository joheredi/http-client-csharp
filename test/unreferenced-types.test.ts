import type {
  SdkClientType,
  SdkEnumType,
  SdkHttpOperation,
  SdkModelPropertyType,
  SdkModelType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { describe, expect, it } from "vitest";
import {
  applyUnreferencedTypeHandling,
  collectRootTypes,
  extractModelOrEnumTypes,
  findReachableTypes,
  getDirectReferences,
} from "../src/utils/unreferenced-types.js";

// --- Mock helpers ---

/**
 * Creates a minimal mock SdkModelType for testing. Only populates fields
 * that the unreferenced-types-handling logic actually inspects.
 */
function createMockModel(
  name: string,
  overrides: Partial<SdkModelType> = {},
): SdkModelType {
  return {
    kind: "model",
    name,
    properties: [],
    access: "public",
    usage: 0,
    namespace: "TestNamespace",
    crossLanguageDefinitionId: `TestNamespace.${name}`,
    apiVersions: [],
    isGeneratedName: false,
    serializationOptions: {},
    ...overrides,
  } as SdkModelType;
}

/**
 * Creates a minimal mock SdkEnumType for testing.
 */
function createMockEnum(
  name: string,
  overrides: Partial<SdkEnumType> = {},
): SdkEnumType {
  return {
    kind: "enum",
    name,
    values: [],
    access: "public",
    usage: 0,
    namespace: "TestNamespace",
    valueType: { kind: "string" },
    isFixed: true,
    isFlags: false,
    crossLanguageDefinitionId: `TestNamespace.${name}`,
    apiVersions: [],
    isGeneratedName: false,
    isUnionAsEnum: false,
    ...overrides,
  } as SdkEnumType;
}

/**
 * Creates a minimal mock SdkClientType for testing.
 */
function createMockClient(
  methods: unknown[],
  children?: SdkClientType<SdkHttpOperation>[],
): SdkClientType<SdkHttpOperation> {
  return {
    kind: "client",
    name: "TestClient",
    namespace: "TestNamespace",
    methods,
    apiVersions: [],
    crossLanguageDefinitionId: "TestNamespace.TestClient",
    clientInitialization: {},
    children,
    __raw: {},
    decorators: [],
  } as unknown as SdkClientType<SdkHttpOperation>;
}

/**
 * Creates a mock model property with the given type.
 */
function createMockProperty(name: string, type: SdkType): SdkModelPropertyType {
  return {
    kind: "property",
    name,
    type,
    optional: false,
    discriminator: false,
    access: "public",
    apiVersions: [],
    isGeneratedName: false,
    crossLanguageDefinitionId: `TestNamespace.${name}`,
    onClient: false,
    isApiVersionParam: false,
    flatten: false,
    serializationOptions: {},
    serializedName: name,
    isMultipartFileInput: false,
    decorators: [],
  } as unknown as SdkModelPropertyType;
}

// --- Tests ---

/**
 * The default mock operation object for test methods.
 * Includes empty responses/exceptions arrays to match the SdkHttpOperation interface.
 */
const mockOperation = { responses: [], exceptions: [] };

/**
 * Tests for extractModelOrEnumTypes — verifies that model/enum types
 * are correctly extracted from compound SdkType wrappers (arrays, dicts,
 * nullables, unions). This is critical because type references in TCGC
 * are often wrapped in container types.
 */
describe("extractModelOrEnumTypes", () => {
  it("extracts model type directly", () => {
    const model = createMockModel("Widget");
    const result = extractModelOrEnumTypes(model);
    expect(result).toEqual([model]);
  });

  it("extracts enum type directly", () => {
    const enumType = createMockEnum("Color");
    const result = extractModelOrEnumTypes(enumType);
    expect(result).toEqual([enumType]);
  });

  it("unwraps array type to get inner model", () => {
    const model = createMockModel("Widget");
    const arrayType: SdkType = { kind: "array", valueType: model } as SdkType;
    const result = extractModelOrEnumTypes(arrayType);
    expect(result).toEqual([model]);
  });

  it("unwraps dictionary type to get value model", () => {
    const model = createMockModel("Widget");
    const dictType: SdkType = {
      kind: "dict",
      keyType: { kind: "string" } as SdkType,
      valueType: model,
    } as SdkType;
    const result = extractModelOrEnumTypes(dictType);
    expect(result).toEqual([model]);
  });

  it("unwraps nullable type", () => {
    const model = createMockModel("Widget");
    const nullableType: SdkType = {
      kind: "nullable",
      type: model,
    } as SdkType;
    const result = extractModelOrEnumTypes(nullableType);
    expect(result).toEqual([model]);
  });

  it("extracts all variant types from union", () => {
    const model = createMockModel("Widget");
    const enumType = createMockEnum("Color");
    const unionType: SdkType = {
      kind: "union",
      variantTypes: [model, enumType],
    } as SdkType;
    const result = extractModelOrEnumTypes(unionType);
    expect(result).toEqual([model, enumType]);
  });

  it("returns empty array for scalar types", () => {
    const stringType: SdkType = { kind: "string" } as SdkType;
    expect(extractModelOrEnumTypes(stringType)).toEqual([]);

    const intType: SdkType = { kind: "int32" } as SdkType;
    expect(extractModelOrEnumTypes(intType)).toEqual([]);
  });

  it("unwraps nested container types", () => {
    const model = createMockModel("Widget");
    // Array of nullable models: Widget?[]
    const nestedType: SdkType = {
      kind: "array",
      valueType: { kind: "nullable", type: model } as SdkType,
    } as SdkType;
    const result = extractModelOrEnumTypes(nestedType);
    expect(result).toEqual([model]);
  });
});

/**
 * Tests for getDirectReferences — verifies that all immediate type
 * references from a model are collected (properties, base model,
 * discriminated subtypes, additional properties). This is the foundation
 * of the reference graph used for BFS reachability analysis.
 */
describe("getDirectReferences", () => {
  it("collects property type references", () => {
    const referencedModel = createMockModel("Part");
    const model = createMockModel("Widget", {
      properties: [createMockProperty("part", referencedModel)],
    });

    const refs = getDirectReferences(model);
    expect(refs).toContain(referencedModel);
  });

  it("collects base model reference", () => {
    const baseModel = createMockModel("Base");
    const model = createMockModel("Derived", { baseModel });

    const refs = getDirectReferences(model);
    expect(refs).toContain(baseModel);
  });

  it("collects discriminated subtype references", () => {
    const subtype1 = createMockModel("Cat");
    const subtype2 = createMockModel("Dog");
    const model = createMockModel("Animal", {
      discriminatedSubtypes: { cat: subtype1, dog: subtype2 },
    });

    const refs = getDirectReferences(model);
    expect(refs).toContain(subtype1);
    expect(refs).toContain(subtype2);
  });

  it("collects additional properties type reference", () => {
    const valueModel = createMockModel("Value");
    const model = createMockModel("Container", {
      additionalProperties: valueModel,
    });

    const refs = getDirectReferences(model);
    expect(refs).toContain(valueModel);
  });

  it("unwraps container types in properties", () => {
    const innerModel = createMockModel("Item");
    const arrayType: SdkType = {
      kind: "array",
      valueType: innerModel,
    } as SdkType;
    const model = createMockModel("List", {
      properties: [createMockProperty("items", arrayType)],
    });

    const refs = getDirectReferences(model);
    expect(refs).toContain(innerModel);
  });

  it("returns empty array for model with no references", () => {
    const model = createMockModel("Simple", {
      properties: [createMockProperty("name", { kind: "string" } as SdkType)],
    });

    const refs = getDirectReferences(model);
    expect(refs).toEqual([]);
  });
});

/**
 * Tests for collectRootTypes — verifies that types directly used in
 * operation signatures (parameters, responses, exceptions) are correctly
 * identified as root types. Root types form the starting points for BFS
 * reachability analysis.
 */
describe("collectRootTypes", () => {
  it("collects types from method parameters", () => {
    const paramModel = createMockModel("Request");
    const client = createMockClient([
      {
        kind: "basic",
        operation: mockOperation,
        parameters: [{ type: paramModel }],
        response: {},
      },
    ]);

    const roots = collectRootTypes([client]);
    expect(roots.has(paramModel)).toBe(true);
  });

  it("collects types from method responses", () => {
    const responseModel = createMockModel("Response");
    const client = createMockClient([
      {
        kind: "basic",
        operation: mockOperation,
        parameters: [],
        response: { type: responseModel },
      },
    ]);

    const roots = collectRootTypes([client]);
    expect(roots.has(responseModel)).toBe(true);
  });

  it("collects types from method exceptions", () => {
    const errorModel = createMockModel("ErrorResponse");
    const client = createMockClient([
      {
        kind: "basic",
        operation: mockOperation,
        parameters: [],
        response: {},
        exception: { type: errorModel },
      },
    ]);

    const roots = collectRootTypes([client]);
    expect(roots.has(errorModel)).toBe(true);
  });

  it("processes child clients recursively", () => {
    const childModel = createMockModel("ChildResponse");
    const childClient = createMockClient([
      {
        kind: "basic",
        operation: mockOperation,
        parameters: [],
        response: { type: childModel },
      },
    ]);
    const parentClient = createMockClient([], [childClient]);

    const roots = collectRootTypes([parentClient]);
    expect(roots.has(childModel)).toBe(true);
  });

  it("unwraps array parameter types", () => {
    const model = createMockModel("Item");
    const client = createMockClient([
      {
        kind: "basic",
        operation: mockOperation,
        parameters: [{ type: { kind: "array", valueType: model } as SdkType }],
        response: {},
      },
    ]);

    const roots = collectRootTypes([client]);
    expect(roots.has(model)).toBe(true);
  });

  it("handles methods with no response type", () => {
    const client = createMockClient([
      {
        kind: "basic",
        operation: mockOperation,
        parameters: [],
        response: {},
      },
    ]);

    const roots = collectRootTypes([client]);
    expect(roots.size).toBe(0);
  });
});

/**
 * Tests for findReachableTypes — verifies BFS traversal from root types
 * through the reference graph. This is the core algorithm that determines
 * which types are "referenced" (reachable from operations) and which are
 * "unreferenced" (not reachable).
 */
describe("findReachableTypes", () => {
  it("includes root types in reachable set", () => {
    const model = createMockModel("Widget");
    const roots = new Set<SdkModelType | SdkEnumType>([model]);

    const reachable = findReachableTypes(roots);
    expect(reachable.has(model)).toBe(true);
  });

  it("follows property references", () => {
    const innerModel = createMockModel("Part");
    const rootModel = createMockModel("Widget", {
      properties: [createMockProperty("part", innerModel)],
    });
    const roots = new Set<SdkModelType | SdkEnumType>([rootModel]);

    const reachable = findReachableTypes(roots);
    expect(reachable.has(rootModel)).toBe(true);
    expect(reachable.has(innerModel)).toBe(true);
  });

  it("follows base model references", () => {
    const baseModel = createMockModel("Base");
    const rootModel = createMockModel("Derived", { baseModel });
    const roots = new Set<SdkModelType | SdkEnumType>([rootModel]);

    const reachable = findReachableTypes(roots);
    expect(reachable.has(baseModel)).toBe(true);
  });

  it("follows discriminated subtype references", () => {
    const subtype = createMockModel("Cat");
    const rootModel = createMockModel("Animal", {
      discriminatedSubtypes: { cat: subtype },
    });
    const roots = new Set<SdkModelType | SdkEnumType>([rootModel]);

    const reachable = findReachableTypes(roots);
    expect(reachable.has(subtype)).toBe(true);
  });

  it("follows multi-hop references", () => {
    const leaf = createMockModel("Leaf");
    const middle = createMockModel("Middle", {
      properties: [createMockProperty("leaf", leaf)],
    });
    const root = createMockModel("Root", {
      properties: [createMockProperty("middle", middle)],
    });
    const roots = new Set<SdkModelType | SdkEnumType>([root]);

    const reachable = findReachableTypes(roots);
    expect(reachable.has(root)).toBe(true);
    expect(reachable.has(middle)).toBe(true);
    expect(reachable.has(leaf)).toBe(true);
  });

  it("handles circular references without infinite loop", () => {
    const modelA = createMockModel("A");
    const modelB = createMockModel("B");
    // A → B → A (circular)
    modelA.properties = [createMockProperty("b", modelB)];
    modelB.properties = [createMockProperty("a", modelA)];

    const roots = new Set<SdkModelType | SdkEnumType>([modelA]);
    const reachable = findReachableTypes(roots);
    expect(reachable.has(modelA)).toBe(true);
    expect(reachable.has(modelB)).toBe(true);
  });

  it("does not expand through enum types", () => {
    const enumType = createMockEnum("Color");
    const roots = new Set<SdkModelType | SdkEnumType>([enumType]);

    const reachable = findReachableTypes(roots);
    expect(reachable.has(enumType)).toBe(true);
    expect(reachable.size).toBe(1);
  });

  it("does not include unreachable types", () => {
    const reachableModel = createMockModel("Reachable");
    const unreachableModel = createMockModel("Unreachable");
    const roots = new Set<SdkModelType | SdkEnumType>([reachableModel]);

    const reachable = findReachableTypes(roots);
    expect(reachable.has(reachableModel)).toBe(true);
    expect(reachable.has(unreachableModel)).toBe(false);
  });
});

/**
 * Tests for applyUnreferencedTypeHandling — the main entry point that
 * combines root type collection, BFS reachability, and option-specific
 * handling. These tests verify the end-to-end behavior of each option
 * value (keepAll, internalize, removeOrInternalize).
 */
describe("applyUnreferencedTypeHandling", () => {
  /**
   * keepAll should return all types without any modifications to access
   * or filtering. This is the "do nothing" option.
   */
  describe("keepAll", () => {
    it("returns all types unchanged", () => {
      const model = createMockModel("Widget");
      const enumType = createMockEnum("Color");

      const result = applyUnreferencedTypeHandling(
        [model],
        [enumType],
        [],
        "keepAll",
      );

      expect(result.models).toEqual([model]);
      expect(result.enums).toEqual([enumType]);
      expect(model.access).toBe("public");
      expect(enumType.access).toBe("public");
    });

    it("keeps unreferenced types public", () => {
      const usedModel = createMockModel("Widget");
      const unusedModel = createMockModel("Orphan");
      const client = createMockClient([
        {
          kind: "basic",
          operation: mockOperation,
          parameters: [],
          response: { type: usedModel },
        },
      ]);

      const result = applyUnreferencedTypeHandling(
        [usedModel, unusedModel],
        [],
        [client],
        "keepAll",
      );

      expect(result.models).toHaveLength(2);
      expect(unusedModel.access).toBe("public");
    });
  });

  /**
   * internalize should set access to "internal" for types not reachable
   * from any operation signature, but keep them in the output. Types
   * already marked as internal should not be changed.
   */
  describe("internalize", () => {
    it("internalizes unreachable models", () => {
      const usedModel = createMockModel("Widget");
      const unusedModel = createMockModel("Orphan");
      const client = createMockClient([
        {
          kind: "basic",
          operation: mockOperation,
          parameters: [],
          response: { type: usedModel },
        },
      ]);

      const result = applyUnreferencedTypeHandling(
        [usedModel, unusedModel],
        [],
        [client],
        "internalize",
      );

      expect(result.models).toHaveLength(2);
      expect(usedModel.access).toBe("public");
      expect(unusedModel.access).toBe("internal");
    });

    it("internalizes unreachable enums", () => {
      const usedEnum = createMockEnum("Color");
      const unusedEnum = createMockEnum("OrphanEnum");
      const client = createMockClient([
        {
          kind: "basic",
          operation: mockOperation,
          parameters: [{ type: usedEnum }],
          response: {},
        },
      ]);

      const result = applyUnreferencedTypeHandling(
        [],
        [usedEnum, unusedEnum],
        [client],
        "internalize",
      );

      expect(result.enums).toHaveLength(2);
      expect(usedEnum.access).toBe("public");
      expect(unusedEnum.access).toBe("internal");
    });

    it("keeps already-internal types as internal", () => {
      const internalModel = createMockModel("Internal", {
        access: "internal",
      });
      applyUnreferencedTypeHandling([internalModel], [], [], "internalize");

      expect(internalModel.access).toBe("internal");
    });

    it("keeps indirectly referenced types public", () => {
      const leafModel = createMockModel("Leaf");
      const rootModel = createMockModel("Root", {
        properties: [createMockProperty("leaf", leafModel)],
      });
      const client = createMockClient([
        {
          kind: "basic",
          operation: mockOperation,
          parameters: [],
          response: { type: rootModel },
        },
      ]);

      const result = applyUnreferencedTypeHandling(
        [rootModel, leafModel],
        [],
        [client],
        "internalize",
      );

      expect(result.models).toHaveLength(2);
      expect(rootModel.access).toBe("public");
      expect(leafModel.access).toBe("public");
    });
  });

  /**
   * removeOrInternalize should remove types not reachable from any
   * operation signature. This provides the smallest possible output
   * by eliminating unused types entirely.
   */
  describe("removeOrInternalize", () => {
    it("removes unreachable models", () => {
      const usedModel = createMockModel("Widget");
      const unusedModel = createMockModel("Orphan");
      const client = createMockClient([
        {
          kind: "basic",
          operation: mockOperation,
          parameters: [],
          response: { type: usedModel },
        },
      ]);

      const result = applyUnreferencedTypeHandling(
        [usedModel, unusedModel],
        [],
        [client],
        "removeOrInternalize",
      );

      expect(result.models).toEqual([usedModel]);
    });

    it("removes unreachable enums", () => {
      const usedEnum = createMockEnum("Color");
      const unusedEnum = createMockEnum("OrphanEnum");
      const client = createMockClient([
        {
          kind: "basic",
          operation: mockOperation,
          parameters: [{ type: usedEnum }],
          response: {},
        },
      ]);

      const result = applyUnreferencedTypeHandling(
        [],
        [usedEnum, unusedEnum],
        [client],
        "removeOrInternalize",
      );

      expect(result.enums).toEqual([usedEnum]);
    });

    it("keeps indirectly referenced types", () => {
      const leafModel = createMockModel("Leaf");
      const rootModel = createMockModel("Root", {
        properties: [createMockProperty("leaf", leafModel)],
      });
      const client = createMockClient([
        {
          kind: "basic",
          operation: mockOperation,
          parameters: [],
          response: { type: rootModel },
        },
      ]);

      const result = applyUnreferencedTypeHandling(
        [rootModel, leafModel],
        [],
        [client],
        "removeOrInternalize",
      );

      expect(result.models).toEqual([rootModel, leafModel]);
    });

    it("preserves enum referenced through model property", () => {
      const enumType = createMockEnum("Status");
      const model = createMockModel("Widget", {
        properties: [createMockProperty("status", enumType)],
      });
      const client = createMockClient([
        {
          kind: "basic",
          operation: mockOperation,
          parameters: [],
          response: { type: model },
        },
      ]);

      const result = applyUnreferencedTypeHandling(
        [model],
        [enumType],
        [client],
        "removeOrInternalize",
      );

      expect(result.models).toEqual([model]);
      expect(result.enums).toEqual([enumType]);
    });

    it("removes all types when no clients exist", () => {
      const model = createMockModel("Widget");
      const enumType = createMockEnum("Color");

      const result = applyUnreferencedTypeHandling(
        [model],
        [enumType],
        [],
        "removeOrInternalize",
      );

      expect(result.models).toEqual([]);
      expect(result.enums).toEqual([]);
    });

    it("handles complex reference chains correctly", () => {
      // Root → A → B → C (all reachable), D is orphaned
      const modelC = createMockModel("C");
      const modelB = createMockModel("B", {
        properties: [createMockProperty("c", modelC)],
      });
      const modelA = createMockModel("A", {
        properties: [createMockProperty("b", modelB)],
      });
      const modelD = createMockModel("D"); // orphan

      const client = createMockClient([
        {
          kind: "basic",
          operation: mockOperation,
          parameters: [],
          response: { type: modelA },
        },
      ]);

      const result = applyUnreferencedTypeHandling(
        [modelA, modelB, modelC, modelD],
        [],
        [client],
        "removeOrInternalize",
      );

      expect(result.models).toEqual([modelA, modelB, modelC]);
      expect(result.models).not.toContain(modelD);
    });
  });
});
