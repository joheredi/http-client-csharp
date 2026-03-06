import { describe, expect, it } from "vitest";
import { HttpTester, IntegrationTester, Tester } from "./test-host.js";

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

describe("CancellationTokenExtensionsFile", () => {
  /**
   * Verifies CancellationTokenExtensions.cs is generated at the correct
   * Internal path, matching the legacy emitter's output structure.
   */
  it("generates CancellationTokenExtensions.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(
      outputs["src/Generated/Internal/CancellationTokenExtensions.cs"],
    ).toBeDefined();
  });

  /**
   * Verifies the class is internal, static, partial — matching legacy output.
   * These modifiers ensure the class is not part of the public API, contains
   * no instance state, and can be extended by custom code.
   */
  it("declares internal static partial class", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/CancellationTokenExtensions.cs"];
    expect(content).toContain(
      "internal static partial class CancellationTokenExtensions",
    );
  });

  /**
   * Verifies the ToRequestOptions extension method is present.
   * This method bridges CancellationToken to SCM's RequestOptions.
   */
  it("contains ToRequestOptions extension method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/CancellationTokenExtensions.cs"];
    expect(content).toContain(
      "public static RequestOptions ToRequestOptions(this CancellationToken cancellationToken)",
    );
    expect(content).toContain("cancellationToken.CanBeCanceled");
  });

  /**
   * Verifies the required using directives for System.ClientModel.Primitives
   * (for RequestOptions) and System.Threading (for CancellationToken).
   */
  it("includes required using directives", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/CancellationTokenExtensions.cs"];
    expect(content).toContain("using System.ClientModel.Primitives;");
    expect(content).toContain("using System.Threading;");
  });

  /**
   * Verifies the correct namespace is used, derived from the service name.
   */
  it("uses the correct namespace from package name", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace MyLibrary;
    `);
    const content =
      outputs["src/Generated/Internal/CancellationTokenExtensions.cs"];
    expect(content).toContain("namespace MyLibrary");
  });
});

describe("ErrorResultFile", () => {
  /**
   * Verifies ErrorResult.cs is generated at the correct Internal path.
   */
  it("generates ErrorResult.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(outputs["src/Generated/Internal/ErrorResult.cs"]).toBeDefined();
  });

  /**
   * Verifies the class is a generic internal partial class extending
   * ClientResult<T>. This is the error-result pattern used by the
   * HEAD-as-bool pipeline methods.
   */
  it("declares internal partial class with generic type and base type", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ErrorResult.cs"];
    expect(content).toContain("internal partial class ErrorResult<T>");
    expect(content).toContain("ClientResult<T>");
  });

  /**
   * Verifies the constructor accepts PipelineResponse and ClientResultException
   * and chains to the base constructor with default value.
   */
  it("contains constructor with base call", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ErrorResult.cs"];
    expect(content).toContain(
      "public ErrorResult(PipelineResponse response, ClientResultException exception) : base(default, response)",
    );
  });

  /**
   * Verifies the Value property override throws the stored exception.
   * This is the core error semantics: accessing Value on a failed result
   * throws the original exception.
   */
  it("contains Value property that throws exception", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ErrorResult.cs"];
    expect(content).toContain("public override T Value => throw _exception;");
  });

  /**
   * Verifies the required using directives for SCM types.
   */
  it("includes required using directives", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ErrorResult.cs"];
    expect(content).toContain("using System.ClientModel;");
    expect(content).toContain("using System.ClientModel.Primitives;");
  });
});

describe("SerializationFormatFile", () => {
  /**
   * Verifies SerializationFormat.cs is generated at the correct Internal path.
   */
  it("generates SerializationFormat.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(
      outputs["src/Generated/Internal/SerializationFormat.cs"],
    ).toBeDefined();
  });

  /**
   * Verifies it declares an internal enum (not a class), matching
   * the legacy emitter output exactly.
   */
  it("declares internal enum SerializationFormat", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/SerializationFormat.cs"];
    expect(content).toContain("internal enum SerializationFormat");
  });

  /**
   * Verifies all DateTime format values are present with correct ordinals.
   * These formats are used by TypeFormatters for date-time serialization.
   */
  it("contains DateTime format values", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/SerializationFormat.cs"];
    expect(content).toContain("Default = 0");
    expect(content).toContain("DateTime_RFC1123 = 1");
    expect(content).toContain("DateTime_RFC3339 = 2");
    expect(content).toContain("DateTime_RFC7231 = 3");
    expect(content).toContain("DateTime_ISO8601 = 4");
    expect(content).toContain("DateTime_Unix = 5");
  });

  /**
   * Verifies Duration format values are present.
   */
  it("contains Duration format values", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/SerializationFormat.cs"];
    expect(content).toContain("Duration_ISO8601 = 7");
    expect(content).toContain("Duration_Constant = 8");
    expect(content).toContain("Duration_Seconds = 9");
    expect(content).toContain("Duration_Seconds_Float = 10");
    expect(content).toContain("Duration_Seconds_Double = 11");
    expect(content).toContain("Duration_Milliseconds = 12");
  });

  /**
   * Verifies Bytes and Time format values are present.
   */
  it("contains Bytes and Time format values", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/SerializationFormat.cs"];
    expect(content).toContain("Time_ISO8601 = 15");
    expect(content).toContain("Bytes_Base64Url = 16");
    expect(content).toContain("Bytes_Base64 = 17");
  });

  /**
   * Verifies the correct namespace is used, derived from the service name.
   */
  it("uses the correct namespace from package name", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace MyLibrary;
    `);
    const content = outputs["src/Generated/Internal/SerializationFormat.cs"];
    expect(content).toContain("namespace MyLibrary");
  });
});

