import alloyPlugin from "@alloy-js/rollup-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/components/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    exclude: [
      "test/e2e/**",
      "test/smoke.test.ts",
      "test/scenarios.test.ts",
      "test/integration/**",
    ],
    passWithNoTests: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 4,
      },
    },
  },
  esbuild: {
    jsx: "preserve",
    sourcemap: "both",
  },
  plugins: [alloyPlugin()],
});
