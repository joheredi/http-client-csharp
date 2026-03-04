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
   * - `_flows` (Dictionary<string, object>[]) for OAuth2 flow metadata
   *
   * This matches the legacy emitter's field pattern for OAuth2-authenticated
   * services. The `using System.ClientModel.Primitives;` directive must be
   * auto-generated for the AuthenticationTokenProvider and GetTokenOptions
   * type references, and `using System.Collections.Generic;` for Dictionary.
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

    // Verify _flows dictionary field with GetTokenOptions metadata
    expect(clientFile).toContain(
      "private readonly Dictionary<string, object>[] _flows = new Dictionary<string, object>[]",
    );
    expect(clientFile).toContain("GetTokenOptions.ScopesPropertyName");
    expect(clientFile).toContain("GetTokenOptions.AuthorizationUrlPropertyName");
    expect(clientFile).toContain("GetTokenOptions.RefreshUrlPropertyName");
    expect(clientFile).toContain("GetTokenOptions.TokenUrlPropertyName");

    // Verify using directives
    expect(clientFile).toContain("using System.ClientModel.Primitives;");
    expect(clientFile).toContain("using System.Collections.Generic;");
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

  /**
   * Verifies that a root client with no auth generates a secondary
   * (convenience) constructor that delegates to the primary constructor
   * with a default options instance.
   *
   * The secondary constructor pattern `(Uri endpoint) : this(endpoint, new
   * ClientPipelineOptions())` allows consumers to create a client without
   * manually specifying options.
   *
   * When the client has no API versions, the options type falls back to
   * `ClientPipelineOptions` from System.ClientModel.Primitives.
   */
  it("generates secondary constructor for root client without auth", async () => {
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

    // Secondary constructor delegates to primary via : this(...)
    expect(clientFile).toContain(
      ": this(endpoint, new ClientPipelineOptions())",
    );

    // Secondary constructor has only endpoint parameter
    expect(clientFile).toContain("public TestServiceClient(Uri endpoint)");
  });

  /**
   * Verifies that a root client with no auth generates a primary constructor
   * that creates the HTTP pipeline via ClientPipeline.Create.
   *
   * The primary constructor must:
   * - Validate the endpoint parameter with Argument.AssertNotNull
   * - Null-coalesce the options parameter to a default instance
   * - Assign the endpoint to the _endpoint field
   * - Create the pipeline with UserAgentPolicy in the per-retry policies
   *
   * This matches the legacy emitter's ClientProvider.BuildPrimaryConstructorBody.
   */
  it("generates primary constructor with pipeline creation for root client", async () => {
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

    // Primary constructor with endpoint + options parameters
    expect(clientFile).toContain(
      "public TestServiceClient(Uri endpoint, ClientPipelineOptions options)",
    );

    // Argument validation
    expect(clientFile).toContain(
      "Argument.AssertNotNull(endpoint, nameof(endpoint));",
    );

    // Options null-coalescing
    expect(clientFile).toContain("options ??= new ClientPipelineOptions();");

    // Endpoint field assignment
    expect(clientFile).toContain("_endpoint = endpoint;");

    // Pipeline creation with UserAgentPolicy
    expect(clientFile).toContain("ClientPipeline.Create(options,");
    expect(clientFile).toContain(
      "new UserAgentPolicy(typeof(TestServiceClient).Assembly)",
    );

    // Pipeline assignment
    expect(clientFile).toContain("Pipeline = ClientPipeline.Create(");
  });

  /**
   * Verifies that a root client with API key authentication generates
   * constructors that include the credential parameter and API key
   * auth policy injection.
   *
   * The constructor must:
   * - Include ApiKeyCredential as a parameter named "credential"
   * - Validate the credential parameter
   * - Assign the credential to _keyCredential field
   * - Add ApiKeyAuthenticationPolicy.CreateHeaderApiKeyPolicy to the
   *   pipeline's per-retry policies alongside UserAgentPolicy
   *
   * This is critical for API key auth services to function correctly.
   */
  it("generates constructors with API key auth policy injection", async () => {
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

    // Secondary constructor with credential parameter
    expect(clientFile).toContain(
      ": this(endpoint, credential, new ClientPipelineOptions())",
    );

    // Primary constructor with credential + options
    expect(clientFile).toContain(
      "ApiKeyCredential credential, ClientPipelineOptions options)",
    );

    // Credential validation
    expect(clientFile).toContain(
      "Argument.AssertNotNull(credential, nameof(credential));",
    );

    // Credential field assignment
    expect(clientFile).toContain("_keyCredential = credential;");

    // API key auth policy in pipeline creation
    expect(clientFile).toContain(
      "ApiKeyAuthenticationPolicy.CreateHeaderApiKeyPolicy(_keyCredential, AuthorizationHeader)",
    );
  });

  /**
   * Verifies that a root client with OAuth2 authentication generates
   * constructors that include the token provider parameter and bearer
   * token policy injection with the _flows dictionary.
   *
   * The constructor must:
   * - Include AuthenticationTokenProvider as a parameter named "tokenProvider"
   * - Validate the tokenProvider parameter
   * - Assign the token provider to _tokenProvider field
   * - Add BearerTokenPolicy with _flows to the pipeline's per-retry policies
   *
   * This ensures OAuth2 services can authenticate requests correctly
   * using the full flows dictionary pattern matching the legacy emitter.
   */
  it("generates constructors with OAuth2 auth policy injection", async () => {
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

    // Secondary constructor with token provider parameter
    expect(clientFile).toContain(
      ": this(endpoint, tokenProvider, new ClientPipelineOptions())",
    );

    // Primary constructor with token provider + options
    expect(clientFile).toContain(
      "AuthenticationTokenProvider tokenProvider, ClientPipelineOptions options)",
    );

    // Token provider validation
    expect(clientFile).toContain(
      "Argument.AssertNotNull(tokenProvider, nameof(tokenProvider));",
    );

    // Token provider field assignment
    expect(clientFile).toContain("_tokenProvider = tokenProvider;");

    // Bearer token policy with _flows in pipeline creation
    expect(clientFile).toContain(
      "new BearerTokenPolicy(_tokenProvider, _flows)",
    );
  });

  /**
   * Verifies that a versioned service generates constructors that use
   * the generated options class (e.g., TestServiceClientOptions) instead
   * of the base ClientPipelineOptions.
   *
   * The constructor must:
   * - Reference the generated options type in the parameter list
   * - Use the generated options type in the null-coalescing expression
   * - Assign the API version from options.Version to the _apiVersion field
   *
   * This is essential for versioned services where the options class
   * contains the ServiceVersion enum and version string mapping.
   */
  it("generates constructors with versioned options class", async () => {
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
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Secondary constructor references the generated options class
    expect(clientFile).toContain(
      ": this(endpoint, credential, new TestServiceClientOptions())",
    );

    // Primary constructor uses the generated options type
    expect(clientFile).toContain(
      "ApiKeyCredential credential, TestServiceClientOptions options)",
    );

    // Options null-coalescing with generated type
    expect(clientFile).toContain("options ??= new TestServiceClientOptions();");

    // API version assignment from options
    expect(clientFile).toContain("_apiVersion = options.Version;");
  });

  /**
   * Verifies that sub-clients do NOT get public constructors —
   * they only get the protected mocking constructor and the internal
   * constructor for parent-initiated creation.
   *
   * Root constructors with pipeline creation are only for top-level
   * clients. Sub-clients receive their pipeline from the parent.
   */
  it("does not generate public constructors on sub-clients", async () => {
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

    const subFile = outputs["src/Generated/PetOperations.cs"];
    expect(subFile).toBeDefined();

    // Sub-client should NOT have public constructors
    expect(subFile).not.toContain("public PetOperations(");

    // Sub-client should have the protected mocking constructor
    expect(subFile).toContain("protected PetOperations()");

    // Sub-client should have the internal constructor
    expect(subFile).toContain(
      "internal PetOperations(ClientPipeline pipeline, Uri endpoint)",
    );

    // Sub-client should NOT reference ClientPipeline.Create
    expect(subFile).not.toContain("ClientPipeline.Create");

    // Sub-client should NOT reference Argument.AssertNotNull
    expect(subFile).not.toContain("Argument.AssertNotNull");
  });

  /**
   * Verifies the constructor ordering for a root client matches the
   * legacy emitter pattern: mocking → secondary → primary.
   *
   * This ordering is a convention followed by all generated SDK clients
   * and must be consistent for API surface predictability.
   */
  it("generates constructors in correct order: mocking, secondary, primary", async () => {
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

    const mockingIdx = clientFile.indexOf("protected TestServiceClient()");
    const secondaryIdx = clientFile.indexOf(
      "public TestServiceClient(Uri endpoint)",
    );
    const primaryIdx = clientFile.indexOf(
      "public TestServiceClient(Uri endpoint, ClientPipelineOptions options)",
    );

    expect(mockingIdx).toBeGreaterThan(-1);
    expect(secondaryIdx).toBeGreaterThan(-1);
    expect(primaryIdx).toBeGreaterThan(-1);

    // Mocking before secondary before primary
    expect(mockingIdx).toBeLessThan(secondaryIdx);
    expect(secondaryIdx).toBeLessThan(primaryIdx);
  });

  /**
   * Verifies empty constructors use multiline brace style (Allman style) instead
   * of single-line `{ }` or `{}`. The golden files always use multiline empty
   * bodies for constructors:
   *
   * ```csharp
   * protected TestServiceClient()
   * {
   * }
   * ```
   *
   * This matters because the legacy emitter consistently uses this style and
   * diff tools would flag the formatting difference as a change.
   */
  it("uses multiline brace style for empty constructor bodies", async () => {
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

    // Protected mocking constructor should have multiline empty body
    expect(clientFile).toContain(
      "protected TestServiceClient()\n        {\n        }",
    );

    // Secondary constructor with :this() should also have multiline empty body
    expect(clientFile).toContain(
      ": this(endpoint, new ClientPipelineOptions())\n        {\n        }",
    );
  });

  /**
   * Verifies that a root client with sub-clients generates thread-safe lazy
   * factory methods using the Volatile.Read + Interlocked.CompareExchange pattern.
   *
   * This pattern is the standard .NET approach for lock-free lazy initialization:
   * 1. Volatile.Read checks if the cached field is already set (fast path)
   * 2. CompareExchange atomically creates a new instance if the field is null
   * 3. Fallback to the cached field handles the rare race condition
   *
   * The method must be `public virtual` to allow mocking and overriding in tests.
   * The using System.Threading directive must be auto-generated for Volatile/Interlocked.
   */
  it("generates sub-client factory methods with thread-safe lazy init", async () => {
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

    // Verify the factory method signature is public virtual with correct return type
    expect(clientFile).toContain(
      "public virtual PetOperations GetPetOperationsClient()",
    );

    // Verify Volatile.Read for fast-path check
    expect(clientFile).toContain("Volatile.Read(ref _cachedPetOperations)");

    // Verify Interlocked.CompareExchange for atomic lazy creation
    expect(clientFile).toContain(
      "Interlocked.CompareExchange(ref _cachedPetOperations, new PetOperations(Pipeline, _endpoint), null)",
    );

    // Verify fallback to cached field at the end of the null-coalescing chain
    expect(clientFile).toContain("?? _cachedPetOperations;");

    // Verify using System.Threading directive is auto-generated
    expect(clientFile).toContain("using System.Threading;");

    // Verify doc comment on the factory method
    expect(clientFile).toContain(
      "/// <summary> Initializes a new instance of PetOperations. </summary>",
    );
  });

  /**
   * Verifies that multiple sub-clients each get their own factory method.
   * When a service has multiple operation groups, the root client must
   * provide an accessor for each one with independent caching fields.
   *
   * This ensures the emitter handles the client.children array correctly
   * and generates one factory method per child.
   */
  it("generates factory methods for multiple sub-clients", async () => {
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

      @route("/users")
      interface UserOperations {
        @route("/get")
        @get op getUser(): void;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // Both factory methods should be generated
    expect(clientFile).toContain(
      "public virtual PetOperations GetPetOperationsClient()",
    );
    expect(clientFile).toContain(
      "public virtual UserOperations GetUserOperationsClient()",
    );

    // Each should have its own caching field and Volatile.Read
    expect(clientFile).toContain("Volatile.Read(ref _cachedPetOperations)");
    expect(clientFile).toContain("Volatile.Read(ref _cachedUserOperations)");
  });

  /**
   * Verifies that sub-clients do NOT generate factory methods for the
   * parent client. Factory methods are only generated for child clients,
   * not for the parent-child reverse relationship.
   *
   * Sub-clients should not have any factory methods unless they themselves
   * have nested children.
   */
  it("does not generate factory methods on sub-clients without children", async () => {
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

    const subFile = outputs["src/Generated/PetOperations.cs"];
    expect(subFile).toBeDefined();

    // Sub-client without children should NOT have factory methods
    expect(subFile).not.toContain("GetPetOperationsClient");
    expect(subFile).not.toContain("Volatile.Read");
    expect(subFile).not.toContain("Interlocked.CompareExchange");
  });

  /**
   * Verifies the factory method naming convention matches the legacy emitter:
   * - If the sub-client class name does NOT end with "Client", append "Client"
   *   to the method name (e.g., "PetOperations" → "GetPetOperationsClient")
   * - This avoids confusion and makes the accessor discoverable via IntelliSense.
   *
   * The legacy emitter also handles the case where a name already ends with
   * "Client" (e.g., "Get{Name}" without doubling), but that case is rare
   * since TCGC typically names operation groups without the "Client" suffix.
   */
  it("factory method name appends Client suffix correctly", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/test")
      @get op testOp(): void;

      @route("/metrics")
      interface Metrics {
        @route("/get")
        @get op getMetrics(): void;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();

    // "Metrics" doesn't end with "Client", so the method should be "GetMetricsClient"
    expect(clientFile).toContain("public virtual Metrics GetMetricsClient()");
  });

  /**
   * Verifies that factory methods appear after the Pipeline property
   * in the generated client class. This ensures the class member ordering
   * follows the legacy emitter's convention where accessors and methods
   * come after properties and constructors.
   */
  it("factory methods appear after Pipeline property", async () => {
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

    const pipelineIdx = clientFile.indexOf(
      "public ClientPipeline Pipeline { get; }",
    );
    const factoryIdx = clientFile.indexOf("GetPetOperationsClient");

    expect(pipelineIdx).toBeGreaterThan(-1);
    expect(factoryIdx).toBeGreaterThan(-1);
    expect(pipelineIdx).toBeLessThan(factoryIdx);
  });

  /**
   * Verifies that multiline @doc on the @service produces valid XML doc
   * comments on the client class summary where every continuation line
   * starts with `///`.
   *
   * Why this test matters:
   * - The client/structure/default spec has a multiline @doc on the service
   *   that produced broken XML doc comments where continuation lines (numbered
   *   list items) lacked the `///` prefix.
   */
  it("formats multiline @doc on service as valid /// summary comment", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @doc("""
        A service that supports multiple features:
        1. Feature one
        2. Feature two
        3. Feature three
        """)
      @service
      namespace TestService;

      @route("/test")
      @get op test(): void;
    `);
    expect(diagnostics).toHaveLength(0);
    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();
    // Summary continuation lines must have ///
    expect(clientFile).toContain("/// 1. Feature one");
    expect(clientFile).toContain("/// 2. Feature two");
    // Must NOT have bare continuation lines
    expect(clientFile).not.toMatch(/\n\s+1\. Feature one/);
  });

  /**
   * Verifies that deeply nested sub-clients produce unique filenames by
   * concatenating all non-root ancestor names. Without this, sub-clients with
   * the same short name (e.g., "Standard" under both "GroupA" and "GroupB")
   * would collide to a single file and only one would survive.
   *
   * This test creates a 3-level hierarchy using namespaces (the same pattern
   * used by the routes spec):
   *   Root > GroupA > Nested
   *   Root > GroupB > Nested
   *
   * Expected files:
   *   - Root: src/Generated/TestServiceClient.cs
   *   - GroupA: src/Generated/GroupA.cs
   *   - GroupB: src/Generated/GroupB.cs
   *   - Nested under GroupA: src/Generated/GroupANested.cs
   *   - Nested under GroupB: src/Generated/GroupBNested.cs
   *
   * This matches the legacy emitter's convention (e.g., PathParametersLabelExpansionStandard.cs).
   */
  it("generates unique filenames for deeply nested sub-clients with same name", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/a")
      namespace GroupA {
        @route("/nested")
        namespace Nested {
          @route("/op")
          @get op getItem(): void;
        }
      }

      @route("/b")
      namespace GroupB {
        @route("/nested")
        namespace Nested {
          @route("/op")
          @get op getItem(): void;
        }
      }
    `);
    expect(diagnostics).toHaveLength(0);

    // Both deeply nested "Nested" sub-clients must generate separate files
    const nestedA = outputs["src/Generated/GroupANested.cs"];
    const nestedB = outputs["src/Generated/GroupBNested.cs"];

    expect(nestedA).toBeDefined();
    expect(nestedB).toBeDefined();

    // Each must be in its own namespace
    expect(nestedA).toContain("namespace TestService.GroupA.Nested");
    expect(nestedB).toContain("namespace TestService.GroupB.Nested");

    // Each must have the short class name (not the hierarchical filename)
    expect(nestedA).toContain("public partial class Nested");
    expect(nestedB).toContain("public partial class Nested");

    // Parent clients should also exist with correct filenames
    expect(outputs["src/Generated/GroupA.cs"]).toBeDefined();
    expect(outputs["src/Generated/GroupB.cs"]).toBeDefined();
    expect(outputs["src/Generated/TestServiceClient.cs"]).toBeDefined();
  });

  /**
   * Verifies that RestClient files also use hierarchical filenames to prevent
   * collisions for deeply nested sub-clients with operations.
   */
  it("generates unique RestClient filenames for deeply nested sub-clients", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      @route("/a")
      namespace GroupA {
        @route("/nested")
        namespace Nested {
          @route("/op")
          @get op getItem(): void;
        }
      }

      @route("/b")
      namespace GroupB {
        @route("/nested")
        namespace Nested {
          @route("/op")
          @get op getItem(): void;
        }
      }
    `);
    expect(diagnostics).toHaveLength(0);

    // Both deeply nested "Nested" sub-clients must generate separate RestClient files
    const restA = outputs["src/Generated/GroupANested.RestClient.cs"];
    const restB = outputs["src/Generated/GroupBNested.RestClient.cs"];

    expect(restA).toBeDefined();
    expect(restB).toBeDefined();
  });

  /**
   * Verifies that `using System.Linq` is included in client files when the client
   * has convenience methods with spread body containing collection (array) params.
   *
   * The golden SampleTypeSpecClient.cs includes this using because spread body
   * convenience methods use .ToList() to convert IEnumerable<T> parameters to
   * IList<T> when constructing the model for the protocol call.
   *
   * Conversely, clients without collection params in spread bodies should NOT
   * include System.Linq to avoid unused using directives.
   */
  it("includes using System.Linq when spread body has collection params", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
        tags: string[];
      }

      @route("/widgets")
      @post op createWidget(...Widget): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();
    expect(clientFile).toContain("using System.Linq;");
  });

  it("does NOT include using System.Linq when no collection params in spread body", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
        @doc("weight of the widget")
        weight: float32;
      }

      @route("/widgets")
      @post op createWidget(...Widget): Widget;
    `);
    expect(diagnostics).toHaveLength(0);

    const clientFile = outputs["src/Generated/TestServiceClient.cs"];
    expect(clientFile).toBeDefined();
    expect(clientFile).not.toContain("using System.Linq;");
  });
});
