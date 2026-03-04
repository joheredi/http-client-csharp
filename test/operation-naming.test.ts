import { describe, expect, it } from "vitest";
import {
  buildSiblingNameSet,
  cleanOperationName,
} from "../src/utils/operation-naming.js";
import { HttpTester } from "./test-host.js";

/**
 * Tests for operation name conventions (task 3.6.1).
 *
 * The .NET SDK convention renames "List" operations to follow the "Get" pattern:
 * - "List" → "GetAll"
 * - "ListXxx" → "GetXxx"
 *
 * This matches the legacy emitter's `GetCleanOperationName` in `ClientProvider.cs`.
 * Without these conventions, generated C# SDKs would have inconsistent naming
 * compared to hand-written Azure SDKs and the legacy emitter's output.
 */
describe("cleanOperationName", () => {
  /**
   * Validates the core "List" → "GetAll" transformation.
   * When a TypeSpec operation is named exactly "list" and PascalCased to "List",
   * the .NET convention renames it to "GetAll" because listing all items
   * in .NET is idiomatically expressed as "GetAll" or "Get{Things}".
   */
  it('renames exact "List" to "GetAll"', () => {
    expect(cleanOperationName("List")).toBe("GetAll");
  });

  /**
   * Validates the "ListXxx" → "GetXxx" transformation.
   * When a TypeSpec operation starts with "List" followed by a PascalCase
   * word (e.g., "ListItems"), the "List" prefix is replaced with "Get".
   */
  it('renames "ListXxx" to "GetXxx"', () => {
    expect(cleanOperationName("ListItems")).toBe("GetItems");
    expect(cleanOperationName("ListPets")).toBe("GetPets");
    expect(cleanOperationName("ListAll")).toBe("GetAll");
    expect(cleanOperationName("ListAllResources")).toBe("GetAllResources");
  });

  /**
   * Validates that names starting with "List" but NOT followed by an
   * uppercase letter are left unchanged. This prevents incorrect renaming
   * of operations like "Listen" → "en".
   */
  it('does not rename "List" prefix without uppercase continuation', () => {
    expect(cleanOperationName("Listen")).toBe("Listen");
    expect(cleanOperationName("Listing")).toBe("Listing");
    expect(cleanOperationName("Listed")).toBe("Listed");
  });

  /**
   * Validates that non-List operation names are passed through unchanged.
   */
  it("does not modify non-List operation names", () => {
    expect(cleanOperationName("Get")).toBe("Get");
    expect(cleanOperationName("GetItem")).toBe("GetItem");
    expect(cleanOperationName("Create")).toBe("Create");
    expect(cleanOperationName("Delete")).toBe("Delete");
    expect(cleanOperationName("Update")).toBe("Update");
  });

  /**
   * Edge case: "List" alone (4 chars) must not crash or misbehave.
   * The length check (> 4) prevents out-of-bounds access on the 5th char.
   */
  it("handles edge case of exactly 4 characters", () => {
    expect(cleanOperationName("List")).toBe("GetAll");
    expect(cleanOperationName("Gets")).toBe("Gets");
  });
});

