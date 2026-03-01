import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the ModelFactoryFile and ModelFactoryMethod components.
 *
 * These tests verify that the emitter generates a static model factory class
 * (`{PackageName}ModelFactory`) with one static factory method per public model.
 * The factory methods allow test/mock code to construct model instances by
 * calling the internal serialization constructor with `null` for the
 * `additionalBinaryDataProperties` parameter.
 *
 * Why these tests matter:
 * - Model factories are a core C# SDK pattern for testing — without them,
 *   users can't create model instances for unit testing.
 * - Validates the integration of ModelFactoryFile into the emitter pipeline.
 * - Ensures factory method signatures match the serialization constructor
 *   minus the additionalBinaryDataProperties parameter.
 */
describe("ModelFactoryFile", () => {
  /**
   * Validates that a model factory file is generated at the expected path.
   * The factory file should be at `src/Generated/{PackageName}ModelFactory.cs`.
   */
  it("generates a factory file for models", async () => {
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

    const factoryFileKey = Object.keys(outputs).find((k) =>
      k.includes("ModelFactory"),
    );
    expect(factoryFileKey).toBeDefined();
    expect(factoryFileKey).toContain("TestNamespaceModelFactory.cs");
  });

  /**
   * Validates the factory class declaration: public static partial class.
   * This matches the legacy emitter's ModelFactoryProvider output.
   */
  it("generates a public static partial class", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    const factoryFile = outputs[
      Object.keys(outputs).find((k) => k.includes("ModelFactory"))!
    ];

    expect(factoryFile).toContain(
      "public static partial class TestNamespaceModelFactory",
    );
  });

  /**
   * Validates that each public model gets a factory method with:
   * - The method name matching the model class name
   * - Parameters matching the serialization constructor minus binary data
   * - All parameters defaulting to `= default`
   * - A return statement calling `new ModelType(params..., additionalBinaryDataProperties: null)`
   */
  it("generates factory method with correct signature", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
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

    const factoryFile = outputs[
      Object.keys(outputs).find((k) => k.includes("ModelFactory"))!
    ];

    // Verify method signature includes both params with = default
    expect(factoryFile).toContain("public static Widget Widget(");
    expect(factoryFile).toContain("string name = default");
    expect(factoryFile).toContain("int count = default");

    // Verify constructor call with additionalBinaryDataProperties: null
    expect(factoryFile).toContain("return new Widget(");
    expect(factoryFile).toContain("additionalBinaryDataProperties: null");
  });

  /**
   * Validates that multiple models each get their own factory method
   * in the same factory class.
   */
  it("generates methods for multiple models", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
      }

      model Gadget {
        label: string;
        weight: float32;
      }

      @route("/widgets")
      op getWidget(): Widget;
      @route("/gadgets")
      op getGadget(): Gadget;
    `);

    const factoryFile = outputs[
      Object.keys(outputs).find((k) => k.includes("ModelFactory"))!
    ];

    expect(factoryFile).toContain("public static Widget Widget(");
    expect(factoryFile).toContain("public static Gadget Gadget(");
  });

  /**
   * Validates that the factory file uses the root namespace (package name),
   * not a Models sub-namespace. This matches the legacy emitter behavior
   * where the factory class lives in the top-level namespace.
   */
  it("uses root namespace for factory class", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    const factoryFile = outputs[
      Object.keys(outputs).find((k) => k.includes("ModelFactory"))!
    ];

    expect(factoryFile).toContain("namespace TestNamespace");
  });

  /**
   * Validates that no factory file is generated when there are no public models.
   * This prevents generating an empty factory class.
   */
  it("skips factory generation when no public models", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @route("/test")
      op test(): void;
    `);

    const factoryFileKey = Object.keys(outputs).find((k) =>
      k.includes("ModelFactory"),
    );
    expect(factoryFileKey).toBeUndefined();
  });

  /**
   * Validates the auto-generated header is present in the factory file.
   * Ensures the file follows the standard generated file pattern.
   */
  it("includes standard header", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    const factoryFile = outputs[
      Object.keys(outputs).find((k) => k.includes("ModelFactory"))!
    ];

    expect(factoryFile).toContain("// <auto-generated/>");
    expect(factoryFile).toContain("#nullable disable");
  });
});
