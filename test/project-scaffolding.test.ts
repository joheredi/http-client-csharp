import { describe, expect, it } from "vitest";
import {
  AzureHttpTester,
  AzureIntegrationTester,
  ApiTester,
  HttpTester,
  MgmtTester,
} from "./test-host.js";

const HttpTesterDisableXmlDocs = ApiTester.emit("http-client-csharp", {
  "disable-xml-docs": true,
}).importLibraries();

const HttpTesterCustomPackage = ApiTester.emit("http-client-csharp", {
  "package-name": "MyCustomName",
}).importLibraries();

describe("ProjectFile", () => {
  it("generates a .csproj with correct structure", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toBeDefined();
    expect(csprojKey).toContain("src/TestService.csproj");

    const csproj = outputs[csprojKey!];
    expect(csproj).toContain('<Project Sdk="Microsoft.NET.Sdk">');
    expect(csproj).toContain(
      "<TargetFrameworks>netstandard2.0;net8.0</TargetFrameworks>",
    );
    expect(csproj).toContain("<LangVersion>latest</LangVersion>");
    expect(csproj).toContain("<Version>1.0.0-beta.1</Version>");
    expect(csproj).toContain(
      '<PackageReference Include="System.ClientModel" Version="1.9.0" />',
    );
  });

  it("includes package metadata from package name", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace MyLibrary;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toContain("src/MyLibrary.csproj");

    const csproj = outputs[csprojKey!];
    expect(csproj).toContain("This is the MyLibrary client library");
    expect(csproj).toContain("SDK Code Generation MyLibrary");
    expect(csproj).toContain("<PackageTags>MyLibrary</PackageTags>");
  });

  it("includes GenerateDocumentationFile by default", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    const csproj = outputs[csprojKey!];
    expect(csproj).toContain(
      "<GenerateDocumentationFile>true</GenerateDocumentationFile>",
    );
  });

  it("omits GenerateDocumentationFile when disable-xml-docs is true", async () => {
    const [{ outputs }] = await HttpTesterDisableXmlDocs.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    const csproj = outputs[csprojKey!];
    expect(csproj).not.toContain("GenerateDocumentationFile");
  });

  it("uses explicit package-name option for csproj filename", async () => {
    const [{ outputs }] = await HttpTesterCustomPackage.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toContain("src/MyCustomName.csproj");

    const csproj = outputs[csprojKey!];
    expect(csproj).toContain("This is the MyCustomName client library");
  });

  /**
   * Verifies that Azure-flavored projects reference Azure.Core instead of
   * System.ClientModel. Azure.Core transitively includes System.ClientModel,
   * so only Azure.Core is needed. This is critical for e2e compilation of
   * Azure specs that use Azure.Core types (HttpPipeline, Response, etc.).
   */
  it("references Azure.Core package when flavor is azure", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      @service
      namespace AzureService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toBeDefined();

    const csproj = outputs[csprojKey!];
    expect(csproj).toContain(
      '<PackageReference Include="Azure.Core" Version="1.51.1" />',
    );
    expect(csproj).not.toContain("System.ClientModel");
  });

  /**
   * Verifies that Azure-flavored projects include Azure.Core shared source files
   * via $(AzureCoreSharedSources) MSBuild variable. These internal types (ClientDiagnostics,
   * DiagnosticScope, etc.) cannot be referenced from the Azure.Core NuGet package because
   * they are internal. Each generated project must compile its own copy from source.
   *
   * Without these includes, Azure projects fail with CS0122 (member inaccessible due to
   * protection level) when referencing ClientDiagnostics or DiagnosticScope.
   *
   * This matches the legacy emitter's NewAzureProjectScaffolding behavior.
   */
  it("includes Azure.Core shared source files when flavor is azure", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      @service
      namespace AzureService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toBeDefined();

    const csproj = outputs[csprojKey!];

    // All 9 base shared source files must be present
    const expectedSharedFiles = [
      "RawRequestUriBuilder.cs",
      "TypeFormatters.cs",
      "RequestHeaderExtensions.cs",
      "AppContextSwitchHelper.cs",
      "ClientDiagnostics.cs",
      "DiagnosticScopeFactory.cs",
      "DiagnosticScope.cs",
      "HttpMessageSanitizer.cs",
      "TrimmingAttribute.cs",
    ];

    for (const file of expectedSharedFiles) {
      // Use regex to match the Compile element regardless of whitespace between
      // XML attributes. Alloy's MSBuild renderer may wrap long attributes across
      // lines, which is valid XML but breaks exact string matching.
      expect(csproj).toMatch(
        new RegExp(
          `<Compile Include="\\$\\(AzureCoreSharedSources\\)${file.replace(".", "\\.")}"\\s+LinkBase="Shared/Core"\\s*/>`,
        ),
      );
    }
  });

  /**
   * Verifies that unbranded (default) flavor continues to reference
   * System.ClientModel and does NOT include Azure.Core. This ensures
   * the Azure flavor change doesn't regress the default behavior.
   */
  it("references System.ClientModel package when flavor is unbranded", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace UnbrandedService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toBeDefined();

    const csproj = outputs[csprojKey!];
    expect(csproj).toContain(
      '<PackageReference Include="System.ClientModel" Version="1.9.0" />',
    );
    expect(csproj).not.toContain("Azure.Core");
  });

  /**
   * Verifies that unbranded projects do NOT include Azure.Core shared source files.
   * Only Azure-flavored projects need the shared source includes. Including them
   * in unbranded projects would cause build failures ($(AzureCoreSharedSources) undefined).
   */
  it("does not include shared source files when flavor is unbranded", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace UnbrandedService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toBeDefined();

    const csproj = outputs[csprojKey!];
    expect(csproj).not.toContain("AzureCoreSharedSources");
    expect(csproj).not.toContain("LinkBase");
  });

  /**
   * Validates that management plane projects include the Azure.ResourceManager
   * NuGet reference alongside Azure.Core. ARM generated code depends on types
   * from both packages (e.g., TrackedResource, ResourceIdentifier, ArmClient).
   * Without this reference, `dotnet build` would fail for any mgmt output.
   */
  it("references Azure.ResourceManager package when management is true", async () => {
    const [{ outputs }] = await MgmtTester.compileAndDiagnose(`
      @service
      namespace MgmtService;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toBeDefined();

    const csproj = outputs[csprojKey!];
    // Management projects use Azure.Core 1.51.1 (minimum required by Azure.ResourceManager 1.14.0)
    expect(csproj).toContain(
      '<PackageReference Include="Azure.Core" Version="1.51.1" />',
    );
    expect(csproj).toContain(
      '<PackageReference Include="Azure.ResourceManager" Version="1.14.0" />',
    );
  });

  /**
   * Ensures that non-management Azure projects do NOT include the
   * Azure.ResourceManager reference. Only management=true should add it.
   */
  it("does not reference Azure.ResourceManager when management is false", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      @service
      namespace AzureDataPlane;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toBeDefined();

    const csproj = outputs[csprojKey!];
    expect(csproj).toContain(
      '<PackageReference Include="Azure.Core" Version="1.51.1" />',
    );
    expect(csproj).not.toContain("Azure.ResourceManager");
  });
  /**
   * Verifies that Azure projects with LRO operations include the LRO shared source
   * files (ProtocolOperationHelpers, OperationPoller, OperationFinalStateVia, etc.)
   * in the generated .csproj. These internal Azure.Core types provide polling
   * infrastructure that LRO protocol methods depend on.
   *
   * Without these includes, Azure LRO projects fail to compile because
   * ProtocolOperationHelpers.ProcessMessage() is called from generated protocol
   * methods but the type is not available.
   *
   * This matches the legacy emitter's `NewAzureProjectScaffolding.BuildCompileIncludes()`
   * which conditionally adds `_lroSharedFiles` when LRO operations are detected.
   */
  it("includes LRO shared source files when Azure service has LRO operations", async () => {
    const [{ outputs }, diagnostics] =
      await AzureIntegrationTester.compileAndDiagnose(`
      using TypeSpec.Http;
      using TypeSpec.Rest;
      using TypeSpec.Versioning;
      using Azure.Core;
      using Azure.Core.Traits;

      @service
      @versioned(Versions)
      namespace TestLro;

      enum Versions {
        v1: "1.0",
      }

      @resource("users")
      model User {
        @key name: string;
        role: string;
      }

      alias ResourceOps = Azure.Core.ResourceOperations<
        NoConditionalRequests & NoRepeatableRequests & NoClientRequestId
      >;

      @route("/users")
      interface Users {
        createOrReplace is ResourceOps.LongRunningResourceCreateOrReplace<User>;
      }
    `);
    expect(diagnostics).toHaveLength(0);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toBeDefined();

    const csproj = outputs[csprojKey!];

    // All LRO shared source files must be present
    const expectedLroFiles = [
      "ProtocolOperationHelpers.cs",
      "ProtocolOperation.cs",
      "OperationFinalStateVia.cs",
      "OperationPoller.cs",
      "OperationInternal.cs",
      "OperationInternalBase.cs",
      "OperationInternalOfT.cs",
      "VoidValue.cs",
      "AsyncLockWithValue.cs",
      "IOperationSource.cs",
      "NextLinkOperationImplementation.cs",
      "TaskExtensions.cs",
      "SequentialDelayStrategy.cs",
      "FixedDelayWithNoJitterStrategy.cs",
    ];

    for (const file of expectedLroFiles) {
      expect(csproj).toMatch(
        new RegExp(
          `<Compile Include="\\$\\(AzureCoreSharedSources\\)${file.replace(".", "\\.")}"\\s+LinkBase="Shared/Core"\\s*/>`,
        ),
      );
    }

    // ARM-only files should NOT be present
    expect(csproj).not.toContain("ForwardsClientCallsAttribute.cs");
    expect(csproj).not.toContain("NoValueResponseOfT.cs");
    expect(csproj).not.toContain("PageableHelpers.cs");
  });

  /**
   * Verifies that Azure projects WITHOUT LRO operations do not include the LRO
   * shared source files. Non-LRO Azure specs (e.g., simple CRUD with no polling)
   * should not have ProtocolOperationHelpers compiled in — it would be dead code.
   *
   * This matches the legacy emitter's conditional inclusion: `_lroSharedFiles` are
   * only added when `InputLongRunningServiceMethod` is detected in the client tree.
   */
  it("does not include LRO shared source files when Azure service has no LRO operations", async () => {
    const [{ outputs }] = await AzureHttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace AzureNonLro;

      model Item {
        name: string;
      }

      @route("/items")
      @get op getItem(): Item;
    `);

    const csprojKey = Object.keys(outputs).find((k) => k.endsWith(".csproj"));
    expect(csprojKey).toBeDefined();

    const csproj = outputs[csprojKey!];

    // LRO shared source files should NOT be present
    expect(csproj).not.toContain("ProtocolOperationHelpers.cs");
    expect(csproj).not.toContain("OperationFinalStateVia.cs");
    expect(csproj).not.toContain("OperationPoller.cs");
    expect(csproj).not.toContain("VoidValue.cs");
  });
});