describe("operation naming in emitted output", () => {
  /**
   * Verifies that a TypeSpec operation named "list" produces C# methods
   * named "GetAll" / "GetAllAsync" in the generated client.
   *
   * This is the most important integration test for operation naming:
   * it validates that the full pipeline (TCGC → namePolicy → cleanOperationName)
   * produces correct output across protocol methods, convenience methods,
   * and the REST client's CreateRequest method.
   */
  it('renames "list" operation to "GetAll" in protocol methods', async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/items")
      @get op list(): Item[];
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Protocol methods should be renamed from "List" to "GetAll"
    expect(clientFile).toContain(
      "public virtual ClientResult GetAll(RequestOptions options",
    );
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult> GetAllAsync(RequestOptions options",
    );

    // CreateRequest method should also use the renamed operation name
    expect(clientFile).not.toContain("CreateListRequest");
  });

  /**
   * Verifies that a TypeSpec operation named "list" produces the correct
   * "CreateGetAllRequest" method in the REST client file.
   *
   * The REST client's CreateRequest methods must use the same cleaned name
   * as the protocol/convenience methods so the call chain is consistent:
   * GetAll() → CreateGetAllRequest()
   */
  it('renames "list" to "GetAll" in REST client CreateRequest', async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/items")
      @get op list(): Item[];
    `);
    expect(diagnostics).toHaveLength(0);

    const restClientFile =
      outputs["src/Generated/TestServiceClient.RestClient.cs"];
    expect(restClientFile).toBeDefined();

    // REST client should use "CreateGetAllRequest" not "CreateListRequest"
    expect(restClientFile).toContain("CreateGetAllRequest(");
    expect(restClientFile).not.toContain("CreateListRequest(");
  });

  /**
   * Verifies that "listItems" → "GetItems" renaming works in the full pipeline.
   * This tests the "ListXxx" → "GetXxx" variant where the operation name has
   * a suffix after "list".
   */
  it('renames "listXxx" to "GetXxx" in protocol methods', async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Pet {
        name: string;
      }

      @route("/pets")
      @get op listPets(): Pet[];
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // "listPets" → PascalCase "ListPets" → cleaned "GetPets"
    expect(clientFile).toContain(
      "public virtual ClientResult GetPets(RequestOptions options",
    );
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult> GetPetsAsync(RequestOptions options",
    );

    // CreateRequest should match
    expect(clientFile).toContain("CreateGetPetsRequest(");
    expect(clientFile).not.toContain("CreateListPetsRequest(");
  });

  /**
   * Verifies that convenience methods also get the renamed operation name.
   * Both protocol and convenience methods must use the same base name so
   * the convenience method can delegate to the protocol method correctly.
   */
  it('renames "list" in convenience methods', async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Item {
        name: string;
      }

      @route("/items")
      @get op list(): Item[];
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Convenience methods should use "GetAll" not "List"
    // The sync convenience method calls the sync protocol method
    expect(clientFile).toContain(
      "GetAll(cancellationToken.ToRequestOptions())",
    );
    // The async convenience method calls the async protocol method
    expect(clientFile).toContain(
      "GetAllAsync(cancellationToken.ToRequestOptions()).ConfigureAwait(false)",
    );
  });

  /**
   * Verifies that non-List operations are NOT renamed.
   * Only operations starting with "list" should be transformed — other names
   * like "get", "create", "delete" must remain unchanged.
   */
  it("does not rename non-list operations", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op getTest(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // "getTest" should remain "GetTest", not be transformed
    expect(clientFile).toContain(
      "public virtual ClientResult GetTest(RequestOptions options",
    );
    expect(clientFile).toContain(
      "public virtual async Task<ClientResult> GetTestAsync(RequestOptions options",
    );
  });

  /**
   * Verifies that "listen" (which starts with "list" but is NOT followed
   * by an uppercase letter) is NOT renamed. This prevents false positives
   * where "list" is part of a longer word that doesn't mean "list items".
   */
  it('does not rename "listen" or similar words starting with "list"', async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/events")
      @get op listen(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // "listen" → "Listen" should NOT be renamed
    expect(clientFile).toContain(
      "public virtual ClientResult Listen(RequestOptions options",
    );
    expect(clientFile).not.toContain("GetEn(");
  });
});

describe("cleanOperationName with siblingNames (collision avoidance)", () => {
  /**
   * Validates that the List→Get transformation is skipped when the target
   * name already exists among sibling methods. This is the primary fix for
   * CS0111 (duplicate method overloads differing only in return type).
   *
   * The ARM Singleton pattern has both `getByResourceGroup` (scalar) and
   * `listByResourceGroup` (paging). Without this check, both would map to
   * `GetByResourceGroup`, causing a C# compilation error.
   */
  it("skips List→Get rename when target name already exists as sibling", () => {
    const siblings = new Set(["GetByResourceGroup", "ListByResourceGroup"]);
    // "ListByResourceGroup" would normally become "GetByResourceGroup",
    // but since "GetByResourceGroup" already exists, keep the original.
    expect(cleanOperationName("ListByResourceGroup", siblings)).toBe(
      "ListByResourceGroup",
    );
    // "GetByResourceGroup" is not a List→Get transformation, so unchanged.
    expect(cleanOperationName("GetByResourceGroup", siblings)).toBe(
      "GetByResourceGroup",
    );
  });

  /**
   * Validates that the rename still applies when there is no collision.
   * The siblingNames set only prevents renaming when the target name exists.
   */
  it("still applies List→Get rename when no collision exists", () => {
    const siblings = new Set(["ListItems", "CreateItem", "DeleteItem"]);
    expect(cleanOperationName("ListItems", siblings)).toBe("GetItems");
  });

  /**
   * Validates the "List" → "GetAll" case with collision avoidance.
   * If "GetAll" already exists as a sibling, "List" stays as "List".
   */
  it('skips "List" → "GetAll" when "GetAll" is a sibling', () => {
    const siblings = new Set(["List", "GetAll"]);
    expect(cleanOperationName("List", siblings)).toBe("List");
    expect(cleanOperationName("GetAll", siblings)).toBe("GetAll");
  });

  /**
   * When siblingNames is undefined (not provided), the function should
   * behave exactly as before — always apply the transformation.
   */
  it("applies transformation when siblingNames is undefined", () => {
    expect(cleanOperationName("ListByResourceGroup", undefined)).toBe(
      "GetByResourceGroup",
    );
    expect(cleanOperationName("List", undefined)).toBe("GetAll");
  });

  /**
   * Non-List names should never be affected by siblingNames.
   */
  it("does not affect non-List names regardless of siblingNames", () => {
    const siblings = new Set(["GetItems", "CreateItem"]);
    expect(cleanOperationName("GetItems", siblings)).toBe("GetItems");
    expect(cleanOperationName("CreateItem", siblings)).toBe("CreateItem");
  });
});

describe("buildSiblingNameSet", () => {
  /**
   * Validates that buildSiblingNameSet correctly builds a Set of PascalCase
   * names from method descriptors, using the provided naming function.
   */
  it("builds a Set of transformed method names", () => {
    const methods = [
      { name: "getByResourceGroup" },
      { name: "listByResourceGroup" },
      { name: "createOrUpdate" },
    ];
    // Simulate PascalCase transformation
    const getName = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);
    const result = buildSiblingNameSet(methods, getName);
    expect(result).toEqual(
      new Set([
        "GetByResourceGroup",
        "ListByResourceGroup",
        "CreateOrUpdate",
      ]),
    );
  });
});
