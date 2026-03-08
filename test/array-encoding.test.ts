import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for array encoding with delimiter serialization/deserialization.
 *
 * When a model property has `@encode(ArrayEncoding.commaDelimited)` (or space/pipe/newline),
 * the array should be serialized as a single delimited string in JSON rather than
 * a JSON array. For example, `["blue","red","green"]` becomes `"blue,red,green"`.
 *
 * These tests verify that:
 * 1. The serialization code uses `string.Join(delimiter, ...)` instead of WriteStartArray/foreach
 * 2. The deserialization code uses `string.Split(char)` instead of EnumerateArray/foreach
 * 3. Fixed enums use `.ToSerialString()` / `.To{EnumName}()` for conversion
 * 4. Extensible enums use `.ToString()` / `new {EnumName}(v)` for conversion
 * 5. System.Linq is added to usings when enum element types are involved
 *
 * Why these tests matter:
 * - 12 Spector Encode_Array_Property e2e tests fail without this fix
 * - The mock server expects delimited strings, not JSON arrays
 * - Without correct serialization, the server returns HTTP 400
 */
describe("array encoding with delimiters", () => {
  /**
   * Validates that a string array property with @encode(ArrayEncoding.commaDelimited)
   * generates string.Join(",", ...) serialization instead of WriteStartArray/foreach.
   * This is the simplest case — no enum conversion or System.Linq needed.
   */
  it("serializes comma-delimited string array as joined string", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model CommaDelimitedArrayProperty {
        @encode(ArrayEncoding.commaDelimited)
        value: string[];
      }

      @route("/test")
      @post op test(@body body: CommaDelimitedArrayProperty): CommaDelimitedArrayProperty;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) =>
        k.includes("CommaDelimitedArrayProperty") &&
        k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    // Serialization: should use string.Join, NOT WriteStartArray
    expect(serFile).toContain('string.Join(",", Value)');
    expect(serFile).not.toContain("WriteStartArray");
    expect(serFile).not.toContain("WriteEndArray");

    // Deserialization: should use Split, NOT EnumerateArray
    expect(serFile).toContain("GetString().Split(',')");
    expect(serFile).not.toContain("EnumerateArray");

    // No System.Linq needed for string elements
    expect(serFile).not.toContain("System.Linq");
  });

  /**
   * Validates pipe-delimited encoding generates the correct pipe delimiter.
   * Tests that different delimiter types produce the correct C# literal.
   */
  it("serializes pipe-delimited string array with pipe delimiter", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model PipeDelimitedArrayProperty {
        @encode(ArrayEncoding.pipeDelimited)
        value: string[];
      }

      @route("/test")
      @post op test(@body body: PipeDelimitedArrayProperty): PipeDelimitedArrayProperty;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) =>
        k.includes("PipeDelimitedArrayProperty") && k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    // Should use pipe delimiter
    expect(serFile).toContain('string.Join("|", Value)');
    expect(serFile).toContain("GetString().Split('|')");
  });

  /**
   * Validates space-delimited encoding generates the correct space delimiter.
   */
  it("serializes space-delimited string array with space delimiter", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model SpaceDelimitedArrayProperty {
        @encode(ArrayEncoding.spaceDelimited)
        value: string[];
      }

      @route("/test")
      @post op test(@body body: SpaceDelimitedArrayProperty): SpaceDelimitedArrayProperty;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) =>
        k.includes("SpaceDelimitedArrayProperty") &&
        k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    // Should use space delimiter
    expect(serFile).toContain('string.Join(" ", Value)');
    expect(serFile).toContain("GetString().Split(' ')");
  });

  /**
   * Validates newline-delimited encoding generates the correct escape sequence.
   * The newline character requires proper C# escape: '\n' in char literal
   * and "\n" in string literal.
   */
  it("serializes newline-delimited string array with newline delimiter", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model NewlineDelimitedArrayProperty {
        @encode(ArrayEncoding.newlineDelimited)
        value: string[];
      }

      @route("/test")
      @post op test(@body body: NewlineDelimitedArrayProperty): NewlineDelimitedArrayProperty;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) =>
        k.includes("NewlineDelimitedArrayProperty") &&
        k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    // Should use \n delimiter (escaped in C# source)
    expect(serFile).toContain('string.Join("\\n", Value)');
    expect(serFile).toContain("GetString().Split('\\n')");
  });

  /**
   * Validates that a fixed enum array with comma-delimited encoding generates
   * Select(v => v.ToSerialString()) for serialization and
   * Select(v => v.To{EnumName}()) for deserialization.
   * Fixed enums need explicit wire-value conversion because .ToString()
   * returns the C# member name, not the wire string.
   */
  it("serializes comma-delimited fixed enum array with ToSerialString", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      enum Colors {
        Blue: "blue",
        Red: "red",
        Green: "green",
      }

      model CommaDelimitedEnumArrayProperty {
        @encode(ArrayEncoding.commaDelimited)
        value: Colors[];
      }

      @route("/test")
      @post op test(@body body: CommaDelimitedEnumArrayProperty): CommaDelimitedEnumArrayProperty;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) =>
        k.includes("CommaDelimitedEnumArrayProperty") &&
        k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    // Serialization: fixed enums need .Select(v => v.ToSerialString())
    expect(serFile).toContain(
      'string.Join(",", Value.Select(v => v.ToSerialString()))',
    );

    // Deserialization: fixed enums need .Select(v => v.To{EnumName}()).ToArray()
    expect(serFile).toContain(
      "GetString().Split(',').Select(v => v.ToColors()).ToArray()",
    );

    // System.Linq is needed for .Select()
    expect(serFile).toContain("System.Linq");
  });

  /**
   * Validates that an extensible enum (union type) array with comma-delimited
   * encoding generates Select(v => v.ToString()) for serialization and
   * Select(v => new {EnumName}(v)) for deserialization.
   * Extensible enums are readonly structs where .ToString() returns the wire value.
   */
  it("serializes comma-delimited extensible enum array with ToString", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      union ColorsExtensibleEnum {
        string,
        Blue: "blue",
        Red: "red",
        Green: "green",
      }

      model CommaDelimitedExtensibleEnumArrayProperty {
        @encode(ArrayEncoding.commaDelimited)
        value: ColorsExtensibleEnum[];
      }

      @route("/test")
      @post op test(@body body: CommaDelimitedExtensibleEnumArrayProperty): CommaDelimitedExtensibleEnumArrayProperty;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) =>
        k.includes("CommaDelimitedExtensibleEnumArrayProperty") &&
        k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    // Serialization: extensible enums use .ToString()
    expect(serFile).toContain(
      'string.Join(",", Value.Select(v => v.ToString()))',
    );

    // Deserialization: extensible enums use new {EnumName}(v) constructor
    expect(serFile).toContain(
      "GetString().Split(',').Select(v => new ColorsExtensibleEnum(v)).ToArray()",
    );

    // System.Linq is needed for .Select()
    expect(serFile).toContain("System.Linq");
  });

  /**
   * Validates that a normal (non-encoded) array property is unaffected —
   * it should still use the standard WriteStartArray/foreach/WriteEndArray pattern.
   * This regression test ensures the encoding check doesn't break non-encoded arrays.
   */
  it("does not affect non-encoded array properties", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model NormalArrayProperty {
        value: string[];
      }

      @route("/test")
      @post op test(@body body: NormalArrayProperty): NormalArrayProperty;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) => k.includes("NormalArrayProperty") && k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    // Normal arrays should use the standard pattern
    expect(serFile).toContain("WriteStartArray");
    expect(serFile).toContain("WriteEndArray");
    expect(serFile).toContain("EnumerateArray");
    expect(serFile).not.toContain("string.Join");
    expect(serFile).not.toContain("Split");
  });
});
