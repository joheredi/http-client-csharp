import { describe, expect, it } from "vitest";
import type {
  SdkClientType,
  SdkEnumType,
  SdkHttpOperation,
  SdkModelType,
} from "@azure-tools/typespec-client-generator-core";
import { UsageFlags } from "@azure-tools/typespec-client-generator-core";
import {
  toNamespace,
  getInvalidNamespaceSegments,
  resolveRootNamespace,
  resolvePackageName,
  ensureModelNamespaces,
  collectInvalidNamespaceSegments,
  cleanNamespace,
  cleanAllNamespaces,
  isSystemTypeNameCollision,
  applyModelSubNamespace,
  redirectArmSdkNamespaceConflicts,
} from "../src/utils/package-name.js";

/**
 * Tests for namespace resolution utilities (task 0.3.3).
 *
 * These tests verify that the `toNamespace()` function correctly converts raw package
 * name strings (which may be kebab-case, dot-separated, or mixed-case) into valid
 * C# namespace identifiers. The conversion must match the behavior of the legacy
 * emitter's `getClientNamespaceStringHelper` function.
 *
 * The `getInvalidNamespaceSegments()` function detects namespace segments that conflict
 * with C# reserved words like "Type", "Array", and "Enum", which would cause ambiguous
 * references in generated code.
 */
describe("toNamespace", () => {
  /**
   * Core kebab-case conversion: hyphens become dots, segments get capitalized.
   * This is the primary use case for the `package-name` emitter option.
   * Matches legacy test: getClientNamespaceStringHelper(undefined, "client-plane-generated") === "Client.Plane.Generated"
   */
  it("converts kebab-case to PascalCase with dots", () => {
    expect(toNamespace("client-plane-generated")).toBe(
      "Client.Plane.Generated",
    );
  });

  /**
   * Mixed-case input should still normalize: all segments get their first letter capitalized.
   * Matches legacy test: getClientNamespaceStringHelper(undefined, "client-plane-Generated")
   */
  it("handles mixed case in kebab segments", () => {
    expect(toNamespace("client-plane-Generated")).toBe(
      "Client.Plane.Generated",
    );
    expect(toNamespace("client-Plane-generated")).toBe(
      "Client.Plane.Generated",
    );
  });

  /**
   * Dot-separated input should capitalize each segment without adding extra dots.
   * Matches legacy test: getClientNamespaceStringHelper(undefined, "client.plane.generated")
   */
  it("handles dot-separated input", () => {
    expect(toNamespace("client.plane.generated")).toBe(
      "Client.Plane.Generated",
    );
  });

  /**
   * Already-valid C# namespaces should pass through unchanged.
   * This is important because TCGC-provided namespaces are already valid.
   */
  it("passes through already-valid namespaces unchanged", () => {
    expect(toNamespace("Azure.AI.ContentSafety")).toBe(
      "Azure.AI.ContentSafety",
    );
    expect(toNamespace("MyService")).toBe("MyService");
  });

  /**
   * Single-word package names should just get their first letter capitalized.
   */
  it("capitalizes single-word names", () => {
    expect(toNamespace("myservice")).toBe("Myservice");
    expect(toNamespace("MyService")).toBe("MyService");
  });

  /**
   * Empty string edge case — should return empty string without error.
   */
  it("handles empty string", () => {
    expect(toNamespace("")).toBe("");
  });

  /**
   * Mixed hyphens and dots — hyphens become dots, then all segments capitalize.
   */
  it("handles mixed hyphens and dots", () => {
    expect(toNamespace("azure.ai-content-safety")).toBe(
      "Azure.Ai.Content.Safety",
    );
  });
});

describe("getInvalidNamespaceSegments", () => {
  /**
   * Validates that segments matching C# reserved words are detected.
   * The legacy emitter tracks "Type", "Array", and "Enum" as invalid namespace segments.
   */
  it("detects reserved word conflicts", () => {
    expect(getInvalidNamespaceSegments("My.Type.Service")).toEqual(["Type"]);
    expect(getInvalidNamespaceSegments("My.Array.Handler")).toEqual(["Array"]);
    expect(getInvalidNamespaceSegments("My.Enum.Types")).toEqual(["Enum"]);
    expect(getInvalidNamespaceSegments("My.File.Handler")).toEqual(["File"]);
  });

  /**
   * Multiple conflicting segments should all be returned.
   */
  it("returns multiple conflicts", () => {
    expect(getInvalidNamespaceSegments("Type.Array.Service")).toEqual([
      "Type",
      "Array",
    ]);
  });

  /**
   * Valid namespaces with no conflicts should return an empty array.
   */
  it("returns empty array for valid namespaces", () => {
    expect(getInvalidNamespaceSegments("Azure.AI.ContentSafety")).toEqual([]);
    expect(getInvalidNamespaceSegments("MyService")).toEqual([]);
  });

  /**
   * Case sensitivity: "type" (lowercase) should NOT be flagged — only exact matches matter.
   * C# is case-sensitive, so only PascalCase matches are conflicts.
   */
  it("is case-sensitive", () => {
    expect(getInvalidNamespaceSegments("My.type.Service")).toEqual([]);
    expect(getInvalidNamespaceSegments("My.array.Service")).toEqual([]);
  });
});

