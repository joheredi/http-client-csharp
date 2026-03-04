/**
 * Spector E2E Generation Script
 *
 * Compiles TypeSpec http-specs through the new emitter to produce C# client
 * projects that mirror the legacy emitter's Spector test project structure.
 *
 * Usage:
 *   npx tsx test/e2e/generate.ts          # generate all scenarios
 *   npx tsx test/e2e/generate.ts --clean   # clean output before generating
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";

/** Root of the repository. */
const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** Where generated C# projects are written. */
const OUTPUT_ROOT = join(REPO_ROOT, "temp", "e2e", "Spector", "http");

/** Path to the http-specs package's specs directory. */
const SPECS_ROOT = join(REPO_ROOT, "node_modules/@typespec/http-specs/specs");

/** Path to the azure-http-specs package's specs directory. */
const AZURE_SPECS_ROOT = join(
  REPO_ROOT,
  "node_modules/@azure-tools/azure-http-specs/specs",
);

/** Absolute path to the emitter package (used as --emit target). */
const EMITTER_PATH = REPO_ROOT;

/**
 * Scenario definition for a single spec to compile.
 */
interface Scenario {
  /** Relative path from specs root to the directory containing the tsp file. */
  specPath: string;
  /** Relative output path under OUTPUT_ROOT. */
  outputPath: string;
  /** Optional package-name override (for versioned scenarios). */
  packageName?: string;
  /** Optional api-version override (for versioned scenarios). */
  apiVersion?: string;
  /** Which specs root to use. Defaults to http-specs. */
  specsRoot?: string;
  /** Entry file name. Defaults to "main.tsp". */
  entryFile?: string;
}

/**
 * PascalCase a kebab-case string: "api-key" → "ApiKey"
 */
function pascalCase(s: string): string {
  return s
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Build the package name from a spec path.
 * "authentication/api-key" → "Authentication.ApiKey"
 */
function buildPackageName(specPath: string): string {
  return specPath.split("/").map(pascalCase).join(".");
}

/**
 * Build the full list of scenarios from http-specs.
 * Handles versioning scenarios that generate multiple outputs.
 */
function buildScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];

  /** Versioning specs that need v1/v2 generation. */
  const versioningSpecs: Record<string, { versions: string[] }> = {
    "versioning/added": { versions: ["v1", "v2"] },
    "versioning/madeOptional": { versions: ["v1", "v2"] },
    "versioning/removed": { versions: ["v1", "v2preview", "v2"] },
    "versioning/renamedFrom": { versions: ["v1", "v2"] },
    "versioning/returnTypeChangedFrom": { versions: ["v1", "v2"] },
    "versioning/typeChangedFrom": { versions: ["v1", "v2"] },
  };

  /** All non-versioning spec paths from @typespec/http-specs. */
  const standardSpecs = [
    "authentication/api-key",
    "authentication/http/custom",
    "authentication/oauth2",
    "authentication/union",
    "documentation",
    "encode/array",
    "encode/bytes",
    "encode/datetime",
    "encode/duration",
    "encode/numeric",
    "parameters/basic",
    "parameters/body-optionality",
    "parameters/collection-format",
    "parameters/path",
    "parameters/query",
    "parameters/spread",
    "payload/content-negotiation",
    "payload/json-merge-patch",
    "payload/media-type",
    "payload/multipart",
    "payload/pageable",
    "payload/xml",
    "response/status-code-range",
    "routes",
    "serialization/encoded-name/json",
    "server/endpoint/not-defined",
    "server/path/multiple",
    "server/path/single",
    "server/versions/not-versioned",
    "server/versions/versioned",
    "special-headers/conditional-request",
    "special-headers/repeatability",
    "special-words",
    "type/array",
    "type/dictionary",
    "type/enum/extensible",
    "type/enum/fixed",
    "type/model/empty",
    "type/model/inheritance/enum-discriminator",
    "type/model/inheritance/nested-discriminator",
    "type/model/inheritance/not-discriminated",
    "type/model/inheritance/recursive",
    "type/model/inheritance/single-discriminator",
    "type/model/usage",
    "type/model/visibility",
    "type/property/additional-properties",
    "type/property/nullable",
    "type/property/optionality",
    "type/property/value-types",
    "type/scalar",
    "type/union",
  ];

  /**
   * Specs from @azure-tools/azure-http-specs.
   * These use client.tsp as entry point (main.tsp is just a service stub).
   */
  const azureClientStructureSpecs = [
    "client/structure/client-operation-group",
    "client/structure/default",
    "client/structure/multi-client",
    "client/structure/renamed-operation",
    "client/structure/two-operation-group",
  ];

  /** Versioning specs from @azure-tools/azure-http-specs. */
  const azureVersionedSpecs: Record<string, { versions: string[] }> = {
    "resiliency/srv-driven": { versions: ["v1", "v2"] },
  };

  // Standard (non-versioned) scenarios from http-specs
  for (const specPath of standardSpecs) {
    scenarios.push({
      specPath,
      outputPath: specPath,
    });
  }

  // Azure client/structure specs (use client.tsp entry point)
  for (const specPath of azureClientStructureSpecs) {
    scenarios.push({
      specPath,
      outputPath: specPath,
      specsRoot: AZURE_SPECS_ROOT,
      entryFile: "client.tsp",
    });
  }

  // Versioned scenarios from http-specs: one compilation per version
  for (const [specPath, config] of Object.entries(versioningSpecs)) {
    const baseName = buildPackageName(specPath);
    for (const version of config.versions) {
      const versionSuffix = pascalCase(version);
      scenarios.push({
        specPath,
        outputPath: `${specPath}/${version}`,
        packageName: `${baseName}.${versionSuffix}`,
        apiVersion: version,
      });
    }
  }

  // Versioned scenarios from azure-http-specs
  for (const [specPath, config] of Object.entries(azureVersionedSpecs)) {
    const baseName = buildPackageName(specPath);
    for (const version of config.versions) {
      const versionSuffix = pascalCase(version);
      scenarios.push({
        specPath,
        outputPath: `${specPath}/${version}`,
        packageName: `${baseName}.${versionSuffix}`,
        apiVersion: version,
        specsRoot: AZURE_SPECS_ROOT,
      });
    }
  }

  return scenarios;
}

