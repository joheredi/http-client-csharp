import { describe, expect, it } from "vitest";
import type {
  SdkArrayType,
  SdkBuiltInType,
  SdkDictionaryType,
  SdkEnumType,
  SdkModelType,
  SdkNullableType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import {
  isCollectionType,
  isPropertyNullable,
  unwrapNullableType,
} from "../src/utils/nullable.js";

/**
 * Helper to create a minimal SdkBuiltInType for testing.
 * Only the `kind` field matters for nullable/collection logic.
 */
function makeBuiltIn(kind: string): SdkBuiltInType {
  return { kind: kind as SdkBuiltInType["kind"] } as SdkBuiltInType;
}

/**
 * Helper to create a minimal SdkArrayType for testing.
 */
function makeArray(elementType: SdkType): SdkArrayType {
  return { kind: "array", valueType: elementType } as SdkArrayType;
}

/**
 * Helper to create a minimal SdkDictionaryType for testing.
 */
function makeDict(valueType: SdkType): SdkDictionaryType {
  return {
    kind: "dict",
    keyType: makeBuiltIn("string"),
    valueType,
  } as SdkDictionaryType;
}

/**
 * Helper to create a minimal SdkNullableType for testing.
 */
function makeNullable(inner: SdkType): SdkNullableType {
  return { kind: "nullable", type: inner } as SdkNullableType;
}

/**
 * Helper to create a minimal SdkEnumType for testing.
 */
function makeEnum(): SdkEnumType {
  return { kind: "enum" } as SdkEnumType;
}

/**
 * Helper to create a minimal SdkModelType for testing.
 */
function makeModel(): SdkModelType {
  return { kind: "model" } as SdkModelType;
}

/**
 * Tests for the nullable type utility functions.
 *
 * These tests verify the core nullable type determination logic that drives
 * how C# model properties are rendered. The nullable rules directly match the
 * legacy emitter's PropertyProvider.cs (lines 86-88) to ensure generated output
 * consistency:
 *
 * - Optional non-collection types → T? (nullable)
 * - Required types → T (not nullable)
 * - Collections → never nullable (use ChangeTracking* instead)
 * - SdkNullableType → nullable (unless wrapping a collection)
 *
 * These rules affect every model property in the generated C# SDK, so getting
 * them wrong would cause widespread output differences from the legacy emitter.
 */
describe("isPropertyNullable", () => {
  /**
   * An optional int32 property should be nullable because int is a value type
   * and the property needs to represent the "missing" state via int?.
   * This is the most common nullable case in generated models.
   */
  it("returns true for optional value type (int32)", () => {
    const prop = { type: makeBuiltIn("int32"), optional: true };
    expect(isPropertyNullable(prop)).toBe(true);
  });

  /**
   * A required int32 property should NOT be nullable. Required properties
   * always have a value; there's no need for Nullable<int>.
   */
  it("returns false for required value type (int32)", () => {
    const prop = { type: makeBuiltIn("int32"), optional: false };
    expect(isPropertyNullable(prop)).toBe(false);
  });

  /**
   * An optional string property should be nullable. While string is a reference
   * type and `#nullable disable` makes string? equivalent to string, the legacy
   * emitter still applies WithNullable(true) to ALL optional non-collection types.
   * We match this behavior for output consistency.
   */
  it("returns true for optional reference type (string)", () => {
    const prop = { type: makeBuiltIn("string"), optional: true };
    expect(isPropertyNullable(prop)).toBe(true);
  });

  /**
   * A required string property should NOT be nullable.
   */
  it("returns false for required reference type (string)", () => {
    const prop = { type: makeBuiltIn("string"), optional: false };
    expect(isPropertyNullable(prop)).toBe(false);
  });

  /**
   * An optional array property should NOT be nullable. Collections use
   * ChangeTrackingList<T> to distinguish "not set" from "empty", so they
   * should never be rendered as nullable in C#.
   * This matches legacy PropertyProvider.cs: `!propertyType.IsCollection`.
   */
  it("returns false for optional array property", () => {
    const prop = { type: makeArray(makeBuiltIn("string")), optional: true };
    expect(isPropertyNullable(prop)).toBe(false);
  });

  /**
   * A required array property should NOT be nullable (collections are never nullable).
   */
  it("returns false for required array property", () => {
    const prop = { type: makeArray(makeBuiltIn("string")), optional: false };
    expect(isPropertyNullable(prop)).toBe(false);
  });

  /**
   * An optional dictionary property should NOT be nullable. Same rule as arrays:
   * dictionaries use ChangeTrackingDictionary for undefined semantics.
   */
  it("returns false for optional dictionary property", () => {
    const prop = { type: makeDict(makeBuiltIn("int32")), optional: true };
    expect(isPropertyNullable(prop)).toBe(false);
  });

  /**
   * A required dictionary property should NOT be nullable.
   */
  it("returns false for required dictionary property", () => {
    const prop = { type: makeDict(makeBuiltIn("int32")), optional: false };
    expect(isPropertyNullable(prop)).toBe(false);
  });

  /**
   * When TCGC wraps a value type in SdkNullableType (e.g., `prop: int32 | null`),
   * the property should be nullable even if it's required. The explicit null in
   * the TypeSpec definition means the C# type must support null.
   */
  it("returns true for explicitly nullable value type (required)", () => {
    const prop = {
      type: makeNullable(makeBuiltIn("int32")),
      optional: false,
    };
    expect(isPropertyNullable(prop)).toBe(true);
  });

  /**
   * An optional property with an explicitly nullable type should be nullable.
   * Both the optional flag and the SdkNullableType wrapper agree.
   */
  it("returns true for explicitly nullable value type (optional)", () => {
    const prop = {
      type: makeNullable(makeBuiltIn("int32")),
      optional: true,
    };
    expect(isPropertyNullable(prop)).toBe(true);
  });

  /**
   * Even if TCGC wraps a collection in SdkNullableType (e.g., `prop: string[] | null`),
   * the property should NOT be nullable. Collections are NEVER nullable in the
   * C# HTTP client emitter — the collection rule takes precedence over explicit
   * nullability.
   */
  it("returns false for explicitly nullable collection (array)", () => {
    const prop = {
      type: makeNullable(makeArray(makeBuiltIn("string"))),
      optional: false,
    };
    expect(isPropertyNullable(prop)).toBe(false);
  });

  /**
   * Same as above but for dictionaries: even explicitly nullable dicts are not
   * rendered as nullable.
   */
  it("returns false for explicitly nullable collection (dict)", () => {
    const prop = {
      type: makeNullable(makeDict(makeBuiltIn("string"))),
      optional: false,
    };
    expect(isPropertyNullable(prop)).toBe(false);
  });

  /**
   * An optional enum property should be nullable. Enums are value types in C#
   * (fixed enums are C# enums), so optional enums need `EnumType?`.
   * For extensible enums (which are classes), the `?` is a no-op under
   * `#nullable disable` but is still emitted for consistency with the legacy emitter.
   */
  it("returns true for optional enum property", () => {
    const prop = { type: makeEnum(), optional: true };
    expect(isPropertyNullable(prop)).toBe(true);
  });

  /**
   * A required enum property should NOT be nullable.
   */
  it("returns false for required enum property", () => {
    const prop = { type: makeEnum(), optional: false };
    expect(isPropertyNullable(prop)).toBe(false);
  });

  /**
   * An optional model property (reference type) should be nullable.
   * Under `#nullable disable`, `Model?` is the same as `Model`, but we
   * still apply nullable for consistency with the legacy emitter.
   */
  it("returns true for optional model property", () => {
    const prop = { type: makeModel(), optional: true };
    expect(isPropertyNullable(prop)).toBe(true);
  });

  /**
   * A required model property should NOT be nullable.
   */
  it("returns false for required model property", () => {
    const prop = { type: makeModel(), optional: false };
    expect(isPropertyNullable(prop)).toBe(false);
  });
});

/**
 * Tests for unwrapNullableType — used to strip SdkNullableType wrappers
 * before passing types to TypeExpression. Without unwrapping, TypeExpression
 * would render T? from the nullable wrapper, and the Property component's
 * nullable prop would add another ?, producing T?? which is invalid.
 */
describe("unwrapNullableType", () => {
  /**
   * When the type is SdkNullableType, unwrap should return the inner type.
   * This is the core use case: preparing a type for TypeExpression rendering.
   */
  it("unwraps SdkNullableType to the inner type", () => {
    const inner = makeBuiltIn("int32");
    const nullable = makeNullable(inner);
    expect(unwrapNullableType(nullable)).toBe(inner);
  });

  /**
   * When the type is not wrapped in SdkNullableType, return it unchanged.
   * Most types flow through this path.
   */
  it("returns non-nullable types unchanged", () => {
    const type = makeBuiltIn("string");
    expect(unwrapNullableType(type)).toBe(type);
  });

  /**
   * Unwrapping a nullable array should return the array type.
   * This supports the collection-never-nullable rule: we first unwrap,
   * then check isCollectionType on the inner type.
   */
  it("unwraps SdkNullableType wrapping an array", () => {
    const arr = makeArray(makeBuiltIn("int32"));
    const nullable = makeNullable(arr);
    expect(unwrapNullableType(nullable)).toBe(arr);
  });
});

/**
 * Tests for isCollectionType — determines whether a type is an array or
 * dictionary. Collection types follow special nullable rules (never nullable)
 * and will need special handling for IList/IReadOnlyList in task 1.1.3.
 */
describe("isCollectionType", () => {
  /**
   * Array types are collections.
   */
  it("returns true for array types", () => {
    expect(isCollectionType(makeArray(makeBuiltIn("string")))).toBe(true);
  });

  /**
   * Dictionary types are collections.
   */
  it("returns true for dictionary types", () => {
    expect(isCollectionType(makeDict(makeBuiltIn("string")))).toBe(true);
  });

  /**
   * Built-in scalar types are not collections.
   */
  it("returns false for built-in types", () => {
    expect(isCollectionType(makeBuiltIn("string"))).toBe(false);
  });

  /**
   * Enum types are not collections.
   */
  it("returns false for enum types", () => {
    expect(isCollectionType(makeEnum())).toBe(false);
  });

  /**
   * Model types are not collections.
   */
  it("returns false for model types", () => {
    expect(isCollectionType(makeModel())).toBe(false);
  });

  /**
   * A nullable-wrapped array should still be detected as a collection.
   * This is important because isCollectionType unwraps nullable before checking,
   * ensuring the collection-never-nullable rule applies even when TCGC wraps
   * the collection in SdkNullableType.
   */
  it("returns true for nullable-wrapped array", () => {
    expect(
      isCollectionType(makeNullable(makeArray(makeBuiltIn("int32")))),
    ).toBe(true);
  });

  /**
   * A nullable-wrapped dictionary should still be detected as a collection.
   */
  it("returns true for nullable-wrapped dictionary", () => {
    expect(
      isCollectionType(makeNullable(makeDict(makeBuiltIn("string")))),
    ).toBe(true);
  });
});