describe("ClientPipelineExtensionsFile", () => {
  /**
   * Verifies ClientPipelineExtensions.cs is generated at the correct path.
   */
  it("generates ClientPipelineExtensions.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"],
    ).toBeDefined();
  });

  /**
   * Verifies the class is internal, static, partial — matching legacy output.
   */
  it("declares internal static partial class", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"];
    expect(content).toContain(
      "internal static partial class ClientPipelineExtensions",
    );
  });

  /**
   * Verifies the async ProcessMessageAsync extension method is present
   * with the expected signature and error handling logic.
   */
  it("contains ProcessMessageAsync method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"];
    expect(content).toContain(
      "public static async ValueTask<PipelineResponse> ProcessMessageAsync(this ClientPipeline pipeline, PipelineMessage message, RequestOptions options)",
    );
    expect(content).toContain(
      "await pipeline.SendAsync(message).ConfigureAwait(false);",
    );
    expect(content).toContain("ClientErrorBehaviors.NoThrow");
  });

  /**
   * Verifies the synchronous ProcessMessage extension method is present.
   */
  it("contains ProcessMessage method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"];
    expect(content).toContain(
      "public static PipelineResponse ProcessMessage(this ClientPipeline pipeline, PipelineMessage message, RequestOptions options)",
    );
    expect(content).toContain("pipeline.Send(message);");
    expect(content).toContain(
      "throw new ClientResultException(message.Response);",
    );
  });

  /**
   * Verifies the async HEAD-as-bool method is present with the correct
   * switch pattern for status code classification.
   */
  it("contains ProcessHeadAsBoolMessageAsync method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"];
    expect(content).toContain(
      "public static async ValueTask<ClientResult<bool>> ProcessHeadAsBoolMessageAsync(this ClientPipeline pipeline, PipelineMessage message, RequestOptions options)",
    );
    expect(content).toContain("case >= 200 and < 300:");
    expect(content).toContain("ClientResult.FromValue(true, response)");
    expect(content).toContain("case >= 400 and < 500:");
    expect(content).toContain("ClientResult.FromValue(false, response)");
    expect(content).toContain("new ErrorResult<bool>");
  });

  /**
   * Verifies the synchronous HEAD-as-bool method is present.
   */
  it("contains ProcessHeadAsBoolMessage method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"];
    expect(content).toContain(
      "public static ClientResult<bool> ProcessHeadAsBoolMessage(this ClientPipeline pipeline, PipelineMessage message, RequestOptions options)",
    );
  });

  /**
   * Verifies the required using directives for SCM pipeline types.
   */
  it("includes required using directives", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"];
    expect(content).toContain("using System.ClientModel;");
    expect(content).toContain("using System.ClientModel.Primitives;");
    expect(content).toContain("using System.Threading.Tasks;");
  });
});

