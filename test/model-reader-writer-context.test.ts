import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

/**
 * Tests for the ModelReaderWriterContextFile component.
 *
 * These tests verify that the emitter generates a `{PackageName}Context` class
 * that inherits from `ModelReaderWriterContext` and registers all serializable
 * model types via `[ModelReaderWriterBuildable(typeof(T))]` attributes.
 *
 * This context class is required by System.ClientModel's source generation
 * to discover all model types supporting serialization/deserialization at
 * compile time, enabling AOT-compatible model reader/writer operations.
 *
 * Why these tests matter:
 * - Without the context class, System.ClientModel source generators cannot
 *   discover model types, breaking AOT and trimming scenarios.
 * - The class name must be deterministic (derived from package name) and the
 *   attributes must be sorted alphabetically to match the legacy emitter.
 * - Unknown discriminator variants must also be registered, or polymorphic
 *   deserialization will fail at runtime.
 *
 * @module
 */

describe("ModelReaderWriterContextFile", () => {
  /**
   * Verifies the context file is generated at the expected path.
   * The file should be at `src/Generated/Models/{PackageName}Context.cs`.
   */
  it("generates context file at the correct path", async () => {
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

    const key = Object.keys(outputs).find((k) =>
      k.endsWith("TestNamespaceContext.cs"),
    );
    expect(key).toBe("src/Generated/Models/TestNamespaceContext.cs");
  });

  /**
   * Verifies the context class name is derived from the package name
   * by removing dots and appending "Context". This naming convention
   * matches the legacy emitter's RemovePeriods(PrimaryNamespace) + "Context".
   */
  it("derives class name from package name with dots removed", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace My.Service.Namespace;

      model Widget {
        name: string;
      }

      @route("/test")
      op test(): Widget;
    `);

    const key = Object.keys(outputs).find((k) =>
      k.endsWith("MyServiceNamespaceContext.cs"),
    );
    expect(key).toBeDefined();
    const content = outputs[key!];
    expect(content).toContain(
      "public partial class MyServiceNamespaceContext : ModelReaderWriterContext",
    );
  });

  /**
   * Verifies the context class uses the root package namespace, not a
   * Models sub-namespace. The context represents the entire package.
   */
  it("uses the root package namespace", async () => {
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

    const content = outputs["src/Generated/Models/TestNamespaceContext.cs"];
    expect(content).toContain("namespace TestNamespace");
  });

  /**
   * Verifies the context class is declared as `public partial` and inherits
   * from `ModelReaderWriterContext`. The `partial` modifier allows users to
   * extend the class with custom code.
   */
  it("generates a public partial class inheriting ModelReaderWriterContext", async () => {
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

    const content = outputs["src/Generated/Models/TestNamespaceContext.cs"];
    expect(content).toContain(
      "public partial class TestNamespaceContext : ModelReaderWriterContext",
    );
  });

  /**
   * Verifies that the context includes a `using System.ClientModel.Primitives;`
   * directive, which is needed for `ModelReaderWriterContext` and
   * `ModelReaderWriterBuildableAttribute`.
   */
  it("includes using for System.ClientModel.Primitives", async () => {
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

    const content = outputs["src/Generated/Models/TestNamespaceContext.cs"];
    expect(content).toContain("using System.ClientModel.Primitives;");
  });

  /**
   * Verifies that each model gets a `[ModelReaderWriterBuildable(typeof(T))]`
   * attribute on the context class. This is how System.ClientModel discovers
   * serializable types.
   */
  it("generates ModelReaderWriterBuildable attribute for each model", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Widget {
        name: string;
      }

      model Gadget {
        id: int32;
      }

      @route("/widgets")
      op getWidget(): Widget;

      @route("/gadgets")
      op getGadget(): Gadget;
    `);

    const content = outputs["src/Generated/Models/TestNamespaceContext.cs"];
    expect(content).toContain("[ModelReaderWriterBuildable(typeof(Gadget))]");
    expect(content).toContain("[ModelReaderWriterBuildable(typeof(Widget))]");
  });

  /**
   * Verifies that attributes are sorted alphabetically by type name.
   * Deterministic ordering is important for reproducible builds and
   * clean diffs in version control. Matches legacy emitter behavior.
   */
  it("sorts attributes alphabetically by type name", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Zebra {
        name: string;
      }

      model Apple {
        color: string;
      }

      model Mango {
        ripe: boolean;
      }

      @route("/zebras")
      op getZebra(): Zebra;

      @route("/apples")
      op getApple(): Apple;

      @route("/mangos")
      op getMango(): Mango;
    `);

    const content = outputs["src/Generated/Models/TestNamespaceContext.cs"];
    const appleIdx = content!.indexOf(
      "[ModelReaderWriterBuildable(typeof(Apple))]",
    );
    const mangoIdx = content!.indexOf(
      "[ModelReaderWriterBuildable(typeof(Mango))]",
    );
    const zebraIdx = content!.indexOf(
      "[ModelReaderWriterBuildable(typeof(Zebra))]",
    );

    expect(appleIdx).toBeGreaterThan(-1);
    expect(mangoIdx).toBeGreaterThan(-1);
    expect(zebraIdx).toBeGreaterThan(-1);
    expect(appleIdx).toBeLessThan(mangoIdx);
    expect(mangoIdx).toBeLessThan(zebraIdx);
  });

  /**
   * Verifies that discriminated base models with subtypes also generate
   * `[ModelReaderWriterBuildable(typeof(Unknown{BaseName}))]` attributes
   * for the unknown fallback class. Without this, polymorphic deserialization
   * of unrecognized discriminator values would fail at runtime.
   */
  it("includes Unknown discriminator variants for abstract models", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @discriminator("kind")
      model Pet {
        kind: string;
        name: string;
      }

      model Cat extends Pet {
        kind: "cat";
        purring: boolean;
      }

      model Dog extends Pet {
        kind: "dog";
        barking: boolean;
      }

      @route("/pets")
      op getPet(): Pet;
    `);

    const content = outputs["src/Generated/Models/TestNamespaceContext.cs"];
    expect(content).toContain("[ModelReaderWriterBuildable(typeof(Cat))]");
    expect(content).toContain("[ModelReaderWriterBuildable(typeof(Dog))]");
    expect(content).toContain("[ModelReaderWriterBuildable(typeof(Pet))]");
    expect(content).toContain(
      "[ModelReaderWriterBuildable(typeof(UnknownPet))]",
    );
  });

  /**
   * Verifies correct alphabetical ordering when Unknown variants are mixed
   * with regular models. Unknown types sort by their full name (e.g.,
   * "UnknownPet" sorts after "Pet" and before "Zebra").
   */
  it("sorts Unknown variants alongside regular models", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      @discriminator("kind")
      model Animal {
        kind: string;
        name: string;
      }

      model Bird extends Animal {
        kind: "bird";
        wingspan: float32;
      }

      @route("/animals")
      op getAnimal(): Animal;
    `);

    const content = outputs["src/Generated/Models/TestNamespaceContext.cs"];

    // Expected order: Animal, Bird, UnknownAnimal
    const animalIdx = content!.indexOf(
      "[ModelReaderWriterBuildable(typeof(Animal))]",
    );
    const birdIdx = content!.indexOf(
      "[ModelReaderWriterBuildable(typeof(Bird))]",
    );
    const unknownIdx = content!.indexOf(
      "[ModelReaderWriterBuildable(typeof(UnknownAnimal))]",
    );

    expect(animalIdx).toBeGreaterThan(-1);
    expect(birdIdx).toBeGreaterThan(-1);
    expect(unknownIdx).toBeGreaterThan(-1);
    expect(animalIdx).toBeLessThan(birdIdx);
    expect(birdIdx).toBeLessThan(unknownIdx);
  });

  /**
   * Verifies that derived models (which have a base model) are also included
   * in the context. All models that implement serialization interfaces should
   * be registered, not just root models.
   */
  it("includes derived models with base classes", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestNamespace;

      model Base {
        id: string;
      }

      model Derived extends Base {
        extra: string;
      }

      @route("/items")
      op getItem(): Derived;
    `);

    const content = outputs["src/Generated/Models/TestNamespaceContext.cs"];
    expect(content).toContain("[ModelReaderWriterBuildable(typeof(Base))]");
    expect(content).toContain("[ModelReaderWriterBuildable(typeof(Derived))]");
  });

  /**
   * Verifies that the context file includes the license header from options.
   * This ensures consistency with other generated files.
   */
  it("includes license header", async () => {
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

    const content = outputs["src/Generated/Models/TestNamespaceContext.cs"];
    expect(content).toContain("// <auto-generated/>");
  });
});
