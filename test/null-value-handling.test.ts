/**
 * Tests for null value handling during JSON deserialization.
 *
 * These tests validate that the property matching loop generates correct
 * `JsonValueKind.Null` checks for each property variant during deserialization.
 * Null handling has four distinct behaviors based on property kind:
 *
 * | Property Kind                    | Null Behavior                                      |
 * |----------------------------------|----------------------------------------------------|
 * | Nullable non-collection          | `propVar = null; continue;`                        |
 * | Optional collection              | `continue;`                                        |
 * | Required nullable collection     | `propVar = new ChangeTrackingList<T>(); continue;` |
 * | Required non-nullable            | No null check                                      |
 *
 * Additionally, collection items/values with nullable element types get
 * item-level null checks using `if/else` with `ValueKind == JsonValueKind.Null`.
 *
 * These patterns match the legacy emitter's `DeserializationPropertyNullCheckStatement`
 * in `MrwSerializationTypeDefinition.cs`.
 *
 * @module
 */

import { describe, expect, it } from "vitest";
import type {
  SdkArrayType,
  SdkBuiltInType,
  SdkDictionaryType,
  SdkModelPropertyType,
  SdkNullableType,
} from "@azure-tools/typespec-client-generator-core";
import { getNullCheckBehavior } from "../src/components/serialization/PropertyMatchingLoop.js";
import { HttpTester } from "./test-host.js";

// --- Mock helpers ---

/** Creates a minimal SdkBuiltInType for testing. */
function makeBuiltIn(kind: string): SdkBuiltInType {
  return { kind: kind as SdkBuiltInType["kind"] } as SdkBuiltInType;
}

/** Creates a minimal SdkArrayType for testing. */
function makeArray(elementType: SdkBuiltInType): SdkArrayType {
  return { kind: "array", valueType: elementType } as SdkArrayType;
}

/** Creates a minimal SdkDictionaryType for testing. */
function makeDict(valueType: SdkBuiltInType): SdkDictionaryType {
  return {
    kind: "dict",
    keyType: makeBuiltIn("string"),
    valueType,
  } as SdkDictionaryType;
}

/** Creates a minimal SdkNullableType for testing. */
function makeNullable(
  inner: SdkBuiltInType | SdkArrayType | SdkDictionaryType,
): SdkNullableType {
  return { kind: "nullable", type: inner } as SdkNullableType;
}

/**
 * Creates a minimal SdkModelPropertyType for testing null check behavior.
 * Only fields relevant to null check analysis are populated.
 */
function makeProperty(
  overrides: Partial<SdkModelPropertyType> & {
    type: SdkBuiltInType | SdkArrayType | SdkDictionaryType | SdkNullableType;
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
 * Tests for getNullCheckBehavior.
 *
 * This function determines what kind of null-handling code to generate for
 * a property during JSON deserialization. Getting this wrong means either:
 * - Missing null checks → NullReferenceException when JSON has null values
 * - Unnecessary null checks → redundant code that doesn't match legacy output
 * - Wrong null handling → collections not properly initialized for null wire values
 */
describe("getNullCheckBehavior", () => {
  /**
   * Optional non-collection properties (e.g., `name?: string`) are nullable
   * in C# (`string?`). When JSON has null for this property, we assign null
   * to the local variable and continue to the next property.
   */
  it('returns "assign-null" for optional non-collection property', () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: true,
    });
    expect(getNullCheckBehavior(prop)).toBe("assign-null");
  });

  /**
   * Required but explicitly nullable properties (e.g., `name: string | null`)
   * are wrapped in SdkNullableType by TCGC. They need the same assign-null
   * handling as optional properties.
   */
  it('returns "assign-null" for required explicitly nullable property', () => {
    const prop = makeProperty({
      type: makeNullable(makeBuiltIn("string")),
      optional: false,
    });
    expect(getNullCheckBehavior(prop)).toBe("assign-null");
  });

  /**
   * Required non-nullable properties (e.g., `name: string`) should never
   * receive null in valid JSON. No null check is generated.
   */
  it("returns null for required non-nullable property", () => {
    const prop = makeProperty({
      type: makeBuiltIn("string"),
      optional: false,
    });
    expect(getNullCheckBehavior(prop)).toBeNull();
  });

  /**
   * Required non-nullable value type (e.g., `count: int32`) can't be null
   * in C#. No null check needed.
   */
  it("returns null for required int32 property", () => {
    const prop = makeProperty({
      type: makeBuiltIn("int32"),
      optional: false,
    });
    expect(getNullCheckBehavior(prop)).toBeNull();
  });

  /**
   * Optional value types (e.g., `count?: int32`) become `int?` in C#.
   * Null on the wire means assign null and continue.
   */
  it('returns "assign-null" for optional int32 property', () => {
    const prop = makeProperty({
      type: makeBuiltIn("int32"),
      optional: true,
    });
    expect(getNullCheckBehavior(prop)).toBe("assign-null");
  });

  /**
   * Optional collections (e.g., `items?: string[]`) use ChangeTrackingList
   * for "not set" semantics. When JSON has null, we just continue — leaving
   * the ChangeTracking default in place.
   */
  it('returns "skip" for optional array property', () => {
    const prop = makeProperty({
      type: makeArray(makeBuiltIn("string")),
      optional: true,
    });
    expect(getNullCheckBehavior(prop)).toBe("skip");
  });

  /**
   * Optional dictionaries follow the same pattern as optional arrays.
   */
  it('returns "skip" for optional dictionary property', () => {
    const prop = makeProperty({
      type: makeDict(makeBuiltIn("int32")),
      optional: true,
    });
    expect(getNullCheckBehavior(prop)).toBe("skip");
  });

  /**
   * Required but explicitly nullable collections (e.g., `items: string[] | null`)
   * need a new empty ChangeTracking instance to represent "was null on wire"
   * (as opposed to "not present" which is the default state).
   */
  it('returns "empty-collection" for required nullable array', () => {
    const prop = makeProperty({
      type: makeNullable(makeArray(makeBuiltIn("string"))),
      optional: false,
    });
    expect(getNullCheckBehavior(prop)).toBe("empty-collection");
  });

  /**
   * Required nullable dictionaries get the same empty-collection treatment.
   */
  it('returns "empty-collection" for required nullable dictionary', () => {
    const prop = makeProperty({
      type: makeNullable(makeDict(makeBuiltIn("string"))),
      optional: false,
    });
    expect(getNullCheckBehavior(prop)).toBe("empty-collection");
  });

  /**
   * Required non-nullable collections (e.g., `items: string[]`) should always
   * have a non-null JSON array. No null check is generated.
   */
  it("returns null for required non-nullable array", () => {
    const prop = makeProperty({
      type: makeArray(makeBuiltIn("string")),
      optional: false,
    });
    expect(getNullCheckBehavior(prop)).toBeNull();
  });

  /**
   * Required non-nullable dictionaries follow the same pattern.
   */
  it("returns null for required non-nullable dictionary", () => {
    const prop = makeProperty({
      type: makeDict(makeBuiltIn("string")),
      optional: false,
    });
    expect(getNullCheckBehavior(prop)).toBeNull();
  });
});

