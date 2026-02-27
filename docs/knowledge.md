# Knowledge Base

## Gotchas

### Vitest runs submodule tests if not scoped

The vitest config MUST include `test: { include: ["test/**/*.test.{ts,tsx}"] }` to scope test discovery. Without this, vitest picks up 920+ test files from submodules, all of which fail (missing deps, wrong vitest version, etc.). This was fixed in task 0.1.4.

### All TypeSpec ecosystem packages are already installed

Due to `autoInstallPeers: true` in pnpm settings and transitive dependencies from `@typespec/emitter-framework`, packages like `@alloy-js/csharp`, `@typespec/http`, `@typespec/rest`, and `@azure-tools/typespec-client-generator-core` are already present in `node_modules` even before explicitly adding them to `package.json`. Adding them makes the dependency relationship explicit.

## Design Decisions

### Dependencies follow the legacy emitter pattern (Task 0.1.4)

**Chosen approach:** TypeSpec ecosystem packages (`@typespec/http`, `@typespec/rest`, `@azure-tools/typespec-client-generator-core`) are `peerDependencies` (with matching devDependencies for testing). Alloy framework packages (`@alloy-js/core`, `@alloy-js/csharp`) are direct `dependencies`.

**Why:** This matches the legacy emitter's package.json structure. TypeSpec packages are provided by the user's project environment; Alloy packages are our implementation detail.

**Rejected:** Putting TCGC as a direct dependency — this would cause version conflicts if multiple emitters in the same project use different TCGC versions.

### Root output component wraps emitter-framework Output (Task 0.3.1)

**Chosen approach:** `HttpClientCSharpOutput` is a self-contained component that wraps `Output` from `@typespec/emitter-framework`. It accepts `program` as a prop and configures name policy + format options internally. `emitter.tsx` stays thin — just creates the component and calls `writeOutput`.

**Why:** Keeps all C# rendering configuration in one place. The component is the single source of truth for name policy and format options. Easy to test in isolation.

**Rejected:** Making HttpClientCSharpOutput a content component inside a separately-configured `Output` in emitter.tsx — this splits configuration across two files and makes the component less self-contained.

### Use Output from @typespec/emitter-framework, not @alloy-js/core

**Key difference:** The emitter-framework `Output` wraps core `Output` and adds a `TspContext.Provider` with the TypeSpec `Program`. This lets all child components call `useTsp()` to access the program and typekit. The core `Output` does NOT provide TspContext.

**Import:** `import { Output } from "@typespec/emitter-framework";` (never from `@alloy-js/core` for the root).
