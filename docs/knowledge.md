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

## Design Decisions — Extensible Enum Component

### Approach: StructDeclaration + raw strings

Chose to use alloy-js/csharp `StructDeclaration` for the outer struct declaration (preserves refkey for cross-file references) with raw strings for the body content. Rejected two alternatives:

1. **All raw strings** — would lose refkey support needed for model properties referencing enum types
2. **Full alloy components** — not possible because alloy-js/csharp lacks OperatorDeclaration and const field components

### Using directives are manual

The extensible enum component manually adds `using System;`, `using System.ComponentModel;`, and optionally `using System.Globalization;` as raw strings (same pattern as FixedEnumSerializationFile). Alloy's automatic using directive management only works when using alloy type references, not raw strings.

### TypeSpec unions model extensible enums

In TCGC, TypeSpec `union` types with literal members (e.g., `union Foo { string, Bar: "Bar" }`) are modeled as `SdkEnumType` with `isFixed=false`. Regular TypeSpec `enum` declarations produce `isFixed=true`. The emitter filters on `isFixed` to route to the appropriate component.

### [EditorBrowsable] on Equals(object) and GetHashCode

Per the ExtensibleEnumProvider source code, both `Equals(object)` and `GetHashCode()` receive `[EditorBrowsable(EditorBrowsableState.Never)]`. Some older Plugin golden files don't show this on GetHashCode, but the Spector golden files (current reference) do include it.

## Extensible Enum Serialization (Tasks 1.7.1-1.7.4)

**Key insight**: Extensible enum serialization files are completely different from fixed enum serialization files:

- **Fixed enums**: Use an `internal static partial class {EnumName}Extensions` with extension methods (ToSerial{Type}, To{EnumName})
- **Extensible enums**: Use a `public readonly partial struct` with a single `internal {type} ToSerial{FrameworkName}() => _value;` method

**String extensible enums**: No serialization file needed — they use `ToString()` directly. Filtering happens at the emitter level in `emitter.tsx`.

**Numeric type mapping for extensible enum serialization**:

- `int32` → `int` keyword, `Int32` framework name → `ToSerialInt32`
- `int64` → `long` keyword, `Int64` framework name → `ToSerialInt64`
- `float32` → `float` keyword, `Single` framework name → `ToSerialSingle`
- `float64` → `double` keyword, `Double` framework name → `ToSerialDouble`

## Design Decisions

### Extensible Enum Serialization Filtering (1.7.x)

**Chosen**: Filter at emitter level — `extensibleEnums.filter(e => e.valueType.kind !== "string")` before mapping to component.
**Rejected**: Internal filtering (component returns null for string types) — components shouldn't be created just to render nothing; this is cleaner and more explicit.

### TypeExpression Scalar Override Strategy (1.1.1)

**Chosen**: Document gaps in `src/utils/type-mapping.ts` with constant maps and lookup utilities. Task 1.1.2 will consume these to create a `CSharpTypeExpression` wrapper using `Experimental_ComponentOverrides`.
**Why**: Clean separation — 1.1.1 provides the data (which scalars differ, what the correct values are), 1.1.2 provides the mechanism (override config + wrapper component).
**Rejected**: Creating the override config in 1.1.1 — overlaps with 1.1.2's scope.

**Key gaps identified (8 scalars)**: `bytes`→BinaryData, `unknown`→BinaryData, `integer`→long, `numeric`→double, `float`→double, `plainDate`→DateTimeOffset, `plainTime`→TimeSpan, `safeint`→long.

**Important**: `BinaryData` is NOT in alloy-js/csharp builtins. It's in the `System` namespace and needs a custom library declaration. System builtins are available via `import System from "@alloy-js/csharp/global/System"` (has DateTimeOffset, TimeSpan, Uri but NOT BinaryData).

**Non-scalar gaps**: Arrays→`T[]` in EF but legacy uses `IList<T>`/`IReadOnlyList<T>` by direction (task 1.1.3). Non-nullable unions throw in EF but legacy maps to BinaryData (task 1.1.2).

## Design Decisions

### Task 1.1.2: Scalar Override Approach

**Chosen**: `Experimental_ComponentOverrides` provider with `forTypeKind("Scalar")` and `forTypeKind("Intrinsic")`.
**Rejected**: Standalone CSharpTypeExpression wrapper component.
**Why**: The override provider automatically applies to ALL `<TypeExpression>` usages in the subtree, including those inside emitter-framework components (like ClassDeclaration's type rendering). A wrapper would only work where explicitly used and miss framework-internal calls.

### Scalar Base Chain Resolution Gotcha

When overriding scalars via `forTypeKind("Scalar")`, the callback receives ALL scalars including built-in ones like `int32` that inherit from overridden parents like `integer`. The `getScalarOverride()` function uses `intrinsicNameToCSharpType` from `@typespec/emitter-framework/csharp` to distinguish:

- **Built-in scalars** (in intrinsic map): check only the direct name against the override map
- **User-defined scalars** (not in intrinsic map): walk the baseScalar chain to inherit overrides
  This prevents `int32 extends integer` from incorrectly picking up `integer→long`.

### System.BinaryData default import

`System` from `@alloy-js/csharp/global/System` is a **default export** (use `import System from ...` not `import { System } from ...`).

### Stream and IPAddress are not TypeSpec scalars

Stream and IPAddress were `InputPrimitiveType` kinds in the legacy emitter, but they don't exist as TypeSpec scalars or TCGC `SdkBuiltInKinds`. They must be handled at the model property generation level, not at the TypeExpression override level.

### TCGC decorators not available in test host (Task 1.2.1)

TCGC decorators like `@access(Access.internal)` from `Azure.ClientGenerator.Core` cannot be used in TypeSpec test code because the test host only registers `http-client-csharp` and `@typespec/http` as libraries. The `@azure-tools/typespec-client-generator-core` TypeSpec library isn't explicitly registered. Tests that need to exercise TCGC-specific behaviors should use indirect approaches (e.g., relying on TCGC's analysis of usage patterns) rather than TCGC decorators directly.