/**
 * Tests for resolveRootNamespace and resolvePackageName (task 12.2.8).
 *
 * These tests verify that infrastructure files get the correct namespace when
 * generating versioned projects. The `package-name` option includes a version
 * suffix (e.g., "Versioning.Foo.V2") for project file naming, but the code
 * namespace must come from TCGC to match the client code namespace.
 *
 * resolveRootNamespace ignores the explicit package-name option and always
 * uses the TCGC-derived namespace. This ensures infrastructure files
 * (Argument.cs, Optional.cs, etc.) are in the same namespace as client code.
 */
describe("resolveRootNamespace", () => {
  /**
   * When TCGC provides a client namespace, resolveRootNamespace should use it,
   * ignoring any explicit package-name option. This is the core fix for the
   * versioned project namespace mismatch (task 12.2.8).
   */
  it("uses TCGC client namespace, ignoring explicit package-name", () => {
    const mockContext = createMockSdkContext({
      clientNamespace: "Versioning.ReturnTypeChangedFrom",
    });

    // resolvePackageName with explicit option uses the option
    expect(
      resolvePackageName(mockContext, "Versioning.ReturnTypeChangedFrom.V2"),
    ).toBe("Versioning.ReturnTypeChangedFrom.V2");

    // resolveRootNamespace always uses TCGC namespace
    expect(resolveRootNamespace(mockContext)).toBe(
      "Versioning.ReturnTypeChangedFrom",
    );
  });

  /**
   * When no explicit package-name is set, resolvePackageName and
   * resolveRootNamespace should return the same value (TCGC client namespace).
   */
  it("matches resolvePackageName when no explicit option is set", () => {
    const mockContext = createMockSdkContext({
      clientNamespace: "MyService",
    });

    expect(resolvePackageName(mockContext)).toBe("MyService");
    expect(resolveRootNamespace(mockContext)).toBe("MyService");
  });

  /**
   * When TCGC has no clients, falls back to sdkPackage.namespaces.
   */
  it("falls back to sdkPackage namespace when no clients exist", () => {
    const mockContext = createMockSdkContext({
      namespaceName: "Versioning.Added",
    });

    expect(resolveRootNamespace(mockContext)).toBe("Versioning.Added");
  });

  /**
   * When TCGC has neither clients nor namespaces, falls back to crossLanguagePackageId.
   */
  it("falls back to crossLanguagePackageId when no clients or namespaces", () => {
    const mockContext = createMockSdkContext({
      crossLanguagePackageId: "my-cross-lang-id",
    });

    expect(resolveRootNamespace(mockContext)).toBe("my-cross-lang-id");
  });

  /**
   * When TCGC provides nothing, falls back to "UnknownPackage".
   */
  it('falls back to "UnknownPackage" when no metadata available', () => {
    const mockContext = createMockSdkContext({});

    expect(resolveRootNamespace(mockContext)).toBe("UnknownPackage");
  });

  /**
   * Validates the fix for task 12.9: rootNamespace must reflect the cleaned
   * value after cleanAllNamespaces() mutates client namespaces in place.
   *
   * Before the fix, rootNamespace was captured once BEFORE cleanAllNamespaces(),
   * causing infrastructure files (Argument.cs, ClientUriBuilder.cs, etc.) to
   * use the pre-clean namespace while client files used the post-clean namespace.
   * This produced ~214 CS errors (CS0103, CS0246, CS1061) from namespace mismatch.
   *
   * The fix re-resolves rootNamespace after cleaning. Since cleanAllNamespaces
   * mutates client objects by reference (same objects as in sdkPackage.clients),
   * resolveRootNamespace returns the cleaned value.
   */
  it("returns cleaned namespace after cleanAllNamespaces mutates client objects", () => {
    // Create a context where the first client's namespace contains
    // a reserved word segment that cleanAllNamespaces will prefix with `_`
    const mockContext = createMockSdkContext({
      clientNamespace: "Type.Foo",
    });

    // Before cleaning: rootNamespace has the original value
    expect(resolveRootNamespace(mockContext)).toBe("Type.Foo");

    // Simulate what emitter.tsx does: getAllClients returns the same objects
    const allClients = mockContext.sdkPackage
      .clients as SdkClientType<SdkHttpOperation>[];
    cleanAllNamespaces(allClients, [], []);

    // After cleaning: the client's namespace is mutated in place
    expect(allClients[0].namespace).toBe("_Type.Foo");

    // Re-resolving rootNamespace should return the cleaned value
    // because cleanAllNamespaces mutated the same object reference
    expect(resolveRootNamespace(mockContext)).toBe("_Type.Foo");
  });

  /**
   * Validates that rootNamespace tracks dynamic client-name conflicts too,
   * not just static reserved words. When a client name like "MoveClient"
   * matches its namespace's last segment, that segment gets prefixed.
   */
  it("returns cleaned namespace for dynamic client-name conflicts", () => {
    const mockContext = {
      sdkPackage: {
        clients: [
          { name: "MoveClient", namespace: "MoveClient" },
        ] as unknown as SdkClientType<SdkHttpOperation>[],
        namespaces: [],
        crossLanguagePackageId: undefined,
      },
    };

    // Before cleaning
    expect(resolveRootNamespace(mockContext as any)).toBe("MoveClient");

    const allClients = mockContext.sdkPackage.clients;
    cleanAllNamespaces(allClients, [], []);

    // After cleaning: name "MoveClient" matches last segment "MoveClient" → prefixed
    expect(allClients[0].namespace).toBe("_MoveClient");
    expect(resolveRootNamespace(mockContext as any)).toBe("_MoveClient");
  });
});

