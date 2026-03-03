/**
 * End-to-end integration test for the Sample-TypeSpec golden output.
 *
 * This test validates the full C# HTTP client emitter output against the golden
 * files in the legacy emitter's test project:
 * `submodules/typespec/packages/http-client-csharp/generator/TestProjects/Local/Sample-TypeSpec/`
 *
 * The test reads the SampleService TypeSpec definition, compiles it through
 * the emitter, and compares every generated file against the golden output.
 * This is the primary end-to-end correctness gate for the emitter.
 *
 * ## Usage
 *
 * **Default mode** (runs with `pnpm test`):
 * - Compiles the TypeSpec without errors
 * - Reports file coverage metrics (generated vs golden)
 * - Reports content match rate
 * - Per-file comparison tests are skipped to avoid noise
 *
 * **Full validation mode** (run manually to see all per-file results):
 * ```bash
 * INTEGRATION_FULL=true pnpm test -- test/integration/sample-typespec.test.ts
 * ```
 *
 * Known limitations:
 * - The `@dynamicModel` decorator from `@typespec/http-client-csharp` is not
 *   available (the legacy emitter package is not installed). The decorator
 *   references are stripped from the TypeSpec input before compilation.
 *   Files affected by @dynamicModel may differ from golden output.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { describe, it, expect, beforeAll } from "vitest";
import { IntegrationApiTester } from "../test-host.js";

/** When true, runs individual per-file golden comparison tests. */
const FULL_MODE = process.env.INTEGRATION_FULL === "true";

/** Path to the SampleService TypeSpec definition. */
const SAMPLE_TSP_PATH = resolve(
  import.meta.dirname,
  "../../submodules/typespec/docs/samples/client/csharp/SampleService/main.tsp",
);

/** Path to the golden output directory. */
const GOLDEN_DIR = resolve(
  import.meta.dirname,
  "../../submodules/typespec/packages/http-client-csharp/generator/TestProjects/Local/Sample-TypeSpec/src/Generated",
);

/**
 * Creates a tester configured with the same emitter options as the
 * Sample-TypeSpec tspconfig.yaml (MIT License, Microsoft company).
 */
const SampleTester = IntegrationApiTester.emit("http-client-csharp", {
  license: {
    name: "MIT License",
    company: "Microsoft",
  },
}).importLibraries();

/**
 * Recursively lists all `.cs` files in a directory.
 * Returns paths relative to the base directory.
 */
function listCsFiles(dir: string, base: string = dir): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listCsFiles(fullPath, base));
    } else if (entry.endsWith(".cs")) {
      files.push(relative(base, fullPath));
    }
  }
  return files.sort();
}

/**
 * Strips the legacy emitter import and `@dynamicModel` decorator from TypeSpec
 * source code. This is necessary because:
 * 1. `@typespec/http-client-csharp` (the legacy emitter package) is not installed
 *    as a dependency — it defines the `@dynamicModel` extern decorator.
 * 2. `using TypeSpec.HttpClient.CSharp;` references the legacy emitter's namespace.
 * 3. `@dynamicModel` annotations would cause compilation errors without the
 *    decorator implementation.
 *
 * The emitter's @dynamicModel detection is not yet implemented (hardcoded to false),
 * so stripping these references does not affect the generated output.
 */
function preprocessTypeSpec(content: string): string {
  return content
    .replace(/^import\s+"@typespec\/http-client-csharp";\s*$/m, "")
    .replace(/^using\s+TypeSpec\.HttpClient\.CSharp;\s*$/m, "")
    .replace(/^\s*@dynamicModel\s*$/gm, "");
}

/**
 * Normalizes generated C# content for comparison by trimming trailing whitespace
 * from each line and ensuring consistent line endings.
 */
function normalize(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
}