describe("SolutionFile", () => {
  it("generates a .sln file", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const slnKey = Object.keys(outputs).find((k) => k.endsWith(".sln"));
    expect(slnKey).toBeDefined();
    expect(slnKey).toBe("TestService.sln");

    const sln = outputs[slnKey!];
    expect(sln).toContain(
      "Microsoft Visual Studio Solution File, Format Version 12.00",
    );
    expect(sln).toContain("# Visual Studio Version 17");
  });

  it("references the correct .csproj in the .sln", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace MyLibrary;
    `);

    const slnKey = Object.keys(outputs).find((k) => k.endsWith(".sln"));
    const sln = outputs[slnKey!];
    expect(sln).toContain(`"MyLibrary", "src\\MyLibrary.csproj"`);
  });

  it("includes Debug and Release configurations", async () => {
    const [{ outputs }] = await HttpTester.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const slnKey = Object.keys(outputs).find((k) => k.endsWith(".sln"));
    const sln = outputs[slnKey!];
    expect(sln).toContain("Debug|Any CPU = Debug|Any CPU");
    expect(sln).toContain("Release|Any CPU = Release|Any CPU");
  });

  it("uses explicit package-name option for sln filename", async () => {
    const [{ outputs }] = await HttpTesterCustomPackage.compileAndDiagnose(`
      @service
      namespace TestService;
    `);

    const slnKey = Object.keys(outputs).find((k) => k.endsWith(".sln"));
    expect(slnKey).toBe("MyCustomName.sln");
  });
});
