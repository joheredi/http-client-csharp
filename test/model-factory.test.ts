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

  /**
   * Validates that array collection properties are converted to IEnumerable<T>
   * in the factory method parameter, null-coalesced with ChangeTrackingList<T>,
   * and passed as .ToList() to the constructor.
   *
   * This is critical because the legacy emitter uses IEnumerable<T> (the
   * broadest input interface) for factory parameters so test code can pass
   * any enumerable type. The ChangeTrackingList initialization prevents null
   * when no value is provided, and .ToList() converts back to the concrete
   * List<T> expected by the serialization constructor.
   */
  it("converts array properties to IEnumerable with ChangeTrackingList init", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
        tags: string[];
      }

      @route("/test")
      op test(): Widget;
    `);

    const factoryFile = outputs[
      Object.keys(outputs).find((k) => k.includes("ModelFactory"))!
    ];

    // Parameter type should be IEnumerable<string> (not IList<string>)
    expect(factoryFile).toContain("IEnumerable<string> tags = default");

    // Null-coalescing with ChangeTrackingList
    expect(factoryFile).toContain(
      "tags ??= new ChangeTrackingList<string>();",
    );

    // Constructor arg should use .ToList()
    expect(factoryFile).toContain("tags.ToList()");
  });

  /**
   * Validates that dictionary collection properties use IDictionary<string, T>
   * in factory parameters, are null-coalesced with ChangeTrackingDictionary,
   * and passed as-is to the constructor (no .ToList() needed for dicts).
   *
   * Dictionaries keep the same IDictionary interface in factory methods
   * because both the factory parameter and the serialization constructor
   * accept IDictionary. The ChangeTrackingDictionary initialization prevents
   * null when no value is provided.
   */
  it("handles dictionary properties with ChangeTrackingDictionary init", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
        metadata: Record<string>;
      }

      @route("/test")
      op test(): Widget;
    `);

    const factoryFile = outputs[
      Object.keys(outputs).find((k) => k.includes("ModelFactory"))!
    ];

    // Null-coalescing with ChangeTrackingDictionary
    expect(factoryFile).toContain(
      "metadata ??= new ChangeTrackingDictionary<string, string>();",
    );

    // Dictionary param should not have .ToList()
    expect(factoryFile).not.toContain("metadata.ToList()");
  });

  /**
   * Validates that models with both scalar and collection properties generate
   * correct factory methods: scalar params pass through directly, collection
   * params get the IEnumerable conversion and ChangeTracking initialization.
   *
   * This end-to-end test ensures the parallel data structures (factoryParams,
   * collectionInits, ctorArgs) stay aligned when mixing property types.
   */
  it("handles mixed scalar and collection properties", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
        count: int32;
        tags: string[];
        metadata: Record<int32>;
      }

      @route("/test")
      op test(): Widget;
    `);

    const factoryFile = outputs[
      Object.keys(outputs).find((k) => k.includes("ModelFactory"))!
    ];

    // Scalar params pass through normally
    expect(factoryFile).toContain("string name = default");
    expect(factoryFile).toContain("int count = default");

    // Array param uses IEnumerable
    expect(factoryFile).toContain("IEnumerable<string> tags = default");

    // Both collections get ChangeTracking initialization
    expect(factoryFile).toContain(
      "tags ??= new ChangeTrackingList<string>();",
    );
    expect(factoryFile).toContain(
      "metadata ??= new ChangeTrackingDictionary<string, int>();",
    );

    // Array uses .ToList(), dict does not
    expect(factoryFile).toContain("tags.ToList()");
    expect(factoryFile).not.toContain("metadata.ToList()");

    // Constructor call ends with additionalBinaryDataProperties: null
    expect(factoryFile).toContain("additionalBinaryDataProperties: null");
  });

  /**
   * Validates that models with only scalar properties (no collections)
   * still generate factory methods without any null-coalescing lines.
   * This is a regression check to ensure the collection handling doesn't
   * break the simple case.
   */
  it("generates clean method body when no collections", async () => {
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

    // No ChangeTracking or .ToList() for scalar-only models
    expect(factoryFile).not.toContain("ChangeTrackingList");
    expect(factoryFile).not.toContain("ChangeTrackingDictionary");
    expect(factoryFile).not.toContain(".ToList()");

    // Still has the basic structure
    expect(factoryFile).toContain("return new Widget(");
    expect(factoryFile).toContain("additionalBinaryDataProperties: null");
  });
});
