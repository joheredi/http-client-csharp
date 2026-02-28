import { describe, expect, it } from "vitest";
import type {
  SdkArrayType,
  SdkBuiltInType,
  SdkConstantType,
  SdkDictionaryType,
  SdkModelPropertyType,
  SdkModelType,
  SdkNullableType,
  SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { Visibility } from "@typespec/http";
import {
  getPropertyInitializerKind,
  isCSharpReferenceType,
  isConstructorParameter,
  isPropertyReadOnly,
  propertyRequiresNullCheck,
} from "../src/utils/property.js";

// --- Mock helpers ---

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

/** Creates a minimal SdkConstantType for testing. */
function makeConstant(): SdkConstantType {
  return { kind: "constant", value: "fixed" } as SdkConstantType;
}

/**
 * Creates a minimal SdkModelPropertyType for testing property utilities.
 * Only fields relevant to property analysis are populated.
 */
function makeProperty(
  overrides: Partial<SdkModelPropertyType> & {
    type: SdkType;
    optional: boolean;
  },
): SdkModelPropertyType {
  return {
    kind: "property",
    name: "testProp",
    discriminator: false,
    serializedName: "testProp",
    ...overrides,
  } as SdkModelPropertyType;
}

/**
 * Tests for isCSharpReferenceType.
 *
 * This function determines whether a TCGC SDK type maps to a C# reference
 * type. Reference types can be null at runtime and require Argument.AssertNotNull
 * validation when they appear as required constructor parameters.
 *
 * Getting this wrong means either:
 * - Missing null checks on required string/model parameters (runtime NullReferenceException)
 * - Adding unnecessary null checks on value types like int (compile error in C#)
 */
describe("isCSharpReferenceType", () => {
  /**
   * String maps to System.String in C# which is a reference type (class).
   * Required string properties need null validation.
   */
  it("returns true for string type", () => {
    expect(isCSharpReferenceType(makeBuiltIn("string"))).toBe(true);
  });

  /**
   * Model types map to generated C# classes which are reference types.
   * Required model-typed properties need null validation.
   */
  it("returns true for model type", () => {
    expect(isCSharpReferenceType(makeModel())).toBe(true);
  });

  /**
   * Bytes maps to System.BinaryData in C# which is a class (reference type).
   */
  it("returns true for bytes type", () => {
    expect(isCSharpReferenceType(makeBuiltIn("bytes"))).toBe(true);
  });

  /**
   * URL maps to System.Uri in C# which is a class (reference type).
   */
  it("returns true for url type", () => {
    expect(isCSharpReferenceType(makeBuiltIn("url"))).toBe(true);
  });

  /**
   * Unknown maps to System.BinaryData in C# which is a class (reference type).
   */
  it("returns true for unknown type", () => {
    expect(isCSharpReferenceType(makeBuiltIn("unknown"))).toBe(true);
  });

  /**
   * int32 maps to int in C# which is a value type (struct).
   * Value types cannot be null so don't need Argument.AssertNotNull.
   */
  it("returns false for int32 type", () => {
    expect(isCSharpReferenceType(makeBuiltIn("int32"))).toBe(false);
  });

  /**
   * boolean maps to bool in C# which is a value type.
   */
  it("returns false for boolean type", () => {
    expect(isCSharpReferenceType(makeBuiltIn("boolean"))).toBe(false);
  });

  /**
   * float64 maps to double in C# which is a value type.
   */
  it("returns false for float64 type", () => {
    expect(isCSharpReferenceType(makeBuiltIn("float64"))).toBe(false);
  });

  /**
   * Nullable wrapper should be unwrapped — the inner type determines
   * reference vs value type.
   */
  it("unwraps nullable to check inner type", () => {
    expect(isCSharpReferenceType(makeNullable(makeBuiltIn("string")))).toBe(
      true,
    );
    expect(isCSharpReferenceType(makeNullable(makeBuiltIn("int32")))).toBe(
      false,
    );
  });
});

/**
 * Tests for isPropertyReadOnly.
 *
 * Read-only properties are populated by the server during deserialization
 * and cannot be set by the user. They never have setters and are not
 * included as constructor parameters. This is determined by the visibility
 * array containing only Visibility.Read.
 *
 * Getting this wrong means either:
 * - Exposing setters on server-populated properties (API contract violation)
 * - Requiring read-only properties in constructors (user cannot provide them)
 */
describe("isPropertyReadOnly", () => {
  /**
   * A property with visibility=[Read] is read-only — it's only visible
   * when reading data from the server.
   */
  it("returns true when visibility is [Read] only", () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: false,
      visibility: [Visibility.Read],
    });
    expect(isPropertyReadOnly(prop)).toBe(true);
  });

  /**
   * A property with visibility=[Read, Create] is not read-only — it can
   * be set during creation.
   */
  it("returns false when visibility includes Read and Create", () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: false,
      visibility: [Visibility.Read, Visibility.Create],
    });
    expect(isPropertyReadOnly(prop)).toBe(false);
  });

  /**
   * A property with no visibility array is not read-only — the default
   * is full visibility.
   */
  it("returns false when visibility is undefined", () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: false,
    });
    expect(isPropertyReadOnly(prop)).toBe(false);
  });

  /**
   * A property with an empty visibility array is not read-only.
   */
  it("returns false when visibility is empty", () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: false,
      visibility: [],
    });
    expect(isPropertyReadOnly(prop)).toBe(false);
  });
});

