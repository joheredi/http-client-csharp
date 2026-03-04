/**
 * Vitest globalSetup for Spector e2e tests.
 *
 * Starts the tsp-spector mock server before all tests and stops it after.
 * The server provides mock HTTP endpoints that implement the TypeSpec HTTP specs,
 * allowing generated client libraries to be tested against a live server.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");

/** Port for the Spector mock server (3002 avoids conflicts with dev servers). */
const SERVER_PORT = 3002;

/** Health-check endpoint that returns 204 when the server is ready. */
const HEALTH_URL = `http://localhost:${SERVER_PORT}/routes/in-interface/fixed`;

/** Path to the http-specs mock API definitions. */
const CORE_SPECS_PATH = join(
  projectRoot,
  "node_modules",
  "@typespec",
  "http-specs",
  "specs",
);

/** Path to the azure-http-specs mock API definitions. */
const AZURE_SPECS_PATH = join(
  projectRoot,
  "node_modules",
  "@azure-tools",
  "azure-http-specs",
  "specs",
);

/** Path to write Spector coverage data. */
const COVERAGE_FILE = join(projectRoot, "temp", "spector-coverage.json");

/** Path to the tsp-spector CLI binary. */
const TSP_SPECTOR_BIN = join(
  projectRoot,
  "node_modules",
  ".bin",
  "tsp-spector",
);

/** Reference to the server process for cleanup. */
let serverProcess: ChildProcess | undefined;

/**
 * Polls the health-check endpoint until the server responds with HTTP 204.
 */
async function waitForServer(
  url: string,
  retries: number = 30,
  delayMs: number = 1000,
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const statusCode = await new Promise<number>((resolve, reject) => {
        http
          .get(url, (res) => resolve(res.statusCode ?? 0))
          .on("error", reject);
      });

      if (statusCode === 204) {
        console.log(`[spector] Server ready (204 from ${url})`);
        return;
      }
      console.log(
        `[spector] Attempt ${attempt}/${retries}: got ${statusCode}, retrying...`,
      );
    } catch {
      console.log(
        `[spector] Attempt ${attempt}/${retries}: server not ready yet...`,
      );
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }

  throw new Error(
    `[spector] Server did not become ready within ${retries} attempts (expected 204 from ${url})`,
  );
}

/**
 * Starts the tsp-spector mock server and waits until it is ready.
 * Called by Vitest before any e2e test files run.
 */
export async function setup(): Promise<void> {
  if (!existsSync(CORE_SPECS_PATH)) {
    throw new Error(
      `[spector] Core specs directory not found: ${CORE_SPECS_PATH}\n` +
        `Install @typespec/http-specs: pnpm add -D @typespec/http-specs`,
    );
  }

  if (!existsSync(AZURE_SPECS_PATH)) {
    throw new Error(
      `[spector] Azure specs directory not found: ${AZURE_SPECS_PATH}\n` +
        `Install @azure-tools/azure-http-specs: pnpm add -D @azure-tools/azure-http-specs`,
    );
  }

  // Ensure temp/ directory exists for coverage file
  const coverageDir = dirname(COVERAGE_FILE);
  if (!existsSync(coverageDir)) {
    mkdirSync(coverageDir, { recursive: true });
  }

  console.log(`[spector] Starting mock server on port ${SERVER_PORT}...`);

  serverProcess = spawn(
    TSP_SPECTOR_BIN,
    [
      "server",
      "start",
      CORE_SPECS_PATH,
      AZURE_SPECS_PATH,
      "--port",
      String(SERVER_PORT),
      "--coverageFile",
      COVERAGE_FILE,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );

  // Log server output for debugging
  serverProcess.stdout?.on("data", (data: Buffer) => {
    console.log(`[spector:stdout] ${data.toString().trim()}`);
  });
  serverProcess.stderr?.on("data", (data: Buffer) => {
    console.error(`[spector:stderr] ${data.toString().trim()}`);
  });

  serverProcess.on("error", (err) => {
    console.error(`[spector] Failed to start server: ${err.message}`);
  });

  // Detach so the server outlives this process if needed
  serverProcess.unref();

  await waitForServer(HEALTH_URL);
}

/**
 * Stops the tsp-spector mock server.
 * Called by Vitest after all e2e tests have completed.
 */
export async function teardown(): Promise<void> {
  console.log(`[spector] Stopping mock server on port ${SERVER_PORT}...`);
  try {
    await execFileAsync(TSP_SPECTOR_BIN, [
      "server",
      "stop",
      "--port",
      String(SERVER_PORT),
    ]);
    console.log("[spector] Server stopped successfully.");
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    // Server may already be stopped — that's OK
    if (
      error.code === "ECONNREFUSED" ||
      error.message?.includes("ECONNREFUSED")
    ) {
      console.log("[spector] Server was already stopped.");
    } else {
      console.error(`[spector] Error stopping server: ${error.message}`);
    }
  }
  serverProcess = undefined;
}