/**
 * Minimal mock for SdkContext that provides just enough structure
 * for resolvePackageName and resolveRootNamespace to work.
 */
function createMockSdkContext(opts: {
  clientNamespace?: string;
  namespaceName?: string;
  crossLanguagePackageId?: string;
}): any {
  return {
    sdkPackage: {
      clients: opts.clientNamespace
        ? [{ namespace: opts.clientNamespace }]
        : [],
      namespaces: opts.namespaceName ? [{ fullName: opts.namespaceName }] : [],
      crossLanguagePackageId: opts.crossLanguagePackageId ?? undefined,
    },
  };
}

/**
 * Tests for ensureModelNamespaces (task 12.2.9).
 *
 * TCGC sometimes provides empty namespace strings for anonymous request models
 * synthesized from spread operations with mixed HTTP decorators (e.g., when
 * an operation combines @path, @header, and bare properties). These tests verify
 * that the namespace is correctly derived from crossLanguageDefinitionId.
 *
 * Without this fix, ModelFile generates `namespace  {` (empty namespace) and
 * client files get `using ;` (empty using), both of which are invalid C#.
 */
describe("ensureModelNamespaces", () => {
  /**
   * Anonymous request models from spread operations have IDs like
   * `Parameters.Spread.Model.spreadCompositeRequestMix.Request.anonymous`.
   * The namespace should be derived by removing the last 3 segments.
   */
  it("derives namespace from crossLanguageDefinitionId for models with empty namespace", () => {
    const models = [
      createMockModel(
        "SpreadCompositeRequestMixRequest",
        "",
        "Parameters.Spread.Model.spreadCompositeRequestMix.Request.anonymous",
      ),
      createMockModel(
        "SpreadAsRequestParameterRequest",
        "",
        "Parameters.Spread.Alias.spreadAsRequestParameter.Request.anonymous",
      ),
    ];

    ensureModelNamespaces(models, "Parameters.Spread");

    expect(models[0].namespace).toBe("Parameters.Spread.Model");
    expect(models[1].namespace).toBe("Parameters.Spread.Alias");
  });

  /**
   * Models that already have a valid namespace should not be modified.
   * This ensures the fix only targets models with empty namespaces.
   */
  it("does not modify models with existing namespace", () => {
    const models = [
      createMockModel(
        "BodyParameter",
        "Parameters.Spread.Model",
        "Parameters.Spread.Model.BodyParameter",
      ),
      createMockModel(
        "SimpleRequest",
        "Parameters.Basic.ImplicitBody",
        "Parameters.Basic.ImplicitBody.simple.Request.anonymous",
      ),
    ];

    ensureModelNamespaces(models, "Parameters.Spread");

    expect(models[0].namespace).toBe("Parameters.Spread.Model");
    expect(models[1].namespace).toBe("Parameters.Basic.ImplicitBody");
  });

  /**
   * When crossLanguageDefinitionId doesn't match the anonymous pattern
   * (no "anonymous" suffix), fall back to the root namespace.
   */
  it("falls back to root namespace when crossLanguageDefinitionId is not anonymous", () => {
    const models = [createMockModel("SomeModel", "", "SomeModel")];

    ensureModelNamespaces(models, "MyService");

    expect(models[0].namespace).toBe("MyService");
  });

  /**
   * Response anonymous models also follow the same pattern and should
   * have their namespace derived correctly.
   */
  it("handles anonymous response models", () => {
    const models = [
      createMockModel(
        "SomeResponse",
        "",
        "TestService.ContinuationToken.requestQueryResponseBody.Response.anonymous",
      ),
    ];

    ensureModelNamespaces(models, "TestService");

    expect(models[0].namespace).toBe("TestService.ContinuationToken");
  });
});

/**
 * Tests for namespace cleaning utilities (task 12.2.13).
 *
 * When a sub-client's name matches the last segment of its namespace (e.g.,
 * client "Model" in namespace "Parameters.Spread.Model"), C# produces CS0118
 * errors because the type name conflicts with the namespace. The legacy emitter
 * solves this by prefixing the conflicting segment with `_`.
 *
 * These tests verify that:
 * 1. Client name conflicts are detected correctly
 * 2. Static reserved words (Type, Array, Enum) are always treated as invalid
 * 3. Namespace strings are transformed by prefixing invalid segments with `_`
 * 4. cleanAllNamespaces applies the transformation to clients, models, and enums
 */