### Model file component pattern (Task 1.2.1)

**Chosen approach:** Single `ModelFile` component following the `FixedEnumFile` pattern — one component handles the file-level structure (SourceFile, header, namespace) and the class declaration. Child content is passed through for future tasks to populate with properties, constructors, etc.

**Why:** Consistent with existing enum components. Separation into sub-components (ModelDeclaration, etc.) can happen naturally as complexity grows. The `partial` keyword is always applied since every model class is split across a main file and a serialization file.

## Nullable Type Handling (Task 1.1.4)

- **TCGC `SdkNullableType`**: TCGC wraps types in `SdkNullableType { kind: "nullable", type: SdkType }` when the TypeSpec definition includes `| null`. This is orthogonal to the `optional` flag on properties.
- **`unwrapNullableType` before `TypeExpression`**: Always unwrap SdkNullableType before passing to TypeExpression, then control nullability via the `nullable` prop on Property. This prevents double `?` (T??).
- **Collection-never-nullable rule**: Arrays and dicts are NEVER nullable, even when wrapped in SdkNullableType. The isCollectionType check unwraps nullable before testing kind.
- **Reference type nullable with `#nullable disable`**: Under `#nullable disable`, `string?` = `string`. We still emit `?` for optional reference types to match legacy emitter output.

## Design Decisions

### Nullable Utility Design (Task 1.1.4)

**Chosen:** Three separate functions (`isPropertyNullable`, `unwrapNullableType`, `isCollectionType`) that compose independently.
**Rejected:** Single `resolvePropertyType()` returning `{ type, nullable }` — less flexible, harder to use in contexts where only one piece is needed.
**Reason:** Components may need just the nullable check (e.g., for constructor parameter validation) or just the unwrap (e.g., for serialization type dispatch). Separate functions are more reusable.

### Task 1.2.2: Model Property TypeExpression Pattern

TypeExpression from `@typespec/emitter-framework/csharp` expects TypeSpec compiler `Type`, NOT TCGC `SdkType`. Every SdkType has `__raw?: Type` on SdkTypeBase. Use `sdkType.__raw!` to pass to TypeExpression. This works for all types where TCGC preserves the raw reference (scalars, models, enums). For nullable types, call `unwrapNullableType()` first to strip SdkNullableType, then access `.__raw!` on the inner type.

### Task 1.2.2: Property Accessor Pattern

Model property setters are determined by model usage flags (UsageFlags bitmap):

- Input-only (Input flag only): get-only — constructor handles initialization
- Output-only (Output flag only): get-only — deserialization populates
- Input+Output (both flags): get+set — user modification + server population
  Use bitwise AND to check: `(usage & UsageFlags.Input) !== 0 && (usage & UsageFlags.Output) !== 0`

### Task 1.2.2: Doc Comment Format

Legacy emitter uses `/// <summary> text </summary>` (single-line with spaces inside tags). The Alloy Property component's `doc` prop renders `/// text` without summary tags. Wrap doc text in `<summary> ${text} </summary>` before passing to the Property's `doc` prop.

### Task 1.2.2: Property Spacing in ClassDeclaration

Multiple properties rendered inside ClassDeclaration need explicit newline separation. Use `<For each={...} hardline>` from `@alloy-js/core` to add newline breaks between property renderings.

### Task 1.2.3: Property Setter Rules (Full Logic)

The `propertyHasSetter` function in ModelProperty.tsx now implements the full legacy PropertyProvider.PropertyHasSetter logic. Order matters:
1. Read-only properties (visibility=[Read]) → never have setters
2. Output-only models → never have setters
3. Input-only models, required properties → no setter (constructor handles it)
4. Input-only models, optional properties → HAS setter (object initializer syntax)
5. Collection properties → never have setters (mutation via Add/Remove)
6. Everything else → has setter

Key insight: the old `propertyHasSetter(modelUsage)` was too simple — it treated all input-only properties as get-only. The legacy emitter only makes *required* input-only properties get-only; optional ones need setters for `new Model(required) { Optional = val }` syntax.

### Task 1.2.3: Property Utility Functions in src/utils/property.ts

Created utility functions for required/optional analysis that downstream constructor tasks (1.2.4, 1.2.5) should import:
- `isConstructorParameter(prop, isStruct?)` — whether prop is a public ctor param
- `propertyRequiresNullCheck(prop)` — whether prop needs Argument.AssertNotNull (required reference types only)
- `getPropertyInitializerKind(prop)` — returns one of: change-tracking-list, change-tracking-dict, to-list, to-dict, direct-assign, none
- `isCSharpReferenceType(type)` — string, model, bytes, url, unknown map to C# reference types
- `isPropertyReadOnly(prop)` — visibility=[Read] only

## Design Decisions

### Task 1.2.3: Pure utility functions over component-based approach
Chose pure utility functions in `src/utils/property.ts` over embedding logic in JSX components.
- **Chosen**: Utility functions — easier to unit test, importable by constructor tasks, matches nullable.ts pattern
- **Rejected**: Component-based approach — would couple initialization logic to rendering, harder to test
