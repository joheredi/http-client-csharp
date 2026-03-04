import alloyPlugin from "@alloy-js/rollup-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/e2e/**/*.test.ts"],
    globalSetup: ["test/e2e/setup/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    isolate: false,
    passWithNoTests: true,
    pool: "forks",
  },
  esbuild: {
    jsx: "preserve",
    sourcemap: "both",
  },
  plugins: [alloyPlugin()],
});
