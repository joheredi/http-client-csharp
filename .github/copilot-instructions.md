# Copilot Instructions — http-client-csharp

## What This Is

A TypeSpec emitter that generates C# HTTP client code using the **Alloy framework**'s JSX-based code generation model. It rewrites the legacy two-phase pipeline (TypeSpec → JSON → C# generator) into a single-phase TypeScript emitter that directly outputs C# source files.

## Build / Test / Lint

```bash
pnpm run build          # Build with alloy build
pnpm test               # Run all tests (vitest)
pnpm test -- test/hello.test.ts   # Run a single test file
pnpm test -- -t "emit output.txt" # Run tests matching a name pattern
pnpm run lint           # ESLint (src/ and test/)
pnpm run format:check   # Prettier check
pnpm run format         # Prettier auto-fix
```

Tests use **vitest** with the `@alloy-js/rollup-plugin` for JSX transform. The vitest config scopes test discovery to `test/` only (submodules contain their own tests that must not run here).

## Architecture

### Rendering Pipeline

```
TypeSpec API Definition
  → TypeSpec Compiler (parses into Program)
  → $onEmit (src/emitter.tsx) — emitter entry point
  → JSX component tree using Alloy + @alloy-js/csharp
  → writeOutput() — renders tree to C# files
```

### Key Layers

- **`src/emitter.tsx`** — `$onEmit` entry point. Creates the `<Output>` root, wraps content in `<SourceDirectory>` / `<SourceFile>`, calls `writeOutput()`.
- **`src/components/`** — JSX components that map TypeSpec constructs to C# code. Each component returns Alloy elements (`ClassDeclaration`, `Method`, `Property`, etc.).
- **`src/lib.ts`** — TypeSpec library definition (diagnostics, emitter name).
- **`src/testing/`** — Test library registration for `@typespec/compiler/testing`.

### JSX for Code Generation

This project uses JSX not for UI but for **code generation**. The `tsconfig.json` sets `"jsxImportSource": "@alloy-js/core"`. Components in `.tsx` files return Alloy elements that render to C# source text.

```tsx
// Components produce C# output, not HTML
<ClassDeclaration public name="MyClient">
  <Property public name="BaseUrl" type="string" get set />
</ClassDeclaration>
```

### Testing Pattern

Tests use the `createTester` / `Tester` pattern from `@typespec/compiler/testing`:

```ts
// test/test-host.ts sets up the tester
const ApiTester = createTester(resolvePath(import.meta.dirname, ".."), {
  libraries: ["http-client-csharp"],
});
export const Tester = ApiTester.emit("http-client-csharp");

// Tests compile TypeSpec and assert on emitted output
const [{ outputs }, diagnostics] = await Tester.compileAndDiagnose(`op test(): void;`);
expect(outputs["output.txt"]).toBe("Hello world!\n");
```

## Key Conventions

### Imports

| What | Import From |
|------|-------------|
| `ClassDeclaration`, `Method`, `Property`, `SourceFile`, etc. | `@alloy-js/csharp` |
| `SourceDirectory`, `refkey`, `code`, `For`, `Show` | `@alloy-js/core` |
| `Output`, `writeOutput`, `useTsp` | `@typespec/emitter-framework` |
| `TypeExpression`, `efRefkey` | `@typespec/emitter-framework/csharp` |

**Always** import `SourceFile` from `@alloy-js/csharp` (not `@alloy-js/core`) — the C# version manages `using` directives automatically.

### Refkeys

Use `refkey()` to create cross-file symbol references. Alloy resolves them and auto-generates `using` statements:

```tsx
const myClassKey = refkey("MyClass");
<ClassDeclaration name="MyClass" refkey={myClassKey} />
// Reference from another file — Alloy adds the `using` automatically
<Property name="Instance" type={myClassKey} get set />
```

### The `code` Template Tag

Use `` code`...` `` from `@alloy-js/core` for inline C# expressions with interpolated refkeys/components:

```tsx
code`await ${tokenCredentialKey}.GetTokenAsync(
  new TokenRequestContext(${scopesKey}), ${cancellationTokenKey})`
```

### Component Conventions

- Components live in `src/components/` as `.tsx` files
- Props interfaces are defined alongside the component: `export interface FooProps {}`
- Use `<For>`, `<Show>`, `<Switch>`/`<Match>` for iteration and conditionals — avoid string concatenation or imperative loops for code output

## Known Gotchas

- **TCGC model pruning**: Models not referenced by any operation won't appear in `sdkPackage.models`. Always include an operation in test TypeSpec.
- **Alloy JSX is lazy**: `<MyComponent />` doesn't evaluate until rendering. Use `renderToString()` from `@alloy-js/core/testing` to trigger evaluation in tests.
- **Import ordering**: Alloy orders imports by registration/encounter order, not alphabetically. Match this order in test assertions.

## Reference

The file `alloy-csharp-guide.md` at the repo root is a comprehensive reference for the Alloy C# framework, covering components, rendering primitives, naming policies, contexts, STC, and testing patterns. Consult it when implementing new emitter features.

The `docs/knowledge.md` file contains accumulated troubleshooting notes and known issues.
