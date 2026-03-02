import { describe, expect, it } from "vitest";
import type {
  SdkArrayType,
  SdkBuiltInType,
  SdkDictionaryType,
  SdkModelType,
  SdkNullableType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import {
  getCollectionParameterVariant,
  getCollectionPropertyVariant,
  getCollectionValueType,
  isArrayCollection,
  isDictCollection,
} from "../src/utils/collections.js";

// --- Mock helpers ---
// These create minimal SDK type objects with only the fields needed for
// collection type determination. The collection utilities operate on the
// `kind` and `valueType` discriminants, so full SDK types aren't required.

/** Creates a minimal SdkBuiltInType for testing. */
function makeBuiltIn(kind: string): SdkBuiltInType {
  return { kind: kind as SdkBuiltInType["kind"] } as SdkBuiltInType;
}

/** Creates a minimal SdkArrayType for testing. */
function makeArray(elementType: SdkType): SdkArrayType {
  return { kind: "array", valueType: elementType } as SdkArrayType;
}

/** Creates a minimal SdkDictionaryType for testing. */
function makeDict(valueType: SdkType): SdkDictionaryType {
  return {
    kind: "dict",
    keyType: makeBuiltIn("string"),
    valueType,
  } as SdkDictionaryType;
}

/** Creates a minimal SdkNullableType for testing. */
function makeNullable(inner: SdkType): SdkNullableType {
  return { kind: "nullable", type: inner } as SdkNullableType;
}

/** Creates a minimal SdkModelType for testing. */
function makeModel(): SdkModelType {
  return { kind: "model" } as SdkModelType;
}

/**
 * Tests for getCollectionPropertyVariant.
 *
 * This function determines which C# collection interface to use for a model
 * property declaration based on whether the property is read-only. It matches
 * the legacy emitter's PropertyProvider.cs line 100:
 *   `Type = inputProperty.IsReadOnly ? propertyType.OutputType : propertyType`
 *
 * The distinction is critical for API surface correctness:
 * - Writable properties use mutable interfaces (IList, IDictionary) so users
 *   can Add/Remove items via the collection API.
 * - Read-only properties use immutable interfaces (IReadOnlyList,
 *   IReadOnlyDictionary) because server-populated data should not be modified.
 *
 * Getting this wrong would either expose mutation on read-only data (API contract
 * violation) or prevent users from modifying writable collections (broken DX).
 */
describe("getCollectionPropertyVariant", () => {
  /**
   * Writable array properties use IList<T> — the mutable list interface.
   * Users can Add, Remove, and index-assign items through the property.
   * This is the default for non-read-only array properties in input models.
   */
  it('returns "IList" for writable array property', () => {
    const type = makeArray(makeBuiltIn("string"));
    expect(getCollectionPropertyVariant(type, false)).toBe("IList");
  });

  /**
   * Read-only array properties use IReadOnlyList<T> — the immutable interface.
   * Server-populated list properties should not expose Add/Remove.
   * Matches CSharpType.GetOutputType: IList<T> → IReadOnlyList<T>.
   */
  it('returns "IReadOnlyList" for read-only array property', () => {
    const type = makeArray(makeBuiltIn("string"));
    expect(getCollectionPropertyVariant(type, true)).toBe("IReadOnlyList");
  });

  /**
   * Writable dictionary properties use IDictionary<string, T> — the mutable interface.
   * Matches the legacy emitter's default dictionary type.
   */
  it('returns "IDictionary" for writable dict property', () => {
    const type = makeDict(makeBuiltIn("int32"));
    expect(getCollectionPropertyVariant(type, false)).toBe("IDictionary");
  });

  /**
   * Read-only dictionary properties use IReadOnlyDictionary<string, T>.
   * Matches CSharpType.GetOutputType: IDictionary<K,V> → IReadOnlyDictionary<K,V>.
   */
  it('returns "IReadOnlyDictionary" for read-only dict property', () => {
    const type = makeDict(makeBuiltIn("int32"));
    expect(getCollectionPropertyVariant(type, true)).toBe(
      "IReadOnlyDictionary",
    );
  });

  /**
   * Nullable-wrapped arrays should be handled correctly — the nullable wrapper
   * is unwrapped before determining the collection variant. This ensures
   * TypeSpec definitions like `prop: string[] | null` still get IList<T>.
   */
  it("unwraps nullable array to determine variant", () => {
    const type = makeNullable(makeArray(makeBuiltIn("string")));
    expect(getCollectionPropertyVariant(type, false)).toBe("IList");
    expect(getCollectionPropertyVariant(type, true)).toBe("IReadOnlyList");
  });

  /**
   * Nullable-wrapped dictionaries should be unwrapped correctly.
   */
  it("unwraps nullable dict to determine variant", () => {
    const type = makeNullable(makeDict(makeBuiltIn("string")));
    expect(getCollectionPropertyVariant(type, false)).toBe("IDictionary");
    expect(getCollectionPropertyVariant(type, true)).toBe(
      "IReadOnlyDictionary",
    );
  });

  /**
   * Calling with a non-collection type is a programming error and should throw.
   * This catches misuse where the caller forgot to check isCollectionType first.
   */
  it("throws for non-collection type", () => {
    expect(() =>
      getCollectionPropertyVariant(makeBuiltIn("string"), false),
    ).toThrow("non-collection type");
  });

  /**
   * Model types are not collections and should throw.
   */
  it("throws for model type", () => {
    expect(() => getCollectionPropertyVariant(makeModel(), false)).toThrow(
      "non-collection type",
    );
  });
});

/**
 * Tests for getCollectionParameterVariant.
 *
 * This function determines which C# collection interface to use for constructor
 * and method parameters. It matches the legacy emitter's CSharpType.GetInputType
 * (CSharpType.cs lines 326–345).
 *
 * The key design choice from the legacy emitter:
 * - Array parameters use IEnumerable<T> (broadest interface) so callers can
 *   pass any sequence — List, array, LINQ query, etc. The constructor body
 *   converts to the concrete type via .ToList().
 * - Dictionary parameters keep IDictionary<string, T> since there's no broader
 *   dictionary interface that's commonly used.
 *
 * Getting this wrong would either restrict what callers can pass (too narrow
 * interface) or break the constructor body's .ToList()/.ToDictionary() calls
 * (wrong expected input type).
 */
describe("getCollectionParameterVariant", () => {
  /**
   * Array parameters use IEnumerable<T> — the broadest input interface.
   * This allows callers to pass List, array, LINQ query, or any IEnumerable.
   * The constructor body converts via `.ToList()`.
   */
  it('returns "IEnumerable" for array type', () => {
    const type = makeArray(makeBuiltIn("string"));
    expect(getCollectionParameterVariant(type)).toBe("IEnumerable");
  });

  /**
   * Dictionary parameters keep IDictionary<string, T>.
   * Unlike arrays, dictionaries don't broaden to IEnumerable<KeyValuePair>.
   * The constructor body converts via `.ToDictionary()`.
   */
  it('returns "IDictionary" for dict type', () => {
    const type = makeDict(makeBuiltIn("int32"));
    expect(getCollectionParameterVariant(type)).toBe("IDictionary");
  });

  /**
   * Nullable-wrapped arrays should be unwrapped to IEnumerable.
   */
  it("unwraps nullable array", () => {
    const type = makeNullable(makeArray(makeBuiltIn("string")));
    expect(getCollectionParameterVariant(type)).toBe("IEnumerable");
  });

  /**
   * Nullable-wrapped dicts should be unwrapped to IDictionary.
   */
  it("unwraps nullable dict", () => {
    const type = makeNullable(makeDict(makeBuiltIn("int32")));
    expect(getCollectionParameterVariant(type)).toBe("IDictionary");
  });

  /**
   * Non-collection types should throw — indicates caller error.
   */
  it("throws for non-collection type", () => {
    expect(() => getCollectionParameterVariant(makeBuiltIn("int32"))).toThrow(
      "non-collection type",
    );
  });
});

/**
 * Tests for getCollectionValueType.
 *
 * Extracts the element/value type from a collection, which downstream code
 * passes to TypeExpression to render the generic type argument.
 *
 * For arrays: the element type (e.g., `string` from `string[]`)
 * For dicts: the value type (e.g., `int` from `IDictionary<string, int>`)
 *
 * Getting this wrong would render the wrong generic argument in the C#
 * collection type (e.g., `IList<int>` instead of `IList<string>`).
 */
describe("getCollectionValueType", () => {
  /**
   * Array: extracts the element type (valueType field on SdkArrayType).
   */
  it("returns element type for array", () => {
    const stringType = makeBuiltIn("string");
    const type = makeArray(stringType);
    expect(getCollectionValueType(type)).toBe(stringType);
  });

  /**
   * Dict: extracts the value type (valueType field on SdkDictionaryType).
   * The key type (always string) is not returned since it's implicit.
   */
  it("returns value type for dict", () => {
    const int32Type = makeBuiltIn("int32");
    const type = makeDict(int32Type);
    expect(getCollectionValueType(type)).toBe(int32Type);
  });

  /**
   * Nullable-wrapped array: unwraps then extracts the element type.
   */
  it("unwraps nullable array to get element type", () => {
    const modelType = makeModel();
    const type = makeNullable(makeArray(modelType));
    expect(getCollectionValueType(type)).toBe(modelType);
  });

  /**
   * Nullable-wrapped dict: unwraps then extracts the value type.
   */
  it("unwraps nullable dict to get value type", () => {
    const stringType = makeBuiltIn("string");
    const type = makeNullable(makeDict(stringType));
    expect(getCollectionValueType(type)).toBe(stringType);
  });

  /**
   * Non-collection types should throw.
   */
  it("throws for non-collection type", () => {
    expect(() => getCollectionValueType(makeBuiltIn("string"))).toThrow(
      "non-collection type",
    );
  });

  /**
   * Nested collections: array of arrays. The outer value type is itself
   * an array type. This verifies the function returns the immediate child
   * type without recursing.
   */
  it("returns inner array type for nested array", () => {
    const innerArray = makeArray(makeBuiltIn("int32"));
    const outerArray = makeArray(innerArray);
    expect(getCollectionValueType(outerArray)).toBe(innerArray);
  });

  /**
   * Dict with model values: the value type is a model type.
   * This is common for `Record<MyModel>` in TypeSpec.
   */
  it("returns model type for dict with model values", () => {
    const modelType = makeModel();
    const type = makeDict(modelType);
    expect(getCollectionValueType(type)).toBe(modelType);
  });
});

/**
 * Tests for isArrayCollection and isDictCollection.
 *
 * Type guard functions that distinguish array from dictionary collections.
 * Used by components to decide between single-type-argument rendering
 * (e.g., `IList<T>`) and two-type-argument rendering (e.g., `IDictionary<string, T>`).
 *
 * Both unwrap nullable wrappers, ensuring consistent behavior even when TCGC
 * wraps collection types in SdkNullableType.
 */
describe("isArrayCollection", () => {
  it("returns true for array type", () => {
    expect(isArrayCollection(makeArray(makeBuiltIn("string")))).toBe(true);
  });

  it("returns true for nullable-wrapped array", () => {
    expect(
      isArrayCollection(makeNullable(makeArray(makeBuiltIn("string")))),
    ).toBe(true);
  });

  it("returns false for dict type", () => {
    expect(isArrayCollection(makeDict(makeBuiltIn("string")))).toBe(false);
  });

  it("returns false for non-collection type", () => {
    expect(isArrayCollection(makeBuiltIn("string"))).toBe(false);
  });
});

describe("isDictCollection", () => {
  it("returns true for dict type", () => {
    expect(isDictCollection(makeDict(makeBuiltIn("string")))).toBe(true);
  });

  it("returns true for nullable-wrapped dict", () => {
    expect(
      isDictCollection(makeNullable(makeDict(makeBuiltIn("string")))),
    ).toBe(true);
  });

  it("returns false for array type", () => {
    expect(isDictCollection(makeArray(makeBuiltIn("string")))).toBe(false);
  });

  it("returns false for non-collection type", () => {
    expect(isDictCollection(makeBuiltIn("int32"))).toBe(false);
  });
});

/**
 * Cross-function consistency tests.
 *
 * These tests verify that the collection utility functions work together
 * correctly — the property variant, parameter variant, and value type
 * extraction produce consistent results for the same input types.
 */
describe("cross-function consistency", () => {
  /**
   * For a writable array property: the property variant should be IList,
   * the parameter variant should be IEnumerable, and the value type should
   * be the element type. This combination drives the complete constructor
   * pattern: `public Model(IEnumerable<string> items) { Items = items.ToList(); }`
   * where the property is declared as `IList<string> Items { get; }`.
   */
  it("array: property=IList, parameter=IEnumerable, valueType=element", () => {
    const elementType = makeBuiltIn("string");
    const arrayType = makeArray(elementType);

    expect(getCollectionPropertyVariant(arrayType, false)).toBe("IList");
    expect(getCollectionParameterVariant(arrayType)).toBe("IEnumerable");
    expect(getCollectionValueType(arrayType)).toBe(elementType);
    expect(isArrayCollection(arrayType)).toBe(true);
    expect(isDictCollection(arrayType)).toBe(false);
  });

  /**
   * For a writable dict property: the property variant should be IDictionary,
   * the parameter variant should also be IDictionary, and the value type should
   * be the dict value type. This drives: `public Model(IDictionary<string, int> tags)
   * { Tags = new Dictionary<string, int>(tags); }` where the property is
   * `IDictionary<string, int> Tags { get; }`.
   */
  it("dict: property=IDictionary, parameter=IDictionary, valueType=value", () => {
    const valueType = makeBuiltIn("int32");
    const dictType = makeDict(valueType);

    expect(getCollectionPropertyVariant(dictType, false)).toBe("IDictionary");
    expect(getCollectionParameterVariant(dictType)).toBe("IDictionary");
    expect(getCollectionValueType(dictType)).toBe(valueType);
    expect(isArrayCollection(dictType)).toBe(false);
    expect(isDictCollection(dictType)).toBe(true);
  });

  /**
   * Read-only array: property variant changes to IReadOnlyList, but parameter
   * and value type remain the same (read-only properties aren't constructor
   * parameters, but the function should still return correct results).
   */
  it("read-only array: property=IReadOnlyList", () => {
    const elementType = makeBuiltIn("string");
    const arrayType = makeArray(elementType);

    expect(getCollectionPropertyVariant(arrayType, true)).toBe("IReadOnlyList");
    expect(getCollectionValueType(arrayType)).toBe(elementType);
  });

  /**
   * Read-only dict: property variant changes to IReadOnlyDictionary.
   */
  it("read-only dict: property=IReadOnlyDictionary", () => {
    const valueType = makeBuiltIn("int32");
    const dictType = makeDict(valueType);

    expect(getCollectionPropertyVariant(dictType, true)).toBe(
      "IReadOnlyDictionary",
    );
    expect(getCollectionValueType(dictType)).toBe(valueType);
  });
});
