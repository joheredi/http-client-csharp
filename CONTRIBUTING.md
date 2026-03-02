# Contributing to http-client-csharp

Thank you for your interest in contributing! This guide covers development setup, conventions, and workflows.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 24.x or later
- [pnpm](https://pnpm.io/) 10.x (auto-resolved via `packageManager` in `package.json`)
- [.NET SDK](https://dotnet.microsoft.com/) 9.0+ (only for smoke tests)

### Getting Started

```bash
git clone <repo-url>
cd http-client-csharp
pnpm install
pnpm build
pnpm test
```

## Build / Test / Lint

```bash
pnpm build              # Build with alloy build
pnpm test               # Run all tests (vitest)
pnpm test:unit          # Unit tests only (excludes scenarios and smoke)
pnpm test:scenario      # Scenario tests only (markdown-based expected output)
pnpm test:smoke         # Smoke tests only (requires dotnet SDK)
pnpm test -- test/hello.test.ts   # Run a single test file
pnpm test -- -t "some pattern"    # Run tests matching a name pattern
pnpm lint               # ESLint (src/ and test/)
pnpm format             # Prettier auto-fix
pnpm format:check       # Prettier check (no writes)
```

## Workflow

### Before Committing

Always run these before committing:

```bash
pnpm format
pnpm lint
```

### Before Marking Work as Done

Verify both build and tests pass:

```bash
pnpm build && pnpm test
```

### PR Previews

Every pull request automatically publishes a preview package via [pkg.pr.new](https://pkg.pr.new). A comment with an install link is posted on the PR once all tests pass.

## Testing

Tests live in `test/` and are run with [vitest](https://vitest.dev/). The vitest config scopes discovery to `test/` only (submodules have their own tests).

### Test Categories

| Category     | Script               | Description                                                      |
| ------------ | -------------------- | ---------------------------------------------------------------- |
| **Unit**     | `pnpm test:unit`     | Component-level tests — compile TypeSpec, assert on C# output    |
| **Scenario** | `pnpm test:scenario` | Markdown-based snapshot tests comparing full file output         |
| **Smoke**    | `pnpm test:smoke`    | End-to-end: emit C# → `dotnet build` to verify compilable output |

### Writing Unit Tests

Tests use the `Tester` / `HttpTester` pattern from `test/test-host.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HttpTester } from "./test-host.js";

describe("MyFeature", () => {
  it("generates expected output", async () => {
    const [{ outputs }, diagnostics] = await HttpTester.compileAndDiagnose(`
      using TypeSpec.Http;

      @service
      namespace TestService;

      model Widget {
        name: string;
      }

      @route("/widgets")
      op getWidget(): Widget;
    `);

    expect(diagnostics).toHaveLength(0);

    // Use endsWith with leading slash for precise file matching
    const fileKey = Object.keys(outputs).find((k) => k.endsWith("/Widget.cs"));
    expect(fileKey).toBeDefined();
    expect(outputs[fileKey!]).toContain("public partial class Widget");
  });
});
```

**Important:** Use `HttpTester` (not `Tester`) when your TypeSpec uses HTTP decorators like `@route`, `@query`, etc.

### Scenario Tests

Scenario tests compare emitted output against expected snippets defined in markdown files under `test/scenarios/`. To update expectations after intentional output changes:

```bash
SCENARIOS_UPDATE=true pnpm test -- test/scenarios.test.ts
```

### Common Testing Pitfalls

- **TCGC model pruning**: Models not referenced by any operation won't appear in the output. Always include an operation in test TypeSpec.
- **File key collisions**: When finding output files by name, use `k.endsWith("/Widget.cs")` instead of `k.includes("Widget")`. Infrastructure files like `SerializationFormat.cs` or `ModelSerializationExtensions.cs` will match partial names (e.g., `"Format"` matches `SerializationFormat`, `"Mode"` matches `Model`).
- **Import ordering**: Alloy orders `using` directives by encounter order, not alphabetically. Match this in assertions.

## Code Conventions

### JSX Components

Components live in `src/components/` as `.tsx` files. Each component maps a TypeSpec construct to C# code:

```tsx
export interface MyComponentProps {
  model: SdkModelType;
  options: ResolvedCSharpEmitterOptions;
}

export function MyComponent(props: MyComponentProps) {
  return (
    <ClassDeclaration public name={props.model.name}>
      <Property public name="Name" type="string" get set />
    </ClassDeclaration>
  );
}
```

**Key conventions:**

- Props interfaces are defined alongside the component
- Use `<For>`, `<Show>`, `<Switch>`/`<Match>` for iteration and conditionals
- Use `` code`...` `` for inline C# expressions with interpolated refkeys
- Use `refkey()` for cross-file symbol references (Alloy auto-generates `using` directives)

### Imports

| What                                                         | Import From                          |
| ------------------------------------------------------------ | ------------------------------------ |
| `ClassDeclaration`, `Method`, `Property`, `SourceFile`, etc. | `@alloy-js/csharp`                   |
| `SourceDirectory`, `refkey`, `code`, `For`, `Show`           | `@alloy-js/core`                     |
| `Output`, `writeOutput`, `useTsp`                            | `@typespec/emitter-framework`        |
| `TypeExpression`, `efRefkey`                                 | `@typespec/emitter-framework/csharp` |

**Always** import `SourceFile` from `@alloy-js/csharp` (not `@alloy-js/core`) — the C# version manages `using` directives automatically.

### ESLint

The ESLint config allows underscore-prefixed variables to be unused:

```ts
// OK — _result is intentionally unused (destructuring pattern)
const [_result, diagnostics] = await Tester.compileAndDiagnose(`...`);

// OK — _index is intentionally unused (rest pattern)
return params.map(({ priority: _priority, index: _index, ...rest }) => rest);
```

## Project Architecture

### Rendering Pipeline

```
TypeSpec API Definition
  → TypeSpec Compiler (parses into Program)
  → $onEmit (src/emitter.tsx)
  → JSX component tree using Alloy + @alloy-js/csharp
  → writeOutput() — renders tree to C# files
```

### Key Entry Points

- **`src/emitter.tsx`** — `$onEmit` function. Creates TCGC `SdkContext`, resolves options, builds the JSX tree, and writes output.
- **`src/components/HttpClientCSharpOutput.tsx`** — Root component that wraps everything in `<Output>` with C# name policy.
- **`src/lib.ts`** — TypeSpec library definition (emitter name, diagnostics, option schema).
- **`src/options.ts`** — Emitter options interface, JSON schema, defaults, and resolver.

### Key Dependencies

| Package                                              | Role                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `@alloy-js/core`                                     | JSX rendering engine, `code` template tag, `refkey`              |
| `@alloy-js/csharp`                                   | C# language support (ClassDeclaration, Method, SourceFile, etc.) |
| `@typespec/emitter-framework`                        | TypeSpec integration (Output, writeOutput, useTsp)               |
| `@azure-tools/typespec-client-generator-core` (TCGC) | TypeSpec → SDK model transformation                              |

## Reference

- **`docs/knowledge.md`** — Accumulated troubleshooting notes, gotchas, and design decisions
- **`alloy-csharp-guide.md`** — Comprehensive Alloy C# framework reference
- **`.github/copilot-instructions.md`** — Condensed conventions for AI-assisted development
