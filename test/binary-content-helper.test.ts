import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for BinaryContentHelper and Utf8JsonBinaryContent infrastructure files.
 *
 * These tests verify that the emitter generates the `BinaryContentHelper.cs` and
 * `Utf8JsonBinaryContent.cs` infrastructure classes. BinaryContentHelper provides
 * static factory methods for converting .NET types into BinaryContent instances,
 * and is referenced by convenience methods when encoding body parameters (e.g.,
 * bytes, enums, arrays) for protocol method calls. Utf8JsonBinaryContent is the
 * underlying class that wraps a Utf8JsonWriter for building JSON request bodies.
 *
 * Without these files, any convenience method that calls
 * `BinaryContentHelper.FromObject(...)` or `BinaryContentHelper.FromEnumerable(...)`
 * will fail to compile (CS0103: name does not exist in current context).
 */
describe("BinaryContentHelper infrastructure", () => {
  /**
   * Validates that BinaryContentHelper.cs is generated in Internal/.
   * This is critical because ConvenienceMethod.tsx generates references to
   * BinaryContentHelper for non-model body parameters.
   */
  it("generates BinaryContentHelper.cs", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      op sendBytes(@body value: bytes): void;
    `);

    const filePath = "src/Generated/Internal/BinaryContentHelper.cs";
    const content = outputs[filePath];
    expect(content, `Expected ${filePath} to be generated`).toBeDefined();
    expect(content).toContain(
      "internal static partial class BinaryContentHelper",
    );
    expect(content).toContain(
      "public static BinaryContent FromObject(object value)",
    );
    expect(content).toContain(
      "public static BinaryContent FromEnumerable<T>(IEnumerable<T> enumerable)",
    );
    expect(content).toContain(
      "public static BinaryContent FromDictionary<T>(IDictionary<string, T> dictionary)",
    );
    expect(content).toContain(
      "public static BinaryContent FromObject(BinaryData value)",
    );
  });

  /**
   * Validates that Utf8JsonBinaryContent.cs is generated in Internal/.
   * BinaryContentHelper depends on Utf8JsonBinaryContent — each factory
   * method creates a new Utf8JsonBinaryContent instance.
   */
  it("generates Utf8JsonBinaryContent.cs", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      op sendBytes(@body value: bytes): void;
    `);

    const filePath = "src/Generated/Internal/Utf8JsonBinaryContent.cs";
    const content = outputs[filePath];
    expect(content, `Expected ${filePath} to be generated`).toBeDefined();
    expect(content).toContain(
      "internal partial class Utf8JsonBinaryContent : BinaryContent",
    );
    expect(content).toContain("public Utf8JsonWriter JsonWriter { get; }");
    expect(content).toContain("WriteToAsync");
    expect(content).toContain("TryComputeLength");
    expect(content).toContain("Dispose");
  });

  /**
   * Validates that BinaryContentHelper uses preprocessor directives for
   * NET6_0_OR_GREATER conditional compilation. This is important because
   * BinaryData handling differs between .NET 6+ (WriteRawValue) and older
   * TFMs (JsonDocument.Parse fallback).
   */
  it("includes NET6_0_OR_GREATER preprocessor directives", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      op sendBytes(@body value: bytes): void;
    `);

    const content = outputs["src/Generated/Internal/BinaryContentHelper.cs"];
    expect(content).toContain("#if NET6_0_OR_GREATER");
    expect(content).toContain("WriteRawValue");
    expect(content).toContain("#else");
    expect(content).toContain("JsonDocument.Parse");
    expect(content).toContain("#endif");
  });
});
