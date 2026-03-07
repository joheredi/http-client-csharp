#!/usr/bin/env node

/**
 * emit-mgmt.ts — Compiles the Azure management plane (ARM) TypeSpec test suite.
 *
 * Runs `tsp compile` on the management test project's main.tsp file (which
 * imports all 31 ARM resource TypeSpec fixtures) using the http-client-csharp
 * emitter with management-plane options enabled.
 *
 * The generated C# code is written to `temp/mgmt/` for inspection or
 * subsequent `dotnet build` validation.
 *
 * Usage:
 *   pnpm emit:mgmt                # compile all mgmt test files
 *
 * Prerequisites: The emitter must be built first (`pnpm build`).
 */

import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Root of this repository (two levels up from eng/scripts/). */
const projectRoot = resolve(__dirname, "../..");

/**
 * Path to the management plane TypeSpec test project's main.tsp.
 * This file imports all 31 ARM resource TypeSpec fixtures.
 */
const mgmtMainTsp = join(
  projectRoot,
  "submodules",
  "azure-sdk-for-net",
  "eng",
  "packages",
  "http-client-csharp-mgmt",
  "generator",
  "TestProjects",
  "Local",
  "Mgmt-TypeSpec",
  "main.tsp",
);

/** Output root for generated code. */
const generatedRoot = join(projectRoot, "temp", "mgmt");

/** Absolute path to the emitter package (used as --emit target). */
const emitterPath = projectRoot;

/** Directory for error logs from failed compilation. */
const logDir = join(projectRoot, "temp", "emit-mgmt-logs");

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🔧 emit-mgmt: Compiling management plane TypeSpec test suite");
  console.log(`   main.tsp: ${mgmtMainTsp}`);
  console.log(`   output:   ${generatedRoot}`);

  // Validate that the mgmt test project exists
  if (!existsSync(mgmtMainTsp)) {
    console.error(
      `❌ Management test project not found at:\n   ${mgmtMainTsp}\n` +
        `   Make sure the azure-sdk-for-net submodule is initialized.`,
    );
    process.exit(1);
  }

  // Clean previous output
  await rm(generatedRoot, { recursive: true, force: true });
  await mkdir(generatedRoot, { recursive: true });
  await mkdir(logDir, { recursive: true });

  const start = Date.now();

  const args = [
    "tsp",
    "compile",
    mgmtMainTsp,
    "--emit",
    emitterPath,
    "--option",
    `http-client-csharp.emitter-output-dir=${generatedRoot}`,
    "--option",
    "http-client-csharp.new-project=true",
    "--option",
    "http-client-csharp.flavor=azure",
    "--option",
    "http-client-csharp.management=true",
    "--option",
    "http-client-csharp.enable-wire-path-attribute=true",
    "--option",
    "http-client-csharp.package-name=Azure.Generator.MgmtTypeSpec.Tests",
  ];

  try {
    const { stdout, stderr } = await execFileAsync("npx", args, {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    });

    const durationMs = Date.now() - start;

    if (stdout) console.log(stdout);
    if (stderr) console.warn(stderr);

    console.log(`✅ emit-mgmt: Compilation succeeded in ${durationMs}ms`);
    console.log(`   Generated code at: ${generatedRoot}`);
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const errorDetails =
      [err.stdout, err.stderr].filter(Boolean).join("\n") ||
      err.message ||
      "Unknown error";

    const durationMs = Date.now() - start;

    // Write error log
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(logDir, "error.log"), errorDetails);

    console.error(
      `❌ emit-mgmt: Compilation failed in ${durationMs}ms\n` +
        `   Error log: ${join(logDir, "error.log")}\n` +
        `   ${errorDetails.slice(0, 500)}`,
    );
    process.exit(1);
  }
}

main();
