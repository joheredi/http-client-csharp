import { describe, expect, it } from "vitest";
import { HttpTester, Tester } from "./test-host.js";

/**
 * Tests for the internal infrastructure helper files.
 *
 * These tests verify that the emitter generates the four SCM helper types
 * that are required by model constructors, serialization code, and client
 * methods:
 *
 * - **Argument** — runtime parameter validation (AssertNotNull, AssertNotNullOrEmpty, etc.)
 * - **Optional** — "is defined" checks for optional properties and collections
 * - **ChangeTrackingList<T>** — lazy-init list wrapper with "undefined" state tracking
 * - **ChangeTrackingDictionary<TKey, TValue>** — lazy-init dictionary wrapper
 *
 * These types are generated for EVERY project (matching legacy emitter behavior)
 * because any generated model, enum, or client code may reference them.
 *
 * @module
 */

describe("ArgumentFile", () => {
  /**
   * Verifies the Argument.cs file is generated at the correct path under
   * src/Generated/Internal/, matching the legacy emitter's output structure.
   */
  it("generates Argument.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const key = Object.keys(outputs).find((k) =>
      k.endsWith("Internal/Argument.cs"),
    );
    expect(key).toBeDefined();
    expect(key).toBe("src/Generated/Internal/Argument.cs");
  });

  /**
   * Verifies the class declaration is correct: internal, static, partial,
   * matching the legacy output exactly. These modifiers are important:
   * - internal: not part of public API surface
   * - static: utility class with no instance state
   * - partial: allows custom code extensions
   */
  it("declares internal static partial class", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/Argument.cs"];
    expect(content).toContain("internal static partial class Argument");
  });

  /**
   * Verifies the correct namespace is used, derived from the service name.
   * This ensures the helper type is in the same namespace as generated
   * models and clients, avoiding the need for cross-namespace using directives.
   */
  it("uses the correct namespace from package name", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace MyLibrary;
    `);
    const content = outputs["src/Generated/Internal/Argument.cs"];
    expect(content).toContain("namespace MyLibrary");
  });

  /**
   * Verifies the two overloads of AssertNotNull are generated:
   * 1. Generic reference type overload: AssertNotNull<T>(T value, string name)
   * 2. Nullable struct overload: AssertNotNull<T>(T? value, string name) where T : struct
   *
   * Both overloads are used by model constructors and client methods to
   * validate required parameters at runtime.
   */
  it("contains AssertNotNull overloads", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/Argument.cs"];
    expect(content).toContain(
      "public static void AssertNotNull<T>(T value, string name)",
    );
    expect(content).toContain(
      "public static void AssertNotNull<T>(T? value, string name)",
    );
    expect(content).toContain("where T : struct");
    expect(content).toContain("throw new ArgumentNullException(name);");
  });

  /**
   * Verifies AssertNotNullOrEmpty is generated for both collection and string
   * overloads. String parameters in client methods use this for validation.
   */
  it("contains AssertNotNullOrEmpty overloads", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/Argument.cs"];
    expect(content).toContain(
      "public static void AssertNotNullOrEmpty<T>(IEnumerable<T> value, string name)",
    );
    expect(content).toContain(
      "public static void AssertNotNullOrEmpty(string value, string name)",
    );
  });

  /**
   * Verifies AssertNotNullOrWhiteSpace is generated for string validation.
   */
  it("contains AssertNotNullOrWhiteSpace", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/Argument.cs"];
    expect(content).toContain(
      "public static void AssertNotNullOrWhiteSpace(string value, string name)",
    );
  });

  /**
   * Verifies AssertInRange is generated with the notnull+IComparable constraint.
   */
  it("contains AssertInRange with generic constraints", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/Argument.cs"];
    expect(content).toContain(
      "public static void AssertInRange<T>(T value, T minimum, T maximum, string name)",
    );
    expect(content).toContain("where T : notnull, IComparable<T>");
    expect(content).toContain("throw new ArgumentOutOfRangeException");
  });

  /**
   * Verifies CheckNotNullOrEmpty is generated as a convenience method
   * that delegates to AssertNotNullOrEmpty and returns the validated value.
   */
  it("contains CheckNotNullOrEmpty", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/Argument.cs"];
    expect(content).toContain(
      "public static string CheckNotNullOrEmpty(string value, string name)",
    );
    expect(content).toContain("AssertNotNullOrEmpty(value, name);");
    expect(content).toContain("return value;");
  });

  /**
   * Verifies the required using directives are present for the types
   * referenced in the Argument class (System for exceptions, System.Collections
   * for ICollection, System.Collections.Generic for IEnumerable<T>).
   */
  it("includes required using directives", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/Argument.cs"];
    expect(content).toContain("using System;");
    expect(content).toContain("using System.Collections;");
    expect(content).toContain("using System.Collections.Generic;");
  });
});

describe("OptionalFile", () => {
  /**
   * Verifies Optional.cs is generated at the correct Internal path.
   */
  it("generates Optional.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(outputs["src/Generated/Internal/Optional.cs"]).toBeDefined();
  });

  /**
   * Verifies the class is internal, static, partial to match legacy output.
   */
  it("declares internal static partial class", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/Optional.cs"];
    expect(content).toContain("internal static partial class Optional");
  });

  /**
   * Verifies IsCollectionDefined overloads check ChangeTrackingList and
   * ChangeTrackingDictionary for the "undefined" state. This is essential
   * for serialization code that must skip undefined collections.
   */
  it("contains IsCollectionDefined overloads", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/Optional.cs"];
    expect(content).toContain(
      "public static bool IsCollectionDefined<T>(IEnumerable<T> collection)",
    );
    expect(content).toContain("ChangeTrackingList<T> changeTrackingList");
    expect(content).toContain(
      "public static bool IsCollectionDefined<TKey, TValue>(IDictionary<TKey, TValue> collection)",
    );
    expect(content).toContain(
      "public static bool IsCollectionDefined<TKey, TValue>(IReadOnlyDictionary<TKey, TValue> collection)",
    );
  });

  /**
   * Verifies IsDefined overloads for struct, object, string, and JsonElement.
   * These are used by serialization code to check if optional scalar
   * properties have been set.
   */
  it("contains IsDefined overloads", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/Optional.cs"];
    expect(content).toContain("public static bool IsDefined<T>(T? value)");
    expect(content).toContain("where T : struct");
    expect(content).toContain("public static bool IsDefined(object value)");
    expect(content).toContain("public static bool IsDefined(string value)");
    expect(content).toContain(
      "public static bool IsDefined(JsonElement value)",
    );
  });

  /**
   * Verifies the required using directives for Generic collections and JSON.
   */
  it("includes required using directives", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/Optional.cs"];
    expect(content).toContain("using System.Collections.Generic;");
    expect(content).toContain("using System.Text.Json;");
  });
});

describe("ChangeTrackingListFile", () => {
  /**
   * Verifies ChangeTrackingList.cs is generated at the correct Internal path.
   */
  it("generates ChangeTrackingList.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(
      outputs["src/Generated/Internal/ChangeTrackingList.cs"],
    ).toBeDefined();
  });

  /**
   * Verifies the class declaration includes the generic type parameter
   * and both IList<T> and IReadOnlyList<T> interface implementations.
   * These interfaces are required for the collection to be usable in
   * model properties (IList<T>) and read-only access (IReadOnlyList<T>).
   */
  it("declares class with generic type and interface implementations", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ChangeTrackingList.cs"];
    expect(content).toContain("internal partial class ChangeTrackingList<T>");
    expect(content).toContain("IList<T>");
    expect(content).toContain("IReadOnlyList<T>");
  });

  /**
   * Verifies the IsUndefined property tracks whether the inner list
   * has been initialized. This is the core mechanism for distinguishing
   * "not set" from "set to empty" in serialization code.
   */
  it("contains IsUndefined property", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ChangeTrackingList.cs"];
    expect(content).toContain("public bool IsUndefined => _innerList == null;");
  });

  /**
   * Verifies the EnsureList method lazily initializes the inner list.
   * The ??= pattern is used for thread-safe lazy initialization.
   */
  it("contains EnsureList method with lazy initialization", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ChangeTrackingList.cs"];
    expect(content).toContain("public IList<T> EnsureList()");
    expect(content).toContain("return _innerList ??= new List<T>();");
  });

  /**
   * Verifies the IReadOnlyList constructor accepts IReadOnlyList<T> and
   * converts it to a mutable list using .ToList(), which requires System.Linq.
   */
  it("includes System.Linq using for ToList()", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ChangeTrackingList.cs"];
    expect(content).toContain("using System.Linq;");
    expect(content).toContain("_innerList = innerList.ToList();");
  });
});

describe("ChangeTrackingDictionaryFile", () => {
  /**
   * Verifies ChangeTrackingDictionary.cs is generated at the correct path.
   */
  it("generates ChangeTrackingDictionary.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(
      outputs["src/Generated/Internal/ChangeTrackingDictionary.cs"],
    ).toBeDefined();
  });

  /**
   * Verifies the class declaration includes both generic type parameters,
   * the notnull constraint on TKey, and both dictionary interface implementations.
   * The notnull constraint matches the C# Dictionary<TKey, TValue> requirement.
   */
  it("declares class with generic types, constraint, and interfaces", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ChangeTrackingDictionary.cs"];
    expect(content).toContain(
      "internal partial class ChangeTrackingDictionary<TKey, TValue>",
    );
    expect(content).toContain("IDictionary<TKey, TValue>");
    expect(content).toContain("IReadOnlyDictionary<TKey, TValue>");
    expect(content).toContain("where TKey : notnull");
  });

  /**
   * Verifies the IsUndefined property for the dictionary, matching the
   * list counterpart's "undefined" state tracking mechanism.
   */
  it("contains IsUndefined property", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ChangeTrackingDictionary.cs"];
    expect(content).toContain(
      "public bool IsUndefined => _innerDictionary == null;",
    );
  });

  /**
   * Verifies the EnsureDictionary method with lazy initialization pattern.
   */
  it("contains EnsureDictionary method with lazy initialization", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ChangeTrackingDictionary.cs"];
    expect(content).toContain(
      "public IDictionary<TKey, TValue> EnsureDictionary()",
    );
    expect(content).toContain(
      "return _innerDictionary ??= new Dictionary<TKey, TValue>();",
    );
  });

  /**
   * Verifies explicit interface implementations for IReadOnlyDictionary
   * Keys and Values properties, which delegate to the IDictionary versions.
   */
  it("contains explicit IReadOnlyDictionary interface implementations", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ChangeTrackingDictionary.cs"];
    expect(content).toContain(
      "IEnumerable<TKey> IReadOnlyDictionary<TKey, TValue>.Keys => Keys;",
    );
    expect(content).toContain(
      "IEnumerable<TValue> IReadOnlyDictionary<TKey, TValue>.Values => Values;",
    );
  });

  /**
   * Verifies the IReadOnlyDictionary constructor that copies entries
   * from a read-only dictionary into a mutable dictionary.
   */
  it("contains IReadOnlyDictionary copy constructor", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ChangeTrackingDictionary.cs"];
    expect(content).toContain(
      "public ChangeTrackingDictionary(IReadOnlyDictionary<TKey, TValue> dictionary)",
    );
    expect(content).toContain("foreach (var pair in dictionary)");
    expect(content).toContain("_innerDictionary.Add(pair);");
  });
});

describe("Infrastructure files — always generated", () => {
  /**
   * Verifies that all four infrastructure helper files are generated even
   * for a minimal service with no models, enums, or clients. This matches
   * the legacy emitter behavior where these files are part of every project.
   */
  it("generates all four helper files for a minimal service", async () => {
    const [{ outputs }] = await Tester.compileAndDiagnose(`op test(): void;`);
    expect(outputs["src/Generated/Internal/Argument.cs"]).toBeDefined();
    expect(outputs["src/Generated/Internal/Optional.cs"]).toBeDefined();
    expect(
      outputs["src/Generated/Internal/ChangeTrackingList.cs"],
    ).toBeDefined();
    expect(
      outputs["src/Generated/Internal/ChangeTrackingDictionary.cs"],
    ).toBeDefined();
  });

  /**
   * Verifies that the infrastructure files include the standard
   * auto-generated header and #nullable disable directive.
   */
  it("includes auto-generated header in all files", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const internalFiles = Object.keys(outputs).filter((k) =>
      k.includes("/Internal/"),
    );
    for (const file of internalFiles) {
      expect(outputs[file]).toContain("// <auto-generated/>");
      expect(outputs[file]).toContain("#nullable disable");
    }
  });
});
