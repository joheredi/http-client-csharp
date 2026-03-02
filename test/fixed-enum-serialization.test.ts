import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the FixedEnumSerializationFile component.
 *
 * These tests verify that the emitter correctly generates C# serialization
 * extension classes for fixed (non-extensible) enums. The serialization file
 * contains ToSerial{Type} and To{EnumName} extension methods that convert
 * between enum values and their underlying representations.
 *
 * Why these tests matter:
 * - Serialization is required for all fixed enums to round-trip through JSON.
 * - Int-backed enums skip the serialization method (values embedded in enum).
 * - String comparison must be case-insensitive (StringComparer.OrdinalIgnoreCase).
 * - Numeric comparison must use == equality.
 * - The generated code must match the legacy emitter's golden file format.
 */
describe("FixedEnumSerializationFile", () => {
  /**
   * Validates that a string-backed fixed enum generates a serialization file
   * with the correct file path pattern ({EnumName}.Serialization.cs) and the
   * internal static partial extension class structure.
   */
  it("generates serialization file for string-backed enum", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      enum Color {
        Red,
        Green,
        Blue,
      }

      @route("/test")
      op test(@query color: Color): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) => k.includes("Color") && k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    // File structure
    expect(serFile).toContain("using System;");
    expect(serFile).toContain("internal static partial class ColorExtensions");

    // Serialization method (string enums always have this)
    expect(serFile).toContain("ToSerialString(this Color value)");
    expect(serFile).toContain("=> value switch");
    expect(serFile).toContain('Color.Red => "Red"');
    expect(serFile).toContain('Color.Green => "Green"');
    expect(serFile).toContain('Color.Blue => "Blue"');

    // Deserialization method
    expect(serFile).toContain("ToColor(this string value)");
    expect(serFile).toContain("StringComparer.OrdinalIgnoreCase.Equals");
    expect(serFile).toContain("return Color.Red;");
    expect(serFile).toContain("return Color.Green;");
    expect(serFile).toContain("return Color.Blue;");

    // Error handling
    expect(serFile).toContain("ArgumentOutOfRangeException");
    expect(serFile).toContain("Unknown Color value.");
  });

  /**
   * Validates that int-backed fixed enums do NOT generate a serialization
   * method (ToSerial*), because integer values are embedded directly in the
   * C# enum declaration. Only the deserialization method is generated.
   *
   * This matches the legacy emitter behavior where FixedEnumSerializationProvider
   * checks NeedsSerializationMethod() and skips int/long underlying types.
   */
  it("skips serialization method for int-backed enums", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      enum Priority {
        Low: 0,
        Medium: 1,
        High: 2,
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

    // Should NOT have serialization method
    expect(serFile).not.toContain("ToSerial");
    expect(serFile).not.toContain("=> value switch");

    // Should have deserialization method with int parameter
    expect(serFile).toContain("ToPriority(this int value)");
    expect(serFile).toContain("value == 0");
    expect(serFile).toContain("value == 1");
    expect(serFile).toContain("value == 2");
    expect(serFile).toContain("return Priority.Low;");
    expect(serFile).toContain("return Priority.Medium;");
    expect(serFile).toContain("return Priority.High;");
  });

  /**
   * Validates that float-backed fixed enums generate both serialization and
   * deserialization methods. Float values use the F suffix in C# (e.g., 1.1F)
   * and the method name uses "Single" (the .NET framework name for float).
   *
   * This matches the legacy golden file FloatFixedEnum.Serialization.cs.
   */
  it("generates both methods for float-backed enums", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      enum Temperature {
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

    // Serialization method with float return type and "Single" suffix
    expect(serFile).toContain(
      "ToSerialSingle(this Temperature value) => value switch",
    );
    expect(serFile).toContain("Temperature.Cold => 32.5F");
    expect(serFile).toContain("Temperature.Warm => 72F");
    expect(serFile).toContain("Temperature.Hot => 100.5F");

    // Deserialization method with float parameter and == comparison
    expect(serFile).toContain("ToTemperature(this float value)");
    expect(serFile).toContain("value == 32.5F");
    expect(serFile).toContain("value == 72F");
    expect(serFile).toContain("value == 100.5F");
    expect(serFile).toContain("return Temperature.Cold;");
  });

  /**
   * Validates the auto-generated file header is present in the serialization
   * file, including the license comment, auto-generated marker, and nullable
   * disable directive. The header must match the legacy emitter's format.
   */
  it("includes the standard auto-generated header and using System", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      enum Status {
        Active,
        Inactive,
      }

      @route("/test")
      op test(@query status: Status): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) => k.includes("Status") && k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    expect(serFile).toContain("// <auto-generated/>");
    expect(serFile).toContain("#nullable disable");
    expect(serFile).toContain("using System;");
  });

  /**
   * Validates the correct namespace wrapping for the serialization extension class.
   * The namespace comes from the TCGC SdkEnumType.namespace property and must
   * match the enum declaration's namespace.
   */
  it("wraps the extension class in the correct namespace", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace MyService;

      enum Direction {
        North,
        South,
      }

      @route("/test")
      op test(@query dir: Direction): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) => k.includes("Direction") && k.includes("Serialization"),
    );
    expect(serFileKey).toBeDefined();
    const serFile = outputs[serFileKey!];

    expect(serFile).toContain("namespace MyService");
  });

  /**
   * Validates that no serialization files are generated when no enums exist
   * in the TypeSpec input. This ensures the emitter doesn't produce spurious
   * serialization files.
   */
  it("produces no serialization files when no enums exist", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      op test(): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFiles = Object.keys(outputs).filter(
      (k) => k.includes("Serialization") && !k.includes("Internal/"),
    );
    expect(serFiles).toHaveLength(0);
  });

  /**
   * Validates the file path pattern for serialization files. The generated
   * file must be at src/Generated/Models/{EnumName}.Serialization.cs to match
   * the legacy emitter's output structure.
   */
  it("generates file at the correct path", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      enum Fruit {
        Apple,
        Banana,
      }

      @route("/test")
      op test(@query fruit: Fruit): void;
    `);

    expect(diagnostics).toHaveLength(0);

    const serFileKey = Object.keys(outputs).find(
      (k) => k.includes("Serialization") && !k.includes("Internal/"),
    );
    expect(serFileKey).toBeDefined();
    expect(serFileKey).toContain("src/Generated/Models/Fruit.Serialization.cs");
  });
});
