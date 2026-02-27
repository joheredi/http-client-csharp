import { resolvePath } from "@typespec/compiler";
import {
  createTestLibrary,
  TypeSpecTestLibrary,
} from "@typespec/compiler/testing";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "url";

function resolvePackageRoot() {
  let currentDir = dirname(fileURLToPath(import.meta.url));

  while (!existsSync(resolvePath(currentDir, "package.json"))) {
    const parentDir = resolvePath(currentDir, "..");
    if (parentDir === currentDir) {
      throw new Error(
        "Unable to resolve package root for http-client-csharp test library",
      );
    }
    currentDir = parentDir;
  }

  return currentDir;
}

export const HttpClientCsharpTestLibrary: TypeSpecTestLibrary =
  createTestLibrary({
    name: "http-client-csharp",
    packageRoot: resolvePackageRoot(),
  });
