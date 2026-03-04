import alloyPlugin from "@alloy-js/rollup-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/scenarios.test.ts"],
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
