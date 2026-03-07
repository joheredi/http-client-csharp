import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { HttpTester, MgmtTester } from "./test-host.js";

/**
 * Root directory for smoke test output.
 * Kept after test runs for investigation; cleaned before each run.
 */
const SMOKE_DIR = resolve(import.meta.dirname, "..", "temp", "smoke");

/** Directory containing .tsp fixture files for smoke tests. */
const FIXTURES_DIR = resolve(import.meta.dirname, "fixtures", "smoke");

/**
 * Check whether the `dotnet` CLI is available.
 */
function hasDotnet(): boolean {
  try {
    execSync("dotnet --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Write the in-memory outputs map to a directory on disk.
 */
function writeOutputsToDisk(
  outputs: Record<string, string>,
  baseDir: string,
): void {
  for (const [relativePath, content] of Object.entries(outputs)) {
    const fullPath = join(baseDir, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
}

/**
 * Read a .tsp fixture file and return its content.
 */
function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

/**
 * Run `dotnet build` in the given directory and return stdout.
 * Throws on non-zero exit code, including build output in the error message.
 */
function dotnetBuild(cwd: string): string {
  try {
    return execSync("dotnet build", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    const stdout = err.stdout ?? "";
    const stderr = err.stderr ?? "";
    throw new Error(`dotnet build failed:\n${stdout}\n${stderr}`);
  }
}

describe(
  "smoke tests — dotnet build on emitter output",
  { timeout: 120_000 },
  () => {
    beforeAll(() => {
      if (!hasDotnet()) {
        console.warn("Skipping smoke tests: dotnet CLI not found");
        return;
      }

      // Clean previous smoke output before starting
      rmSync(SMOKE_DIR, { recursive: true, force: true });
      mkdirSync(SMOKE_DIR, { recursive: true });
    });

    it.skipIf(!hasDotnet())(
      "builds a minimal service with a model",
      async () => {
        const testDir = join(SMOKE_DIR, "minimal-service");

        const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(
          readFixture("minimal-service.tsp"),
        );

        expect(diagnostics).toHaveLength(0);
        writeOutputsToDisk(outputs, testDir);

        const result = dotnetBuild(join(testDir, "src"));
        expect(result).toContain("Build succeeded");
      },
    );

    it.skipIf(!hasDotnet())(
      "builds a service with fixed and extensible enums",
      async () => {
        const testDir = join(SMOKE_DIR, "enums");

        const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(
          readFixture("enums.tsp"),
        );

        expect(diagnostics).toHaveLength(0);
        writeOutputsToDisk(outputs, testDir);

        const result = dotnetBuild(join(testDir, "src"));
        expect(result).toContain("Build succeeded");
      },
    );

    it.skipIf(!hasDotnet())(
      "builds a service with complex models",
      async () => {
        const testDir = join(SMOKE_DIR, "complex-models");

        const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(
          readFixture("complex-models.tsp"),
        );

        expect(diagnostics).toHaveLength(0);
        writeOutputsToDisk(outputs, testDir);

        const result = dotnetBuild(join(testDir, "src"));
        expect(result).toContain("Build succeeded");
      },
    );

    it.skipIf(!hasDotnet())("builds the Widget service example", async () => {
      const testDir = join(SMOKE_DIR, "widget");

      const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(
        readFixture("widget.tsp"),
      );

      expect(diagnostics).toHaveLength(0);
      writeOutputsToDisk(outputs, testDir);

      const result = dotnetBuild(join(testDir, "src"));
      expect(result).toContain("Build succeeded");
    });

    /**
     * Validates that the emitter can process an Azure Resource Manager (ARM)
     * TypeSpec definition and produce C# output with the correct project
     * structure. This verifies:
     * - ARM TypeSpec compiles through the emitter without diagnostics
     * - Generated .csproj references Azure.ResourceManager NuGet
     * - Output includes expected C# source files
     *
     * Note: `dotnet build` is not validated here because ARM-specific code
     * generation (CRUD clients, resource detection, property flattening) is
     * implemented in phase 19. Once that phase is complete, this test should
     * be extended to also validate `dotnet build` succeeds.
     */
    it("emits a management plane ARM resource", async () => {
      const testDir = join(SMOKE_DIR, "mgmt-resource");

      const [{ outputs }, diagnostics] =
        await MgmtTester.compileAndDiagnose(
          readFixture("mgmt-resource.tsp"),
        );

      // Emitter processes ARM TypeSpec without errors
      expect(diagnostics).toHaveLength(0);

      // Verify .csproj references Azure.ResourceManager
      const csprojKey = Object.keys(outputs).find((k) =>
        k.endsWith(".csproj"),
      );
      expect(csprojKey).toBeDefined();
      const csproj = outputs[csprojKey!];
      expect(csproj).toContain(
        '<PackageReference Include="Azure.ResourceManager" Version="1.14.0" />',
      );
      expect(csproj).toContain(
        '<PackageReference Include="Azure.Core" Version="1.51.1" />',
      );

      // Verify output includes C# source files
      const csFiles = Object.keys(outputs).filter((k) => k.endsWith(".cs"));
      expect(csFiles.length).toBeGreaterThan(0);

      // Write to disk for manual inspection / future dotnet build validation
      writeOutputsToDisk(outputs, testDir);
    });
  },
);