describe("collectInvalidNamespaceSegments", () => {
  /**
   * When a sub-client's name matches its namespace's last segment, the segment
   * must be collected. This is the primary case causing CS0118 errors in
   * specs like parameters/spread (client "Model" in "Parameters.Spread.Model").
   */
  it("detects client name matching last namespace segment", () => {
    const clients = [
      createMockClient("SpreadClient", "Parameters.Spread"),
      createMockClient("Model", "Parameters.Spread.Model"),
      createMockClient("Alias", "Parameters.Spread.Alias"),
    ];

    const invalid = collectInvalidNamespaceSegments(clients);

    expect(invalid.has("Model")).toBe(true);
    expect(invalid.has("Alias")).toBe(true);
  });

  /**
   * Static reserved words (Type, Array, Enum) must always be in the invalid set,
   * even when no client names conflict. These are C# system type names that
   * cause ambiguous references when used as namespace segments.
   */
  it("always includes static reserved words", () => {
    const clients = [createMockClient("MyClient", "My.Service")];

    const invalid = collectInvalidNamespaceSegments(clients);

    expect(invalid.has("Type")).toBe(true);
    expect(invalid.has("Array")).toBe(true);
    expect(invalid.has("Enum")).toBe(true);
    expect(invalid.has("File")).toBe(true);
  });

  /**
   * Clients where the name does NOT match the last namespace segment should
   * not add any extra invalid segments beyond the static reserved words.
   */
  it("does not flag non-conflicting client names", () => {
    const clients = [
      createMockClient("SpreadClient", "Parameters.Spread"),
      createMockClient("PetOperations", "PetStore.Operations"),
    ];

    const invalid = collectInvalidNamespaceSegments(clients);

    expect(invalid.has("SpreadClient")).toBe(false);
    expect(invalid.has("PetOperations")).toBe(false);
    expect(invalid.has("Spread")).toBe(false);
  });

  /**
   * Clients with empty or missing namespace should be safely skipped.
   */
  it("handles clients with empty namespace", () => {
    const clients = [
      createMockClient("MyClient", ""),
      createMockClient("OtherClient"),
    ];

    const invalid = collectInvalidNamespaceSegments(clients);

    // Should only contain static reserved words (Type, Array, Enum, File)
    expect(invalid.size).toBe(4);
  });

  /**
   * When a model's name matches the last segment of its namespace, the segment
   * must be collected. This is the CS0118 fix for ARM specs like non-resource
   * where model "NonResource" lives in namespace "Azure.ResourceManager.NonResource".
   * Without this, files in the parent namespace that reference the model type get
   * CS0118 because C# resolves the identifier as the namespace, not the type.
   */
  it("detects model name matching last namespace segment", () => {
    const clients = [
      createMockClient(
        "NonResourceClient",
        "Azure.ResourceManager.NonResource",
      ),
    ];
    const models = [
      createMockModel(
        "NonResource",
        "Azure.ResourceManager.NonResource",
        "Azure.ResourceManager.NonResource.NonResource",
      ),
    ];

    const invalid = collectInvalidNamespaceSegments(clients, models);

    expect(invalid.has("NonResource")).toBe(true);
  });

  /**
   * When an enum's name matches the last segment of its namespace, the segment
   * must be collected to prevent CS0118. This covers the same pattern as model
   * collisions but for enum types.
   */
  it("detects enum name matching last namespace segment", () => {
    const clients = [createMockClient("MyClient", "My.Service.Status")];
    const enums = [createMockEnum("Status", "My.Service.Status")];

    const invalid = collectInvalidNamespaceSegments(clients, [], enums);

    expect(invalid.has("Status")).toBe(true);
  });

  /**
   * Models and enums whose names do NOT match the last namespace segment should
   * not pollute the invalid set. Only exact matches trigger the prefix.
   */
  it("does not flag non-conflicting model or enum names", () => {
    const clients = [createMockClient("MyClient", "Azure.ResourceManager.Foo")];
    const models = [
      createMockModel("Bar", "Azure.ResourceManager.Foo", "Foo.Bar"),
    ];
    const enums = [createMockEnum("Baz", "Azure.ResourceManager.Foo")];

    const invalid = collectInvalidNamespaceSegments(clients, models, enums);

    expect(invalid.has("Bar")).toBe(false);
    expect(invalid.has("Baz")).toBe(false);
    expect(invalid.has("Foo")).toBe(false);
  });
});

