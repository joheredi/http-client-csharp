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

## Design Decisions

### System.ClientModel builtins: Two createLibrary calls per namespace (Task 0.2.1)

**Chosen approach:** Separate `createLibrary()` calls for `System.ClientModel` and `System.ClientModel.Primitives`, both in a single file `src/builtins/system-client-model.ts`. Future tasks (0.2.2–0.2.6) extend the same file by adding types to the existing calls.

**Rejected approach:** Nested namespace descriptor (Primitives as a `kind: "namespace"` member inside SystemClientModel). This was rejected because it would make imports awkward (`SystemClientModel.Primitives.ClientPipeline` vs `SystemClientModelPrimitives.ClientPipeline`) and doesn't match how the alloy builtins organize sub-namespaces.

### Testing builtins: render() + SourceFile for using statement verification

Using `render(<Output><SourceFile>...</SourceFile></Output>)` from `@alloy-js/core` with C# components to test using statement generation, rather than going through the full TypeSpec→TCGC→emitter pipeline. This is faster, more focused, and doesn't depend on the emitter component tree.

### Cross-library type refs use arrow functions for lazy evaluation

Within `createLibrary()`, member `type` properties that reference types from the same or other library must use `() => library.Type` arrow function syntax. This is because the library variable isn't assigned yet during the `createLibrary()` call — the arrow function defers evaluation until first access.

## Design Decisions

### License header: utility function vs JSX component (Task 0.3.4)

**Chosen:** Utility function (`getLicenseHeader()`) returning a `\n`-joined string.
**Rejected:** JSX component wrapping the header. Unnecessary since plain strings work as `Children` in Alloy's SourceFile `header` prop.
**Why:** The header is static text — no dynamic JSX rendering needed. A function is simpler, testable without JSX, and the string works directly as the `header` prop value.

### Do NOT use Prose for SourceFile headers

The Alloy `<Prose>` component collapses all whitespace and word-wraps based on `printWidth`. Using it for the license header would destroy the exact line formatting. Pass strings or `code` template results directly to the `header` prop instead.

### @alloy-js/csharp SourceFile lacks `header` prop

The C# SourceFile (`@alloy-js/csharp`) does NOT accept a `header` prop, unlike the core SourceFile (`@alloy-js/core`). The core SourceFile has `header?: Children` for file-level headers, but the C# wrapper passes only `path`, `filetype`, `reference`, and format options to the core SourceFile — it does not pass `header` through.

**Workaround**: Render the header as raw text children at the top of the C# SourceFile's content. When there's no parent Namespace context, the SourceFile renders children directly without a namespace wrapper, so the header appears at the top of the file. Example: `{headerString}\n\n<Namespace name={...}>...`

### TCGC requires HTTP operations to include types in sdkPackage

TCGC's `sdkPackage.enums` and `sdkPackage.models` only include types that are reachable from HTTP operations. Defining a TypeSpec `enum` or `model` without an operation that uses `@route` will NOT make it appear in the TCGC output. Tests must define at least one HTTP operation (with `@route`) that references the type.

### Tests need `.importLibraries()` for HTTP decorators

The `createTester` with `libraries: ["@typespec/http"]` is necessary but NOT sufficient. You must also call `.importLibraries()` on the emitter tester to make `using TypeSpec.Http;` work in test TypeSpec code. Pattern: `HttpTester = ApiTester.emit("http-client-csharp").importLibraries()`.

### TCGC SdkEnumValueType uses `doc` and `summary` fields (not `description`)

The TCGC `SdkTypeBase` has `doc?: string` and `summary?: string` for documentation. There is no `description` field. For enum member doc comments, use: `member.summary ?? member.doc ?? fallback`.

## Design Decisions

### FixedEnumFile: Direct @alloy-js/csharp vs emitter-framework EnumDeclaration

**Chosen**: Direct @alloy-js/csharp `EnumDeclaration` + `EnumMember` with TCGC types.

**Rejected**: Emitter-framework's `EnumDeclaration` wrapper (which takes TypeSpec `Enum | Union` types).

**Why**: (1) The EF wrapper uses `getDocComments($, value)` which relies on TypeSpec `@doc` decorators with no fallback to member names — missing the legacy behavior. (2) The EF's `EnumMember` rendering can't be customized for int-backed enums that need explicit values. (3) Working directly with TCGC types avoids the `__raw` bridge and gives access to TCGC-specific fields like `doc`, `summary`, `isFixed`.

### Doc comments: Raw strings vs Alloy DocComment/DocSummary components

**Chosen**: Raw strings like `` `/// <summary> ${desc} </summary>` `` for single-line doc comments.

**Rejected**: `<DocComment><DocSummary>...</DocSummary></DocComment>` which produces multi-line format.

**Why**: The golden file uses single-line `/// <summary> Monday. </summary>`. The Alloy doc components produce multi-line `/// <summary>\n/// Monday.\n/// </summary>`. Raw strings give exact format control.

### Fixed Enum Value Rendering: Int-backed vs String/Float-backed (2026-02-28)

> **Rule**: Only int-backed fixed enums get explicit initialization values in the C# enum declaration (e.g., `One = 1`). String-backed and float-backed enums have no values — serialization is handled by extension methods.
>
> **Implementation**: Use `isSdkIntKind(sdkEnum.valueType.kind)` from TCGC to detect int-backed enums. Render ` = ${member.value}` as a text sibling after `<EnumMember>` in the JSX fragment.
>
> **Legacy reference**: `FixedEnumProvider.cs` line 77: `ValueExpression? initializationValue = IsIntValueType ? Literal(inputValue.Value) : null;`

### Extension methods not supported by Alloy's ParameterProps

The `ParameterProps` interface in `@alloy-js/csharp` does not include a `this` modifier for extension method parameters. To generate extension methods, render the full method signature as a raw string child of `ClassDeclaration` rather than using the `Method` component.

### Rendering multiline method bodies in Alloy

Use individual string children separated by `{"\n"}` for each line of a method body. Alloy indents each child to the current context level after a newline. Leading spaces in the string (e.g., `"    if (...)"`) add indentation relative to the base level. Avoid multi-line strings with embedded `\n` as only the first line gets base indentation.

### C# type mapping for enum backing types

Map TCGC scalar kinds to C# types:

- `"string"` → keyword: `string`, framework: `String`
- `"float32"` → keyword: `float`, framework: `Single`
- `"float64"` → keyword: `double`, framework: `Double`
- `"int32"` → keyword: `int`, framework: `Int32`
- `"int64"` → keyword: `long`, framework: `Int64`

The framework name is used in serialization method suffixes (e.g., `ToSerialString`, `ToSerialSingle`).

## Design Decisions

### Task 1.5.1: FixedEnumSerializationFile rendering approach

**Chosen:** Single component file with SerializeMethod/DeserializeMethod sub-components that render method bodies as line-by-line string children of ClassDeclaration.

**Rejected:** Using Alloy's Method component — ParameterProps lacks `this` modifier for extension methods. Also rejected using `code` template tags for entire methods — difficult to control indentation precisely for complex nested structures (switch expressions, if-chains).
