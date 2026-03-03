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