describe("cleanNamespace", () => {
  /**
   * Core case: segments matching invalid names get `_` prefix.
   * This is what prevents CS0118 for sub-clients like "Model".
   */
  it("prefixes invalid segments with underscore", () => {
    const invalid = new Set(["Model", "Alias"]);

    expect(cleanNamespace("Parameters.Spread.Model", invalid)).toBe(
      "Parameters.Spread._Model",
    );
    expect(cleanNamespace("Parameters.Spread.Alias", invalid)).toBe(
      "Parameters.Spread._Alias",
    );
  });

  /**
   * Non-conflicting namespaces should pass through unchanged.
   */
  it("does not modify segments that are not invalid", () => {
    const invalid = new Set(["Model"]);

    expect(cleanNamespace("Parameters.Spread", invalid)).toBe(
      "Parameters.Spread",
    );
    expect(cleanNamespace("My.Service.Client", invalid)).toBe(
      "My.Service.Client",
    );
  });

  /**
   * Multiple invalid segments in the same namespace should all be prefixed.
   * This handles the unlikely but possible case where multiple segments conflict.
   */
  it("prefixes multiple invalid segments", () => {
    const invalid = new Set(["Type", "Array"]);

    expect(cleanNamespace("My.Type.Array.Service", invalid)).toBe(
      "My._Type._Array.Service",
    );
  });

  /**
   * Empty or falsy namespace strings should be returned as-is.
   */
  it("handles empty namespace", () => {
    const invalid = new Set(["Model"]);

    expect(cleanNamespace("", invalid)).toBe("");
  });

  /**
   * Single-segment namespace (root level) should be prefixed if it matches.
   */
  it("handles single-segment namespace", () => {
    const invalid = new Set(["Model"]);

    expect(cleanNamespace("Model", invalid)).toBe("_Model");
  });
});

describe("cleanAllNamespaces", () => {
  /**
   * The primary integration test: verifies that clients, models, and enums
   * all have their namespaces cleaned in place. This mimics the parameters/spread
   * scenario where client "Model" conflicts with namespace "Parameters.Spread.Model".
   */
  it("cleans client, model, and enum namespaces for sub-client conflicts", () => {
    const clients = [
      createMockClient("SpreadClient", "Parameters.Spread"),
      createMockClient("Model", "Parameters.Spread.Model"),
      createMockClient("Alias", "Parameters.Spread.Alias"),
    ];
    const models = [
      createMockModel(
        "BodyParameter",
        "Parameters.Spread.Model",
        "Parameters.Spread.Model.BodyParameter",
      ),
      createMockModel(
        "SpreadRequest",
        "Parameters.Spread.Alias",
        "Parameters.Spread.Alias.spreadRequest",
      ),
    ];
    const enums: SdkEnumType[] = [];

    cleanAllNamespaces(clients, models, enums);

    // Client namespaces should be cleaned
    expect(clients[0].namespace).toBe("Parameters.Spread");
    expect(clients[1].namespace).toBe("Parameters.Spread._Model");
    expect(clients[2].namespace).toBe("Parameters.Spread._Alias");

    // Model namespaces should also be cleaned
    expect(models[0].namespace).toBe("Parameters.Spread._Model");
    expect(models[1].namespace).toBe("Parameters.Spread._Alias");
  });

  /**
   * When no client names conflict, namespaces should remain unchanged.
   * Only static reserved words (Type, Array, Enum) should trigger prefixing.
   */
  it("does not modify namespaces when no conflicts exist", () => {
    const clients = [
      createMockClient("SpreadClient", "Parameters.Spread"),
      createMockClient("PetOperations", "PetStore.Operations"),
    ];
    const models = [createMockModel("Pet", "PetStore", "PetStore.Pet")];
    const enums: SdkEnumType[] = [];

    cleanAllNamespaces(clients, models, enums);

    expect(clients[0].namespace).toBe("Parameters.Spread");
    expect(clients[1].namespace).toBe("PetStore.Operations");
    expect(models[0].namespace).toBe("PetStore");
  });

  /**
   * Static reserved words should be prefixed even without client name conflicts.
   * Namespace "My.Type.Service" should become "My._Type.Service".
   */
  it("prefixes static reserved words in all namespaces", () => {
    const clients = [createMockClient("TypeClient", "My.Type")];
    const models = [createMockModel("MyModel", "My.Type", "My.Type.MyModel")];
    const enums = [createMockEnum("MyEnum", "My.Type")];

    cleanAllNamespaces(clients, models, enums);

    expect(clients[0].namespace).toBe("My._Type");
    expect(models[0].namespace).toBe("My._Type");
    expect(enums[0].namespace).toBe("My._Type");
  });

  /**
   * The "File" namespace segment must be prefixed because it shadows the common
   * .NET type System.IO.File and can cause CS0118 errors when a model named
   * "File" (e.g., TypeSpec.Http.File) is referenced from a child namespace.
   * This mirrors the type/file spec where namespace _Type.File._Body has a
   * File segment that shadows the File model type.
   */
  it("prefixes File segment in namespaces like Type and Array", () => {
    const clients = [
      createMockClient("FileClient", "Type.File"),
      createMockClient("Body", "Type.File.Body"),
    ];
    const models = [
      createMockModel("FileModel", "TypeSpec.Http", "TypeSpec.Http.File"),
    ];
    const enums: SdkEnumType[] = [];

    cleanAllNamespaces(clients, models, enums);

    // Both Type and File are static reserved words and should be prefixed
    expect(clients[0].namespace).toBe("_Type._File");
    expect(clients[1].namespace).toBe("_Type._File._Body");
    // Model namespace TypeSpec.Http has no invalid segments — unchanged
    expect(models[0].namespace).toBe("TypeSpec.Http");
  });

  /**
   * When a model's name matches the last segment of its namespace, ALL namespaces
   * containing that segment must be cleaned. This is the end-to-end fix for CS0118
   * in ARM specs like non-resource where model "NonResource" lives in namespace
   * "Azure.ResourceManager.NonResource". After cleaning, both the client namespace
   * and model namespace should have the `_` prefix on the conflicting segment.
   */
  it("cleans namespaces when model name matches last namespace segment", () => {
    const clients = [
      createMockClient(
        "NonResourceClient",
        "Azure.ResourceManager.NonResource",
      ),
    ];
    const models = [
      createMockModel(
        "NonResource",
        "Azure.ResourceManager.NonResource",
        "Azure.ResourceManager.NonResource.NonResource",
      ),
    ];
    const enums: SdkEnumType[] = [];

    cleanAllNamespaces(clients, models, enums);

    // Both client and model namespaces should have _NonResource
    expect(clients[0].namespace).toBe("Azure.ResourceManager._NonResource");
    expect(models[0].namespace).toBe("Azure.ResourceManager._NonResource");
  });
});

