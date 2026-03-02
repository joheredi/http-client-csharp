import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the ExtensibleEnumSerializationFile component.
 *
 * These tests verify that the emitter correctly generates C# serialization
 * partial structs for numeric extensible enums, and correctly SKIPS
 * serialization file generation for string extensible enums.
 *
 * Why these tests matter:
 * - Numeric extensible enums need a ToSerial{Type} method for JSON serialization.
 * - String extensible enums use ToString() directly and need no serialization file.
 * - The generated partial struct must match the legacy emitter's output format.
 * - The ToSerial method must be internal (not public) and return _value directly.
 */
describe("ExtensibleEnumSerializationFile", () => {
  /**
   * Validates that an int32-backed extensible enum generates a serialization
   * file containing a partial struct with an internal ToSerialInt32 method.
   *
   * This is the core smoke test for numeric extensible enum serialization.
   * The method must return _value (the underlying int field) to allow the
   * JSON serializer to write the numeric value.
   */
  it("generates ToSerialInt32 for int-backed extensible enum", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      union Priority {
        int32,
        Low: 1,
        High: 2,
        Critical: 10,
      }

      @route("/test")
      op test(@query priority: Priority): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) => k.includes("Priority") && k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    // Partial struct (not extension class — extensible enums use struct, not class)
    expect(serFile).toContain("public readonly partial struct Priority");

    // Internal ToSerial method returning _value
    expect(serFile).toContain("internal int ToSerialInt32() => _value;");
  });

  /**
   * Validates that a float32-backed extensible enum generates a serialization
   * file with ToSerialSingle. The method name uses "Single" (the .NET framework
   * name for float) to match the legacy emitter's naming convention.
   */
  it("generates ToSerialSingle for float-backed extensible enum", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      union Temperature {
        float32,
        Cold: 32.5,
        Warm: 72.0,
        Hot: 100.5,
      }

      @route("/test")
      op test(@query temp: Temperature): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) => k.includes("Temperature") && k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    // Float-backed uses "Single" in method name and "float" as return type
    expect(serFile).toContain("public readonly partial struct Temperature");
    expect(serFile).toContain("internal float ToSerialSingle() => _value;");
  });

  /**
   * Validates that string-backed extensible enums do NOT generate a
   * serialization file. String enums use ToString() for serialization
   * and an implicit conversion operator for deserialization, so no
   * separate serialization file is needed.
   *
   * This is critical: generating a serialization file for string enums
   * would produce incorrect output and not match the legacy emitter.
   */
  it("does not generate serialization file for string-backed extensible enum", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      union Color {
        string,
        Red: "Red",
        Green: "Green",
        Blue: "Blue",
      }

      @route("/test")
      op test(@query color: Color): void;
    `);

    expect(diagnostics).toHaveLength(0);

    // The main enum file should exist
    const enumFileKey = Object.keys(outputs).find(
      (k) => k.includes("Color") && !k.includes("Serialization"),
    );
    expect(enumFileKey).toBeDefined();

    // But no serialization file for string enums
    const serFileKey = Object.keys(outputs).find(
      (k) => k.includes("Color") && k.includes("Serialization"),
    );
    expect(serFileKey).toBeUndefined();
  });

  /**
   * Validates that the serialization file includes the standard auto-generated
   * header with license comment, auto-generated marker, and nullable disable
   * directive. This ensures compliance with the legacy emitter's file format.
   */
  it("includes the standard auto-generated header", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      union StatusCode {
        int32,
        Ok: 200,
        NotFound: 404,
      }

      @route("/test")
      op test(@query code: StatusCode): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) => k.includes("StatusCode") && k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    expect(serFile).toContain("// <auto-generated/>");
    expect(serFile).toContain("#nullable disable");
  });

  /**
   * Validates that the serialization partial struct is wrapped in the correct
   * namespace matching the service namespace from the TypeSpec input.
   */
  it("wraps the partial struct in the correct namespace", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace MyService;

      union Level {
        int32,
        Low: 1,
        High: 2,
      }

      @route("/test")
      op test(@query level: Level): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) => k.includes("Level") && k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    expect(serFile).toContain("namespace MyService");
  });

  /**
   * Validates the file path pattern for extensible enum serialization files.
   * The generated file must be at src/Generated/Models/{EnumName}.Serialization.cs
   * to match the legacy emitter's output structure.
   */
  it("generates file at the correct path", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      union Score {
        int32,
        Low: 1,
        High: 100,
      }

      @route("/test")
      op test(@query score: Score): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) => k.includes("Score") && k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    expect(serFileKey).toContain("src/Generated/Models/Score.Serialization.cs");
  });

  /**
   * Validates that no serialization files are generated when only string
   * extensible enums exist. This is a broader test than the single-enum
   * skip test — it ensures the emitter filtering logic works correctly
   * when ALL extensible enums are string-backed.
   */
  it("produces no serialization files when only string extensible enums exist", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      union Fruit {
        string,
        Apple: "Apple",
        Banana: "Banana",
      }

      union Vegetable {
        string,
        Carrot: "Carrot",
        Potato: "Potato",
      }

      @route("/test")
      op test(@query fruit: Fruit, @query veg: Vegetable): void;
    `);

    expect(diagnostics).toHaveLength(0);

    // Both enum files should exist
    const enumFiles = Object.keys(outputs).filter(
      (k) =>
        (k.includes("Fruit") || k.includes("Vegetable")) &&
        !k.includes("Serialization"),
    );
    expect(enumFiles).toHaveLength(2);

    // No serialization files for string enums
    const serFiles = Object.keys(outputs).filter(
      (k) =>
        (k.includes("Fruit") || k.includes("Vegetable")) &&
        k.includes("Serialization"),
    );
    expect(serFiles).toHaveLength(0);
  });

  /**
   * Validates that when both string and numeric extensible enums exist,
   * only the numeric enum gets a serialization file. This tests the
   * filtering logic at the emitter level for mixed enum scenarios.
   */
  it("generates serialization file for numeric but not string extensible enums in same spec", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      union Color {
        string,
        Red: "Red",
        Blue: "Blue",
      }

      union Priority {
        int32,
        Low: 1,
        High: 2,
      }

      @route("/test")
      op test(@query color: Color, @query priority: Priority): void;
    `);

    expect(diagnostics).toHaveLength(0);

    // Priority should have a serialization file
    const prioritySerFile = Object.keys(outputs).find(
      (k) => k.includes("Priority") && k.includes("Serialization"),
    );
    expect(prioritySerFile).toBeDefined();
    expect(outputs[prioritySerFile!]).toContain(
      "internal int ToSerialInt32() => _value;",
    );

    // Color should NOT have a serialization file
    const colorSerFile = Object.keys(outputs).find(
      (k) => k.includes("Color") && k.includes("Serialization"),
    );
    expect(colorSerFile).toBeUndefined();
  });
});
