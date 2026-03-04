/**
 * Tests for literal type wrapper struct generation.
 *
 * Verifies that optional/nullable constant-typed model properties generate
 * readonly partial struct wrappers implementing IEquatable<T>, following
 * the same pattern as extensible enums. These structs allow the property
 * to accept any value of the underlying type (not just the literal value),
 * providing forward-compatibility similar to extensible enums.
 *
 * The tests validate:
 * - Float literal → wrapper struct with ToSerialSingle() serialization
 * - Int literal → wrapper struct with ToSerialInt32() serialization
 * - String literal → wrapper struct without serialization file
 * - Bool literal → NO wrapper struct (uses nullable bool directly)
 * - Required literal → NO wrapper struct (uses raw primitive with initializer)
 * - Property types on the model reference the wrapper struct
 *
 * @module
 */

import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Helper to compile a TypeSpec service with a model that has literal properties
 * and return the generated output files.
 */
async function compileLiteralModel(typeSpec: string) {
  const [{ outputs }, diagnostics] =
    await HttpTester.compileAndDiagnose(typeSpec);
  expect(diagnostics).toHaveLength(0);
  return outputs;
}

describe("Literal type wrapper structs", () => {
  /**
   * Tests that an optional float literal property generates a readonly partial
   * struct wrapper. The struct should:
   * - Implement IEquatable<T>
   * - Have a private readonly float _value field
   * - Have a private const with the literal value (4.56F)
   * - Include equality operators, implicit conversion, and GetHashCode/ToString
   * - Use CultureInfo.InvariantCulture for ToString (numeric types)
   */
  it("generates float literal wrapper struct for optional float property", async () => {
    const outputs = await compileLiteralModel(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Thing {
        name: string;
        optionalLiteralFloat?: 4.56;
      }

      @route("/things")
      op getThings(): Thing;
    `);

    const structFile = Object.keys(outputs).find((k) =>
      k.endsWith("ThingOptionalLiteralFloat.cs"),
    );
    expect(structFile).toBeDefined();
    const content = outputs[structFile!];

    // Verify struct declaration with IEquatable
    expect(content).toContain(
      "public readonly partial struct ThingOptionalLiteralFloat : IEquatable<ThingOptionalLiteralFloat>",
    );

    // Verify private value field
    expect(content).toContain("private readonly float _value;");

    // Verify const field with literal value
    expect(content).toContain("private const float");
    expect(content).toContain("4.56F");

    // Verify constructor
    expect(content).toContain("public ThingOptionalLiteralFloat(float value)");

    // Verify equality operators
    expect(content).toContain(
      "public static bool operator ==(ThingOptionalLiteralFloat left, ThingOptionalLiteralFloat right) => left.Equals(right);",
    );
    expect(content).toContain(
      "public static bool operator !=(ThingOptionalLiteralFloat left, ThingOptionalLiteralFloat right) => !left.Equals(right);",
    );

    // Verify implicit conversion from float
    expect(content).toContain(
      "public static implicit operator ThingOptionalLiteralFloat(float value) => new ThingOptionalLiteralFloat(value);",
    );

    // String-only nullable implicit operator should NOT be present for float
    expect(content).not.toContain(
      "public static implicit operator ThingOptionalLiteralFloat?(float value)",
    );

    // Verify Equals methods
    expect(content).toContain(
      "public override bool Equals(object obj) => obj is ThingOptionalLiteralFloat other && Equals(other);",
    );
    expect(content).toContain(
      "public bool Equals(ThingOptionalLiteralFloat other) => Equals(_value, other._value);",
    );

    // Verify GetHashCode (numeric: _value.GetHashCode())
    expect(content).toContain(
      "public override int GetHashCode() => _value.GetHashCode();",
    );

    // Verify ToString with CultureInfo.InvariantCulture (numeric)
    expect(content).toContain(
      "public override string ToString() => _value.ToString(CultureInfo.InvariantCulture);",
    );

    // Verify using directives
    expect(content).toContain("using System;");
    expect(content).toContain("using System.ComponentModel;");
    expect(content).toContain("using System.Globalization;");
  });

  /**
   * Tests that a float literal wrapper struct generates a serialization file
   * with ToSerialSingle() method. This is needed because numeric types cannot
   * be serialized by ToString() — the serialization layer needs the raw numeric
   * value to write to JSON.
   */
  it("generates serialization file for float literal wrapper", async () => {
    const outputs = await compileLiteralModel(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Thing {
        name: string;
        optionalLiteralFloat?: 4.56;
      }

      @route("/things")
      op getThings(): Thing;
    `);

    const serializationFile = Object.keys(outputs).find((k) =>
      k.endsWith("ThingOptionalLiteralFloat.Serialization.cs"),
    );
    expect(serializationFile).toBeDefined();
    const content = outputs[serializationFile!];

    // Verify partial struct with ToSerialSingle method
    expect(content).toContain(
      "public readonly partial struct ThingOptionalLiteralFloat",
    );
    expect(content).toContain("internal float ToSerialSingle() => _value;");
  });

  /**
   * Tests that an optional int literal property generates a wrapper struct
   * with int-specific patterns (no F suffix, int type, ToSerialInt32).
   */
  it("generates int literal wrapper struct for optional int property", async () => {
    const outputs = await compileLiteralModel(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Thing {
        name: string;
        optionalLiteralInt?: 456;
      }

      @route("/things")
      op getThings(): Thing;
    `);

    const structFile = Object.keys(outputs).find((k) =>
      k.endsWith("ThingOptionalLiteralInt.cs"),
    );
    expect(structFile).toBeDefined();
    const content = outputs[structFile!];

    expect(content).toContain(
      "public readonly partial struct ThingOptionalLiteralInt : IEquatable<ThingOptionalLiteralInt>",
    );
    expect(content).toContain("private readonly int _value;");
    expect(content).toContain("private const int");

    // Verify serialization file exists with ToSerialInt32
    const serFile = Object.keys(outputs).find((k) =>
      k.endsWith("ThingOptionalLiteralInt.Serialization.cs"),
    );
    expect(serFile).toBeDefined();
    expect(outputs[serFile!]).toContain(
      "internal int ToSerialInt32() => _value;",
    );
  });

  /**
   * Tests that an optional string literal property generates a wrapper struct
   * with string-specific patterns: case-insensitive comparison, null validation,
   * nullable implicit conversion, and no serialization file.
   */
  it("generates string literal wrapper struct for optional string property", async () => {
    const outputs = await compileLiteralModel(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Thing {
        name: string;
        optionalLiteralString?: "reject";
      }

      @route("/things")
      op getThings(): Thing;
    `);

    const structFile = Object.keys(outputs).find((k) =>
      k.endsWith("ThingOptionalLiteralString.cs"),
    );
    expect(structFile).toBeDefined();
    const content = outputs[structFile!];

    expect(content).toContain(
      "public readonly partial struct ThingOptionalLiteralString : IEquatable<ThingOptionalLiteralString>",
    );
    expect(content).toContain("private readonly string _value;");

    // String-specific: Argument.AssertNotNull in constructor
    expect(content).toContain("Argument.AssertNotNull(value, nameof(value));");

    // String-specific: case-insensitive Equals
    expect(content).toContain(
      "string.Equals(_value, other._value, StringComparison.InvariantCultureIgnoreCase)",
    );

    // String-specific: StringComparer.InvariantCultureIgnoreCase for GetHashCode
    expect(content).toContain(
      "StringComparer.InvariantCultureIgnoreCase.GetHashCode(_value)",
    );

    // String-specific: nullable implicit conversion operator
    expect(content).toContain(
      "public static implicit operator ThingOptionalLiteralString?(string value) => value == null ? null : new ThingOptionalLiteralString(value);",
    );

    // String-specific: ToString returns _value directly
    expect(content).toContain("public override string ToString() => _value;");

    // No serialization file for string types
    const serFile = Object.keys(outputs).find((k) =>
      k.endsWith("ThingOptionalLiteralString.Serialization.cs"),
    );
    expect(serFile).toBeUndefined();
  });

  /**
   * Tests that optional bool literal properties do NOT generate wrapper structs.
   * Bool has only two possible values, making extensible wrappers unnecessary.
   * Instead, optional bool uses nullable bool (bool?).
   */
  it("does NOT generate wrapper struct for optional bool literal", async () => {
    const outputs = await compileLiteralModel(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Thing {
        name: string;
        optionalLiteralBool?: false;
      }

      @route("/things")
      op getThings(): Thing;
    `);

    // No wrapper struct file should be generated for bool
    const structFile = Object.keys(outputs).find(
      (k) => k.includes("ThingOptionalLiteralBool") && k.endsWith(".cs"),
    );
    expect(structFile).toBeUndefined();
  });

  /**
   * Tests that the model property type references the wrapper struct when
   * the property is an optional literal. The property should be typed as
   * ThingOptionalLiteralFloat? (nullable wrapper struct) instead of float?.
   */
  it("uses wrapper struct type on model property", async () => {
    const outputs = await compileLiteralModel(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Thing {
        name: string;
        optionalLiteralFloat?: 4.56;
      }

      @route("/things")
      op getThings(): Thing;
    `);

    const modelFile = Object.keys(outputs).find(
      (k) => k.endsWith("Thing.cs") && k.includes("Models"),
    );
    expect(modelFile).toBeDefined();
    const content = outputs[modelFile!];

    // Property should reference wrapper struct type, not raw float
    expect(content).toContain("ThingOptionalLiteralFloat?");
    expect(content).not.toMatch(/public\s+float\?\s+OptionalLiteralFloat/);
  });
});
