import { describe, expect, it } from "vitest";
import { AzureHttpTester, HttpTester } from "./test-host.js";

/**
 * Tests for the SystemTextJsonConverter feature (task 17.10).
 *
 * When flavor='azure' and a model has the `@useSystemTextJsonConverter("csharp")`
 * decorator, the emitter should:
 *   1. Add `[JsonConverter(typeof({Model}Converter))]` attribute on the
 *      serialization partial class
 *   2. Generate a nested `internal partial class {Model}Converter : JsonConverter<{Model}>`
 *      with Write and Read method overrides
 *
 * When flavor is unbranded OR the model lacks the decorator, no converter
 * should be generated. This ensures backward compatibility and feature isolation.
 */
describe("SystemTextJsonConverter", () => {
  /**
   * Core test: verifies that the [JsonConverter] attribute is generated on the
   * serialization partial class when the model has @useSystemTextJsonConverter
   * and flavor='azure'. This is the primary acceptance criterion.
   */
  it("adds [JsonConverter] attribute when model has @useSystemTextJsonConverter and flavor=azure", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core;

      @service
      namespace TestService;

      @useSystemTextJsonConverter("csharp")
      model FooProperties {
        name: string;
        value: int32;
      }

      @route("/test")
      op test(): FooProperties;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = Object.keys(outputs).find((k) =>
      k.includes("FooProperties.Serialization.cs"),
    );
    expect(serFile).toBeDefined();
    const content = outputs[serFile!];

    expect(content).toContain(
      "[JsonConverter(typeof(FooPropertiesConverter))]",
    );
  });

  /**
   * Verifies the nested converter class is generated with the correct
   * declaration: internal partial, inheriting from JsonConverter<T>.
   */
  it("generates nested converter class declaration", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core;

      @service
      namespace TestService;

      @useSystemTextJsonConverter("csharp")
      model FooProperties {
        name: string;
      }

      @route("/test")
      op test(): FooProperties;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = Object.keys(outputs).find((k) =>
      k.includes("FooProperties.Serialization.cs"),
    );
    const content = outputs[serFile!];

    expect(content).toMatch(
      /internal\s+partial\s+class\s+FooPropertiesConverter\s*:\s*JsonConverter<FooProperties>/,
    );
  });

  /**
   * Verifies the Write method override in the converter class correctly
   * delegates to WriteObjectValue with IJsonModel<T> and WireOptions.
   */
  it("generates Write method that delegates to WriteObjectValue", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core;

      @service
      namespace TestService;

      @useSystemTextJsonConverter("csharp")
      model FooProperties {
        name: string;
      }

      @route("/test")
      op test(): FooProperties;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = Object.keys(outputs).find((k) =>
      k.includes("FooProperties.Serialization.cs"),
    );
    const content = outputs[serFile!];

    // Write method signature
    expect(content).toMatch(
      /public\s+override\s+void\s+Write\s*\(\s*Utf8JsonWriter\s+writer\s*,\s*FooProperties\s+model\s*,\s*JsonSerializerOptions\s+options\s*\)/,
    );

    // Write method body: delegates to WriteObjectValue with IJsonModel<T>
    expect(content).toContain(
      "writer.WriteObjectValue<IJsonModel<FooProperties>>(model, ModelSerializationExtensions.WireOptions);",
    );
  });

  /**
   * Verifies the Read method override in the converter class correctly
   * parses JSON and delegates to the static Deserialize method.
   */
  it("generates Read method that delegates to Deserialize", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core;

      @service
      namespace TestService;

      @useSystemTextJsonConverter("csharp")
      model FooProperties {
        name: string;
      }

      @route("/test")
      op test(): FooProperties;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = Object.keys(outputs).find((k) =>
      k.includes("FooProperties.Serialization.cs"),
    );
    const content = outputs[serFile!];

    // Read method signature with ref parameter
    expect(content).toMatch(
      /public\s+override\s+FooProperties\s+Read\s*\(\s*ref\s+Utf8JsonReader\s+reader\s*,\s*Type\s+typeToConvert\s*,\s*JsonSerializerOptions\s+options\s*\)/,
    );

    // Read method body: parses document and calls Deserialize
    expect(content).toContain(
      "using JsonDocument document = JsonDocument.ParseValue(ref reader);",
    );
    expect(content).toContain(
      "return DeserializeFooProperties(document.RootElement, ModelSerializationExtensions.WireOptions);",
    );
  });

  /**
   * Verifies the using directives for System.Text.Json.Serialization are
   * present (needed for JsonConverter<T> and JsonConverterAttribute).
   */
  it("includes using System.Text.Json.Serialization directive", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using Azure.ClientGenerator.Core;

      @service
      namespace TestService;

      @useSystemTextJsonConverter("csharp")
      model FooProperties {
        name: string;
      }

      @route("/test")
      op test(): FooProperties;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = Object.keys(outputs).find((k) =>
      k.includes("FooProperties.Serialization.cs"),
    );
    const content = outputs[serFile!];

    expect(content).toContain("using System.Text.Json.Serialization;");
  });

  /**
   * Critical negative test: unbranded flavor should NEVER generate
   * JsonConverter infrastructure, even if the decorator is somehow present.
   * This ensures the feature is properly gated behind azure flavor.
   */
  it("does NOT generate converter for unbranded flavor", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    expect(serFile).toBeDefined();
    const content = outputs[serFile!];

    expect(content).not.toContain("JsonConverter");
    expect(content).not.toContain("Converter");
    expect(content).not.toContain("using System.Text.Json.Serialization;");
  });

  /**
   * Negative test: even with azure flavor, models WITHOUT the
   * @useSystemTextJsonConverter decorator should not get the converter.
   * The decorator must be explicitly applied.
   */
  it("does NOT generate converter for azure model without decorator", async () => {
    const [{ outputs }, diagnostics] =
      await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);

    const serFile = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    expect(serFile).toBeDefined();
    const content = outputs[serFile!];

    expect(content).not.toContain("JsonConverterAttribute");
    expect(content).not.toContain("WidgetConverter");
  });
});
