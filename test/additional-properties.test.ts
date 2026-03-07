/**
 * Unit tests for AdditionalProperties feature.
 *
 * Tests that models extending or spreading Record<T> generate:
 * 1. A typed `AdditionalProperties` property on the model class
 * 2. Correct constructor initialization (public ctor) and parameter (serialization ctor)
 * 3. Typed serialization (write) of additional properties to JSON
 * 4. Typed deserialization (read) of additional properties from JSON
 *
 * These tests validate the core model-level changes for task 15.9:
 * "Align Type/Property/AdditionalProperties API surface with legacy emitter."
 *
 * WHY THESE TESTS MATTER:
 * Without AdditionalProperties support, models extending Record<T> are missing
 * the public dictionary property that the legacy emitter generates. This causes
 * CS1061 compilation errors in the E2E test project (~57 Spector scenarios).
 *
 * @module
 */

import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

describe("AdditionalProperties", () => {
  /**
   * Tests that a model spreading Record<float32> generates a typed
   * `IDictionary<string, float> AdditionalProperties` property.
   *
   * This is the core property declaration test — without this property,
   * the E2E tests can't compile because test code accesses
   * `model.AdditionalProperties["key"]`.
   */
  it("generates AdditionalProperties property for spread Record<float32>", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model SpreadFloatRecord {
        id: float32;
        ...Record<float32>;
      }

      @route("/test")
      op test(): SpreadFloatRecord;
    `);

    expect(diagnostics).toHaveLength(0);

    // Find the model file (not serialization)
    const modelKey = Object.keys(outputs).find(
      (k) => k.includes("SpreadFloatRecord.cs") && !k.includes("Serialization"),
    );
    expect(modelKey).toBeDefined();
    const modelContent = outputs[modelKey!];

    // Should have the typed AdditionalProperties property
    expect(modelContent).toContain(
      "public IDictionary<string, float> AdditionalProperties { get; }",
    );

    // Should NOT have the raw _additionalBinaryDataProperties field
    // (replaced by typed AdditionalProperties)
    expect(modelContent).not.toContain("_additionalBinaryDataProperties");
  });

  /**
   * Tests that a model spreading Record<string> generates a typed
   * `IDictionary<string, string> AdditionalProperties` property.
   */
  it("generates AdditionalProperties property for spread Record<string>", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model SpreadStringRecord {
        name: string;
        ...Record<string>;
      }

      @route("/test")
      op test(): SpreadStringRecord;
    `);

    expect(diagnostics).toHaveLength(0);

    const modelKey = Object.keys(outputs).find(
      (k) =>
        k.includes("SpreadStringRecord.cs") && !k.includes("Serialization"),
    );
    expect(modelKey).toBeDefined();
    const modelContent = outputs[modelKey!];

    expect(modelContent).toContain(
      "public IDictionary<string, string> AdditionalProperties { get; }",
    );
  });

  /**
   * Tests that a model extending Record<unknown> generates
   * `IDictionary<string, BinaryData> AdditionalProperties`.
   *
   * The "unknown" type maps to BinaryData in C#.
   */
  it("generates AdditionalProperties property for extends Record<unknown>", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model ExtendsUnknownRecord extends Record<unknown> {
        name: string;
      }

      @route("/test")
      op test(): ExtendsUnknownRecord;
    `);

    expect(diagnostics).toHaveLength(0);

    const modelKey = Object.keys(outputs).find(
      (k) =>
        k.includes("ExtendsUnknownRecord.cs") && !k.includes("Serialization"),
    );
    expect(modelKey).toBeDefined();
    const modelContent = outputs[modelKey!];

    expect(modelContent).toContain(
      "public IDictionary<string, BinaryData> AdditionalProperties { get; }",
    );
  });

  /**
   * Tests that the public constructor initializes AdditionalProperties
   * with a ChangeTrackingDictionary so the property is never null.
   */
  it("initializes AdditionalProperties in public constructor", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model SpreadFloatRecord {
        id: float32;
        ...Record<float32>;
      }

      @route("/test")
      op test(): SpreadFloatRecord;
    `);

    expect(diagnostics).toHaveLength(0);

    const modelKey = Object.keys(outputs).find(
      (k) => k.includes("SpreadFloatRecord.cs") && !k.includes("Serialization"),
    );
    const modelContent = outputs[modelKey!];

    // Public constructor should initialize AdditionalProperties
    expect(modelContent).toContain(
      "AdditionalProperties = new ChangeTrackingDictionary<string, float>();",
    );
  });

  /**
   * Tests that the serialization constructor accepts and assigns
   * the typed AdditionalProperties parameter.
   */
  it("adds AdditionalProperties parameter to serialization constructor", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model SpreadFloatRecord {
        id: float32;
        ...Record<float32>;
      }

      @route("/test")
      op test(): SpreadFloatRecord;
    `);

    expect(diagnostics).toHaveLength(0);

    const modelKey = Object.keys(outputs).find(
      (k) => k.includes("SpreadFloatRecord.cs") && !k.includes("Serialization"),
    );
    const modelContent = outputs[modelKey!];

    // Serialization constructor should have typed parameter
    expect(modelContent).toContain(
      "IDictionary<string, float> additionalProperties",
    );
    // And assign it
    expect(modelContent).toContain(
      "AdditionalProperties = additionalProperties;",
    );
  });

  /**
   * Tests that the serialization (write) correctly iterates AdditionalProperties
   * and writes each value with the correct writer method.
   */
  it("serializes AdditionalProperties with correct writer method", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model SpreadFloatRecord {
        id: float32;
        ...Record<float32>;
      }

      @route("/test")
      op test(): SpreadFloatRecord;
    `);

    expect(diagnostics).toHaveLength(0);

    const serKey = Object.keys(outputs).find((k) =>
      k.includes("SpreadFloatRecord.Serialization.cs"),
    );
    expect(serKey).toBeDefined();
    const serContent = outputs[serKey!];

    // Should iterate AdditionalProperties and write values
    expect(serContent).toContain("foreach (var item in AdditionalProperties)");
    expect(serContent).toContain("writer.WritePropertyName(item.Key)");
    expect(serContent).toContain("writer.WriteNumberValue(item.Value)");
  });

  /**
   * Tests that the deserialization (read) correctly captures unknown
   * properties into the typed additionalProperties dictionary.
   */
  it("deserializes additional properties with correct reader method", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model SpreadFloatRecord {
        id: float32;
        ...Record<float32>;
      }

      @route("/test")
      op test(): SpreadFloatRecord;
    `);

    expect(diagnostics).toHaveLength(0);

    const serKey = Object.keys(outputs).find((k) =>
      k.includes("SpreadFloatRecord.Serialization.cs"),
    );
    expect(serKey).toBeDefined();
    const serContent = outputs[serKey!];

    // Variable declaration for the dictionary
    expect(serContent).toContain(
      "IDictionary<string, float> additionalProperties = new Dictionary<string, float>()",
    );

    // Catch-all read expression
    expect(serContent).toContain("additionalProperties[jsonProperty.Name]");
    expect(serContent).toContain("jsonProperty.Value.GetSingle()");
  });

  /**
   * Tests that a model WITHOUT additional properties still generates
   * the raw _additionalBinaryDataProperties field (no regression).
   */
  it("preserves _additionalBinaryDataProperties for models without additional properties", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model RegularModel {
        name: string;
      }

      @route("/test")
      op test(): RegularModel;
    `);

    expect(diagnostics).toHaveLength(0);

    const modelKey = Object.keys(outputs).find(
      (k) => k.includes("RegularModel.cs") && !k.includes("Serialization"),
    );
    expect(modelKey).toBeDefined();
    const modelContent = outputs[modelKey!];

    // Should have the raw binary data field (not typed AdditionalProperties)
    expect(modelContent).toContain("_additionalBinaryDataProperties");
    expect(modelContent).not.toContain("AdditionalProperties");
  });

  /**
   * Tests serialization for string-typed additional properties.
   * String values use WriteStringValue/GetString.
   */
  it("serializes string additional properties correctly", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model SpreadStringRecord {
        name: string;
        ...Record<string>;
      }

      @route("/test")
      op test(): SpreadStringRecord;
    `);

    expect(diagnostics).toHaveLength(0);

    const serKey = Object.keys(outputs).find((k) =>
      k.includes("SpreadStringRecord.Serialization.cs"),
    );
    expect(serKey).toBeDefined();
    const serContent = outputs[serKey!];

    expect(serContent).toContain("writer.WriteStringValue(item.Value)");
    expect(serContent).toContain("jsonProperty.Value.GetString()");
  });

  /**
   * Tests serialization for unknown/BinaryData additional properties.
   * BinaryData uses WriteRawValue with #if NET6_0_OR_GREATER conditional.
   */
  it("serializes unknown additional properties with WriteRawValue", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model ExtendsUnknownRecord extends Record<unknown> {
        name: string;
      }

      @route("/test")
      op test(): ExtendsUnknownRecord;
    `);

    expect(diagnostics).toHaveLength(0);

    const serKey = Object.keys(outputs).find((k) =>
      k.includes("ExtendsUnknownRecord.Serialization.cs"),
    );
    expect(serKey).toBeDefined();
    const serContent = outputs[serKey!];

    // Should use WriteRawValue with NET6 conditional
    expect(serContent).toContain("writer.WriteRawValue(item.Value)");
    expect(serContent).toContain("#if NET6_0_OR_GREATER");

    // Deserialization should use BinaryData.FromString
    expect(serContent).toContain(
      "BinaryData.FromString(jsonProperty.Value.GetRawText())",
    );
  });
});