describe("ClientUriBuilderFile", () => {
  /**
   * Verifies ClientUriBuilder.cs is generated at the correct Internal path.
   * This file is required by generated REST client code that constructs
   * request URIs from route templates, path, and query parameters.
   */
  it("generates ClientUriBuilder.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(outputs["src/Generated/Internal/ClientUriBuilder.cs"]).toBeDefined();
  });

  /**
   * Verifies the class is internal, partial — matching legacy output.
   * Unlike most infrastructure helpers, ClientUriBuilder is NOT static
   * because it maintains instance state (UriBuilder, StringBuilder, pathLength).
   */
  it("declares internal partial class (not static)", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ClientUriBuilder.cs"];
    expect(content).toContain("internal partial class ClientUriBuilder");
    expect(content).not.toContain(
      "internal static partial class ClientUriBuilder",
    );
  });

  /**
   * Verifies the private fields and properties that hold URI state.
   * These are the core data structures the builder uses internally.
   */
  it("contains private fields and lazy-init properties", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ClientUriBuilder.cs"];
    expect(content).toContain("private UriBuilder _uriBuilder;");
    expect(content).toContain("private StringBuilder _pathAndQuery;");
    expect(content).toContain("private int _pathLength;");
    expect(content).toContain(
      "private UriBuilder UriBuilder => _uriBuilder ??= new UriBuilder();",
    );
    expect(content).toContain(
      "private StringBuilder PathAndQuery => _pathAndQuery ??= new StringBuilder();",
    );
  });

  /**
   * Verifies the Reset method that initializes the builder from a base URI.
   * This is always the first call in the generated REST client request methods.
   */
  it("contains Reset method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ClientUriBuilder.cs"];
    expect(content).toContain("public void Reset(Uri uri)");
    expect(content).toContain("_uriBuilder = new UriBuilder(uri);");
  });

  /**
   * Verifies the AppendPath overloads for various types.
   * These are used when substituting path parameters in route templates
   * (e.g., /items/{id} where id can be int, string, Guid, etc.).
   */
  it("contains AppendPath overloads for multiple types", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ClientUriBuilder.cs"];
    expect(content).toContain(
      "public void AppendPath(string value, bool escape)",
    );
    expect(content).toContain(
      "public void AppendPath(bool value, bool escape = false)",
    );
    expect(content).toContain(
      "public void AppendPath(int value, bool escape = true)",
    );
    expect(content).toContain(
      "public void AppendPath(Guid value, bool escape = true)",
    );
    expect(content).toContain(
      "public void AppendPath(long value, bool escape = true)",
    );
    expect(content).toContain(
      "public void AppendPath(DateTimeOffset value, SerializationFormat format = SerializationFormat.Default, bool escape = true)",
    );
  });

  /**
   * Verifies the AppendQuery overloads used for adding query parameters.
   * The generated client calls these for each query parameter on an operation.
   */
  it("contains AppendQuery overloads for multiple types", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ClientUriBuilder.cs"];
    expect(content).toContain(
      "public void AppendQuery(string name, string value, bool escape)",
    );
    expect(content).toContain(
      "public void AppendQuery(string name, int value, bool escape = true)",
    );
    expect(content).toContain(
      "public void AppendQuery(string name, decimal value, bool escape = true)",
    );
    expect(content).toContain(
      "public void AppendQuery(string name, Guid value, bool escape = true)",
    );
  });

  /**
   * Verifies the delimited append methods for collections.
   * These handle array/list parameters serialized as delimited strings.
   */
  it("contains AppendPathDelimited and AppendQueryDelimited", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ClientUriBuilder.cs"];
    expect(content).toContain("public void AppendPathDelimited<T>");
    expect(content).toContain("public void AppendQueryDelimited<T>");
  });

  /**
   * Verifies the UpdateQuery method for modifying existing query parameters.
   * This is needed for paging scenarios where the next-link URL overwrites query values.
   */
  it("contains UpdateQuery method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ClientUriBuilder.cs"];
    expect(content).toContain(
      "public void UpdateQuery(string name, string value)",
    );
  });

  /**
   * Verifies the ToUri method that constructs the final URI.
   * This is always the last call in the generated REST client request methods.
   */
  it("contains ToUri method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ClientUriBuilder.cs"];
    expect(content).toContain("public Uri ToUri()");
    expect(content).toContain("return UriBuilder.Uri;");
  });

  /**
   * Verifies required using directives: System (for Uri, UriBuilder),
   * System.Collections.Generic (for IEnumerable), System.Linq (for Select),
   * System.Text (for StringBuilder).
   */
  it("includes required using directives", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/ClientUriBuilder.cs"];
    expect(content).toContain("using System;");
    expect(content).toContain("using System.Collections.Generic;");
    expect(content).toContain("using System.Linq;");
    expect(content).toContain("using System.Text;");
  });

  /**
   * Verifies the correct namespace is used, derived from the service name.
   */
  it("uses the correct namespace from package name", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace MyUriLib;
    `);
    const content = outputs["src/Generated/Internal/ClientUriBuilder.cs"];
    expect(content).toContain("namespace MyUriLib");
  });
});

describe("TypeFormattersFile", () => {
  /**
   * Verifies TypeFormatters.cs is generated at the correct Internal path.
   * This file provides string conversion and parsing utilities used by
   * ClientUriBuilder and serialization code.
   */
  it("generates TypeFormatters.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(outputs["src/Generated/Internal/TypeFormatters.cs"]).toBeDefined();
  });

  /**
   * Verifies the class is internal, static, partial — matching legacy output.
   * Static because all methods are utility functions with no instance state.
   */
  it("declares internal static partial class", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/TypeFormatters.cs"];
    expect(content).toContain("internal static partial class TypeFormatters");
  });

  /**
   * Verifies the format constants used across the class.
   * RoundtripZFormat is the ISO8601 format with 7-digit fractional seconds in UTC.
   */
  it("contains format constants", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/TypeFormatters.cs"];
    expect(content).toContain(
      'private const string RoundtripZFormat = "yyyy-MM-ddTHH:mm:ss.fffffffZ";',
    );
    expect(content).toContain('public const string DefaultNumberFormat = "G";');
  });

  /**
   * Verifies the ToString overloads for bool, DateTime, DateTimeOffset,
   * TimeSpan, and byte[]. These are the core formatting methods.
   */
  it("contains ToString overloads", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/TypeFormatters.cs"];
    expect(content).toContain(
      'public static string ToString(bool value) => value ? "true" : "false";',
    );
    expect(content).toContain(
      "public static string ToString(DateTime value, string format)",
    );
    expect(content).toContain(
      "public static string ToString(DateTimeOffset value, string format)",
    );
    expect(content).toContain(
      "public static string ToString(TimeSpan value, string format)",
    );
    expect(content).toContain(
      "public static string ToString(byte[] value, string format)",
    );
  });

  /**
   * Verifies Base64URL encoding and decoding methods.
   * These are needed for Bytes_Base64Url serialization format.
   */
  it("contains Base64URL encode and decode methods", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/TypeFormatters.cs"];
    expect(content).toContain(
      "public static string ToBase64UrlString(byte[] value)",
    );
    expect(content).toContain(
      "public static byte[] FromBase64UrlString(string value)",
    );
  });

  /**
   * Verifies the Parse methods for deserialization.
   * These are used when reading response values from JSON/headers.
   */
  it("contains ParseDateTimeOffset and ParseTimeSpan", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/TypeFormatters.cs"];
    expect(content).toContain(
      "public static DateTimeOffset ParseDateTimeOffset(string value, string format)",
    );
    expect(content).toContain(
      "public static TimeSpan ParseTimeSpan(string value, string format)",
    );
  });

  /**
   * Verifies the ToFormatSpecifier method that maps SerializationFormat
   * enum values to their corresponding format strings. This is the bridge
   * between TypeSpec encoding metadata and C# format specifiers.
   */
  it("contains ToFormatSpecifier mapping", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/TypeFormatters.cs"];
    expect(content).toContain(
      "public static string ToFormatSpecifier(SerializationFormat format)",
    );
    expect(content).toContain('SerializationFormat.DateTime_RFC1123 => "R"');
    expect(content).toContain('SerializationFormat.DateTime_RFC3339 => "O"');
    expect(content).toContain('SerializationFormat.Bytes_Base64Url => "U"');
    expect(content).toContain('SerializationFormat.Duration_ISO8601 => "P"');
  });

  /**
   * Verifies the ConvertToString dispatch method that handles many types.
   * This is the primary method called by ClientUriBuilder for parameter formatting.
   */
  it("contains ConvertToString dispatch method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/TypeFormatters.cs"];
    expect(content).toContain(
      "public static string ConvertToString(object value, SerializationFormat format = SerializationFormat.Default)",
    );
    expect(content).toContain('null => "null"');
    expect(content).toContain("string s => s");
    expect(content).toContain("bool b => ToString(b)");
    expect(content).toContain("Guid guid => guid.ToString()");
  });

  /**
   * Verifies required using directives: System (base types),
   * System.Collections.Generic (IEnumerable), System.Globalization
   * (CultureInfo), System.Xml (XmlConvert for ISO8601 durations).
   */
  it("includes required using directives", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content = outputs["src/Generated/Internal/TypeFormatters.cs"];
    expect(content).toContain("using System;");
    expect(content).toContain("using System.Collections.Generic;");
    expect(content).toContain("using System.Globalization;");
    expect(content).toContain("using System.Xml;");
  });

  /**
   * Verifies the correct namespace is used, derived from the service name.
   */
  it("uses the correct namespace from package name", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace MyFormatterLib;
    `);
    const content = outputs["src/Generated/Internal/TypeFormatters.cs"];
    expect(content).toContain("namespace MyFormatterLib");
  });
});

