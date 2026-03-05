import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the DeserializeReturnStatement component.
 *
 * These tests verify that the `DeserializeXxx` method ends with a `return new ModelName(...)`
 * statement that constructs the model from all deserialized local variables. Without this
 * return statement, the deserialization method compiles but never produces a result
 * (CS0161: not all code paths return a value).
 *
 * Why these tests matter:
 * - The return statement is the final, essential piece of the deserialization method.
 * - The constructor arguments must match the serialization constructor parameters in
 *   the exact same order — wrong order causes silent data corruption.
 * - Derived discriminated models must include base model parameters (including
 *   additionalBinaryDataProperties) followed by their own properties.
 * - The model name in `new ModelName(...)` must match the current model type, not
 *   the base model — each derived model constructs itself.
 */
describe("DeserializeReturnStatement", () => {
  /**
   * Validates that a simple model's DeserializeXxx method ends with a return
   * statement constructing the model with all property variables and
   * additionalBinaryDataProperties.
   */
  it("generates return statement for simple model", async () => {
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
    expect(fileKey).toBeDefined();
    const content = outputs[fileKey!];

    expect(content).toContain(
      "return new Widget(name, count, additionalBinaryDataProperties);",
    );
  });

  /**
   * Validates that a single-property model includes both the property variable
   * and additionalBinaryDataProperties in the return statement. Even the
   * simplest model needs the extra binary data parameter.
   */
  it("generates return statement for single-property model", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Item {
        id: string;
      }

      @route("/test")
      op test(): Item;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Item.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();
    const content = outputs[fileKey!];

    expect(content).toContain(
      "return new Item(id, additionalBinaryDataProperties);",
    );
  });

  /**
   * Validates that a derived discriminated model's return statement includes
   * all parameters in the correct order: base model params (discriminator,
   * base properties, additionalBinaryDataProperties) followed by own properties.
   * This order must match the serialization constructor parameter order exactly.
   */
  it("generates return statement for derived discriminated model", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @discriminator("kind")
      model Pet {
        kind: string;
        name: string;
      }

      model Dog extends Pet {
        kind: "dog";
        breed: string;
      }

      @route("/test")
      op test(): Pet;
    `);

    expect(diagnostics).toHaveLength(0);

    const dogFileKey = Object.keys(outputs).find((k) =>
      k.endsWith("/Dog.Serialization.cs"),
    );
    expect(dogFileKey).toBeDefined();
    const dogContent = outputs[dogFileKey!];

    // Derived model return: base params (kind, name, additionalBinaryDataProperties) + own (breed)
    expect(dogContent).toContain(
      "return new Dog(kind, name, additionalBinaryDataProperties, breed);",
    );
  });

  /**
   * Validates that the base model in a discriminated hierarchy uses discriminator
   * dispatch instead of a standard return statement. Base models with discriminated
   * subtypes peek at the discriminator property and dispatch to derived deserializers,
   * falling back to the Unknown variant for unrecognized values.
   *
   * This is important because abstract base models cannot be directly instantiated,
   * so their deserialization method delegates to the correct derived type.
   */
  it("generates discriminator dispatch for base discriminated model", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @discriminator("kind")
      model Pet {
        kind: string;
        name: string;
      }

      model Dog extends Pet {
        kind: "dog";
        breed: string;
      }

      @route("/test")
      op test(): Pet;
    `);

    expect(diagnostics).toHaveLength(0);

    const petFileKey = Object.keys(outputs).find((k) =>
      k.endsWith("/Pet.Serialization.cs"),
    );
    expect(petFileKey).toBeDefined();
    const petContent = outputs[petFileKey!];

    // Base discriminated model should NOT have a standard return new statement
    expect(petContent).not.toContain("return new Pet(");

    // Should have discriminator dispatch instead
    expect(petContent).toContain(
      'if (element.TryGetProperty("kind"u8, out JsonElement discriminator))',
    );
    expect(petContent).toContain("switch (discriminator.GetString())");
    expect(petContent).toContain(
      "return Dog.DeserializeDog(element, options);",
    );
    expect(petContent).toContain(
      "return UnknownPet.DeserializeUnknownPet(element, options);",
    );
  });

  /**
   * Validates that the return statement appears after the property matching
   * foreach loop and before the method closing brace. The structural ordering
   * is: null check → variable declarations → foreach loop → return statement.
   */
  it("places return statement after foreach loop", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Widget.Serialization.cs"),
    );
    const content = outputs[fileKey!];

    // The foreach loop should appear before the return statement
    const foreachIdx = content.indexOf(
      "foreach (var jsonProperty in element.EnumerateObject())",
    );
    const returnIdx = content.indexOf(
      "return new Widget(name, additionalBinaryDataProperties);",
    );
    expect(foreachIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(-1);
    expect(foreachIdx).toBeLessThan(returnIdx);
  });

  /**
   * Validates that a model with multiple typed properties (string, int, bool,
   * float) generates a return statement with all property variables in the
   * correct order matching the model property declaration order.
   */
  it("includes all property types in return statement", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Config {
        label: string;
        priority: int32;
        enabled: boolean;
        ratio: float64;
      }

      @route("/test")
      op test(): Config;
    `);

    expect(diagnostics).toHaveLength(0);

    const fileKey = Object.keys(outputs).find((k) =>
      k.includes("Config.Serialization.cs"),
    );
    expect(fileKey).toBeDefined();
    const content = outputs[fileKey!];

    expect(content).toContain(
      "return new Config(label, priority, enabled, ratio, additionalBinaryDataProperties);",
    );
  });
});
