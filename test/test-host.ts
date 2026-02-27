import { Diagnostic, resolvePath } from "@typespec/compiler";
import {
  createTester,
  createTestHost,
  createTestWrapper,
  expectDiagnosticEmpty,
} from "@typespec/compiler/testing";
import { HttpClientCsharpTestLibrary } from "../src/testing/index.js";
const ApiTester = createTester(resolvePath(import.meta.dirname, ".."), {
  libraries: ["http-client-csharp"],
});

export const Tester = ApiTester.emit("http-client-csharp");