/**
 * Tests for the ModelSerializationExtensionsFile component.
 *
 * ModelSerializationExtensions.cs provides extension methods and static helpers
 * used by serialization/deserialization code throughout the generated client.
 * It includes:
 * - WireOptions — default ModelReaderWriterOptions with "W" (wire) format
 * - JsonDocumentOptions — configured with MaxDepth=256 for parsing
 * - JsonElement extension methods for reading typed values
 * - Utf8JsonWriter extension methods for writing typed values
 * - WriteObjectValue<T> polymorphic serializer
 *
 * This file is always generated as part of the infrastructure layer.
 */
describe("ModelSerializationExtensionsFile", () => {
  /**
   * Verifies that ModelSerializationExtensions.cs is generated at the
   * standard Internal path, matching the legacy emitter's output structure.
   */
  it("generates ModelSerializationExtensions.cs at the correct path", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"],
    ).toBeDefined();
  });

  /**
   * Verifies the class is declared as internal, static, and partial,
   * matching the legacy emitter convention for infrastructure helpers
   * that provide extension methods.
   */
  it("declares internal static partial class", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "internal static partial class ModelSerializationExtensions",
    );
  });

  /**
   * Verifies the WireOptions field is generated — this is the default
   * ModelReaderWriterOptions("W") used by all serialization code as the
   * fallback options when no explicit options are provided.
   */
  it("contains WireOptions field", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      'internal static readonly ModelReaderWriterOptions WireOptions = new ModelReaderWriterOptions("W")',
    );
  });

  /**
   * Verifies the JsonDocumentOptions field is generated with MaxDepth=256.
   * This prevents StackOverflow when parsing deeply nested JSON responses.
   */
  it("contains JsonDocumentOptions field with MaxDepth", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "internal static readonly JsonDocumentOptions JsonDocumentOptions",
    );
    expect(content).toContain("MaxDepth = 256");
  });

  /**
   * Verifies the GetObject extension method that converts a JsonElement
   * into a C# object based on its ValueKind. This is essential for
   * deserializing additional/unknown properties (additionalProperties).
   */
  it("contains GetObject extension method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "public static object GetObject(this JsonElement element)",
    );
    expect(content).toContain("case JsonValueKind.String:");
    expect(content).toContain("case JsonValueKind.Number:");
    expect(content).toContain("case JsonValueKind.Object:");
    expect(content).toContain("case JsonValueKind.Array:");
  });

  /**
   * Verifies GetBytesFromBase64 extension method that handles both
   * standard ("D") and URL-safe ("U") Base64 encoding formats.
   */
  it("contains GetBytesFromBase64 extension method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "public static byte[] GetBytesFromBase64(this JsonElement element, string format)",
    );
    expect(content).toContain(
      "TypeFormatters.FromBase64UrlString(element.GetRequiredString())",
    );
  });

  /**
   * Verifies GetDateTimeOffset extension method that handles Unix timestamps
   * ("U" format with Number kind) and formatted date strings.
   */
  it("contains GetDateTimeOffset extension method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "public static DateTimeOffset GetDateTimeOffset(this JsonElement element, string format)",
    );
    expect(content).toContain(
      "DateTimeOffset.FromUnixTimeSeconds(element.GetInt64())",
    );
  });

  /**
   * Verifies the set of Utf8JsonWriter.WriteStringValue overloads for
   * DateTimeOffset, DateTime, TimeSpan, and char types.
   */
  it("contains WriteStringValue overloads", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "public static void WriteStringValue(this Utf8JsonWriter writer, DateTimeOffset value, string format)",
    );
    expect(content).toContain(
      "public static void WriteStringValue(this Utf8JsonWriter writer, DateTime value, string format)",
    );
    expect(content).toContain(
      "public static void WriteStringValue(this Utf8JsonWriter writer, TimeSpan value, string format)",
    );
    expect(content).toContain(
      "public static void WriteStringValue(this Utf8JsonWriter writer, char value)",
    );
  });

  /**
   * Verifies WriteBase64StringValue handles both URL-safe ("U") and
   * standard ("D") Base64 formats, with null-handling.
   */
  it("contains WriteBase64StringValue method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "public static void WriteBase64StringValue(this Utf8JsonWriter writer, byte[] value, string format)",
    );
    expect(content).toContain("writer.WriteNullValue()");
    expect(content).toContain("TypeFormatters.ToBase64UrlString(value)");
  });

  /**
   * Verifies WriteNumberValue for DateTimeOffset using Unix timestamps.
   * Only the "U" format is supported for numeric date representation.
   */
  it("contains WriteNumberValue method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "public static void WriteNumberValue(this Utf8JsonWriter writer, DateTimeOffset value, string format)",
    );
    expect(content).toContain("value.ToUnixTimeSeconds()");
  });

  /**
   * Verifies WriteObjectValue<T> — the polymorphic serializer that dispatches
   * based on value type (IJsonModel, byte[], BinaryData, JsonElement, int,
   * decimal, double, float, long, string, bool, Guid, DateTimeOffset,
   * DateTime, dictionary-like, array-like, TimeSpan). This is the most
   * critical method as it handles all additional/unknown properties.
   */
  it("contains WriteObjectValue<T> polymorphic serializer", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "public static void WriteObjectValue<T>(this Utf8JsonWriter writer, T value, ModelReaderWriterOptions options = null)",
    );
    expect(content).toContain("case IJsonModel<T> jsonModel:");
    expect(content).toContain("case byte[] bytes:");
    expect(content).toContain("case BinaryData bytes0:");
    expect(content).toContain("case JsonElement json:");
    expect(content).toContain("case int i:");
    expect(content).toContain("case double d0:");
    expect(content).toContain("double.IsNaN(d0)");
    expect(content).toContain(
      "case IEnumerable<KeyValuePair<string, object>> enumerable:",
    );
    expect(content).toContain("case IEnumerable<object> objectEnumerable:");
    expect(content).toContain("case TimeSpan timeSpan:");
  });

  /**
   * Verifies the non-generic WriteObjectValue overload that delegates
   * to WriteObjectValue<object>. This enables callers to pass plain
   * `object` without explicit type parameters.
   */
  it("contains non-generic WriteObjectValue overload", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "public static void WriteObjectValue(this Utf8JsonWriter writer, object value, ModelReaderWriterOptions options = null)",
    );
    expect(content).toContain(
      "writer.WriteObjectValue<object>(value, options)",
    );
  });

  /**
   * Verifies ThrowNonNullablePropertyIsNull with [Conditional("DEBUG")]
   * attribute. This method only throws in debug builds, matching the
   * legacy emitter's behavior for service-returned null on non-nullable properties.
   */
  it("contains ThrowNonNullablePropertyIsNull with Conditional attribute", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain('[Conditional("DEBUG")]');
    expect(content).toContain(
      "public static void ThrowNonNullablePropertyIsNull(this JsonProperty @property)",
    );
  });

  /**
   * Verifies GetRequiredString that throws InvalidOperationException
   * when a required string value is null. Used during deserialization
   * of non-nullable string properties.
   */
  it("contains GetRequiredString method", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "public static string GetRequiredString(this JsonElement element)",
    );
    expect(content).toContain("throw new InvalidOperationException");
  });

  /**
   * Verifies all required using directives are present. These namespaces
   * are needed for JSON serialization types (System.Text.Json),
   * model reader/writer (System.ClientModel.Primitives), and
   * diagnostic attributes (System.Diagnostics).
   */
  it("includes required using directives", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain("using System;");
    expect(content).toContain("using System.ClientModel.Primitives;");
    expect(content).toContain("using System.Collections.Generic;");
    expect(content).toContain("using System.Diagnostics;");
    expect(content).toContain("using System.Globalization;");
    expect(content).toContain("using System.Text.Json;");
  });

  /**
   * Verifies the namespace is derived from the service name, matching
   * the convention used by all other infrastructure files.
   */
  it("uses the correct namespace from package name", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace MySerializationLib;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain("namespace MySerializationLib");
  });
});

