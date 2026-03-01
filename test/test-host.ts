import { Diagnostic, resolvePath } from "@typespec/compiler";
import {
  createTester,
  createTestHost,
  createTestWrapper,
  expectDiagnosticEmpty,
} from "@typespec/compiler/testing";
import { HttpClientCsharpTestLibrary } from "../src/testing/index.js";
export const ApiTester = createTester(resolvePath(import.meta.dirname, ".."), {
  libraries: ["http-client-csharp", "@typespec/http", "@typespec/versioning"],
});

export const Tester = ApiTester.emit("http-client-csharp");

/**
 * Emitter tester with HTTP library auto-imported.
 * Use this when test TypeSpec needs `using TypeSpec.Http;` and HTTP decorators
 * like `@route`, `@query`, etc. The `.importLibraries()` call makes
 * all registered libraries available to the TypeSpec compiler.
 */
export const HttpTester = Tester.importLibraries();
