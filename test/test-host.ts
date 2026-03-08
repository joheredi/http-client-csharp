import { resolvePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
export const ApiTester = createTester(resolvePath(import.meta.dirname, ".."), {
  libraries: [
    "http-client-csharp",
    "@typespec/http",
    "@typespec/versioning",
    "@azure-tools/typespec-client-generator-core",
  ],
});

export const Tester = ApiTester.emit("http-client-csharp");

/**
 * Emitter tester with HTTP library auto-imported.
 * Use this when test TypeSpec needs `using TypeSpec.Http;` and HTTP decorators
 * like `@route`, `@query`, etc. The `.importLibraries()` call makes
 * all registered libraries available to the TypeSpec compiler.
 */
export const HttpTester = Tester.importLibraries();

/**
 * Emitter tester configured with Azure flavor.
 * Use this when testing Azure-specific code generation (HttpPipeline,
 * AzureKeyCredential, ClientDiagnostics, etc.). The `flavor: "azure"`
 * option activates Azure SDK type mappings throughout the emitter pipeline.
 */
export const AzureHttpTester = ApiTester.emit("http-client-csharp", {
  flavor: "azure",
}).importLibraries();

/**
 * Tester for integration tests that registers all libraries needed
 * by the full SampleService TypeSpec (rest, xml, azure-core).
 */
export const IntegrationApiTester = createTester(
  resolvePath(import.meta.dirname, ".."),
  {
    libraries: [
      "http-client-csharp",
      "@typespec/http",
      "@typespec/rest",
      "@typespec/versioning",
      "@typespec/xml",
      "@azure-tools/typespec-client-generator-core",
      "@azure-tools/typespec-azure-core",
    ],
  },
);
export const IntegrationTester =
  IntegrationApiTester.emit("http-client-csharp").importLibraries();

/**
 * Azure-flavored integration tester with Azure.Core available.
 * Use this when testing Azure-specific type mappings (e.g., uuid → Guid)
 * that require both the Azure.Core library and the Azure flavor.
 */
export const AzureIntegrationTester = IntegrationApiTester.emit(
  "http-client-csharp",
  {
    flavor: "azure",
  },
).importLibraries();

/**
 * Tester for Azure management plane (ARM) tests.
 *
 * Registers the Azure Resource Manager library in addition to all
 * integration libraries, and configures the emitter with `flavor: "azure"`
 * and `management: true`. Use this when testing ARM-specific code
 * generation (TrackedResource, ExtensionResource, CRUD operations, etc.).
 */
export const MgmtApiTester = createTester(
  resolvePath(import.meta.dirname, ".."),
  {
    libraries: [
      "http-client-csharp",
      "@typespec/http",
      "@typespec/rest",
      "@typespec/versioning",
      "@typespec/openapi",
      "@azure-tools/typespec-client-generator-core",
      "@azure-tools/typespec-azure-core",
      "@azure-tools/typespec-azure-resource-manager",
    ],
  },
);

export const MgmtTester = MgmtApiTester.emit("http-client-csharp", {
  flavor: "azure",
  management: true,
}).importLibraries();
