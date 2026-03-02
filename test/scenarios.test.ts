/**
 * Scenario test harness for the http-client-csharp emitter.
 *
 * This file sets up the @typespec/emitter-framework scenario testing infrastructure
 * for end-to-end validation of the C# emitter output. Scenario tests are defined
 * as markdown files in the `test/scenarios/` directory, where each file contains:
 *
 * 1. A `## TypeSpec` section with the TypeSpec input specification
 * 2. One or more code blocks with C# expected output, annotated with file path
 *    and snippet type (e.g., `` ```csharp src/Generated/Models/Widget.cs class Widget ```  ``)
 *
 * The harness uses tree-sitter with the C# grammar to extract code snippets
 * (classes, interfaces, enums, functions) from the emitted output and compare
 * them against the expected snippets in the markdown files.
 *
 * To update scenario expectations after intentional output changes, run:
 *   SCENARIOS_UPDATE=true pnpm test -- test/scenarios.test.ts
 *
 * @module
 */
import {
  type LanguageConfiguration,
  createSnippetExtractor,
  executeScenarios,
} from "@typespec/emitter-framework/testing";
import { createRequire } from "node:module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Language, Parser } from "web-tree-sitter";
import { Tester } from "./test-host.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);

/**
 * Creates the C# language configuration for the tree-sitter snippet extractor.
 *
 * This is a local implementation equivalent to `createCSharpExtractorConfig()`
 * from `@typespec/emitter-framework/testing`. We provide our own because the
 * upstream function uses CJS `require.resolve()` which is unavailable in our
 * ESM-only vitest environment.
 */
async function createLocalCSharpExtractorConfig(): Promise<LanguageConfiguration> {
  await Parser.init();
  const wasmPath =
    require.resolve("tree-sitter-c-sharp/tree-sitter-c_sharp.wasm");
  const language = await Language.load(wasmPath);
  return {
    codeBlockTypes: ["cs", "csharp"],
    format: async (content: string) => content,
    language,
    nodeKindMapping: {
      classNodeType: "class_declaration",
      functionNodeType: "local_function_statement",
      interfaceNodeType: "interface_declaration",
      enumNodeType: "enum_declaration",
    },
  };
}

const csExtractorConfig = await createLocalCSharpExtractorConfig();
const snippetExtractor = createSnippetExtractor(csExtractorConfig);

const scenarioPath = join(__dirname, "scenarios");

await executeScenarios(
  Tester.import("@typespec/http").using("TypeSpec.Http"),
  csExtractorConfig,
  scenarioPath,
  snippetExtractor,
);