/**
 * Integration tests for null value handling in generated C# code.
 *
 * These tests compile TypeSpec definitions and verify that the generated
 * serialization files contain the correct null-handling patterns. They
 * validate the full pipeline: TypeSpec → TCGC → PropertyMatchingLoop → C#.
 *
 * Why these tests matter:
 * - Unit tests on getNullCheckBehavior verify the decision logic, but only
 *   integration tests verify the actual generated C# code is syntactically
 *   correct and matches expected patterns.
 * - Catches regressions in indentation, variable naming, and the interaction
 *   between null checks and value extraction code.
 */
describe("null value handling in generated C#", () => {
  /**
   * Optional string property should generate a null check that assigns null
   * to the variable and continues. This is the most common null handling
   * pattern — optional properties in TypeSpec become nullable in C#.
   */
  it("generates null check for optional string property", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
        description?: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();
    const content = outputs[fileKey!];

    // Required property (name) should NOT have a null check
    expect(content).toContain('if (prop.NameEquals("name"u8))');
    expect(content).not.toMatch(
      /NameEquals\("name"u8\).*?ValueKind == JsonValueKind\.Null.*?name = null/s,
    );

    // Optional property (description) should have: assign null and continue
    expect(content).toContain('if (prop.NameEquals("description"u8))');
    expect(content).toContain("description = null;");
    expect(content).toContain("prop.Value.ValueKind == JsonValueKind.Null");
  });

  /**
   * Optional int32 property becomes `int?` in C#. The null check must
   * assign null (not 0 or default) to distinguish "not present" from "zero".
   */
  it("generates null check for optional value type property", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
        count?: int32;
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // count is optional → null check with assign null
    expect(content).toContain('if (prop.NameEquals("count"u8))');
    expect(content).toContain("count = null;");
  });

  /**
   * Optional array property should generate a null check that just
   * continues — leaving the ChangeTracking default in place. The array
   * deserialization code should still appear after the null check.
   */
  it("generates skip null check for optional array property", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
        tags?: string[];
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // The tags block should have a null check with continue (no assignment)
    expect(content).toContain('if (prop.NameEquals("tags"u8))');

    // Extract the tags block to verify null check is before array deserialization
    const tagsBlockStart = content.indexOf('if (prop.NameEquals("tags"u8))');
    const tagsBlock = content.substring(
      tagsBlockStart,
      content.indexOf("}", tagsBlockStart + 200) + 1,
    );

    expect(tagsBlock).toContain("prop.Value.ValueKind == JsonValueKind.Null");
    // Should NOT contain "tags = null" — just continue
    expect(tagsBlock).not.toContain("tags = null");
  });

  /**
   * Required non-nullable property should NOT have any null check.
   * This verifies we're not generating unnecessary null checks that would
   * bloat the output and diverge from the legacy emitter.
   */
  it("does not generate null check for required non-nullable property", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
        count: int32;
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // Extract the name block — should not have JsonValueKind.Null check
    const nameStart = content.indexOf('if (prop.NameEquals("name"u8))');
    const countStart = content.indexOf('if (prop.NameEquals("count"u8))');

    // Get the name block (between name match and count match)
    const nameBlock = content.substring(nameStart, countStart);
    expect(nameBlock).not.toContain("JsonValueKind.Null");

    // Get the count block
    const countBlock = content.substring(
      countStart,
      content.indexOf("}", countStart + 100) + 1,
    );
    expect(countBlock).not.toContain("JsonValueKind.Null");
  });
});