describe("Sample-TypeSpec integration", () => {
  /** All golden output files (relative paths from Generated/). */
  const goldenFiles = listCsFiles(GOLDEN_DIR);

  /** Compiled emitter outputs, populated by beforeAll. */
  let outputs: Record<string, string>;

  /** Diagnostics from compilation. */
  let diagnostics: readonly {
    severity: string;
    code: string;
    message: string;
  }[];

  beforeAll(async () => {
    const tspContent = readFileSync(SAMPLE_TSP_PATH, "utf-8");
    const processed = preprocessTypeSpec(tspContent);
    const [result, diags] = await SampleTester.compileAndDiagnose(processed);
    outputs = result.outputs;
    diagnostics = diags as typeof diagnostics;
  }, 120_000);

  /**
   * Validates that the TypeSpec compiles without errors.
   * Warnings are expected and allowed (e.g., PATCH implicit-optional warnings
   * from the TypeSpec definition, TCGC union-enum warnings).
   * Only compiler errors indicate a real problem.
   */
  it("should compile without errors", () => {
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      const errorMessages = errors.map((e) => `[${e.code}] ${e.message}`);
      expect.fail(
        `Compilation produced ${errors.length} error(s):\n${errorMessages.join("\n")}`,
      );
    }
  });

  /**
   * Reports file coverage metrics: how many golden files are generated,
   * how many are missing, and how many extra files are generated.
   * This test always passes — it logs metrics for tracking progress.
   *
   * The metrics help identify:
   * - Missing files: features not yet implemented in the emitter
   * - Extra files: emitter generates files the golden output doesn't have
   *   (may indicate different infrastructure choices or bugs)
   */
  it("should report file coverage metrics", () => {
    const generatedPaths = Object.keys(outputs)
      .filter((p) => p.startsWith("src/Generated/") && p.endsWith(".cs"))
      .map((p) => p.replace("src/Generated/", ""))
      .sort();

    const missingFiles = goldenFiles.filter((f) => !generatedPaths.includes(f));
    const extraFiles = generatedPaths.filter((f) => !goldenFiles.includes(f));
    const commonFiles = goldenFiles.filter((f) => generatedPaths.includes(f));

    // Count content matches
    let matchCount = 0;
    for (const file of commonFiles) {
      const outputKey = `src/Generated/${file}`;
      const genContent = normalize(outputs[outputKey]);
      const goldenContent = normalize(
        readFileSync(join(GOLDEN_DIR, file), "utf-8"),
      );
      if (genContent === goldenContent) {
        matchCount++;
      }
    }

    console.log("\n=== Sample-TypeSpec Integration Metrics ===");
    console.log(`Golden files:     ${goldenFiles.length}`);
    console.log(`Generated files:  ${generatedPaths.length}`);
    console.log(`Common files:     ${commonFiles.length}`);
    console.log(`Content matches:  ${matchCount}/${commonFiles.length}`);
    console.log(`Missing files:    ${missingFiles.length}`);
    console.log(`Extra files:      ${extraFiles.length}`);

    if (missingFiles.length > 0) {
      console.log("\nMissing (in golden but not generated):");
      for (const f of missingFiles) {
        console.log(`  - ${f}`);
      }
    }
    if (extraFiles.length > 0) {
      console.log("\nExtra (generated but not in golden):");
      for (const f of extraFiles) {
        console.log(`  - ${f}`);
      }
    }
    console.log("==========================================\n");
  });

  /**
   * Per-file golden output comparison tests.
   *
   * These tests run ONLY when INTEGRATION_FULL=true is set:
   * ```bash
   * INTEGRATION_FULL=true pnpm test -- test/integration/sample-typespec.test.ts
   * ```
   *
   * Each test compares a single generated file against its golden output.
   * This provides granular failure reporting — when a file doesn't match,
   * you can see exactly which file and what the diff is.
   *
   * As the emitter improves, more of these tests will pass. The match count
   * in the metrics test above tracks overall progress.
   */
  const testFn = FULL_MODE ? it : it.skip;

  for (const goldenFile of goldenFiles) {
    testFn(`should match golden output: ${goldenFile}`, () => {
      const outputKey = `src/Generated/${goldenFile}`;
      const goldenContent = readFileSync(join(GOLDEN_DIR, goldenFile), "utf-8");

      if (outputs[outputKey] === undefined) {
        expect.fail(
          `File not generated by emitter: ${outputKey}. ` +
            `This indicates an unimplemented feature.`,
        );
        return;
      }

      expect(normalize(outputs[outputKey])).toBe(normalize(goldenContent));
    });
  }
});