/**
 * Compile a single scenario using `tsp compile`.
 */
function compileScenario(scenario: Scenario): {
  success: boolean;
  error?: string;
} {
  const root = scenario.specsRoot ?? SPECS_ROOT;
  const entry = scenario.entryFile ?? "main.tsp";
  const specFile = join(root, scenario.specPath, entry);
  const outputDir = join(OUTPUT_ROOT, scenario.outputPath);

  if (!existsSync(specFile)) {
    return { success: false, error: `Spec file not found: ${specFile}` };
  }

  mkdirSync(outputDir, { recursive: true });

  // Build tsp compile command
  const options: string[] = [
    `--emit ${EMITTER_PATH}`,
    `--option http-client-csharp.emitter-output-dir="${outputDir}"`,
    `--option http-client-csharp.new-project=true`,
  ];

  if (scenario.packageName) {
    options.push(
      `--option http-client-csharp.package-name="${scenario.packageName}"`,
    );
  }

  if (scenario.apiVersion) {
    options.push(
      `--option http-client-csharp.api-version="${scenario.apiVersion}"`,
    );
  }

  const cmd = `npx tsp compile "${specFile}" ${options.join(" ")}`;

  try {
    execSync(cmd, {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return {
      success: false,
      error: `${err.stdout ?? ""}\n${err.stderr ?? ""}`.trim(),
    };
  }
}

// --- Main execution ---
const args = process.argv.slice(2);
const shouldClean = args.includes("--clean");

if (shouldClean && existsSync(OUTPUT_ROOT)) {
  console.log("Cleaning output directory...");
  rmSync(OUTPUT_ROOT, { recursive: true, force: true });
}

const scenarios = buildScenarios();
console.log(`Generating ${scenarios.length} scenarios...`);

let succeeded = 0;
let failed = 0;
const failures: { scenario: string; error: string }[] = [];

for (const scenario of scenarios) {
  const label = scenario.packageName
    ? `${scenario.specPath} (${scenario.apiVersion})`
    : scenario.specPath;
  process.stdout.write(`  ${label}...`);

  const result = compileScenario(scenario);
  if (result.success) {
    succeeded++;
    process.stdout.write(" ✓\n");
  } else {
    failed++;
    process.stdout.write(" ✗\n");
    failures.push({ scenario: label, error: result.error ?? "unknown error" });
  }
}

console.log(
  `\nDone: ${succeeded} succeeded, ${failed} failed out of ${scenarios.length}`,
);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  ${f.scenario}: ${f.error.split("\n")[0]}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