/**
 * Tests for isSystemTypeNameCollision (task 12.19).
 *
 * Validates detection of generated type names that collide with well-known
 * .NET BCL types. When a generated client, model, or enum has one of these
 * names (e.g., "Object", "Enum"), unqualified references become ambiguous
 * with the system type (CS0104). Components use this function to decide
 * whether to emit fully-qualified references.
 */
describe("isSystemTypeNameCollision", () => {
  /**
   * Core system types must be detected: Object (System.Object), Enum
   * (System.Enum), Type (System.Type), Array (System.Array), File
   * (System.IO.File). These are the most common sources of CS0104 errors.
   */
  it("returns true for well-known system type names", () => {
    expect(isSystemTypeNameCollision("Object")).toBe(true);
    expect(isSystemTypeNameCollision("Enum")).toBe(true);
    expect(isSystemTypeNameCollision("Type")).toBe(true);
    expect(isSystemTypeNameCollision("Array")).toBe(true);
    expect(isSystemTypeNameCollision("File")).toBe(true);
    expect(isSystemTypeNameCollision("Action")).toBe(true);
    expect(isSystemTypeNameCollision("Attribute")).toBe(true);
    expect(isSystemTypeNameCollision("Exception")).toBe(true);
  });

  /**
   * Normal model/client names should not trigger the collision check.
   * This ensures we don't over-qualify references for non-colliding names.
   */
  it("returns false for non-colliding type names", () => {
    expect(isSystemTypeNameCollision("Widget")).toBe(false);
    expect(isSystemTypeNameCollision("Pet")).toBe(false);
    expect(isSystemTypeNameCollision("UserProfile")).toBe(false);
    expect(isSystemTypeNameCollision("ActionRequest")).toBe(false);
  });

  /**
   * The check is case-sensitive — "object" (lowercase) and "enum"
   * (lowercase) are C# keywords handled separately by Alloy's keyword
   * escaping, not by this collision detection.
   */
  it("is case-sensitive", () => {
    expect(isSystemTypeNameCollision("object")).toBe(false);
    expect(isSystemTypeNameCollision("enum")).toBe(false);
    expect(isSystemTypeNameCollision("OBJECT")).toBe(false);
  });
});

function createMockClient(
  name: string,
  namespace?: string,
): SdkClientType<SdkHttpOperation> {
  return { name, namespace } as unknown as SdkClientType<SdkHttpOperation>;
}

function createMockModel(
  name: string,
  namespace: string,
  crossLanguageDefinitionId: string,
): SdkModelType {
  return {
    name,
    namespace,
    crossLanguageDefinitionId,
  } as unknown as SdkModelType;
}

function createMockEnum(
  name: string,
  namespace: string,
  usage?: number,
): SdkEnumType {
  return { name, namespace, usage: usage ?? 0 } as unknown as SdkEnumType;
}

/**
 * Tests for applyModelSubNamespace() (task 17.8).
 *
 * When the `model-namespace` emitter option is enabled (default for Azure),
 * models and enums are placed in a `.Models` sub-namespace. This mirrors the
 * legacy Azure emitter's `NamespaceVisitor.UpdateModelsNamespace()`.
 *
 * These tests verify:
 * - Models get `.Models` appended to their namespace
 * - Enums get `.Models` appended to their namespace
 * - API version enums are excluded (stay in root namespace)
 * - Already-suffixed namespaces are not double-appended (idempotent)
 * - Multiple namespace levels work correctly
 */
