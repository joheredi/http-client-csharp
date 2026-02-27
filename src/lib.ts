import { createTypeSpecLibrary } from "@typespec/compiler";

export const $lib = createTypeSpecLibrary({
  name: "http-client-csharp",
  diagnostics: {},
});

export const { reportDiagnostic, createDiagnostic } = $lib;
