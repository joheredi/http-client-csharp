import { describe, expect, it } from "vitest";
import { HttpTester, Tester } from "./test-host.js";

/**
 * Tests for the ClientFile component (src/components/clients/ClientFile.tsx).
 *
 * These tests verify that the emitter generates correct C# client class files
 * with the proper structure: endpoint field, mocking constructor, Pipeline
 * property, and (for sub-clients) internal constructor.
 *
 * Why these tests matter:
 * - The client class is the primary public API surface for consumers.
 * - Incorrect structure (missing constructors, wrong access modifiers) would
 *   make the generated SDK unusable or break the mocking/DI patterns.
 * - Sub-clients must have an internal constructor for parent-initiated
 *   creation via factory methods (task 3.2.4).
 */
describe("ClientFile", () => {
  /**
   * Verifies that a root client generates a file with the expected class
   * structure. Root clients are the top-level entry point for SDK consumers,
   * so they must have the correct class name, endpoint field, Pipeline
   * property, and mocking constructor.
   *
   * The mocking constructor (protected, parameterless) enables consumers to
   * create test doubles without calling the real HTTP pipeline.
   */
  it("generates root client file with correct structure", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify class declaration is public partial
    expect(clientFile).toContain("public partial class TestServiceClient");

    // Verify private readonly endpoint field
    expect(clientFile).toContain("private readonly Uri _endpoint;");

    // Verify protected mocking constructor
    expect(clientFile).toContain("protected TestServiceClient()");

    // Verify Pipeline property with correct type
    expect(clientFile).toContain("public ClientPipeline Pipeline { get; }");

    // Root client should NOT have an internal constructor
    // (primary constructors with auth are added in task 3.2.3)
    expect(clientFile).not.toContain("internal TestServiceClient(");
  });

  /**
   * Verifies that a sub-client (operation group) generates a file with an
   * internal constructor that accepts the parent's pipeline and endpoint.
   * This constructor pattern is essential for the parent client's factory
   * methods (e.g., GetSubOperationsClient()) to create sub-client instances.
   *
   * The internal constructor assigns:
   * - `_endpoint = endpoint;` for service endpoint routing
   * - `Pipeline = pipeline;` for HTTP request processing
   */
  it("generates sub-client file with internal constructor", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/sub")
      interface SubOperations {
        @route("/op")
        @get op getItem(): void;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    const subClientFile = outputs["src/Generated/SubOperations.cs"];
    expect(subClientFile).toBeDefined();

    // Verify public partial class
    expect(subClientFile).toContain("public partial class SubOperations");

    // Verify endpoint field
    expect(subClientFile).toContain("private readonly Uri _endpoint;");

    // Verify protected mocking constructor
    expect(subClientFile).toContain("protected SubOperations()");

    // Verify internal constructor with pipeline and endpoint params
    expect(subClientFile).toContain(
      "internal SubOperations(ClientPipeline pipeline, Uri endpoint)",
    );

    // Verify constructor body assigns endpoint and pipeline
    expect(subClientFile).toContain("_endpoint = endpoint;");
    expect(subClientFile).toContain("Pipeline = pipeline;");

    // Verify Pipeline property
    expect(subClientFile).toContain("public ClientPipeline Pipeline { get; }");
  });

  /**
   * Verifies that the root client's doc comment uses the service description
   * from the TypeSpec @doc decorator, not a generic fallback.
   *
   * This ensures the generated API documentation reflects the service author's
   * intent as specified in the TypeSpec definition.
   */
  it("uses service doc for root client class summary", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @doc("A test service for validation.")
      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();
    expect(clientFile).toContain(
      "/// <summary> A test service for validation. </summary>",
    );
  });

  /**
   * Verifies that a sub-client uses the standard "The {Name} sub-client."
   * doc comment pattern instead of any doc from the TypeSpec interface.
   *
   * This matches the legacy emitter's behavior where sub-clients always use
   * the standardized description format regardless of any @doc decorators.
   */
  it("uses standard doc comment for sub-client", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/pets")
      interface PetOperations {
        @route("/update")
        @put op updatePet(): void;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    const subClientFile = outputs["src/Generated/PetOperations.cs"];
    expect(subClientFile).toBeDefined();
    expect(subClientFile).toContain(
      "/// <summary> The PetOperations sub-client. </summary>",
    );
  });

  /**
   * Verifies that the emitter generates both root and sub-client files when
   * the TypeSpec defines operation groups. This ensures the getAllClients
   * utility correctly traverses the client hierarchy.
   */
  it("generates files for both root and sub-clients", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;

      @route("/pets")
      interface PetOperations {
        @route("/get")
        @get op getPet(): void;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    // Both root client and sub-client files should be generated
    expect(outputs["src/Generated/TestServiceClient.cs"]).toBeDefined();
    expect(outputs["src/Generated/PetOperations.cs"]).toBeDefined();
  });

  /**
   * Verifies that a service with no operations does NOT generate a client
   * file. TCGC only produces SdkClientType entries when there are operations
   * to expose, so an empty service should have no client class output.
   * This is consistent with the existing emitter behavior where an empty
   * service produces only project scaffolding (.csproj, .sln).
   */
  it("does not generate client file for service with no operations", async () => {
    const [{ outputs }, diagnostics] = await Tester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);
    expect(diagnostics).toHaveLength(0);

    const csFiles = Object.keys(outputs).filter((k) => k.endsWith(".cs"));
    const clientFiles = csFiles.filter((k) =>
      k.includes("TestServiceClient.cs"),
    );
    expect(clientFiles).toHaveLength(0);
  });

  /**
   * Verifies that a root client with API key authentication generates the
   * correct auth credential fields:
   * - `_keyCredential` (ApiKeyCredential) for storing the API key
   * - `AuthorizationHeader` (const string) for the header name
   *
   * Auth fields are only generated on root clients, not sub-clients, because
   * sub-clients inherit authentication through the pipeline passed by the parent.
   * The `using System.ClientModel;` directive must be auto-generated for
   * the ApiKeyCredential type reference.
   */
  it("generates API key auth fields for root client", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @useAuth(ApiKeyAuth<ApiKeyLocation.header, "x-api-key">)
      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify API key credential field
    expect(clientFile).toContain(
      "private readonly ApiKeyCredential _keyCredential;",
    );

    // Verify authorization header constant
    expect(clientFile).toContain(
      'private const string AuthorizationHeader = "x-api-key";',
    );

    // Verify using directive for System.ClientModel (where ApiKeyCredential lives)
    expect(clientFile).toContain("using System.ClientModel;");
  });

  /**
   * Verifies that a root client with OAuth2 authentication generates the
   * correct token provider fields:
   * - `_tokenProvider` (AuthenticationTokenProvider) for managing tokens
   * - `AuthorizationScopes` (static readonly string[]) for the required scopes
   *
   * This matches the legacy emitter's field pattern for OAuth2-authenticated
   * services. The `using System.ClientModel.Primitives;` directive must be
   * auto-generated for the AuthenticationTokenProvider type reference.
   */
  it("generates OAuth2 auth fields for root client", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @useAuth(OAuth2Auth<[{
        type: OAuth2FlowType.implicit,
        authorizationUrl: "https://login.example.com/authorize",
        refreshUrl: "https://login.example.com/refresh",
        tokenUrl: "https://login.example.com/token"
      }]>)
      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify token provider field
    expect(clientFile).toContain(
      "private readonly AuthenticationTokenProvider _tokenProvider;",
    );

    // Verify authorization scopes array
    expect(clientFile).toContain(
      "private static readonly string[] AuthorizationScopes = new string[]",
    );

    // Verify using directive for System.ClientModel.Primitives
    expect(clientFile).toContain("using System.ClientModel.Primitives;");
  });

  /**
   * Verifies that a root client with sub-clients generates caching fields
   * for lazy sub-client instantiation. The caching field pattern
   * (`private ChildType _cachedChildName`) enables thread-safe lazy
   * initialization via Interlocked.CompareExchange in factory methods.
   *
   * The caching fields must NOT be readonly (they're set lazily, not in
   * the constructor). The type must resolve to the sub-client class via
   * refkey cross-file resolution.
   */
  it("generates sub-client caching fields on root client", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;

      @route("/pets")
      interface PetOperations {
        @route("/get")
        @get op getPet(): void;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify sub-client caching field (NOT readonly, lazy initialized)
    expect(clientFile).toContain("private PetOperations _cachedPetOperations;");

    // Caching field should NOT be readonly
    expect(clientFile).not.toContain("readonly PetOperations");
  });

  /**
   * Verifies that sub-clients do NOT have auth credential fields.
   * Sub-clients inherit authentication through the pipeline created
   * by the parent client. Only root clients generate auth fields.
   *
   * This matches the legacy emitter's behavior in ClientProvider.BuildFields()
   * where auth fields are skipped when ClientOptions is null (sub-clients).
   */
  it("does not generate auth fields on sub-clients", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @useAuth(ApiKeyAuth<ApiKeyLocation.header, "x-api-key">)
      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;

      @route("/pets")
      interface PetOperations {
        @route("/get")
        @get op getPet(): void;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    // Root client should have auth fields
    const rootFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(rootFile).toContain("ApiKeyCredential _keyCredential");

    // Sub-client should NOT have auth fields
    const subFile = outputs["src/Generated/PetOperations.cs"];
    expect(subFile).toBeDefined();
    expect(subFile).not.toContain("ApiKeyCredential");
    expect(subFile).not.toContain("AuthorizationHeader");
  });

  /**
   * Verifies that a client-level method parameter (like apiVersion) is
   * generated as a private readonly field on the client class.
   *
   * When a TypeSpec operation has a client-level parameter (annotated with
   * `@query apiVersion: string`), TCGC marks it as a client initialization
   * parameter. The emitter must generate a corresponding field so the
   * constructor (task 3.2.3) can store and the operations can use the value.
   */
  it("generates method parameter fields for client-level params", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using TypeSpec.Versioning;

      @versioned(Versions)
      @service
      namespace TestService;

      enum Versions {
        v2024_01_01: "2024-01-01",
      }

      @route("/test")
      @get op testOp(@query apiVersion: string): void;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify API version field is generated as private readonly string
    expect(clientFile).toContain("private readonly string _apiVersion;");
  });

  /**
   * Verifies the complete field ordering for a root client with auth,
   * API version, and sub-clients. Fields must appear in this order
   * to match the legacy emitter's output:
   * 1. _endpoint (always first)
   * 2. Auth fields (credential + header constant)
   * 3. Additional method params (_apiVersion, etc.)
   * 4. Sub-client caching fields
   *
   * This ordering is important for API surface consistency with the
   * legacy generator and for code review predictability.
   */
  it("generates fields in correct order", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using TypeSpec.Versioning;

      @versioned(Versions)
      @useAuth(ApiKeyAuth<ApiKeyLocation.header, "x-api-key">)
      @service
      namespace TestService;

      enum Versions {
        v2024_01_01: "2024-01-01",
      }

      @route("/test")
      @get op testOp(@query apiVersion: string): void;

      @route("/pets")
      interface PetOperations {
        @route("/get")
        @get op getPet(): void;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Verify all fields are present
    expect(clientFile).toContain("private readonly Uri _endpoint;");
    expect(clientFile).toContain(
      "private readonly ApiKeyCredential _keyCredential;",
    );
    expect(clientFile).toContain(
      'private const string AuthorizationHeader = "x-api-key";',
    );
    expect(clientFile).toContain("private readonly string _apiVersion;");
    expect(clientFile).toContain("private PetOperations _cachedPetOperations;");

    // Verify ordering: endpoint → auth → apiVersion → cache fields
    const endpointIdx = clientFile.indexOf("_endpoint");
    const authIdx = clientFile.indexOf("_keyCredential");
    const headerIdx = clientFile.indexOf("AuthorizationHeader");
    const versionIdx = clientFile.indexOf("_apiVersion");
    const cacheIdx = clientFile.indexOf("_cachedPetOperations");

    expect(endpointIdx).toBeLessThan(authIdx);
    expect(authIdx).toBeLessThan(headerIdx);
    expect(headerIdx).toBeLessThan(versionIdx);
    expect(versionIdx).toBeLessThan(cacheIdx);
  });
});
