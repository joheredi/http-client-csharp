import alloyPlugin from "@alloy-js/rollup-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/smoke.test.ts"],
    passWithNoTests: true,
    testTimeout: 180000,
    hookTimeout: 180000,
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
