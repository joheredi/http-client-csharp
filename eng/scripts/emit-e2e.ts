#!/usr/bin/env node

/**
 * emit-e2e.ts — Discovers and generates C# client libraries from all Spector specs.
 *
 * Finds `client.tsp` / `main.tsp` files under both the @typespec/http-specs
 * and @azure-tools/azure-http-specs packages, runs `tsp compile` for each spec
 * in parallel, and writes the generated code to `temp/e2e/Spector/http/{spec-path}/`.
 * Specs listed in `test/e2e/.testignore` are skipped.
 *
 * Usage:
 *   pnpm emit:e2e                      # generate all non-ignored specs
 *   pnpm emit:e2e --filter type/array   # only specs matching the filter
 *
 * Prerequisites: The emitter must be built first (`pnpm build`).
 */

import { execFile } from "node:child_process";
import { cpus } from "node:os";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { globby } from "globby";
import pLimit from "p-limit";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Root of this repository (two levels up from eng/scripts/). */
const projectRoot = resolve(__dirname, "../..");

/** Root directory containing the core Spector specs. */
const coreSpecsBasePath = join(
  projectRoot,
  "node_modules",
  "@typespec",
  "http-specs",
  "specs",
);

/** Root directory containing the Azure Spector specs. */
const azureSpecsBasePath = join(
  projectRoot,
  "node_modules",
  "@azure-tools",
  "azure-http-specs",
  "specs",
);

/** Ignore file listing specs to skip (one path per line, # for comments). */
const ignoreFilePath = join(projectRoot, "test", "e2e", ".testignore");

/** Output root for generated code. */
const generatedRoot = join(projectRoot, "temp", "e2e", "Spector", "http");

/** Directory for error logs from failed compilations. */
const logDirRoot = join(projectRoot, "temp", "emit-e2e-logs");

/** Summary report written after the run. */
const reportFilePath = join(logDirRoot, "report.txt");

/** Absolute path to the emitter package (used as --emit target). */
const emitterPath = projectRoot;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { filter?: string } {
  const args: { filter?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--filter" && i + 1 < argv.length) {
      args.filter = argv[i + 1];
      i++;
    }
  }
  return args;
}

const cliArgs = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Ignore list
// ---------------------------------------------------------------------------

