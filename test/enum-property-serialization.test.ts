/**
 * Tests for enum property serialization in the JSON write path.
 *
 * These tests validate that enum-typed model properties generate the correct
 * `Utf8JsonWriter` calls inside `JsonModelWriteCore`. Enum serialization has
 * five distinct patterns based on two dimensions:
 *
 * 1. **Fixed vs extensible** — determines if extension methods or instance methods are used
 * 2. **Backing type** (string, int, float) — determines the writer method and value transform
 *
 * | Kind       | String-backed                              | Int-backed                           | Float-backed                              |
 * |------------|--------------------------------------------|--------------------------------------|-------------------------------------------|
 * | Fixed      | `WriteStringValue(P.ToSerialString())`     | `WriteNumberValue((int)P)`           | `WriteNumberValue(P.ToSerialSingle())`    |
 * | Extensible | `WriteStringValue(P.ToString())`           | `WriteNumberValue(P.ToSerialInt32())` | `WriteNumberValue(P.ToSerialSingle())`   |
 *
 * These patterns match the legacy emitter's `MrwSerializationTypeDefinition.SerializeJsonValueCore`.
 *
 * @module
 */

import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

describe("enum property serialization", () => {
  /**
   * Validates that a string-backed fixed enum property generates
   * `writer.WriteStringValue(Status.ToSerialString())`.
   *
   * Fixed string enums use an extension method from `{EnumName}Extensions`
   * to map the C# enum value to its wire-format string. This is the most
   * common enum serialization pattern in Azure SDK C# clients.
   */
  it("serializes string-backed fixed enum with ToSerialString()", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      enum Status {
        active: "active",
        inactive: "inactive",
      }

      model Widget {
        status: Status;
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

    expect(content).toContain('writer.WritePropertyName("status"u8);');
    expect(content).toContain(
      "writer.WriteStringValue(Status.ToSerialString());",
    );
  });

  /**
   * Validates that an int-backed fixed enum property generates
   * `writer.WriteNumberValue((int)Priority)`.
   *
   * Int-backed fixed enums use a direct cast because their integer values
   * are embedded in the C# enum declaration. No extension method is needed.
   * This matches the legacy emitter's `value.CastTo(type.UnderlyingEnumType)`.
   */
  it("serializes int-backed fixed enum with direct cast", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      enum Priority {
        low: 1,
        medium: 2,
        high: 3,
      }

      model Task {
        priority: Priority;
      }

      @route("/test")
      op test(): Task;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Task.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();
    const content = outputs[fileKey!];

    expect(content).toContain('writer.WritePropertyName("priority"u8);');
    expect(content).toContain("writer.WriteNumberValue((int)Priority);");
  });

  /**
   * Validates that a float-backed fixed enum property generates
   * `writer.WriteNumberValue(Rating.ToSerialSingle())`.
   *
   * Float-backed fixed enums cannot embed values in the C# enum declaration
   * (C# enums only support integral types), so they use an extension method
   * similar to string enums but targeting the numeric type.
   */
  it("serializes float-backed fixed enum with ToSerialSingle()", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      enum Rating {
        low: 1.0,
        medium: 2.5,
        high: 5.0,
      }

      model Review {
        rating: Rating;
      }

      @route("/test")
      op test(): Review;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Review.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();
    const content = outputs[fileKey!];

    expect(content).toContain('writer.WritePropertyName("rating"u8);');
    expect(content).toContain(
      "writer.WriteNumberValue(Rating.ToSerialSingle());",
    );
  });

  /**
   * Validates that a string-backed extensible enum (union) generates
   * `writer.WriteStringValue(Color.ToString())`.
   *
   * String extensible enums are C# readonly structs that wrap a string.
   * They use `ToString()` directly for serialization because the underlying
   * value is already the wire-format string. No separate serialization file
   * is generated for string extensible enums.
   */
  it("serializes string-backed extensible enum with ToString()", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      union Color {
        string,
        red: "red",
        green: "green",
        blue: "blue",
      }

      model Widget {
        color: Color;
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

    expect(content).toContain('writer.WritePropertyName("color"u8);');
    expect(content).toContain("writer.WriteStringValue(Color.ToString());");
  });

  /**
   * Validates that a numeric-backed extensible enum (union) generates
   * `writer.WriteNumberValue(Level.ToSerialInt32())`.
   *
   * Numeric extensible enums are readonly structs with an internal
   * `ToSerial{FrameworkName}()` method that returns the underlying `_value`.
   * This allows the serialization layer to write the numeric wire value.
   */
  it("serializes int-backed extensible enum with ToSerialInt32()", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      union Level {
        int32,
        low: 1,
        medium: 5,
        high: 10,
      }

      model Widget {
        level: Level;
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

    expect(content).toContain('writer.WritePropertyName("level"u8);');
    expect(content).toContain(
      "writer.WriteNumberValue(Level.ToSerialInt32());",
    );
  });

  /**
   * Validates that an optional enum property is wrapped in an
   * `Optional.IsDefined()` guard during serialization.
   *
   * Optional enum properties must not be serialized when they haven't been
   * set. The guard pattern ensures only defined values reach the wire.
   * This test uses a string-backed fixed enum as the representative case.
   */
  it("wraps optional enum property in Optional.IsDefined guard", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      enum Status {
        active: "active",
        inactive: "inactive",
      }

      model Widget {
        status?: Status;
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

    expect(content).toContain("if (Optional.IsDefined(Status))");
    expect(content).toContain('writer.WritePropertyName("status"u8);');
    expect(content).toContain(
      "writer.WriteStringValue(Status.Value.ToSerialString());",
    );
  });

  /**
   * Validates that a collection of enums serializes each item correctly
   * inside a foreach loop.
   *
   * Enum collections use the same writer method call as scalar enum
   * properties, but applied to the loop variable `item`. Enums are value
   * types so they don't need null checks in the foreach body.
   */
  it("serializes collection of string-backed fixed enums", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      enum Color {
        red: "red",
        green: "green",
        blue: "blue",
      }

      model Widget {
        colors: Color[];
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

    // Collection should use WriteStartArray / WriteEndArray
    expect(content).toContain('writer.WritePropertyName("colors"u8);');
    expect(content).toContain("writer.WriteStartArray();");
    expect(content).toContain(
      "writer.WriteStringValue(item.ToSerialString());",
    );
    expect(content).toContain("writer.WriteEndArray();");
  });
});