/**
 * Tests for XML extension methods in ModelSerializationExtensionsFile.
 *
 * When models use XML serialization (detected via `serializationOptions.xml`
 * on model properties), the emitter must generate additional XML-specific
 * infrastructure in ModelSerializationExtensions.cs:
 *
 * - XmlWriterSettings / XmlReaderSettings static fields
 * - XElement extension methods for reading typed values during deserialization
 * - XmlWriter extension methods for writing formatted values during serialization
 * - WriteObjectValue<T> overload for XmlWriter (IPersistableModel round-trip)
 *
 * Without these, dotnet build fails with CS0117 (XmlWriterSettings not found)
 * and CS1929 (WriteObjectValue not found for XmlWriter).
 *
 * Uses XmlTester which registers @typespec/xml to enable @attribute decorator.
 */
describe("ModelSerializationExtensionsFile — XML extension methods", () => {
  /** TypeSpec definition that triggers XML serialization detection */
  const xmlTypeSpec = `
    using TypeSpec.Http;
    using TypeSpec.Xml;

    @service
    namespace TestXml;

    model XmlModel {
      @attribute id: int32;
      name: string;
    }

    @route("/xml")
    op getXml(): XmlModel;
  `;

  /**
   * Verifies XmlWriterSettings field is generated with UTF-8 encoding (no BOM).
   * This field is referenced by all XML model serialization Write() methods
   * when creating XmlWriter instances via XmlWriter.Create(stream, settings).
   */
  it("contains XmlWriterSettings field when XML models exist", async () => {
    const [{ outputs }] = await IntegrationTester.compileAndDiagnose(xmlTypeSpec);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "internal static readonly XmlWriterSettings XmlWriterSettings",
    );
    expect(content).toContain("Encoding = new UTF8Encoding(false)");
  });

  /**
   * Verifies XmlReaderSettings field is generated with strict security
   * configuration (DTD prohibited, no resolver, character limits).
   * Used internally by the XML WriteObjectValue method when reading
   * serialized model data via XmlReader.
   */
  it("contains XmlReaderSettings field with security settings", async () => {
    const [{ outputs }] = await IntegrationTester.compileAndDiagnose(xmlTypeSpec);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "private static readonly XmlReaderSettings XmlReaderSettings",
    );
    expect(content).toContain("DtdProcessing = DtdProcessing.Prohibit");
    expect(content).toContain("XmlResolver = null");
    expect(content).toContain("MaxCharactersInDocument = 30000000");
  });

  /**
   * Verifies XElement extension methods for typed value reading during
   * XML deserialization: GetDateTimeOffset, GetTimeSpan, GetBytesFromBase64.
   * These parallel the JsonElement extension methods but operate on XElement.
   */
  it("contains XElement extension methods for typed value reading", async () => {
    const [{ outputs }] = await IntegrationTester.compileAndDiagnose(xmlTypeSpec);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "public static DateTimeOffset GetDateTimeOffset(this XElement element, string format)",
    );
    expect(content).toContain(
      "public static TimeSpan GetTimeSpan(this XElement element, string format)",
    );
    expect(content).toContain(
      "public static byte[] GetBytesFromBase64(this XElement element, string format)",
    );
  });

  /**
   * Verifies XmlWriter extension methods for writing formatted values:
   * WriteStringValue (DateTimeOffset, TimeSpan) and WriteBase64StringValue.
   * These are called by XmlModelWriteCore when serializing date/time/bytes fields.
   */
  it("contains XmlWriter WriteStringValue and WriteBase64StringValue overloads", async () => {
    const [{ outputs }] = await IntegrationTester.compileAndDiagnose(xmlTypeSpec);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "public static void WriteStringValue(this XmlWriter writer, DateTimeOffset value, string format)",
    );
    expect(content).toContain(
      "public static void WriteStringValue(this XmlWriter writer, TimeSpan value, string format)",
    );
    expect(content).toContain(
      "public static void WriteBase64StringValue(this XmlWriter writer, byte[] value, string format)",
    );
  });

  /**
   * Verifies WriteObjectValue<T> overload for XmlWriter. This is the XML
   * counterpart to the JSON WriteObjectValue<T>. It serializes an
   * IPersistableModel<T> by writing it through ModelReaderWriter.Write()
   * and piping the resulting XML via XmlReader into the target XmlWriter.
   * The nameHint parameter allows wrapping content in a custom element name.
   */
  it("contains WriteObjectValue<T> for XmlWriter with nameHint parameter", async () => {
    const [{ outputs }] = await IntegrationTester.compileAndDiagnose(xmlTypeSpec);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain(
      "public static void WriteObjectValue<T>(this XmlWriter writer, T value, ModelReaderWriterOptions options = null, string nameHint = null)",
    );
    expect(content).toContain("case IPersistableModel<T> persistableModel:");
    expect(content).toContain("ModelReaderWriter.Write(persistableModel,");
    expect(content).toContain("reader.MoveToContent()");
    expect(content).toContain("writer.WriteNode(reader, true)");
  });

  /**
   * Verifies XML-specific using directives are added when XML models exist.
   * System.Xml (XmlWriter, XmlReader), System.Xml.Linq (XElement),
   * System.IO (Stream), and System.Text (UTF8Encoding) are all required.
   */
  it("includes XML-specific using directives", async () => {
    const [{ outputs }] = await IntegrationTester.compileAndDiagnose(xmlTypeSpec);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).toContain("using System.IO;");
    expect(content).toContain("using System.Text;");
    expect(content).toContain("using System.Xml;");
    expect(content).toContain("using System.Xml.Linq;");
  });

  /**
   * Verifies that XML methods are NOT generated for JSON-only services.
   * Without XML models, the infrastructure file should contain only JSON
   * methods to keep the generated output minimal.
   */
  it("omits XML methods for JSON-only services", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    const content =
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"];
    expect(content).not.toContain("XmlWriterSettings");
    expect(content).not.toContain("XmlReaderSettings");
    expect(content).not.toContain("this XmlWriter writer");
    expect(content).not.toContain("this XElement element");
  });
});