describe("applyModelSubNamespace", () => {
  /**
   * Core behavior: models should have `.Models` appended to their namespace.
   * This is the primary use case for Azure SDK model generation where
   * models live in a separate sub-namespace from clients.
   */
  it("appends .Models to model namespaces", () => {
    const models = [
      createMockModel("Widget", "MyService", "MyService.Widget"),
      createMockModel("Thing", "MyService", "MyService.Thing"),
    ];
    const enums: SdkEnumType[] = [];

    applyModelSubNamespace(models, enums);

    expect(models[0].namespace).toBe("MyService.Models");
    expect(models[1].namespace).toBe("MyService.Models");
  });

  /**
   * Enums should also get `.Models` appended, matching the legacy
   * NamespaceVisitor which moves both models and enums.
   */
  it("appends .Models to enum namespaces", () => {
    const models: SdkModelType[] = [];
    const enums = [
      createMockEnum("Color", "MyService"),
      createMockEnum("Status", "MyService"),
    ];

    applyModelSubNamespace(models, enums);

    expect(enums[0].namespace).toBe("MyService.Models");
    expect(enums[1].namespace).toBe("MyService.Models");
  });

  /**
   * API version enums must be excluded from the `.Models` sub-namespace.
   * They stay in the root namespace because client options reference them
   * directly. The legacy NamespaceVisitor explicitly skips these via
   * `InputModelTypeUsage.ApiVersionEnum` check.
   */
  it("excludes API version enums from .Models namespace", () => {
    const models: SdkModelType[] = [];
    const enums = [
      createMockEnum("Color", "MyService"),
      createMockEnum("ServiceVersion", "MyService", UsageFlags.ApiVersionEnum),
    ];

    applyModelSubNamespace(models, enums);

    expect(enums[0].namespace).toBe("MyService.Models");
    expect(enums[1].namespace).toBe("MyService"); // unchanged
  });

  /**
   * Idempotent: if a namespace already ends with `.Models`, it should
   * not be double-appended. This prevents `MyService.Models.Models`.
   */
  it("does not double-append .Models when already present", () => {
    const models = [
      createMockModel("Widget", "MyService.Models", "MyService.Models.Widget"),
    ];
    const enums: SdkEnumType[] = [];

    applyModelSubNamespace(models, enums);

    expect(models[0].namespace).toBe("MyService.Models");
  });

  /**
   * Multi-level namespaces (e.g., sub-groups) should each get `.Models`
   * appended independently. Each namespace hierarchy gets its own Models
   * sub-namespace.
   */
  it("handles multi-level namespaces correctly", () => {
    const models = [
      createMockModel(
        "Widget",
        "MyService.SubGroup",
        "MyService.SubGroup.Widget",
      ),
      createMockModel("Thing", "MyService", "MyService.Thing"),
    ];
    const enums: SdkEnumType[] = [];

    applyModelSubNamespace(models, enums);

    expect(models[0].namespace).toBe("MyService.SubGroup.Models");
    expect(models[1].namespace).toBe("MyService.Models");
  });

  /**
   * Models and enums in the same call should all be processed. This verifies
   * the function handles both collections correctly in a single invocation.
   */
  it("processes models and enums together", () => {
    const models = [createMockModel("Widget", "MyService", "MyService.Widget")];
    const enums = [createMockEnum("Color", "MyService")];

    applyModelSubNamespace(models, enums);

    expect(models[0].namespace).toBe("MyService.Models");
    expect(enums[0].namespace).toBe("MyService.Models");
  });

  /**
   * Enums with combined usage flags that include ApiVersionEnum should
   * still be excluded from the .Models namespace. The flag check uses
   * bitwise AND to handle combined flags.
   */
  it("handles combined usage flags with ApiVersionEnum", () => {
    const models: SdkModelType[] = [];
    const enums = [
      createMockEnum(
        "ServiceVersion",
        "MyService",
        UsageFlags.ApiVersionEnum | UsageFlags.Input,
      ),
    ];

    applyModelSubNamespace(models, enums);

    expect(enums[0].namespace).toBe("MyService"); // unchanged
  });

  /**
   * Empty model/enum arrays should not cause errors. Edge case for specs
   * with no models or enums.
   */
  it("handles empty arrays gracefully", () => {
    const models: SdkModelType[] = [];
    const enums: SdkEnumType[] = [];

    // Should not throw
    applyModelSubNamespace(models, enums);
  });
});

/**
 * Tests for redirectArmSdkNamespaceConflicts() (task 20.12b).
 *
 * When TCGC assigns models/enums the `Azure.ResourceManager` namespace (the ARM SDK
 * root), applyModelSubNamespace would place them in `Azure.ResourceManager.Models` —
 * the same namespace as SDK-provided types like SystemData and CreatedByType. This
 * causes CS0104 ambiguous reference errors in generated code that imports both
 * `Azure.ResourceManager.CommonTypes.Models` and `Azure.ResourceManager.Models`.
 *
 * These tests verify that redirectArmSdkNamespaceConflicts correctly moves types
 * with the ARM SDK root namespace to the package root namespace, preventing the
 * collision after `.Models` is applied.
 */