async function getIgnoreList(): Promise<string[]> {
  try {
    const content = await readFile(ignoreFilePath, "utf8");
    return content
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.startsWith("#"))
      .map((line) => line.trim());
  } catch {
    console.warn("⚠️  No .testignore file found — processing all specs.");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Spec discovery
// ---------------------------------------------------------------------------

interface SpecEntry {
  /** Absolute path to the .tsp file. */
  fullPath: string;
  /** Path relative to its specsBasePath. */
  relativePath: string;
  /** Which spec source. */
  source: "core" | "azure";
  /** Optional override for the output directory (relative to generatedRoot). */
  outputDir?: string;
  /** Optional package-name override (for versioned scenarios). */
  packageName?: string;
  /** Optional api-version override (for versioned scenarios). */
  apiVersion?: string;
}

/**
 * Versioning specs that need multiple compilations (one per api-version).
 * Each entry maps a spec directory to the list of versions to compile.
 */
const VERSIONED_SPECS: Record<
  string,
  { versions: string[]; source: "core" | "azure" }
> = {
  "versioning/added": { versions: ["v1", "v2"], source: "core" },
  "versioning/madeOptional": { versions: ["v1", "v2"], source: "core" },
  "versioning/removed": { versions: ["v1", "v2preview", "v2"], source: "core" },
  "versioning/renamedFrom": { versions: ["v1", "v2"], source: "core" },
  "versioning/returnTypeChangedFrom": {
    versions: ["v1", "v2"],
    source: "core",
  },
  "versioning/typeChangedFrom": { versions: ["v1", "v2"], source: "core" },
  "resiliency/srv-driven": { versions: ["v1", "v2"], source: "azure" },
};

function pascalCase(s: string): string {
  return s
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function buildPackageName(specPath: string): string {
  return specPath.split("/").map(pascalCase).join(".");
}

/**
 * Discovers all compilable specs under a given specs directory.
 * Prefers `client.tsp` over `main.tsp` when both exist in the same directory.
 */
async function discoverSpecsFromDir(
  specsBasePath: string,
  source: "core" | "azure",
): Promise<SpecEntry[]> {
  if (!existsSync(specsBasePath)) {
    return [];
  }

  const patterns = ["**/client.tsp", "**/main.tsp"];
  const discovered = await globby(patterns, { cwd: specsBasePath });

  const byDir = new Map<string, SpecEntry>();
  for (const relPath of discovered) {
    const dir = dirname(relPath);
    const existing = byDir.get(dir);

    // Prefer client.tsp over main.tsp
    if (existing && existing.relativePath.endsWith("client.tsp")) {
      continue;
    }

    byDir.set(dir, {
      fullPath: join(specsBasePath, relPath),
      relativePath: relPath,
      source,
    });
  }

  return Array.from(byDir.values());
}

/**
 * Discovers all compilable specs, handling versioned specs that need
 * multiple compilations and applying ignore/filter rules.
 */
async function discoverSpecs(
  ignoreList: string[],
  filter?: string,
): Promise<SpecEntry[]> {
  const coreSpecs = await discoverSpecsFromDir(coreSpecsBasePath, "core");
  const azureSpecs = await discoverSpecsFromDir(azureSpecsBasePath, "azure");

  if (coreSpecs.length === 0 && azureSpecs.length === 0) {
    console.error(
      `❌ No specs directories found.\n` +
        `   Make sure @typespec/http-specs and/or @azure-tools/azure-http-specs are installed (pnpm install).`,
    );
    process.exit(1);
  }

  const allDiscovered = [...coreSpecs, ...azureSpecs];
  const specs: SpecEntry[] = [];

  for (const spec of allDiscovered) {
    const specDir = dirname(spec.relativePath);

    // Check if this is a versioned spec that needs multiple compilations
    const versionConfig = VERSIONED_SPECS[specDir];
    if (versionConfig && versionConfig.source === spec.source) {
      const baseName = buildPackageName(specDir);
      for (const version of versionConfig.versions) {
        const versionSuffix = pascalCase(version);
        specs.push({
          ...spec,
          outputDir: `${specDir}/${version}`,
          packageName: `${baseName}.${versionSuffix}`,
          apiVersion: version,
        });
      }
    } else {
      specs.push(spec);
    }
  }

  // Apply ignore list (match on directory prefix, relative to specs root)
  let filtered = specs.filter((spec) => {
    const specDir = spec.outputDir ?? dirname(spec.relativePath);
    return !ignoreList.some(
      (ignored) => specDir === ignored || specDir.startsWith(ignored + "/"),
    );
  });

  // Apply --filter (substring match on spec directory)
  if (filter) {
    filtered = filtered.filter((spec) => {
      const specDir = spec.outputDir ?? dirname(spec.relativePath);
      return specDir.includes(filter);
    });
  }

  // Sort for deterministic output
  filtered.sort((a, b) => {
    const aDir = a.outputDir ?? dirname(a.relativePath);
    const bDir = b.outputDir ?? dirname(b.relativePath);
    return aDir.localeCompare(bDir);
  });

  return filtered;
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

interface CompileResult {
  status: "succeeded" | "failed";
  specDir: string;
  errorDetails?: string;
  durationMs?: number;
}

async function compileSpec(spec: SpecEntry): Promise<CompileResult> {
  const specDir = spec.outputDir ?? dirname(spec.relativePath);
  const outputDir = join(generatedRoot, specDir);
  const logDir = join(logDirRoot, specDir);
  const start = Date.now();

  try {
    await mkdir(outputDir, { recursive: true });

    const args = [
      "tsp",
      "compile",
      spec.fullPath,
      "--emit",
      emitterPath,
      "--option",
      `http-client-csharp.emitter-output-dir=${outputDir}`,
      "--option",
      "http-client-csharp.new-project=true",
    ];

    if (spec.packageName) {
      args.push(
        "--option",
        `http-client-csharp.package-name=${spec.packageName}`,
      );
    }

    if (spec.apiVersion) {
      args.push(
        "--option",
        `http-client-csharp.api-version=${spec.apiVersion}`,
      );
    }

    await execFileAsync("npx", args, {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60_000,
    });

    return {
      status: "succeeded",
      specDir,
      durationMs: Date.now() - start,
    };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const errorDetails =
      [err.stdout, err.stderr].filter(Boolean).join("\n") ||
      err.message ||
      "Unknown error";

    await mkdir(logDir, { recursive: true });
    const logFile = join(
      logDir,
      `${basename(spec.relativePath, ".tsp")}-error.log`,
    );
    await writeFile(logFile, errorDetails, "utf8");

    return {
      status: "failed",
      specDir,
      errorDetails,
      durationMs: Date.now() - start,
    };
  }
}

/** Path to the generated .props file for csproj project references. */
const propsFilePath = join(
  projectRoot,
  "test",
  "e2e",
  "Spector.Tests",
  "GeneratedProjectReferences.props",
);

/**
 * Directories where multiple generated projects share a namespace prefix
 * and need assembly aliases to avoid ambiguity in C# compilation.
 */
const ALIAS_PREFIXES = ["client/structure/", "versioning/", "resiliency/"];

/**
 * Custom alias overrides for specs where the test files (from the legacy
 * submodule) use extern alias names that differ from the csproj-derived names.
 * Key: spec directory path, Value: expected alias name.
 */
const ALIAS_OVERRIDES: Record<string, string> = {
  "client/structure/default": "ClientStructureDefault",
  "client/structure/client-operation-group": "ClientStructureClientOperationGroup",
  "versioning/madeOptional/v1": "MadeOptionalV1",
  "versioning/madeOptional/v2": "MadeOptionalV2",
  "versioning/removed/v1": "RemovedV1",
  "versioning/removed/v2": "RemovedV2",
  "versioning/removed/v2preview": "RemovedV2Preview",
  "versioning/renamedFrom/v2": "RenamedFromV2",
  "versioning/returnTypeChangedFrom/v2": "ReturnTypeChangedFromV2",
  "versioning/typeChangedFrom/v2": "TypeChangedFromV2",
  "resiliency/srv-driven/v1": "SrvDrivenV1",
  "resiliency/srv-driven/v2": "SrvDrivenV2",
};

function needsAlias(specDir: string): boolean {
  return ALIAS_PREFIXES.some((prefix) => specDir.startsWith(prefix));
}

function buildAlias(csprojName: string): string {
  // Remove extension and dots, producing a PascalCase alias
  // e.g., "Versioning.Added.V1" → "VersioningAddedV1"
  return csprojName.replace(/\.csproj$/, "").replace(/\./g, "");
}

/**
 * Scans the generated output directory for .csproj files and writes
 * a GeneratedProjectReferences.props file that the Spector.Tests.csproj imports.
 *
 * @param ignoreList - Spec paths from .testignore. Projects under these paths
 *   are excluded as a safety net (their output dirs should already be cleaned,
 *   but this guards against race conditions or manual re-generation).
 */
async function generateProjectReferences(ignoreList: string[]): Promise<void> {
  console.log("\n📝 Generating project references...");

  const csprojPattern = "**/*.csproj";
  const csprojFiles = await globby(csprojPattern, { cwd: generatedRoot });
  csprojFiles.sort();

  if (csprojFiles.length === 0) {
    console.warn("⚠️  No .csproj files found in generated output.");
    return;
  }

  const lines: string[] = [
    `<!-- Auto-generated by eng/scripts/emit-e2e.ts — do not edit manually -->`,
    `<Project>`,
    `  <ItemGroup>`,
  ];

  let includedCount = 0;
  for (const csprojRelPath of csprojFiles) {
    // csprojRelPath is like "type/array/src/Type.Array.csproj"
    // specDir is the parent structure, e.g., "type/array"
    const specDir = dirname(csprojRelPath).replace(/\/src$/, "");

    // Skip projects from ignored specs (defense-in-depth)
    const isIgnored = ignoreList.some(
      (ignored) => specDir === ignored || specDir.startsWith(ignored + "/"),
    );
    if (isIgnored) {
      continue;
    }

    const csprojName = basename(csprojRelPath);
    const include = `$(GeneratedRoot)${csprojRelPath}`;

    if (needsAlias(specDir)) {
      const alias = ALIAS_OVERRIDES[specDir] ?? buildAlias(csprojName);
      lines.push(
        `    <ProjectReference Include="${include}" Aliases="${alias}" />`,
      );
    } else {
      lines.push(`    <ProjectReference Include="${include}" />`);
    }
    includedCount++;
  }

  lines.push(`  </ItemGroup>`);
  lines.push(`</Project>`);
  lines.push(``);

  await writeFile(propsFilePath, lines.join("\n"), "utf8");
  console.log(
    `✅ Generated ${includedCount} project reference(s) → ${propsFilePath}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = process.hrtime.bigint();

  console.log("🔍 Discovering specs...");
  const ignoreList = await getIgnoreList();
  const specs = await discoverSpecs(ignoreList, cliArgs.filter);

  if (specs.length === 0) {
    console.log("⚠️  No specs to process.");
    return;
  }

  const skippedCount = ignoreList.length;
  console.log(
    `📦 Found ${specs.length} spec(s) to compile` +
      (skippedCount > 0 ? ` (${skippedCount} ignored)` : "") +
      (cliArgs.filter ? ` [filter: ${cliArgs.filter}]` : ""),
  );

  // Clear previous logs
  if (existsSync(logDirRoot)) {
    await rm(logDirRoot, { recursive: true, force: true });
  }

  // Remove stale output from ignored specs so generateProjectReferences()
  // doesn't include their .csproj files in the build.
  if (ignoreList.length > 0) {
    console.log("🗑️  Cleaning stale output from ignored specs...");
    for (const ignored of ignoreList) {
      const staleDir = join(generatedRoot, ignored);
      if (existsSync(staleDir)) {
        await rm(staleDir, { recursive: true, force: true });
        console.log(`   removed: ${ignored}`);
      }
    }
  }

  // Pre-pass: clean all output directories serially before parallel compilation.
  // Avoids ENOTEMPTY race condition when specs have parent-child output directories.
  console.log("🧹 Cleaning output directories...");
  for (const spec of specs) {
    const specDir = spec.outputDir ?? dirname(spec.relativePath);
    const outputDir = join(generatedRoot, specDir);
    if (existsSync(outputDir)) {
      await rm(outputDir, { recursive: true, force: true });
    }
  }
  for (const spec of specs) {
    const specDir = spec.outputDir ?? dirname(spec.relativePath);
    const outputDir = join(generatedRoot, specDir);
    await mkdir(outputDir, { recursive: true });
  }

  // Process specs in parallel
  const concurrency = Math.min(Math.max(1, cpus().length), 4);
  console.log(`⚡ Parallelism: ${concurrency} concurrent compilations\n`);

  const limit = pLimit(concurrency);
  let completed = 0;

  const tasks = specs.map((spec) =>
    limit(async () => {
      const result = await compileSpec(spec);
      completed++;
      const icon = result.status === "succeeded" ? "✅" : "❌";
      const timing = result.durationMs
        ? ` (${(result.durationMs / 1000).toFixed(1)}s)`
        : "";
      console.log(
        `${icon} [${completed}/${specs.length}] ${result.specDir}${timing}`,
      );
      return result;
    }),
  );

  const results = await Promise.all(tasks);

  // Summarize
  const succeeded = results.filter((r) => r.status === "succeeded");
  const failed = results.filter((r) => r.status === "failed");

  console.log("\n" + "=".repeat(60));
  console.log(`✅ Succeeded: ${succeeded.length}`);
  console.log(`❌ Failed:    ${failed.length}`);
  console.log(`⏭️  Skipped:   ${skippedCount} (via .testignore)`);

  if (failed.length > 0) {
    console.log("\nFailed specs:");
    for (const f of failed) {
      console.log(`  - ${f.specDir}`);
    }
    console.log(`\n📁 Error logs: ${logDirRoot}`);
  }

  // Write summary report
  await mkdir(logDirRoot, { recursive: true });
  const report = [
    `Emit E2E Report — ${new Date().toISOString()}`,
    `Succeeded: ${succeeded.length}`,
    `Failed: ${failed.length}`,
    `Skipped: ${skippedCount}`,
    "",
    "Succeeded:",
    ...succeeded.map((r) => `  ✅ ${r.specDir}`),
    "",
    "Failed:",
    ...failed.map(
      (r) => `  ❌ ${r.specDir}\n     ${(r.errorDetails ?? "").split("\n")[0]}`,
    ),
  ].join("\n");
  await writeFile(reportFilePath, report, "utf8");
  console.log(`\n📄 Report: ${reportFilePath}`);

  // Generate .props file with project references for the csproj
  await generateProjectReferences(ignoreList);

  // Timing
  const endTime = process.hrtime.bigint();
  const duration = Number(endTime - startTime) / 1e9;
  console.log(`⏱️  Total time: ${duration.toFixed(1)}s`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

await main();
