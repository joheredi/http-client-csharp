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

### Emitter options file includes interface + schema + defaults + resolver (Task 0.1.1)

**Chosen approach:** `src/options.ts` contains the `CSharpEmitterOptions` interface, `CSharpEmitterOptionsSchema` (JSON Schema), `defaultOptions`, and `resolveOptions()` in a single file.

**Why:** Matches the legacy emitter's `options.ts` pattern. Schema, defaults, and resolver are tightly coupled to the interface — splitting them would create unnecessary indirection.

**Excluded options:** `debug`, `generator-name`, `emitter-extension-path`, `update-code-model`, `sdk-context-options`, `logLevel` — these are all C#-generator-pipeline-specific and don't apply to the single-phase JSX emitter.

**Rejected:** Interface-only file (deferring schema/defaults to 0.1.2) — would require the next task to modify this file again for no benefit.

### TypeSpecLibrary runtime API (Task 0.1.2)

**Gotcha:** `TypeSpecLibrary` does NOT have a `definition` property. To access the emitter options schema at runtime, use `$lib.emitter?.options`. To access diagnostics, use `$lib.diagnostics` which is a map from code to `{ severity, messages }`.

### Diagnostics mirror legacy emitter minus .NET-specific codes (Task 0.1.2)

**Chosen approach:** Copy all diagnostic codes from the legacy emitter except `invalid-dotnet-sdk-dependency`, which validates .NET SDK installation — irrelevant for the single-phase emitter that doesn't invoke the C# generator.

**Why:** Keeps the diagnostic API surface compatible with the legacy emitter. Other emitter code can report the same diagnostics in the same way.

**Rejected:** Starting with minimal diagnostics and adding as needed — this would create churn across multiple tasks. Better to register all known diagnostics upfront.

### $onEmit creates SdkContext and passes it as props (Task 0.1.3)

**Chosen approach:** `$onEmit` creates the TCGC SdkContext via `createSdkContext(context, $lib.name)` and passes it as a prop to `HttpClientCSharpOutput`. Options are also resolved in `$onEmit` and passed as props.

**Why:** `createSdkContext` is async and must run before the JSX tree renders. Passing sdkContext and options as props gives task 0.3.2 (EmitterContext provider) something concrete to wrap in a context provider. This matches the legacy emitter pattern where SdkContext is created at the top level.

**Rejected:** Creating SdkContext inside components — impossible because `createSdkContext` is async and Alloy components are synchronous. Also rejected: not passing sdkContext to components — violates the acceptance criterion.

### Testing with custom emitter options requires a separate tester (Task 0.1.3)

**Gotcha:** `Tester.compileAndDiagnose()` only accepts `TestCompileOptions` which has `compilerOptions` (compiler-level flags), NOT emitter options. To test with custom emitter options, create a separate tester: `ApiTester.emit("http-client-csharp", { ...emitterOptions })`. The `ApiTester` is exported from `test/test-host.ts` for this purpose.
