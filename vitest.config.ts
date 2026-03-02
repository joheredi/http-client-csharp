import alloyPlugin from "@alloy-js/rollup-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "preserve",
    sourcemap: "both",
  },
  plugins: [alloyPlugin()],
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    poolOptions: {
      forks: {
        maxForks: 4,
      },
    },
  },
});