describe("redirectArmSdkNamespaceConflicts", () => {
  /**
   * Core case: models with namespace "Azure.ResourceManager" should be redirected
   * to the package root namespace. Without this, applyModelSubNamespace would put
   * them in "Azure.ResourceManager.Models" which collides with SDK types.
   */
  it("redirects models with Azure.ResourceManager namespace to root", () => {
    const models = [
      createMockModel(
        "ResourceProvisioningState",
        "Azure.ResourceManager",
        "Azure.ResourceManager.ResourceProvisioningState",
      ),
    ];
    const enums: SdkEnumType[] = [];

    redirectArmSdkNamespaceConflicts(
      models,
      enums,
      "Azure.ResourceManager.MethodSubscriptionId",
    );

    expect(models[0].namespace).toBe(
      "Azure.ResourceManager.MethodSubscriptionId",
    );
  });

  /**
   * ListResult types that TCGC puts in the ARM SDK root namespace should also
   * be redirected. This occurs in specs like "resources" where types like
   * ExtensionsResourceListResult end up in "Azure.ResourceManager".
   */
  it("redirects multiple models in Azure.ResourceManager namespace", () => {
    const models = [
      createMockModel(
        "ExtensionsResourceListResult",
        "Azure.ResourceManager",
        "Azure.ResourceManager.ExtensionsResourceListResult",
      ),
      createMockModel(
        "TopLevelTrackedResourceListResult",
        "Azure.ResourceManager",
        "Azure.ResourceManager.TopLevelTrackedResourceListResult",
      ),
    ];
    const enums: SdkEnumType[] = [];

    redirectArmSdkNamespaceConflicts(
      models,
      enums,
      "Azure.ResourceManager.Resources",
    );

    expect(models[0].namespace).toBe("Azure.ResourceManager.Resources");
    expect(models[1].namespace).toBe("Azure.ResourceManager.Resources");
  });

  /**
   * Enums with namespace "Azure.ResourceManager" should also be redirected.
   */
  it("redirects enums with Azure.ResourceManager namespace", () => {
    const models: SdkModelType[] = [];
    const enums = [createMockEnum("SomeArmEnum", "Azure.ResourceManager")];

    redirectArmSdkNamespaceConflicts(
      models,
      enums,
      "Azure.ResourceManager.MyService",
    );

    expect(enums[0].namespace).toBe("Azure.ResourceManager.MyService");
  });

  /**
   * Models/enums with namespaces that are NOT the ARM SDK root should be left
   * untouched. Only the exact "Azure.ResourceManager" namespace causes the
   * collision; sub-namespaces like "Azure.ResourceManager.CommonTypes" are safe.
   */
  it("does not redirect models with other namespaces", () => {
    const models = [
      createMockModel(
        "SystemData",
        "Azure.ResourceManager.CommonTypes",
        "Azure.ResourceManager.CommonTypes.SystemData",
      ),
      createMockModel(
        "SubscriptionResource",
        "Azure.ResourceManager.MethodSubscriptionId._MixedSubscriptionPlacement",
        "Azure.ResourceManager.MethodSubscriptionId.SubscriptionResource",
      ),
    ];
    const enums: SdkEnumType[] = [];

    redirectArmSdkNamespaceConflicts(
      models,
      enums,
      "Azure.ResourceManager.MethodSubscriptionId",
    );

    expect(models[0].namespace).toBe("Azure.ResourceManager.CommonTypes");
    expect(models[1].namespace).toBe(
      "Azure.ResourceManager.MethodSubscriptionId._MixedSubscriptionPlacement",
    );
  });

  /**
   * Empty arrays should not cause errors.
   */
  it("handles empty arrays gracefully", () => {
    const models: SdkModelType[] = [];
    const enums: SdkEnumType[] = [];

    // Should not throw
    redirectArmSdkNamespaceConflicts(models, enums, "Azure.ResourceManager.MyService");
  });

  /**
   * Verifies the full pipeline: ensureModelNamespaces → redirectArmSdkNamespaceConflicts →
   * applyModelSubNamespace. A model that starts with Azure.ResourceManager namespace should
   * end up in "{package}.Models" (NOT "Azure.ResourceManager.Models").
   */
  it("works correctly in the full namespace pipeline", () => {
    const models = [
      createMockModel(
        "ResourceProvisioningState",
        "Azure.ResourceManager",
        "Azure.ResourceManager.ResourceProvisioningState",
      ),
      createMockModel(
        "SystemData",
        "Azure.ResourceManager.CommonTypes",
        "Azure.ResourceManager.CommonTypes.SystemData",
      ),
    ];
    const enums: SdkEnumType[] = [];
    const rootNamespace = "Azure.ResourceManager.MyService";

    // Step 1: redirect ARM SDK namespace conflicts
    redirectArmSdkNamespaceConflicts(models, enums, rootNamespace);
    // Step 2: apply .Models sub-namespace
    applyModelSubNamespace(models, enums);

    // ResourceProvisioningState should be in the package's Models namespace
    expect(models[0].namespace).toBe("Azure.ResourceManager.MyService.Models");
    // SystemData should remain in CommonTypes.Models (no redirect needed)
    expect(models[1].namespace).toBe(
      "Azure.ResourceManager.CommonTypes.Models",
    );
  });
});