/**
 * Tests for isConstructorParameter.
 *
 * Determines which properties should appear as parameters in the public
 * model constructor. This drives the constructor signature that SDK users
 * interact with. The rules follow the legacy emitter's
 * AddInitializationParameterForCtor (ModelProvider.cs lines 1048-1056).
 *
 * Getting this wrong means either:
 * - Forcing users to provide optional values in the constructor (bad DX)
 * - Omitting required values from the constructor (model can be incomplete)
 */
describe("isConstructorParameter", () => {
  /**
   * Required non-collection properties are constructor parameters.
   * Users must provide a value when creating the model.
   */
  it("returns true for required non-collection property", () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: false,
    });
    expect(isConstructorParameter(prop)).toBe(true);
  });

  /**
   * Optional properties are NOT constructor parameters.
   * Users set them via object initializer syntax.
   */
  it("returns false for optional property", () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: true,
    });
    expect(isConstructorParameter(prop)).toBe(false);
  });

  /**
   * Read-only properties are NOT constructor parameters.
   * They are populated by deserialization, not by the user.
   */
  it("returns false for read-only property", () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: false,
      visibility: [Visibility.Read],
    });
    expect(isConstructorParameter(prop)).toBe(false);
  });

  /**
   * Constant/literal properties are NOT constructor parameters.
   * Their value is fixed and known at compile time.
   */
  it("returns false for constant/literal property", () => {
    const prop = makeProperty({
      type: makeConstant(),
      optional: false,
    });
    expect(isConstructorParameter(prop)).toBe(false);
  });

  /**
   * For structs, ALL non-readonly properties are constructor parameters
   * regardless of optional status. C# structs require all fields to be
   * initialized in the constructor.
   */
  it("returns true for optional property on struct", () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: true,
    });
    expect(isConstructorParameter(prop, true)).toBe(true);
  });

  /**
   * Even on structs, read-only properties are not constructor parameters.
   */
  it("returns false for read-only property on struct", () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: false,
      visibility: [Visibility.Read],
    });
    expect(isConstructorParameter(prop, true)).toBe(false);
  });
});

/**
 * Tests for propertyRequiresNullCheck.
 *
 * Determines whether a required property needs Argument.AssertNotNull
 * validation in the constructor. Only required, non-nullable, non-collection
 * C# reference types need this check.
 *
 * Getting this wrong means either:
 * - Missing null checks → NullReferenceException at runtime
 * - Unnecessary null checks on value types → compile error in C#
 */