describe("Infrastructure files — always generated", () => {
  /**
   * Verifies that all infrastructure helper files are generated even
   * for a minimal service with no models, enums, or clients. This matches
   * the legacy emitter behavior where these files are part of every project.
   */
  it("generates all helper files for a minimal service", async () => {
    const [{ outputs }] = await Tester.compileAndDiagnose(`op test(): void;`);
    expect(outputs["src/Generated/Internal/Argument.cs"]).toBeDefined();
    expect(outputs["src/Generated/Internal/Optional.cs"]).toBeDefined();
    expect(
      outputs["src/Generated/Internal/ChangeTrackingList.cs"],
    ).toBeDefined();
    expect(
      outputs["src/Generated/Internal/ChangeTrackingDictionary.cs"],
    ).toBeDefined();
    expect(
      outputs["src/Generated/Internal/CancellationTokenExtensions.cs"],
    ).toBeDefined();
    expect(outputs["src/Generated/Internal/ErrorResult.cs"]).toBeDefined();
    expect(
      outputs["src/Generated/Internal/SerializationFormat.cs"],
    ).toBeDefined();
    expect(
      outputs["src/Generated/Internal/ClientPipelineExtensions.cs"],
    ).toBeDefined();
    expect(outputs["src/Generated/Internal/ClientUriBuilder.cs"]).toBeDefined();
    expect(outputs["src/Generated/Internal/TypeFormatters.cs"]).toBeDefined();
    expect(
      outputs["src/Generated/Internal/ModelSerializationExtensions.cs"],
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