describe("propertyRequiresNullCheck", () => {
  /**
   * Required string property needs null check.
   * String is a reference type in C# and null would be invalid for a
   * required property.
   */
  it("returns true for required string property", () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: false,
    });
    expect(propertyRequiresNullCheck(prop)).toBe(true);
  });

  /**
   * Required model property needs null check.
   * Models are C# classes (reference types).
   */
  it("returns true for required model property", () => {
    const prop = makeProperty({
      type: makeModel(),
      optional: false,
    });
    expect(propertyRequiresNullCheck(prop)).toBe(true);
  });

  /**
   * Optional properties never need null checks because null is a valid value.
   */
  it("returns false for optional string property", () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: true,
    });
    expect(propertyRequiresNullCheck(prop)).toBe(false);
  });

  /**
   * Required value types (int, bool, etc.) don't need null checks because
   * they cannot be null in C#.
   */
  it("returns false for required int32 property", () => {
    const prop = makeProperty({
      type: makeBuiltIn("int32"),
      optional: false,
    });
    expect(propertyRequiresNullCheck(prop)).toBe(false);
  });

  /**
   * Required collection properties don't need null checks because
   * they are initialized via ChangeTracking types, not passed as-is.
   */
  it("returns false for required array property", () => {
    const prop = makeProperty({
      type: makeArray(makeBuiltIn("string")),
      optional: false,
    });
    expect(propertyRequiresNullCheck(prop)).toBe(false);
  });

  /**
   * Required bytes property needs null check.
   * Bytes maps to BinaryData in C# which is a class (reference type).
   */
  it("returns true for required bytes property", () => {
    const prop = makeProperty({
      type: makeBuiltIn("bytes"),
      optional: false,
    });
    expect(propertyRequiresNullCheck(prop)).toBe(true);
  });
});

/**
 * Tests for getPropertyInitializerKind.
 *
 * Determines what kind of initialization a property needs in the public
 * model constructor. This drives constructor body generation:
 * - Optional collections → ChangeTracking types (track "not set" vs "empty")
 * - Required collections → .ToList() from IEnumerable parameter
 * - Required non-collections → direct assignment
 * - Optional non-collections → no initialization (default/null)
 *
 * Getting this wrong means either:
 * - Missing ChangeTracking initialization (serialization can't distinguish
 *   "not set" from "empty" for optional collections)
 * - Missing .ToList() for collections (type mismatch in constructor body)
 */
describe("getPropertyInitializerKind", () => {
  /**
   * Optional array → ChangeTrackingList to track "not set" vs "empty".
   */
  it('returns "change-tracking-list" for optional array', () => {
    const prop = makeProperty({
      type: makeArray(makeBuiltIn("string")),
      optional: true,
    });
    expect(getPropertyInitializerKind(prop)).toBe("change-tracking-list");
  });

  /**
   * Optional dictionary → ChangeTrackingDictionary.
   */
  it('returns "change-tracking-dict" for optional dictionary', () => {
    const prop = makeProperty({
      type: makeDict(makeBuiltIn("int32")),
      optional: true,
    });
    expect(getPropertyInitializerKind(prop)).toBe("change-tracking-dict");
  });

  /**
   * Required array → .ToList() from IEnumerable constructor parameter.
   */
  it('returns "to-list" for required array', () => {
    const prop = makeProperty({
      type: makeArray(makeBuiltIn("string")),
      optional: false,
    });
    expect(getPropertyInitializerKind(prop)).toBe("to-list");
  });

  /**
   * Required dictionary → .ToDictionary() conversion.
   */
  it('returns "to-dict" for required dictionary', () => {
    const prop = makeProperty({
      type: makeDict(makeBuiltIn("string")),
      optional: false,
    });
    expect(getPropertyInitializerKind(prop)).toBe("to-dict");
  });

  /**
   * Required non-collection → direct assignment from constructor parameter.
   */
  it('returns "direct-assign" for required string', () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: false,
    });
    expect(getPropertyInitializerKind(prop)).toBe("direct-assign");
  });

  /**
   * Optional non-collection → no initialization needed (remains default/null).
   */
  it('returns "none" for optional string', () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: true,
    });
    expect(getPropertyInitializerKind(prop)).toBe("none");
  });

  /**
   * Optional nullable array → still uses ChangeTrackingList.
   * The nullable wrapper doesn't change the collection initialization pattern.
   */
  it('returns "change-tracking-list" for optional nullable array', () => {
    const prop = makeProperty({
      type: makeNullable(makeArray(makeBuiltIn("string"))),
      optional: true,
    });
    expect(getPropertyInitializerKind(prop)).toBe("change-tracking-list");
  });
});
