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

Key insight: the old `propertyHasSetter(modelUsage)` was too simple — it treated all input-only properties as get-only. The legacy emitter only makes _required_ input-only properties get-only; optional ones need setters for `new Model(required) { Optional = val }` syntax.

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

## Constructor Generation (Task 1.2.4)

### Naming Policy Categories

The CSharp naming policy (`useCSharpNamePolicy()`) has these relevant categories:

- `"class-property"` → PascalCase (for property names in constructor body assignments)
- `"parameter"` → camelCase (for constructor parameter names)
- `"class"` → PascalCase (for class/model names)
- Default falls to `changecase.camelCase(name)`

### Constructor Component from @alloy-js/csharp

- `<Constructor>` accepts `AccessModifiers` props (`public`, `private`, `protected`, `internal`)
- Setting both `private={true}` and `protected={true}` renders as `"protected private"` (modifier order follows the array: public, protected, private, internal, file). This is valid C# but non-conventional (conventional is `private protected`).
- `parameters` prop accepts `ParameterProps[]` where `type` is `Children` (can be JSX)
- Body is rendered as `children` inside a `<Block newline>` — Alloy handles indentation
- Empty body renders as `{}` on same line (not `{\n}`)

### TypeExpression for Parameter Types

- Use `unwrapNullableType()` before passing to TypeExpression
- For nullable params, compose with JSX fragment: `<>{baseType}?</>`
- `type.__raw!` is needed to get the TypeSpec raw type from TCGC SdkType

### Design Decision: <Constructor> vs Raw Strings

Chose `<Constructor>` component over raw strings (like ExtensibleEnumFile does) because:

1. More idiomatic Alloy — leverages the component's built-in parameter rendering
2. Better composability — parameters are structured data, not string concatenation
3. Automatic handling of braces and indentation
   Tradeoff: modifier ordering is `"protected private"` instead of `"private protected"`, but both compile identically in C#.

## Alloy Constructor Overloading Limitation

**Problem**: The `<Constructor>` component from `@alloy-js/csharp` creates a `MethodSymbol` that triggers automatic name deduplication. When two constructors exist in the same class (valid C# — constructor overloading), the second constructor gets renamed with a `_2` suffix (e.g., `Widget_2(...)` instead of `Widget(...)`).

**Root cause**: Alloy's `SymbolTable.defaultConflictHandler` renames symbols with the same `originalName` by appending `_N`.

**Solution**: Created `OverloadConstructor` in `ModelConstructors.tsx` that mirrors the `Constructor` component but sets `ignoreNameConflict: true` on the `MethodSymbol` options. All necessary internals (`useNamedTypeScope`, `MethodSymbol`, `computeModifiersPrefix`, `getAccessModifier`, `MethodScope`, `MemberDeclaration`, `MemberName`, `Block`, `Parameters`) are publicly exported from `@alloy-js/csharp` and `@alloy-js/core`.

**When to use**: Always use `OverloadConstructor` for the second (and subsequent) constructors in a class. The first constructor can use the standard `<Constructor>`.

## Design Decisions

### Serialization Constructor (Task 1.2.5)

**Chosen approach**: Keep serialization constructor logic in `ModelConstructors.tsx` alongside the public constructor.

**Why**: The component is already named `ModelConstructors` (plural). All constructor logic stays co-located, reducing indirection. The two constructors share utilities (`buildParameters` pattern, naming policy).

**Rejected**: Creating a separate `SerializationConstructor.tsx` component — would add unnecessary file and import overhead for a closely related concern.

## Design Decisions

### Task 1.3.1: Abstract base model — minimal modification approach

**Chosen:** Modify existing ModelFile.tsx + ModelProperty.tsx rather than creating a separate DiscriminatorModel.tsx component.
**Why:** The changes are small (abstract flag + internal access for discriminator property) and don't warrant a new component. All the infrastructure (isModelAbstract, getConstructorAccessModifiers) already existed in ModelConstructors.tsx.
**Rejected:** Creating DiscriminatorModel.tsx as PRD suggested — overkill for 2 small changes across 2 files.

## Gotchas

### Alloy modifier ordering: `protected private` not `private protected`

When setting both `private: true` and `protected: true` on a Constructor/ClassDeclaration, Alloy outputs `protected private` (not `private protected`). Both are valid C# with identical semantics. Tests should accept either ordering via regex: `/(?:private\s+protected|protected\s+private)/`.

### TCGC discriminator fields on SdkModelType

- `discriminatorProperty?: SdkModelPropertyType` — the property that discriminates (on base model)
- `discriminatedSubtypes?: Record<string, SdkModelType>` — map of subtypes (on base model)
- `discriminatorValue?: string` — the value for a specific derived model
- `baseModel?: SdkModelType` — reference to parent model (on derived model)
- `property.discriminator: boolean` — flag on individual properties marking them as discriminators
- There is NO `isAbstract` field — abstractness is derived from having discriminatorProperty + discriminatedSubtypes

### Refkey mismatch between custom declarations and TypeExpression

**Critical gotcha discovered in task 1.3.2**: `TypeExpression` from `@typespec/emitter-framework/csharp` resolves type references using `efRefkey(rawType)`, which is `refkey(Symbol.for("emitter-framework:csharp"), rawType)`. Custom declaration components (FixedEnumFile, ExtensibleEnumFile, ModelFile) that use plain `refkey(sdkType)` will produce `<Unresolved Symbol>` errors when their types are referenced via `TypeExpression`.

**Fix**: Use `efCsharpRefkey(sdkType.__raw!)` from `src/utils/refkey.ts` as the `refkey` prop for declarations. For `EnumDeclaration` (which accepts `Refkey[]`), you can also use `declarationRefkeys(refkey(sdkType), sdkType.__raw)` to register both keys.

**Root cause**: `efRefkey` is NOT publicly exported from `@typespec/emitter-framework/csharp`. Our utility recreates it using the same `Symbol.for("emitter-framework:csharp")` prefix.

**Any new declaration component** (ClassDeclaration, StructDeclaration, EnumDeclaration) must use `efCsharpRefkey` or `declarationRefkeys` from `src/utils/refkey.ts`.

## Design Decisions

### Derived Model Discriminator Constructor Chaining (Task 1.3.3)

**Approach chosen**: Extend OverloadConstructor with `baseInitializer` prop, separate `DerivedModelConstructors` component.
**Why**: Clean separation of base/derived model logic. The `baseInitializer` prop renders `: base(...)` between `<Parameters>` and `<Block>` in the OverloadConstructor.
**Rejected**: Inline base call in constructor body — would render inside `{}` block, syntactically wrong for C# constructor initializers.

### Enum Discriminator Literal Reference

**Approach chosen**: Compose `EnumType.MemberName` using `efCsharpRefkey(enumType.__raw!) + "." + namePolicy.getName(memberName, "enum-member")`.
**Why**: `refkey(enumValue)` from `@alloy-js/core` doesn't resolve across files when the enum declaration is in a separate file. Using `efCsharpRefkey` for the enum TYPE works because it matches the emitter-framework's refkey derivation used in FixedEnumFile/ExtensibleEnumFile.
**Rejected**: `refkey(discriminatorProp.type)` — produced `<Unresolved Symbol>` in output.

### Discriminator Property Filtering on Derived Models

Derived models in TCGC include the discriminator override property in their `properties` array (e.g., `kind: "cat"` on Cat). This property must be filtered out from:

1. Own constructor parameters (not exposed to users)
2. Own serialization parameters (already in base params)
3. Own serialization assignments (base ctor handles it)
4. Property declarations (inherited from base class)
   Use `!p.discriminator` filter on `type.properties` to get the "own non-discriminator properties".

## Design Decisions

### Task 1.3.4: Unknown discriminator variant — reuse OverloadConstructor

**Chosen:** Export and reuse `OverloadConstructor` + `buildSerializationParameters` from ModelConstructors.tsx in the new `UnknownDiscriminatorModel.tsx` component.
**Why:** The Unknown variant's constructor needs `: base(...)` chaining which only OverloadConstructor supports (standard `<Constructor>` from alloy-csharp doesn't have `baseInitializer`). The `buildSerializationParameters` produces exactly the right parameter list. Minimal code duplication.
**Rejected:** Creating a new `BaseChainedConstructor` component — would duplicate OverloadConstructor logic for no benefit. Also rejected extending ModelFile.tsx — the Unknown variant has fundamentally different structure (internal, no properties, single constructor) that warrants a separate component.

### Unknown variant is emitter-synthesized, not from TCGC

The `Unknown{BaseName}` class does NOT exist in TCGC's `discriminatedSubtypes` map. It's synthesized by the C# emitter in `emitter.tsx` by filtering `models` with `isModelAbstract()`. The legacy emitter does this in `InputModelType.cs` (line 108-128) where it creates a synthetic `InputModelType` with discriminatorValue="unknown". Our approach generates the file directly from the abstract base model's metadata without creating intermediate model objects.

### String vs enum discriminator null-guard patterns

- String discriminators: `paramName ?? "unknown"` (null-coalescing, because strings are reference types)
- Enum discriminators: `paramName != default ? paramName : "unknown"` (default-check, because extensible enums are structs/value types that can't be null, and "unknown" string gets implicitly converted to the enum type via its implicit operator)

### Task 1.3.6: Multi-level discriminator hierarchy handling

**Five interconnected bugs fixed:**

1. `isModelAbstract` must check `discriminatorValue === undefined` (legacy: `DiscriminatorValue is null`). Intermediate models with BOTH discriminated subtypes AND a discriminator value are NOT abstract.
2. Use `isBaseDiscriminatorOverride(p)` (checks `p.discriminator && (p.type.kind === "constant" || p.type.kind === "enumvalue")`) instead of `p.discriminator` when filtering derived model properties. This keeps own discriminator properties (Shark's `sharktype: string`) while filtering base overrides (`kind: "shark"`).
3. Constructor params must walk the FULL base hierarchy (`collectBaseNonDiscCtorParams`), not just the immediate base. For 3+ level hierarchies, the immediate base may not expose all ancestor params.
4. Base call argument order must match the base model's ctor param order. Use `buildPublicBaseInitializer()` which iterates base ctor params and substitutes the discriminator literal at the correct position.
5. Serialization ctor params must be computed recursively (`computeSerializationCtorParams`). This positions `additionalBinaryDataProperties` between base-model params and derived-model params.

**`hasDiscriminatedSubtypes` vs `isModelAbstract`:**

- `isModelAbstract` → class should be `abstract` (no discriminatorValue, has subtypes)
- `hasDiscriminatedSubtypes` → Unknown variant should be generated (has subtypes, regardless of discriminatorValue)
  Both functions exist in ModelConstructors.tsx and serve different purposes.

**CRITICAL: vitest resolves through dist/, not source.**
After changing source files in src/, always run `pnpm build` before `pnpm test`. The vitest config uses esbuild with JSX preserve + alloy plugin, but `package.json` exports point to `dist/src/index.js`. Without rebuilding, tests run against stale compiled code.

## Partial Class Declarations Across Files (namekey pattern)

**Problem**: When two `<ClassDeclaration>` components have the same name in the same namespace (e.g., ModelFile and ModelSerializationFile for the same model), Alloy's symbol deduplication renames the second one with a `_2` suffix.

**Solution**: Use `namekey(modelName, { ignoreNameConflict: true })` from `@alloy-js/core` as the `name` prop on the second ClassDeclaration. Since the prop type is `string`, use `as unknown as string` type assertion. This is the same pattern as `OverloadConstructor` in `ModelConstructors.tsx` (which uses `ignoreNameConflict` on `MethodSymbol`).

**Why**: C# partial classes require multiple declarations with the same name. Alloy doesn't natively understand partial class semantics, so `ignoreNameConflict` tells it to allow duplicate names.

**Code pattern**:

```tsx
import { namekey } from "@alloy-js/core";
const partialName = namekey(modelName, { ignoreNameConflict: true });
<ClassDeclaration name={partialName as unknown as string} partial ... />
```

## Alloy SourceFile Using Directive Ordering

**Behavior**: Alloy's `SourceFile` from `@alloy-js/csharp` auto-collects `using` directives from referenced builtins and places them at the very top of the file, BEFORE any manually rendered content (like the license header).

**Impact**: The generated file has `using ...;` before `// <auto-generated/>`, while legacy golden files have the header first. This is a cosmetic difference that affects all files with auto-resolved using directives.

**Status**: Accepted difference. Not blocking. May need framework-level fix in Alloy if exact golden file ordering is required.

## TCGC Model Namespace Property

**Important**: The `SdkModelType.namespace` property returns the raw TypeSpec namespace (e.g., `TestNamespace`), NOT a modified version with `.Models` suffix. The `.Models` suffix visible in legacy golden files like `SampleTypeSpec.Models` is because the TypeSpec definition itself uses that namespace structure.

**Implication**: Tests should match the actual namespace from the TypeSpec definition, not assume any suffix is appended.

## Design Decisions

### ModelSerializationFile Interface Type (Task 2.1.1)

- **Chosen**: Use `code` template with `SystemClientModelPrimitives.IJsonModel` builtin refkey: `` code`${SystemClientModelPrimitives.IJsonModel}<${modelName}>` ``
- **Why**: Auto-generates `using System.ClientModel.Primitives;` via Alloy's SourceFile. Idiomatic Alloy pattern.
- **Rejected**: Plain string `IJsonModel<${modelName}>` — doesn't trigger automatic using statement generation.

## DeserializationConstructor Patterns (Task 2.1.3)

- **OverloadConstructor for serialization file ctors**: Use `OverloadConstructor` (from `ModelConstructors.tsx`) rather than the standard `Constructor` for any constructor placed in the `.Serialization.cs` partial class. The `ignoreNameConflict: true` on its MethodSymbol prevents Alloy from appending `_2` suffixes when the same model already has constructors in the main `.cs` partial class.
- **computePublicCtorParams is now exported**: Use `computePublicCtorParams(model)` from `ModelConstructors.tsx` to determine a model's public initialization constructor parameters. Useful for deciding whether a parameterless constructor already exists.
- **Conditional constructor generation**: `needsDeserializationConstructor(model)` returns true only when `computePublicCtorParams(model).length > 0`. This prevents C# compiler errors from duplicate parameterless constructors.

## Design Decisions

### JsonModelWriteCore: Raw strings + code templates vs Method component (Task 2.2.1)

**Chosen**: Raw strings with `code` template interpolation (following FixedEnumSerializationFile pattern)
**Rejected**: `<Method>` component from @alloy-js/csharp
**Why**: The `<Method>` component uses K&R brace style (`method() {`) for empty methods. Raw strings give full control over Allman-style formatting (`method()\n{`) matching golden files. The `code` template enables refkey interpolation for auto-using directives while keeping manual formatting control.

### System.Text.Json and System builtins (Task 2.2.1)

Created `src/builtins/system.ts` and `src/builtins/system-text-json.ts` as separate files following the existing `system-client-model.ts` pattern. These enable auto-generated `using` directives when Utf8JsonWriter, FormatException, etc. are referenced via refkeys in `code` templates. Future serialization tasks should use these builtins rather than manual `using` strings.

## Design Decisions

### Property Serialization Architecture (Task 2.2.3)

- **Chosen**: Property iteration is INSIDE `JsonModelWriteCore` component (iterates `model.properties`, renders `WritePropertySerialization` for each)
- **Why**: The component already has the model type prop; keeping iteration internal is cohesive and avoids coupling emitter.tsx to serialization details
- **Rejected**: Passing property writes as children from `emitter.tsx` — makes emitter too complex, couples it to serialization internals
- **Extension point**: `getWriteMethodInfo()` in `PropertySerializer.tsx` returns `WriteMethodInfo { methodName, formatArg? }` or `null`. Handles primitives, DateTime (with encoding), plainDate, plainTime. Future tasks (Duration 2.2.5, Bytes 2.2.6, etc.) should add cases to this function.

### DateTime Serialization (Task 2.2.4)

- **Chosen**: Evolve `getWriteMethodName` → `getWriteMethodInfo` returning `{ methodName, formatArg? }`
- **Why**: Clean single return type covers both format-less primitives and format-aware types (DateTime, Duration, bytes)
- **Encoding mapping**: rfc3339→"O", rfc7231→"R", unixTimestamp→"U", plainDate→"D", plainTime→"T"
- **Format-aware overloads**: The generated `ModelSerializationExtensions` class provides `WriteStringValue(Utf8JsonWriter, DateTimeOffset, string)` and `WriteNumberValue(Utf8JsonWriter, DateTimeOffset, string)` that use `TypeFormatters.ToString()` internally

## Gotchas

### CSharp Name Policy Element Types

- Use `"class-property"` (not `"property"`) with `useCSharpNamePolicy().getName()` for PascalCase property names
- Valid elements: `"class"`, `"constant"`, `"variable"`, `"struct"`, `"enum"`, `"enum-member"`, `"function"`, `"interface"`, `"record"`, `"class-member-private"`, `"class-member-public"`, `"class-method"`, `"class-property"`, `"parameter"`, `"type-parameter"`, `"namespace"`

### Constant Type Unwrapping for Serialization

- When determining the writer method for a property, unwrap both nullable (`SdkNullableType`) AND constant (`SdkConstantType`) to get the underlying primitive kind
- Constants still serialize via their property accessor (e.g., `writer.WriteStringValue(Kind)`), but the writer method selection needs the underlying type

## Design Decisions

### Duration serialization: valueTransform pattern (Task 2.2.5)

- `WriteMethodInfo` now has an optional `valueTransform?: (propertyName: string) => string` callback
- When present, the property name is passed through it before rendering (e.g., `name → name.TotalSeconds`)
- This pattern will be reused for bytes serialization (2.2.6) and any future type that needs value wrapping
- The `INTEGER_KINDS` set determines whether `Convert.ToInt32()` wrapping is needed for numeric duration encodings
- DurationKnownEncoding values are: `"ISO8601"`, `"seconds"`, `"milliseconds"` (from `@typespec/compiler`)
- `SdkDurationType` has `encode` (the encoding) and `wireType` (the target type, e.g., int32, float64)

## Known Gap: Optional Value Type .Value Accessor

Optional nullable value types (e.g., `count?: int32` → C# `int?`) need `.Value` inside `Optional.IsDefined` guard blocks to unwrap `Nullable<T>`, but the current code only adds `.Value` for required-nullable properties. This means optional int/bool/DateTimeOffset properties generate `writer.WriteNumberValue(Count)` instead of `writer.WriteNumberValue(Count.Value)`. The generated C# won't compile for these cases. This should be addressed in a future task.

## Design Decisions

### Task 2.2.12: Required-Nullable Write Pattern

**Approach chosen**: Extended `needsOptionalGuard()` to also trigger for required-nullable properties, reusing the same guard infrastructure. Added else branch rendering inside `WritePropertySerialization` component.

**Why**: Both optional and required-nullable properties use `Optional.IsDefined()` guards — the only difference is the else branch. This minimizes code changes and reuses existing infrastructure cleanly.

**Rejected**: Separate rendering path with three code paths (required, optional, required-nullable). Would duplicate guard rendering logic and be harder to maintain.

### JsonDeserialize component pattern (Task 2.3.1)

**Approach chosen**: Raw strings + `code` template (same as `JsonModelWriteCore`).
**Why**: Full control over Allman-style formatting. Consistent with other serialization components.
**Structure**: The component generates the method signature + null check, with a `children` slot for body content. Subsequent tasks (2.3.2–2.3.13) will populate the body incrementally.
**JsonValueKind usage**: `JsonValueKind.Null` is raw text in the method body. The `using System.Text.Json;` directive is auto-generated by referencing `SystemTextJson.JsonElement` in the method signature. No separate builtin declaration is needed for `JsonValueKind`.
**Emitter integration**: Added as a child of `ModelSerializationFile` in `emitter.tsx`, after `JsonModelWriteCore` and `DeserializationConstructor`, separated by `{"\n\n"}`.

## Task 2.1.2 — Interface Determination Design Decision

### Approach chosen: Inline helper in ModelSerializationFile.tsx

- `getSerializationInterfaces(type, modelName)` checks TCGC `UsageFlags` to determine interface
- JSON models → `IJsonModel<T>`, XML-only → `IPersistableModel<T>`, fallback → `IJsonModel<T>`
- Function is exported for downstream reuse (2.1.4, 2.1.5, 2.5.x)

### Rejected: Separate utility file

- Overkill for ~20 lines of logic. Can be extracted later if usage grows.

### Key patterns

- To create XML-only models in TypeSpec tests: use `@header("content-type") contentType: "application/xml"` on body param
- TCGC sets `UsageFlags.Xml` when content type matches `application/xml` or `text/xml`
- Unknown discriminator models should bind interface type to base model (not self) — deferred to when Unknown serialization files are implemented
- Model-as-struct needs `<object>` interface variants (IJsonModel<object>, IPersistableModel<object>) — deferred to task 1.2.8

### Circular type inference in recursive rendering functions

When two rendering functions call each other recursively (e.g., `renderValueWrite` → `renderArraySerialization` → `renderValueWrite`), TypeScript cannot infer the return types and produces `TS7022`. Fix: add an explicit `Children | null` return type annotation (from `@alloy-js/core`) to one of the functions to break the inference cycle.

### TypeExpression works inline in JSX for foreach types

`TypeExpression` from `@typespec/emitter-framework/csharp` can be used inline in JSX children to render C# type names for foreach loop variable declarations. It correctly renders `string`, `int`, `IList<string>`, etc. and generates appropriate `using` directives. Always pass `unwrappedType.__raw!` (unwrap nullable first).

## Design Decisions

### Collection serialization: extend WritePropertySerialization vs separate component

**Chosen:** Extend `WritePropertySerialization` with helper functions (`renderValueWrite`, `renderArraySerialization`, `renderCollectionProperty`) in the same file. **Rejected:** Creating a separate `CollectionSerializer.tsx` component. **Reason:** The collection rendering is tightly coupled to the property serialization flow (needs access to property name, optional guards, serialized name). Keeping it in one file reduces indirection. The `renderValueWrite` function provides a reusable abstraction that tasks 2.2.7 (models), 2.2.8 (enums), and 2.2.10 (dictionaries) can plug into by extending the type switch.

## Design Decisions

### Nested model serialization (2.2.7) — WriteObjectValue without generic type parameter

- **Chosen**: Generate `writer.WriteObjectValue(PropertyName, options)` as raw string — no explicit generic type `<T>`, C# infers it from the argument
- **Why**: Matches legacy emitter output exactly (see `RoundTripModel.Serialization.cs:120`). Simpler code, no need for TypeExpression in the serialization call.
- **Rejected**: Using `writer.WriteObjectValue<TypeExpression>(value, options)` — the legacy emitter only uses explicit `<T>` for `object` types in dictionaries/additional properties, not for direct model property access.

---

### DeserializeVariableDeclarations Pattern (Task 2.3.3)

**Component**: `src/components/serialization/DeserializeVariableDeclarations.tsx`

**Key patterns:**

- Uses `computeVariableInfos()` which mirrors `computeSerializationCtorParams()` but returns property objects instead of ParameterProps, enabling discriminator/type checks
- For the `additionalBinaryDataProperties` variable, must wrap the `code` template in `<>` fragment with separate `{"\n    "}` for the newline — `code` template literals don't handle `\n` at the beginning of the string correctly
- `TypeExpression` renders array types as `T[]` (e.g., `string[]`), not `IList<T>` — this differs from the legacy emitter which uses `IList<T>` for property declarations and variable declarations
- String discriminator literal initialization only applies when: `property.discriminator === true && model.discriminatorValue !== undefined && unwrapped.kind === "string"` — enum discriminators use `default`
- Variable order for derived models: base props → additionalBinaryData → derived own props (matching serialization constructor parameter order)

**Gotcha**: When using the `code` template tag, leading `\n` characters are not rendered. Use a raw string `{"\n    "}` as a separate child before the `code` template for newline+indentation.

## Design Decisions

### PropertyMatchingLoop Approach (Task 2.3.4)

**Chosen**: Single `PropertyMatchingLoop` component with `getReadExpression()` helper function that maps SDK types to `prop.Value.Get{Type}()` expressions. Returns null for unsupported types.
**Why**: Mirrors the write-side pattern (`WritePropertySerialization` + `getWriteMethodInfo`). Clean extension point — subsequent tasks (2.3.5-2.3.12) add new type support by extending `getReadExpression`.
**Rejected**: Children-per-property approach (overcomplicated; loop structure is uniform across properties).

### Property Matching Loop — Key Implementation Notes

- `computeMatchableProperties()` returns a flat list: base model properties (recursive) + own non-override properties, same order as `computeVariableInfos` in DeserializeVariableDeclarations.tsx
- The `READ_METHOD_MAP` constant maps TCGC SDK type kinds to `JsonElement.Get{Type}()` method names
- URL type is handled specially: `new Uri(prop.Value.GetString())` instead of a simple getter
- Constants (e.g., discriminator `kind: "dog"`) are unwrapped to their `valueType` before looking up the reader method
- The children slot after all property matches is for the additional binary data catch-all (task 2.3.12)

### Encoded type deserialization patterns (Task 2.3.6)

**DateTime read expressions**: Uses custom `GetDateTimeOffset(format)` extension method from `ModelSerializationExtensions` for rfc3339 ("O") and rfc7231 ("R"). Unix timestamps use the framework's `DateTimeOffset.FromUnixTimeSeconds(prop.Value.GetInt64())` — no custom extension needed.

**Duration read expressions**: ISO8601 uses custom `GetTimeSpan("P")` extension method. Numeric encodings (seconds/milliseconds) use `TimeSpan.FromSeconds()`/`TimeSpan.FromMilliseconds()` with a getter determined by wire type. Key insight: only `int32` wire type uses `GetInt32()`; all other wire types (int64, float32, float64) use `GetDouble()`. This matches legacy emitter's format enum distinction (Duration_Seconds = int32, everything else = Double).

**Bytes default encoding**: TCGC always assigns `encode: "base64"` as the default for bytes types, even without an explicit `@encode` decorator. The `BinaryData.FromString(prop.Value.GetRawText())` fallback is defensive and not triggered for standard bytes properties.

**plainDate/plainTime**: Use the same extension methods as DateTime/Duration — `GetDateTimeOffset("D")` for plainDate, `GetTimeSpan("T")` for plainTime. These are fixed format specifiers (no encode variation).

### Model deserialization pattern (Task 2.3.7)

**Pattern**: `ModelName.DeserializeModelName(prop.Value, options)` — static method call on the model class.
**Implementation**: Extended `getReadExpression()` with `namePolicy?: NamePolicy<string>` parameter. When `kind === "model"`, uses `namePolicy.getName(modelType.name, "class")` to get PascalCase name.
**Type note**: Use `NamePolicy<string>` (not inline type) to be compatible with `NamePolicy<CSharpElements>` from `useCSharpNamePolicy()`.
**Works for**: Required models, nullable models (unwrapped by `unwrapNullableType`), discriminated base model properties in derived models.

## vi.mock and TypeSpec Compiler Module Loading

**Gotcha:** `vi.mock()` cannot intercept imports made by the TypeSpec compiler. The compiler loads emitter modules in its own module context (likely via native `import()` that bypasses vitest's module interception). Verified: mock factory function is never called when the emitter runs through `compileAndDiagnose`. Workarounds:

1. Test utility functions directly (unit tests)
2. Use alloy's `render()` API for component-level rendering tests
3. Use `globalThis` for cross-context state sharing (last resort)
   Best practice: for features that can't be triggered through TypeSpec compilation (e.g., `modelAsStruct` before TCGC support), test the layers separately rather than trying to mock the integration.

## StructDeclaration vs ClassDeclaration for Models

When generating struct models, use `<StructDeclaration>` from `@alloy-js/csharp` with `readonly` and `partial` props. Key differences from ClassDeclaration:

- No `baseType` prop (C# structs can't inherit)
- No `abstract` prop (C# structs can't be abstract)
- Has `readonly` prop (required for model structs per legacy emitter)
- `interfaceTypes` available for implementing interfaces

## Design Decisions — Enum Property Serialization (Task 2.2.8)

**Approach chosen:** Extend `getWriteMethodInfo` in PropertySerializer.tsx to handle `kind === "enum"` types by returning `WriteMethodInfo` with a `valueTransform`.

**Why:** The `valueTransform` pattern already exists for durations. By reusing it for enums, the same rendering pipeline handles both direct property writes and collection item writes (via `renderValueWrite`). No need for a separate `renderEnumProperty` function.

**Rejected:** Separate `renderEnumProperty` function similar to `renderModelProperty` — would duplicate guard/nullable logic already in the primitive write path.

### Enum serialization in collections

Enum items in collections are automatically handled because `renderValueWrite` falls through to `getWriteMethodInfo` for non-array/non-model types. The `valueTransform` applies to the loop variable `item` the same way it applies to property names.

### Enum deserialization read path

Enum deserialization uses `getEnumReadExpression()` in PropertyMatchingLoop.tsx, mirroring the write path's `getEnumWriteInfo()` in PropertySerializer.tsx. The key asymmetry: fixed int enums serialize with direct cast `(int)value` but deserialize with extension method `GetInt32().ToEnum()` — both directions need the extension method for deserialization validation. The getter method reuses `READ_METHOD_MAP` (same as primitives) since enum backing types are always primitives.

## Collection deserialization: accessor parameter refactoring (Task 2.3.9)

- **getReadExpression now accepts `accessor` parameter** (default `"prop.Value"`). All helper functions (getDateTimeReadExpression, getDurationReadExpression, etc.) also accept `accessor`. This enables reuse for collection items where the accessor is `"item"` or `"item0"` for nested collections.
- **renderArrayDeserialization pattern**: Uses `List<T>` (not `IList<T>`) for the intermediate variable, matching the legacy emitter's deserialization pattern. Variable naming follows depth convention: `array`/`item` at depth 0, `array0`/`item0` at depth 1, etc.
- **TypeExpression for List<T> generic param**: Use `<TypeExpression type={unwrappedItemType.__raw!} />` to render the C# type name for the List<T> generic parameter. This generates proper `using` directives automatically.
- **Null checking for items is separate**: Task 2.3.11 handles null value checking. Collection deserialization (2.3.9) generates the basic loop without null guards.

## Design Decisions

### Collection deserialization approach (Task 2.3.9)

- **Chosen**: Extend `PropertyMatchingLoop.tsx` with helper functions (`renderArrayDeserialization`), mirroring the write path's `renderArraySerialization`/`renderValueWrite` pattern in `PropertySerializer.tsx`.
- **Why**: Collection rendering is tightly coupled to the property matching flow (needs accessor, indent, namePolicy). Consistent with how serialization collections are handled.
- **Rejected**: Creating a separate `CollectionDeserializer.tsx` component — adds indirection without benefit since collection deserialization is always embedded in the property matching loop.

## Dictionary Deserialization (Task 2.3.10)

### Design Decision

- **Chosen approach**: `renderDictionaryDeserialization` function parallel to `renderArrayDeserialization`
- **Rejected**: Unified collection rendering function (too much coupling, harder to maintain)
- **Reason**: Consistent with existing array pattern, simpler, follows legacy emitter structure

### Variable Naming Convention

- Dictionary var: `dictionary` (depth 0), `dictionary0` (depth 1), `dictionary1` (depth 2)
- Prop var: `prop0` (depth 0), `prop1` (depth 1) — starts at 0 because outer loop uses `prop`
- This differs from arrays where `item` is at depth 0 (no existing `item` variable to shadow)

### Generated Pattern

```csharp
Dictionary<string, T> dictionary = new Dictionary<string, T>();
foreach (var prop0 in prop.Value.EnumerateObject())
{
    dictionary.Add(prop0.Name, prop0.Value.GetXxx());
}
```

### Cross-Collection Nesting

- Arrays in dictionaries: `renderDictionaryDeserialization` delegates to `renderArrayDeserialization`
- Dictionaries in arrays: `renderArrayDeserialization` delegates to `renderDictionaryDeserialization`
- Both reset their depth counters when crossing collection type boundaries

## Design Decisions

### Dictionary Serialization (Write Path) — Task 2.2.10

**Approach chosen**: Mirror `renderArraySerialization` with `renderDictionarySerialization` + `renderDictionaryProperty`.
**Why**: Minimal change surface, consistent architecture, enables dict↔array cross-nesting through `renderValueWrite` dispatch.
**Rejected**: Unified collection handler (too much refactoring, would change array behavior).
**Key difference from arrays**: Dicts use `foreach (var item ...)` instead of typed `foreach (Type item ...)`. Nested dicts use depth-based variable names (`item`, `item0`, `item1`) instead of shadowing, because outer `.Key`/`.Value` members are referenced in inner `foreach` expressions.

### PersistableModel Method Patterns (Task 2.1.4)

#### Root type resolution for PersistableModelCreateCore

- Derived models must return the ROOT base type (not immediate parent) in `PersistableModelCreateCore`
- For Dog → Pet → Animal, return type is `Animal` (the root)
- `getRootModelType()` traverses `baseModel` chain to find root
- The IPersistableModel cast and Deserialize call use the CURRENT model name (not root)
- The `nameof()` in error messages uses the CURRENT model name

#### Abstract models get full method bodies

- Abstract discriminated base models (like Animal) get FULL method bodies with switch statements
- NOT `=> throw null` stubs — the agent incorrectly reported this for Bird/Fish
- Both abstract and concrete root models use `protected virtual`

#### Unknown discriminator models are special

- UnknownAnimal's PersistableModelCreateCore calls `DeserializeAnimal` (BASE model, not `DeserializeUnknownAnimal`)
- Uses `IPersistableModel<Animal>` (base model) for cast, not `IPersistableModel<UnknownAnimal>`
- Uses `nameof(Animal)` in error messages (base model name)
- Unknown models are NOT in `sdkPackage.models` — they're generated separately

#### Deferred optional parameters

- `ModelReaderWriter.Write(this, options)` is missing the 3rd param `SampleTypeSpecContext.Default` (task 5.3.1)
- `JsonDocument.Parse(data)` is missing the 2nd param `ModelSerializationExtensions.JsonDocumentOptions` (task 5.1.5)
- Both parameters are optional in C# and can be added when their infrastructure tasks are completed

#### TCGC 3-level discriminated hierarchy limitation

- TypeSpec models with 3+ level discriminated hierarchies (Dog extends Pet extends Animal) produce TCGC diagnostics
- 2-level hierarchies (Dog extends Animal) work fine
- Tests should stick to 2-level hierarchies for discriminated models

## Design Decisions

### Task 2.6.1: IJsonModel.Write wrapper component

- **Approach chosen**: Separate `JsonModelInterfaceWrite.tsx` component file, following the same pattern as `PersistableModelInterfaceMethods.tsx`
- **Approach rejected**: Embedding in `JsonModelWriteCore` — would mix the `protected virtual/override` core method with the explicit interface method, reducing modularity
- Both root and derived models need their own `IJsonModel<T>.Write` because `IJsonModel<T>` is parameterized by model type (IJsonModel<Pet> ≠ IJsonModel<Dog>)
- The method body is identical for root and derived models — polymorphic dispatch happens inside `JsonModelWriteCore`
- No `this.` prefix on `JsonModelWriteCore(writer, options)` call — matches legacy emitter's standard output (Dog.Serialization.cs)

## Design Decisions

### JsonModelCreateCore vs PersistableModelCreateCore pattern differences (2026-03-01)

- **JsonModelCreateCore** uses `if (format != "J") { throw ... }` pattern (no switch/case)
- **PersistableModelCreateCore** uses `switch (format) { case "J": ... default: throw ... }` pattern
- **JsonModelCreateCore** uses `using JsonDocument document = JsonDocument.ParseValue(ref reader);` (using declaration, no braces)
- **PersistableModelCreateCore** uses `using (JsonDocument document = JsonDocument.Parse(data)) { ... }` (using statement with braces)
- Both follow the same virtual/override + root-return-type pattern for inheritance
- These differences match the legacy emitter's output exactly

### IJsonModel<T> interface completion status (2026-03-01)

All 5 interface methods for IJsonModel<T> and IPersistableModel<T> are now implemented:

1. `IJsonModel<T>.Write` → JsonModelInterfaceWrite.tsx (was already done)
2. `IJsonModel<T>.Create` → JsonModelInterfaceCreate.tsx (NEW)
3. `IPersistableModel<T>.Write` → PersistableModelInterfaceMethods.tsx (was already done)
4. `IPersistableModel<T>.Create` → PersistableModelInterfaceMethods.tsx (was already done)
5. `IPersistableModel<T>.GetFormatFromOptions` → PersistableModelInterfaceMethods.tsx (was already done)

### Utf8JsonReader added to builtins (2026-03-01)

`Utf8JsonReader` was added to `src/builtins/system-text-json.ts`. It's used in `JsonModelCreateCore` and `JsonModelInterfaceCreate` for the `ref Utf8JsonReader reader` parameter. Also added `JsonDocument.ParseValue` static method for parsing from a reader.

### DeserializeReturnStatement Pattern (Task 11.1.4 / 2.3.13)

- Created as separate component `DeserializeReturnStatement.tsx` following the per-component pattern
- Shares `computeVariableInfos` from `DeserializeVariableDeclarations.tsx` to ensure constructor args match variable declarations exactly
- The `computeVariableInfos` function and `VariableInfo` type are exported from DeserializeVariableDeclarations
- For derived discriminated models, param order is: base params (including additionalBinaryDataProperties) + own non-override props
- Legacy emitter uses multi-line format for many-param models, but single-line is functionally correct
- **Gotcha**: The null-coalescing fallback for optional nullable list params (`?? new ChangeTrackingList<T>()`) is handled by task 2.3.11, not here

## Inline String Literal Union Types (Task 11.1.5)

**Problem**: TypeSpec inline unions like `color: "red" | "blue"` crash TypeExpression because the raw type is an unnamed Union, but TypeExpression only handles named and nullable unions.

**Solution**: The `forTypeKind("Union", ...)` override in `CSharpTypeExpression.tsx` intercepts unnamed non-nullable unions and emits `<Reference refkey={efCsharpRefkey(union)} />`. This works because:

1. TCGC converts inline literal unions to `SdkEnumType`
2. The enum file declarations register `efCsharpRefkey(rawType)` as their refkey
3. So the Reference resolves to the generated enum declaration

**Important**: When adding new `forTypeKind` overrides, be careful about `props.default` — accessing it for types that would throw in the default TypeExpression will propagate the throw. Only use `props.default` when you know the default behavior won't crash.

**Nullable detection**: The `hasNullVariant()` helper checks for Intrinsic types with name "null" or "void" to distinguish nullable unions from literal unions, without depending on internal emitter-framework utilities.

## Read-Only Property Serialization Guards (Task 2.2.13)

### Pattern

Read-only properties (`@visibility(Lifecycle.Read)`) are only serialized when `options.Format != "W"` (non-wire format). The guard wraps the property write:

- Required read-only: `if (options.Format != "W") { ... }`
- Optional read-only: `if (options.Format != "W" && Optional.IsDefined(Prop)) { ... }`
- Required-nullable read-only: combined guard with `else if (options.Format != "W") { WriteNull }` to avoid writing null in wire format

### Key Helper Functions (PropertySerializer.tsx)

- `needsSerializationGuard(property)` — returns true if any guard needed (read-only OR optional)
- `buildGuardCondition(property, csharpName)` — builds the combined condition string
- `renderElseNull(property, serializedName)` — renders the else-null branch (simple `else` or `else if` for read-only)

### Gotcha: TypeSpec.Rest is NOT available in test host

When writing inline TypeSpec in tests, do NOT use `using TypeSpec.Rest;`. The `Lifecycle` enum is part of the TypeSpec compiler's standard library and is available without any `using` statement. Using `TypeSpec.Rest` causes `invalid-ref` diagnostics.

## Design Decisions

### Read-Only Guards: Combined vs Nested

**Chosen:** Combined conditions with `&&` (e.g., `options.Format != "W" && Optional.IsDefined(Prop)`)
**Rejected:** Nested if blocks (outer format check wrapping inner optional check)
**Reason:** The combined approach matches the legacy emitter's output pattern and keeps the same indentation depth. For required-nullable read-only, we use `else if (options.Format != "W")` instead of `else` to avoid writing null in wire format — this is a subtle correctness requirement.

### Discriminated base models use dispatch, not property matching (Task 2.4.1)

**Key insight:** Models with `hasDiscriminatedSubtypes()` (abstract bases and intermediate models) do NOT use the standard deserialization body (variable declarations → property matching loop → constructor return). Instead, they use discriminator dispatch:

1. `TryGetProperty("{discriminatorName}"u8, out JsonElement discriminator)` to peek
2. `switch (discriminator.GetString())` to dispatch to derived `DeserializeXxx` methods
3. Unknown fallback: `return Unknown{Base}.DeserializeUnknown{Base}(element, options)`

The `discriminatedSubtypes` map is a flat `Record<string, SdkModelType>` containing ALL descendants (not just direct children). This means a 3-level hierarchy Animal → Pet → Dog will have Animal dispatching to both Pet and Dog.

The discriminator serialized name comes from `model.discriminatorProperty!.serializedName`.

**Gotcha:** Tasks 2.4.1/2.4.2/2.4.3 are inseparable — they were implemented together. Future loops finding them already done should just mark them as done.

## Null Value Handling in Deserialization (Task 2.3.11)

### Property-Level Null Checks

- Use `getNullCheckBehavior(property)` from PropertyMatchingLoop.tsx to determine null handling
- Three behaviors: `assign-null`, `skip`, `empty-collection` (or `null` for no check)
- The null check goes INSIDE the `if (prop.NameEquals(...))` block, BEFORE value extraction
- `JsonValueKind.Null` works as raw text because the serialization file already has `using System.Text.Json;` from other references

### Item-Level Null Checks in Collections

- Only generated when `valueType.kind === "nullable"` — i.e., TCGC wraps the item in `SdkNullableType`
- This differs slightly from the legacy emitter which checks `TypeRequiresNullCheckInSerialization` (all reference types including string get null checks)
- For our emitter, `string[]` items do NOT get null checks (string.GetString() naturally returns null), only `(string | null)[]` does
- This difference is functionally equivalent for strings but may produce slightly different generated code structure

### ChangeTracking Types for Empty-Collection Case

- `ChangeTrackingList<T>` and `ChangeTrackingDictionary<string, T>` are plain text in the generated output
- Use `TypeExpression` for the generic type parameter to get proper type resolution
- The "empty-collection" case is for required nullable collections (`items: string[] | null`) — rare but important for wire-format fidelity

### Design Decision

- Null check logic is inline in PropertyMatchingLoop.tsx (not a separate component) because it's tightly coupled with property matching and needs access to variable names, indentation, and property metadata
- Helper functions (`getNullCheckBehavior`, `renderPropertyNullCheck`, `itemNeedsNullCheck`) are exported for unit testing

## Design Decisions

### Cast Operators: Raw Code Template Approach (2026-03-01)

**Chosen**: Raw `code` template with refkeys for type references, raw strings for infrastructure type references.

**Why**: Alloy C# lacks `OperatorDeclaration` component. The `Method` component doesn't support `implicit`/`operator` modifiers. Using `code` templates is the established pattern (see PersistableModelWriteCore, JsonModelWriteCore) for generating method-like constructs that don't fit existing Alloy components.

**For `ModelSerializationExtensions.WireOptions`**: Used raw string reference since `ModelSerializationExtensions` is a generated infrastructure class (task 5.1.5) that doesn't exist yet. Creating it prematurely would be scope creep. The `using` directive will be auto-added when 5.1.5 defines the class with a refkey.

**Rejected**: Creating a minimal `ModelSerializationExtensions` declaration — would conflict with the full implementation in task 5.1.5.

### Input Model Detection for Cast Operators (2026-03-01)

**Approach**: Check `(type.usage & UsageFlags.Input) !== 0` from TCGC to determine if a model gets the implicit BinaryContent operator.

**Legacy mapping**: The legacy emitter uses `RootInputModels.Contains(_inputModel)` which checks if the model is directly used as an operation parameter. TCGC's `UsageFlags.Input` covers the same concept. Unknown discriminator models (auto-generated fallback types) are NOT in the `models` array from TCGC, so no additional filtering is needed.

## Alloy EnumMember Name Policy Gotcha

The `<EnumMember>` component from `@alloy-js/csharp` automatically applies `pascalCase()` name policy to member names. This strips underscores: `V2024_06_01_Preview` becomes `V2024_06_01Preview`. To preserve exact names (e.g., API version enum members), use `namekey(name, { ignoreNamePolicy: true })`:

```tsx
import { namekey } from "@alloy-js/core";
<EnumMember
  name={namekey("V2024_06_01_Preview", { ignoreNamePolicy: true })}
/>;
```

## Constructor Body Formatting in Alloy

Multi-line method/constructor bodies must use explicit `"\n"` strings for line breaks. Each `code` template tag is treated as inline. The pattern used across serialization components:

```tsx
{
  code`public MyClass(int arg)`;
}
{
  ("\n{\n");
}
{
  ("    body line;\n");
}
{
  ("}");
}
```

Do NOT use `\n` inside `code` template strings — use separate string elements.

## TypeSpec Test Pattern for Versioned Services

Tests must use `using TypeSpec.Versioning;` in the TypeSpec code (NOT `import "@typespec/versioning"`). The `HttpTester.importLibraries()` handles the import automatically. `@typespec/versioning` must be in the `libraries` array in `test-host.ts`.

## Design Decisions

### ClientOptionsFile (Task 3.1.1): Single Component vs Split

**Chosen:** Single component (`ClientOptionsFile.tsx`) that generates the entire file.
**Rejected:** Splitting into separate `ServiceVersionEnum.tsx` and `VersionConstructor.tsx` components.
**Reason:** The file is small (~40 lines of C# output). All parts (enum, constructor, properties) are tightly coupled to the same version data. Splitting adds files/indirection without benefit.

## Design Decisions

### Task 1.2.6: Raw strings for \_additionalBinaryDataProperties field

The `<Field>` component from `@alloy-js/csharp` doesn't support `private protected` combined
access modifiers. Its `accessibilityFromProps` function iterates `["public", "internal", "protected", "private"]`
and returns on first match, so passing `{private: true, protected: true}` yields just `"protected"`.
Solution: Use raw strings for the field declaration. This is consistent with how the serialization
constructor already renders `IDictionary<string, BinaryData>` as a string type parameter.

### Root model detection for field generation

A model is a "root model" (should declare `_additionalBinaryDataProperties`) when `model.baseModel === undefined`.
Derived models inherit the field from their base. The legacy emitter walks the entire ancestor chain
checking for the field, but in practice this always means: only models without a base get the field.

### sdkPackage.clients only contains root-level clients

The `sdkContext.sdkPackage.clients` array is documented as "First level clients of the package." Sub-clients are accessed through each client's `children` property. Use `getAllClients()` from `src/utils/clients.ts` to get a flat list of all clients (BFS traversal).

### TCGC does not produce clients for empty services

A TypeSpec with `@service namespace X;` and no operations produces an empty `sdkPackage.clients` array. Tests that expect a client class must include at least one operation.

### OverloadConstructor required for multiple constructors in same class

Alloy's standard `<Constructor>` component creates a MethodSymbol that triggers name deduplication. When multiple constructors exist in the same `<ClassDeclaration>`, use `OverloadConstructor` from `src/components/models/ModelConstructors.tsx` which sets `ignoreNameConflict: true`. This applies to client classes (mocking + internal constructors) and model classes (public + serialization constructors).

### System.Uri builtin added for client endpoint fields

`System.Uri` was added to `src/builtins/system.ts` for use in client endpoint fields. Reference as `System.Uri` in JSX components to auto-generate `using System;`.

## Design Decisions

### ClientFile: Single component for root + sub-clients (task 3.2.1)

**Chosen approach**: Single `ClientFile` component that handles both root and sub-clients, with branching based on `client.parent !== undefined`.

**Why**: The class structure is nearly identical for both (endpoint field, mocking constructor, Pipeline property). The only difference is that sub-clients get an additional internal constructor. Following the ModelFile pattern of one component per concern.

**Rejected**: Separate `RootClientFile` and `SubClientFile` components — would duplicate the common structure (endpoint field, mocking constructor, Pipeline property) with only minor differences.

## Client Fields (Task 3.2.2)

### Auth field patterns

- API key auth: `_keyCredential` (ApiKeyCredential), `AuthorizationHeader` (const string), optional `AuthorizationApiKeyPrefix` (const string)
- OAuth2 auth: `_tokenProvider` (AuthenticationTokenProvider), `AuthorizationScopes` (static readonly string[])
- Auth fields are ONLY generated on root clients. Sub-clients inherit auth through the pipeline.
- The `AuthenticationTokenProvider` builtin was added to `SystemClientModelPrimitives` in `system-client-model.ts`.

### Alloy Field component limitations

- `<Field>` does NOT support `const` modifier. Use raw strings for const fields: `{`private const string AuthorizationHeader = "x-api-key";`}`
- `<Field>` supports: `static`, `readonly`, `volatile`, `new` modifiers
- Naming policy for fields: private fields get `_` prefix + camelCase. So `name="keyCredential"` → `_keyCredential`.

### TCGC type system gotchas

- `Oauth2Auth` in `@typespec/http` uses lowercase 'a' (not `OAuth2Auth`)
- `Oauth2Auth` takes 1 type argument (flows only), not 2
- `SdkBuiltInKinds` = TypeSpec `IntrinsicScalarName` minus utcDateTime/offsetDateTime/duration, plus "unknown"
- Valid SdkBuiltInKinds: bytes, numeric, integer, float, int64, int32, int16, int8, uint64, uint32, uint16, uint8, safeint, float32, float64, decimal, decimal128, string, plainDate, plainTime, boolean, url, unknown
- SdkBuiltInKinds does NOT include: uuid, password, eTag, ipAddress, ipV4Address, ipV6Address

### Client initialization parameters

- `client.clientInitialization.parameters` contains: endpoint (kind: "endpoint"), credential (kind: "credential"), method params (kind: "method")
- API version appears as method param with `isApiVersionParam: true` when TypeSpec has explicit `@query apiVersion: string`
- For versioned services without explicit param, TCGC may handle version through options, not init params

### Cross-file type references for clients

- Use `refkey(client)` on ClassDeclaration to create a stable key for client classes
- Sub-client caching fields reference child types via `refkey(childClient)` — Alloy resolves across files
- Since the same TCGC SdkClientType object is passed to both parent and child ClientFile, `refkey(obj)` produces matching keys

### Design Decision: Client fields approach

- **Chosen**: Utility functions in `client-params.ts` + inline Field rendering in ClientFile
- **Rejected**: Separate ClientFields component (too much indirection for field declarations)
- **Reason**: Follows existing patterns (ClientOptionsFile), utility functions are reusable by constructor generation (task 3.2.3)

## Task 3.2.3: Client Constructor Design Decision

**Approach chosen**: Inline JSX with `code` template tags for constructor body generation.
The `RootClientConstructors` component builds both secondary and primary constructors
using `OverloadConstructor` with `thisInitializer` for chaining.

**Why**: The `code` template tag with SystemClientModelPrimitives references correctly generates
`using` directives while keeping the constructor body readable. Nesting `code` template results
(e.g., `userAgent` variable inside the pipeline creation line) works as expected.

**Rejected**: String-only approach — would not trigger automatic `using` directive generation for types
like `ClientPipeline`, `PipelinePolicy`, `UserAgentPolicy`.

**Gotcha: OverloadConstructor only had baseInitializer**
The original `OverloadConstructor` component only supported `: base(...)` chaining via the
`baseInitializer` prop. Secondary constructors need `: this(...)` chaining. Added `thisInitializer`
prop to support this. Both props are mutually exclusive (C# doesn't allow both).

**Gotcha: Options type varies by API version presence**
When a client has API versions, constructors reference the generated options class (e.g., `TestServiceClientOptions`).
When there are no API versions, constructors fall back to `ClientPipelineOptions` from the builtins.
The options class is always in the same namespace as the client, so string references work without `using` directives.

**Gotcha: API version params vs constructor params**
Method parameters with `isApiVersionParam: true` are NOT constructor parameters — they're assigned from
`options.Version` in the primary constructor body. Non-API-version method params ARE constructor parameters.

### Discriminator exclusion in factory methods (task 1.8.4)

Factory methods for derived discriminated models must exclude the discriminator from parameters
and inject the literal value in the constructor call. The key helper is `getDiscriminatorLiteral()`
in `ModelFactoryMethod.tsx` which walks up the model hierarchy matching `baseModel.discriminatorProperty.name`
to find the correct value at each level.

Detection: check `property.discriminator === true` then call `getDiscriminatorLiteral()`. If it returns
non-undefined, push the literal to ctorArgs and skip the property from factoryParams.

The `ctorArgs` array is `Children[]` (not `string[]`) to support enum discriminator refkeys that need
Alloy to auto-generate `using` directives. Constructor args are joined with `flatMap()` instead of `.join()`.

## Design Decision: Sub-Client Factory Methods (Task 3.2.4)

**Chosen approach:** `SubClientFactoryMethods` helper component within `ClientFile.tsx`.

- Uses `<Method public virtual>` from `@alloy-js/csharp` for the method declaration
- Uses `code` template with `SystemThreading.Volatile` and `SystemThreading.Interlocked` refkeys for the body
- This auto-generates `using System.Threading;` in the file

**Rejected approach:** Separate `SubClientFactoryMethods.tsx` component file — too much indirection for a single-use component that only makes sense within a client class.

**Key pattern:** The method name follows the legacy convention:

- If child class name ends with "Client" (case-insensitive): `Get{Name}` (avoids double "Client")
- Otherwise: `Get{Name}Client`

**Builtin pattern:** `SystemThreading` in `src/builtins/system-threading.ts` uses `createLibrary("System.Threading", { Volatile: ..., Interlocked: ... })` — same pattern as other builtins.

---

### TypeExpression expects TypeSpec Type, not SdkType

`TypeExpression` from `@typespec/emitter-framework/csharp` expects a TypeSpec compiler `Type` (accessed via `sdkType.__raw!`), NOT an `SdkType` directly. For protocol-level type mapping (CreateRequest params), use a direct switch on `SdkType.kind` returning strings for C# keywords (string, int, bool) and refkeys for types needing `using` directives (System.DateTimeOffset, System.Uri, System.BinaryData).

### RestClientFile partial class pattern

RestClientFile uses `namekey(className, { ignoreNameConflict: true })` for its ClassDeclaration — identical to ModelSerializationFile. This prevents Alloy from renaming the second partial declaration with a "\_2" suffix since ClientFile already declares the canonical class. Do NOT use `refkey(client)` on both files.

### ClientUriBuilder and TypeFormatters are raw strings

`ClientUriBuilder` and `TypeFormatters` are internal infrastructure types generated into the same namespace (tasks 5.1.x). They don't need builtin declarations or using directives. Reference them as raw strings in `code` templates.

### Design Decision: RestClientFile (Task 3.3.1)

**Chosen approach:** Single-file component with inline helpers (ClassifierDeclarations, CreateRequestMethod).
**Why:** Cohesive — all REST client concerns in one file. Matches ClientFile.tsx pattern where SubClientFactoryMethods is inline.
**Rejected:** Separate component files for classifiers/methods — too much indirection.

### System builtins: DateTimeOffset and TimeSpan

Added `System.DateTimeOffset` (struct) and `System.TimeSpan` (struct) to the System builtin library for use as protocol parameter types. These generate `using System;` when referenced.

## Design Decisions — Task 3.4.1: ProtocolMethod component

### Approach chosen: Single ProtocolMethods component with inline sync/async rendering

- Both sync and async methods share computed values (params, xmlDoc, validation) in the same loop iteration
- Avoids duplicating computation or JSX trees
- Rejected: Separate SingleProtocolMethod sub-component — would recompute buildProtocolParams twice per operation

### Parameter utility duplication

- `getProtocolTypeExpression`, `unwrapType`, `isConstantType`, `isImplicitContentTypeHeader` are duplicated from RestClientFile
- Chosen over extraction to shared utility to minimize changes to RestClientFile (not in task scope)
- Both copies must stay in sync — documented in JSDoc comments

### Task<> return type via SystemThreadingTasks library

- Added `SystemThreadingTasks` to `src/builtins/system-threading.ts` with `Task` class
- `code\`${SystemThreadingTasks.Task}<${SystemClientModel.ClientResult}>\``renders as`Task<ClientResult>`with both`using System.Threading.Tasks;`and`using System.ClientModel;`
- This pattern works because code templates concatenate rendered library refs with literal strings

## Design Decisions

### Task 3.5.1: ConvenienceMethod — Approach chosen: Operation-param delegation with TypeExpression types

**Approach chosen:** Build convenience params from `method.operation.parameters` (same as protocol method) but use TypeExpression for types instead of unwrapping enums to wire types. Body params use the model type. The method delegates to the protocol method with type conversions (enum `.ToString()`, implicit BinaryContent for models, `.ToRequestOptions()` for CancellationToken).

**Rejected approach:** Using `method.parameters` (TCGC method-level params) directly. This would be needed for spread parameter support but is more complex. Deferred to task 3.5.2.

**Why:** The operation-param approach reuses the same parameter ordering and filtering logic as `ProtocolMethod.tsx`, ensuring parameter order consistency. TypeExpression handles model/enum type resolution and auto-using directives. The delegation pattern matches the legacy emitter's `ScmMethodProviderCollection.BuildConvenienceMethod`.

## Gotchas

### Convenience + Protocol methods cause Alloy name deduplication (\_2 suffix)

When both convenience and protocol methods exist with the same name (C# method overloading), Alloy's name resolution adds a `_2` suffix to the second declaration. Fix: use `namekey(methodName, { ignoreNameConflict: true })` on BOTH convenience AND protocol Method components. This was applied to ProtocolMethod.tsx and ConvenienceMethod.tsx.

### CancellationToken builtin must be in SystemThreading namespace

The `CancellationToken` type was added to `src/builtins/system-threading.ts` (not system-threading-tasks) to ensure `using System.Threading;` is auto-generated. It lives in `System.Threading`, not `System.Threading.Tasks`.

### Convenience method signatures may wrap across lines

When method signatures are long (many params or long return types like `Task<ClientResult<Item>>`), Alloy wraps parameters across multiple lines. Tests should use partial string matching (e.g., `toContain("Task<ClientResult<Item>> CreateItemAsync(")`) rather than full single-line assertions.

### Value types skip Argument.Assert in convenience methods

In C#, value types (int, bool, enum, DateTime, TimeSpan, etc.) cannot be null, so convenience methods should NOT generate `Argument.AssertNotNull` for them. Only reference types (string, models, Uri, BinaryData, arrays, dicts) need validation. The `getConvenienceTypeInfo` function returns `needsAssertion: false` for value types.

### Unknown model refkey pattern (task 1.8.3)

Unknown discriminator variant classes (`Unknown{BaseName}`) now have a refkey via `unknownModelRefkey(baseModelRawType)` from `src/utils/refkey.ts`. This uses a dedicated `Symbol.for("http-client-csharp:unknown-model")` prefix, separate from the emitter-framework prefix. Both the class declaration in `UnknownDiscriminatorModel.tsx` and the factory method in `ModelFactoryMethod.tsx` use the same refkey, enabling Alloy's automatic cross-file reference resolution and `using` directive generation.

To reference an Unknown variant from any component: `import { unknownModelRefkey } from "../../utils/refkey.js"` then use `unknownModelRefkey(sdkModelType.__raw!)`.

### Preprocessor directives render at Alloy base indentation, not column 0

When using raw strings like `"\n#if NET6_0_OR_GREATER"` inside Alloy components, the `#if` will be indented by the parent context's base indentation (typically 8 spaces for namespace+class). This is valid C# (the compiler allows whitespace before `#` on preprocessor lines), but doesn't match the legacy emitter which puts them at column 0. Alloy doesn't provide a mechanism to break out of its indentation context.

### Additional binary data write is only for root models

The `_additionalBinaryDataProperties` field is declared on root models only. The serialization write loop (`AdditionalBinaryDataWrite` component) should only be rendered for root models (`!m.baseModel`). Derived models inherit the field and the base class's `JsonModelWriteCore` writes it via the `base.JsonModelWriteCore()` call. Including it in derived models would cause double-writing.

### Test assertions must account for additional binary data guard

After implementing `AdditionalBinaryDataWrite`, the string `options.Format != "W"` now appears in ALL model serialization files (not just those with read-only properties). Tests that previously asserted `not.toContain('options.Format != "W"')` on the entire file content need to be updated to be more specific — e.g., checking that property writes appear BEFORE the format guard rather than checking the string doesn't exist at all.

### Nested discriminator dispatch scope (task 2.4.5)

When a hierarchy uses different discriminator properties at each level (e.g., Fish with `kind`, Shark with `sharktype`), each model's `discriminatedSubtypes` map only contains entries for its OWN discriminator property values. The root model (Fish) dispatches only to `kind`-based subtypes — it does NOT include transitive descendants that use a different discriminator name. SawShark is reachable only via Shark's dispatch.

TypeSpec requires different `@discriminator(...)` property names at each level of a nested hierarchy. Applying `@discriminator("kind")` on both a parent and child model (reusing the same property name) produces compiler diagnostics.

### Nested discriminator variable initialization bug-compatible behavior (task 2.4.5)

In `DeserializeVariableDeclarations`, the `isStringDiscriminator` check uses `model.discriminatorValue` for ALL string discriminator properties, regardless of which discriminator hierarchy level they belong to. For SawShark (discriminatorValue="saw"), both `kind` and `sharktype` variables get initialized to `"saw"`, even though `kind` should ideally be `"shark"`. This matches the legacy emitter's single-discriminatorValue-per-model behavior. The property matching loop corrects the value from actual JSON.

### Explicit ClientResult operator (2.5.2)

- For JSON-only output models, the operator extracts `PipelineResponse` (NOT `using` — consistent with legacy JSON-only), parses `JsonDocument` (IS `using`), and calls `Deserialize{ModelName}`.
- `response.Content` (BinaryData) is passed directly to `JsonDocument.Parse()` — no intermediate `data` variable needed for non-dynamic models.
- Dual-format (JSON+XML) is handled in task 2.5.3, not here.

### Dual-format cast operators (2.5.3)

- Models with both `UsageFlags.Json` and `UsageFlags.Xml` get Content-Type sniffing in the explicit operator: checks `response.Headers.TryGetValue("Content-Type", ...)` and `value.StartsWith("application/json", StringComparison.OrdinalIgnoreCase)`.
- JSON-only: `response` WITHOUT `using`. XML-only and dual-format: `response` WITH `using`.
- XML deserialization reads from `response.ContentStream` (not `response.Content`), uses `XElement.Load(stream, LoadOptions.PreserveWhitespace)`.
- Created builtins: `SystemIO` (System.IO.Stream), `SystemXmlLinq` (System.Xml.Linq.XElement, LoadOptions), added `System.StringComparison` to existing `System` builtin.
- XML-only test cannot assert `not.toContain("JsonDocument")` on the whole file because other generated methods (JsonModelWriteCore, etc.) still reference JsonDocument for XML-only models — pre-existing issue.
- TypeSpec pattern for XML content types: `@header("content-type") contentType: "application/xml"` — TCGC automatically sets `UsageFlags.Xml` on the model.

## Operation Name Conventions (Task 3.6.1)

### Design Decision: cleanOperationName utility

- **Approach chosen**: Standalone `cleanOperationName()` function in `src/utils/operation-naming.ts`
- **Rejected**: Modifying the naming policy (too generic, domain-specific logic doesn't belong there)
- **Pattern**: Always apply `cleanOperationName(namePolicy.getName(method.name, "class"))` — the function expects PascalCase input
- **Applied in**: ProtocolMethod.tsx, ConvenienceMethod.tsx, RestClientFile.tsx (all three places that resolve operation names)
- **Rules**: "List" → "GetAll", "ListXxx" (uppercase after List) → "GetXxx", everything else unchanged
- **Important**: "Listen", "Listed", "Listing" are NOT renamed (no uppercase letter at position 4)

### TypeSpec collection format syntax

- TypeSpec HTTP decorators only support `explode: boolean` on @query/@header/@path — no `format` option
- `@query(#{explode: true})` → multi format (TCGC: collectionFormat="multi", explode=true)
- `@query tags: string[]` → CSV format (TCGC: collectionFormat="csv", explode=false)
- Pipes/SSV/TSV come only from OpenAPI3 import scenarios
- Path `allowReserved` uses RFC 6570 `+` operator in URI template: `@route("/files/{+path}")`
- `@path(#{allowReserved: true})` gives a diagnostic when path is already in the URI template

### IEnumerable for collection protocol method params

- Collection parameters in protocol method signatures use `IEnumerable<T>` from System.Collections.Generic
- Use `SystemCollectionsGeneric.IEnumerable` refkey from `system-collections-generic.ts` to auto-generate using directive
- Pattern: `code\`${SystemCollectionsGeneric.IEnumerable}<${elementTypeExpr}>\`` for the type expression

### TypeSpec @patch produces implicit optionality warnings

- `@patch` in TypeSpec >=1.0 emits `patch-implicit-optional` warnings for non-merge-patch operations
- When testing PATCH operations, filter diagnostics: `diagnostics.filter(d => d.severity === "error")`
- For tests that need zero diagnostics (e.g., optional body), use `@put` instead of `@patch`
- The generated REST client code is identical regardless — only the HTTP verb string changes

### Pre-existing test failures (as of task 3.3.4)

- 6 tests fail on the base commit (not introduced by any recent change):
  1. model-serialization.test.ts: IJsonModel on XML-only model (line ~348)
  2. model-serialization.test.ts: nested dictionary WriteStartObject count (line ~4158)
     3-6. smoke.test.ts: dotnet build fails on generated C# (4 tests)
- These are likely related to model serialization code, not REST client generation
- The smoke test dotnet build failures may be caused by the model serialization bugs

### Alloy TypeParameterConstraints bug with mixed constrained/unconstrained type params

When using `ClassDeclaration` with `typeParameters` where only SOME params have constraints (e.g., `[{name: "TKey", constraints: "notnull"}, "TValue"]`), Alloy generates invalid `where TValue :` (empty constraint) for unconstrained params. **Workaround**: Use raw `code` template for the full class declaration instead of `ClassDeclaration` + `typeParameters`. (Discovered in task 11.1.3)

### SourceFile `using` prop for explicit using directives

The `<SourceFile>` from `@alloy-js/csharp` has a `using` prop that accepts `string[]` of namespace names. Use this for infrastructure files that need manual usings (e.g., `using={["System", "System.Collections.Generic"]}`). These are rendered at the top of the file before the namespace declaration.

### `code` template handles multi-line C# with proper indentation

The `code` template tag from `@alloy-js/core` processes multi-line strings by detecting relative indentation from leading whitespace, splitting on `\n`, and creating `<indent>` and `<hbr>` nodes. This makes it suitable for embedding multi-line C# code blocks (method bodies, class declarations) within JSX components. The indentation is RELATIVE — the context indentation from parent components (Namespace, ClassDeclaration) is added on top.

### Infrastructure helper files are always generated

Argument.cs, Optional.cs, ChangeTrackingList.cs, and ChangeTrackingDictionary.cs are rendered for EVERY project (matching legacy emitter). They're placed OUTSIDE `<CSharpScalarOverrides>` in emitter.tsx since they don't reference TypeSpec types. Tests checking for "no .cs files" should exclude `/Internal/` paths.

## CodeGen attribute namespace is hardcoded

The four CodeGen attribute files (`CodeGenTypeAttribute`, `CodeGenMemberAttribute`, `CodeGenSuppressAttribute`, `CodeGenSerializationAttribute`) use the **fixed namespace** `Microsoft.TypeSpec.Generator.Customizations`. This does NOT vary with the package name. It matches the legacy emitter's `CodeModelGenerator.CustomizationAttributeNamespace` constant. Do not use `packageName` for these files' namespace.

## ClassDeclaration: `baseType` not `extends`, `attributes` not `decorators`

When using `@alloy-js/csharp`'s `ClassDeclaration`:

- Use `baseType="Attribute"` for inheritance (NOT `extends`)
- Use `attributes={[...]}` for attribute annotations like `[AttributeUsage(...)]` (NOT `decorators`)

## Test filters may match new Internal/ infrastructure files

When tests use broad filters like `k.includes("Serialization")` to find generated files, adding new infrastructure files (e.g., `CodeGenSerializationAttribute.cs` in Internal/) can break them. Always add `&& !k.includes("Internal/")` to exclude infrastructure files from such filters.

## Design Decisions

### 4.1.1 CollectionResultFile — Parameterized Single Component

**Chosen approach:** One `CollectionResultFile` component with `isAsync` and `isConvenience` boolean props, rendered 4 times per paging operation from a parent `CollectionResultFiles` wrapper.

**Rejected alternative:** Four separate components (SyncProtocolCollectionResult, SyncConvenienceCollectionResult, etc.) — too much code duplication since 80% of the logic is shared.

**Rationale:** The parameterized approach maximizes code reuse while keeping each variant's differences (method names, return types, async keywords) clearly visible via conditional expressions.

## Paging Implementation Notes

### How paging methods are identified

- TCGC `SdkPagingServiceMethod` has `kind: "paging"`
- Filter client methods with `m.kind === "paging"` type guard
- The `pagingMetadata` property contains segments for items, next-link, and continuation token

### How item types are extracted

- `method.pagingMetadata.pageItemsSegments` — array of `SdkModelPropertyType` forming path from response to items
- Last segment's `type.valueType` (if array) gives the item type
- Response model from `method.operation.responses.find(r => r.type)?.type`
- Use `<TypeExpression type={sdkType.__raw!} />` for type references (matches model declarations via efCsharpRefkey)

### Request method naming

- Collection result calls `_client.Create{Op}Request(_options)` where the method is on the client's partial class (generated by RestClientFile)
- Operation name uses `cleanOperationName(namePolicy.getName(method.name, "class"))` — same as ProtocolMethod and RestClientFile

## Code template tag whitespace behavior (2026-03-02)

The `code` template tag from `@alloy-js/core` strips leading whitespace when the **first template chunk is whitespace-only** followed by an interpolation. This means:

- ❌ `code\` ${ref} result = ...\`` — loses the 4-space indent
- ✅ `code\` nextPageUri = ((${ref})result)...\`` — keeps indent (first chunk has non-whitespace chars)
- ✅ `"    ", code\`${ref} result = ...\`` — keeps indent by separating indent into a plain string child

**Fix**: When a `code` template needs to start with indentation followed by an interpolated reference, put the indentation in a separate string child before the `code` template.

## Design Decision: Next-link paging strategy (2026-03-02)

**Approach chosen**: Inline strategy selection in the existing `CollectionResultFile` component — detect `nextLinkSegments` on `pagingMetadata` and conditionally build the next-link body vs single-page body using separate builder functions.

**Rejected**: Strategy pattern with separate files/modules — overkill for 2 strategies with small body builder functions. The builder functions (`buildNextLinkGetRawPagesBody`, `buildSinglePageGetRawPagesBody`) are self-contained and don't warrant separate modules.

**Key pattern**: The next-link while-loop references `CreateNext{Op}Request` by string name (not refkey), which will be generated by RestClientFile in task 4.4.1 or similar. This is consistent with how the initial `Create{Op}Request` is referenced.

## Next-link property path with null-conditional access (2026-03-02)

For nested next-link segments, intermediate properties use `?.` (null-conditional operator):

- Single segment: `((ResponseType)result).NextLink`
- Nested segments: `((ResponseType)result).Nested?.NextLink`

The first segment uses direct `.` access on the cast expression (the response model itself is non-null), while subsequent segments use `?.` because intermediate navigation properties could be null.

## Code template newline gotcha (2026-03-02)

The `code` tagged template from `@alloy-js/core` does NOT properly render `\n` escape sequences within the template literal. When using `code` templates with refkeys, always separate the newline+indentation into a plain string and keep the `code` template for refkey resolution only.

**Bad (newline lost):**

```tsx
{
  code`\n            using (${SystemTextJson.JsonDocument} document = ...)`;
}
```

**Good (newline preserved):**

```tsx
{
  ("\n            ");
}
{
  code`using (${SystemTextJson.JsonDocument} document = ...)`;
}
```

## XML-only models: conditional JSON rendering (2026-03-02)

In `emitter.tsx`, JSON-specific serialization components (JsonModelInterfaceWrite, JsonModelWriteCore, JsonModelInterfaceCreate, JsonModelCreateCore, JsonDeserialize, DeserializationConstructor) must be conditionally rendered only when the model supports JSON (`(m.usage & UsageFlags.Json) !== 0`). XML-only models should only get PersistableModel methods and cast operators.

## Smoke test root cause (2026-03-02)

The 4 smoke test failures (dotnet build) are NOT caused by model serialization bugs. They are caused by missing infrastructure files from task 5.1.5:

- `ClientUriBuilder` (used in RestClient)
- `ModelSerializationExtensions` (used in cast operators)
- `CancellationTokenExtensions.ToRequestOptions()` (used in client convenience methods)
- `ClientPipelineExtensions.ProcessMessage()/ProcessMessageAsync()` (used in protocol methods)

## Design Decisions

### AdditionalBinaryDataRead component (task 2.3.12)

**Chosen approach:** Separate `AdditionalBinaryDataRead` component passed as children to `PropertyMatchingLoop`.
**Rejected approach:** Building the catch-all directly into `PropertyMatchingLoop.tsx`.
**Reason:** The children slot was explicitly designed for this purpose (JSDoc comment at line 17), and a separate component mirrors the write-side architecture (`AdditionalBinaryDataWrite`). It keeps PropertyMatchingLoop focused on property matching and follows the single-responsibility principle.

### Test file search patterns must avoid infrastructure file name collisions

When searching for model output files in tests (e.g., `Object.keys(outputs).find(k => k.includes("Format"))`), be aware that infrastructure files will also match partial names:

- `"Format"` matches `SerializationFormat.cs`
- `"Mode"` matches any path containing `Model` (since `"Model".includes("Mode")` is true)
- `"Result"` matches `ErrorResult.cs`

Use `k.endsWith("/Format.cs")` (with leading slash) for precise matching. Note that `k.endsWith("Format.cs")` without a slash is NOT sufficient — `SerializationFormat.cs` also ends with `Format.cs`.

### SerializationFormat enum is pure static content — use raw code template

The SerializationFormat enum has no dynamic content (no TypeSpec model data). Using `EnumDeclaration` + `EnumMember` from Alloy would work but is overkill. A raw `code` template inside `<Namespace>` is simpler and more readable for fully static enums.

### ESLint allows underscore-prefixed unused vars

The eslint config has a custom rule allowing variables prefixed with `_` to be unused (`argsIgnorePattern: "^_"`, `varsIgnorePattern: "^_"`, `destructuredArrayIgnorePattern: "^_"`). Use `_result`, `_index`, `_props` etc. for intentionally unused destructured values.

### CI workflow and pnpm/action-setup require packageManager field

`pnpm/action-setup@v3` requires a pnpm version. This is specified via the `"packageManager": "pnpm@10.30.1"` field in `package.json`. Without it, the CI build step fails with "No pnpm version is specified".

## Gotcha: Preprocessor directives in infrastructure files (2026-03-03)

When generating C# code with `#if NET6_0_OR_GREATER` preprocessor directives inside Alloy's `ClassDeclaration` component:

- **DO NOT** use `code` template blocks for lines between `#if`/`#else`/`#endif`. The `code` block strips leading whitespace and its output gets concatenated with the previous line (e.g., `#endifreturn content;`).
- **DO** define the entire method body containing preprocessor directives as a plain TypeScript string variable, then interpolate it as a JSX child: `{fromObjectBinaryData}`.
- The plain string approach gives full control over line breaks and indentation, avoiding Alloy's dedent/re-indent behavior.
- Plain strings inside `ClassDeclaration` DO get indented by Alloy, which is fine — C# allows indented `#if` directives (e.g., `        #if NET6_0_OR_GREATER`).

See `BinaryContentHelperFile.tsx` for the working pattern vs. the broken `code` block approach.

### EmitterContext follows flight-instructor pattern (Task 0.3.2)

**Chosen approach:** Created `EmitterContext` using `createContext()` from `@alloy-js/core` in `src/contexts/emitter-context.ts`, with a `useEmitterContext()` typed hook that throws if called outside the component tree. Context is provided via `EmitterContext.Provider` inside `HttpClientCSharpOutput`.

**Why:** This matches the RestClientContext pattern in `submodules/flight-instructor/src/csharp/contexts/rest-client-context.ts`. Pre-computing derived state (needsXmlSerialization, hasMultipartOperations) in the root component avoids re-scanning the SdkPackage in every downstream consumer.

**Rejected:** Creating context in `emitter.tsx` and passing as prop — mixes imperative emitter entry point with Alloy component context patterns.

**Gotcha:** Tests using `@route` and `@service` must include `using TypeSpec.Http;` in the TypeSpec code, even when using `HttpTester` (which auto-imports the library). Without it, `@route` produces an `invalid-ref` diagnostic.

## Design Decisions

### Namespace resolution (task 0.3.3)

**Approach chosen:** Add `toNamespace()` conversion inline in `resolvePackageName()` for the `packageNameOption` path only.
**Why:** TCGC-provided namespaces (from clients, SdkPackage.namespaces, crossLanguagePackageId) are already valid C# identifiers. Only user-provided `package-name` options may contain kebab-case. The legacy emitter applied conversion to both option and TCGC client namespace paths, but in the new emitter TCGC values are trusted.
**Rejected:** Creating a separate `resolveNamespace()` wrapper function — would add indirection without benefit since `packageName` is already used as namespace throughout the codebase.

### JsonPatch Builtins (Task 0.2.6)

- `JsonPatch` is in `System.ClientModel.Primitives` namespace — added to existing `SystemClientModelPrimitives` library
- `ExperimentalAttribute` is in `System.Diagnostics.CodeAnalysis` — requires separate `SystemDiagnosticsCodeAnalysis` library for correct `using` generation
- JsonPatch has 10 methods used by merge-patch serialization: TryGetJson, GetJson, TryGetEncodedValue, Contains, IsRemoved, Set, SetPropagators, WriteTo, GetRemainder, GetFirstPropertyName
- The `[Experimental("SCME0001")]` attribute is applied to JsonPatch fields/properties on dynamic models
- Phase 7 tasks (dynamic models, merge-patch) will import these builtins

## Scenario Test Framework Limitations

### Struct extraction not supported

The scenario test tree-sitter configuration only supports extracting: class, function, interface, enum, and type alias declarations. C# `struct` declarations (used for extensible enums) cannot be extracted by type/name. Use full-file comparison instead by omitting the type and name from the code block heading:

````
```csharp src/Generated/Models/MyStruct.cs
// full file content here
````

```

### Namespace differences with legacy emitter
Our emitter generates dot-separated namespaces (e.g., `namespace Type.Enum.Fixed`) while the legacy emitter escapes dots to underscores (e.g., `namespace _Type._Enum.Fixed`). Both are valid C#, but they produce different fully-qualified type names. This affects all scenarios using namespaces with segments that start with uppercase or match C# type names.

## Paging Client Methods

165. **Paging method filter: `m.kind !== "paging"` in ProtocolMethods/ConvenienceMethods** — Paging operations (`kind: "paging"`) have HTTP operations underneath, so `m.operation?.kind === "http"` would match them. Must explicitly exclude paging from regular method generation.

166. **Paging methods: NO validation, NO Task<> wrapping** — Unlike regular methods, paging methods don't call Argument.Assert. Async paging returns `AsyncCollectionResult` (not `Task<AsyncCollectionResult>`). The async type itself handles async iteration.

167. **Paging constructor args must match CollectionResultFile** — Protocol body: `return new Xxx(this, ...params, options)`. Convenience body: `return new Xxx(this, ...convertedArgs, cancellationToken.ToRequestOptions())`. Extra params beyond `(client, options)` require CollectionResultFile constructor updates (task 4.3.1).

168. **Exported param-building functions from ProtocolMethod/ConvenienceMethod** — `buildProtocolParams`, `buildXmlDoc`, `buildConvenienceParams`, `buildConvenienceXmlDoc` are exported for reuse in PagingMethods. Changes to these functions affect both regular and paging method generation.
```

### Continuation-token paging strategy (Task 4.3.1)

**Chosen approach**: Extend `CollectionResultFile.tsx` with inline continuation-token logic alongside existing next-link dispatch.

**Why**: The existing code already uses inline conditional logic for single-page vs next-link strategies. Adding continuation-token as a third branch keeps the code structure consistent and avoids over-engineering with separate strategy abstractions.

**Key implementation details**:

- Continuation-token operations store ALL operation params (from `buildProtocolParams`) as fields in the CollectionResult class, because they need to be passed to `Create{Op}Request` on each iteration.
- The token parameter is identified by matching `metadata.continuationTokenParameterSegments` against operation params.
- Body-based vs header-based detection uses the `kind` discriminator on response segments: `"responseheader"` for headers, `"property"` for body.
- Body-based extraction: `((ResponseType)result).PropertyPath` with `string.IsNullOrEmpty` check.
- Header-based extraction: `result.GetRawResponse().Headers.TryGetValue("header-name", out string value)`.
- GetContinuationToken uses `if/else` pattern (returning null in else block), unlike next-link which uses `if/return null`.
- The same `Create{Op}Request` is re-invoked with updated token (unlike next-link which uses `CreateNext{Op}Request`).

**Rejected**: Creating separate strategy components/abstractions — adds indirection without benefit given the small amount of code involved.

169. **Continuation-token header detection** — `SdkServiceResponseHeader` has `kind: "responseheader"`, while `SdkModelPropertyType` (body properties) has `kind: "property"`. Use the `kind` discriminator to determine body vs header extraction strategy.

170. **Response property path builder reuse** — `buildResponsePropertyPath` (renamed from `buildNextLinkPropertyPath`) is generic and works for both next-link URI paths and continuation-token body property paths. Both use the same `?.' null-conditional operator pattern for nested segments.

## LRO Method Generation (Task 4.5.1)

### Design Decision

For System.ClientModel (non-Azure), LRO methods use the same generation pipeline as basic methods. No separate LRO component (like PagingMethods) is needed because the method signatures are identical — `ClientResult`/`ClientResult<T>` for protocol/convenience.

The `lropaging` kind is excluded from basic/LRO filters and will need separate handling (task 4.5.2).

### Gotchas

- **`@markAsLro` requires model return**: The `@Azure.ClientGenerator.Core.Legacy.markAsLro` decorator can only be applied to operations that return a model. Void returns produce warning `invalid-mark-as-lro-target` and the decorator is ignored.
- **TCGC library must be in test host**: To use `@markAsLro` in tests, `@azure-tools/typespec-client-generator-core` must be listed in the test host's `libraries` array.
- **Async convenience methods wrap**: Long method signatures (especially async with generic return types like `Task<ClientResult<T>>`) wrap across multiple lines due to printWidth. Use partial assertions (check method name + return type separately from parameters).
- **LRO metadata available but unused**: `SdkLroServiceMethod.lroMetadata` contains `finalStateVia`, `finalResponse`, and `finalResultPath` — these are not used in the System.ClientModel target but would be needed for Azure extensions.

## Design Decisions — Task 4.5.2

171. **LRO+Paging treated identically to Paging for System.ClientModel**: Operations with TCGC kind "lropaging" produce the same output as "paging" operations — CollectionResult/AsyncCollectionResult return types and iterator classes. The `lroMetadata` is available on `SdkLroPagingServiceMethod` but unused because System.ClientModel doesn't have LRO-specific return types (no `Operation<T>`). A union type `PagingLikeMethod<T> = SdkPagingServiceMethod<T> | SdkLroPagingServiceMethod<T>` is used in both `PagingMethods.tsx` and `CollectionResultFile.tsx` to handle both kinds with shared code. The legacy emitter's `ScmMethodProviderCollection` similarly doesn't check for `InputLongRunningPagingServiceMethod`, confirming this approach.

172. **Creating lropaging test TypeSpec**: Use `@markAsLro` (from `Azure.ClientGenerator.Core.Legacy`) combined with `@list` and `@pageItems` on the return model to produce `kind: "lropaging"`. TCGC classifies as lropaging when both LRO metadata and paging metadata exist: `const lro = getTcgcLroMetadata(...)` and `const paging = isList(...) || getMarkAsPageable(...)`.

## Multipart TypeSpec tests require explicit `using TypeSpec.Http;` (2026-03-03)

When writing tests with TypeSpec that use `@header`, `@multipartBody`, or `HttpPart<T>`, you MUST include `using TypeSpec.Http;` in the TypeSpec code even when using `HttpTester` (which calls `Tester.importLibraries()`). Without it, the compiler reports "Unknown decorator @header" and "Unknown identifier HttpPart". The `@service` decorator works without explicit import, but HTTP-specific decorators need it.

## MultiPartFormDataBinaryContentFile uses self-filtering pattern (2026-03-03)

The `MultiPartFormDataBinaryContentFile` component uses `useEmitterContext().hasMultipartOperations` internally to decide whether to render. When the flag is false, it returns `false` (renders nothing in JSX). This pattern keeps `emitter.tsx` clean — the component is added unconditionally to the JSX tree and self-filters. Other conditional infrastructure files can follow this same pattern.

## Design Decision: MultiPartFormDataBinaryContentFile uses plain strings (2026-03-03)

**Chosen approach:** Plain string body inside `<ClassDeclaration baseType="BinaryContent">`, matching the BinaryContentHelperFile.tsx pattern. The class content is static (no TypeSpec-dependent parts), and preprocessor directives require plain strings per the documented gotcha.

**Rejected approach:** Full Alloy components (Method, Property, etc.) — too complex for static content, preprocessor directives problematic with Alloy component indentation, no benefit since content doesn't vary with TypeSpec input.

## Validation: Authentication Scenarios (task 10.1.1)

### Differences from Spector golden files

1. **No per-client `ClientOptions` class**: Our emitter uses `ClientPipelineOptions` directly. The legacy emitter generates `ApiKeyClientOptions : ClientPipelineOptions` per client. Future task needed to add custom options class generation.

2. **No default endpoint convenience constructors**: Our emitter requires explicit `Uri endpoint` parameter. The legacy emitter generates convenience constructors with hardcoded default endpoints (e.g., `http://localhost:3000`). Likely depends on `@server` decorator handling.

3. **Union auth: combined constructor instead of separate overloads**: Our emitter generates one constructor taking both `ApiKeyCredential` AND `AuthenticationTokenProvider`. The legacy emitter generates SEPARATE constructors for each auth type so users can choose one. This is a public API surface difference.

4. **Custom HTTP auth (`SharedAccessKey` scheme) not recognized**: TypeSpec `@useAuth({type: AuthType.http, scheme: "SharedAccessKey"})` produces no credential parameter. The legacy emitter maps non-bearer HTTP auth to `ApiKeyCredential`. Our `getAuthInfo()` in `client-params.ts` doesn't handle anonymous `HttpAuth` object patterns.

5. **No `ModelReaderWriterContext` class for auth-only scenarios**: The legacy emitter generates empty context classes (e.g., `AuthenticationApiKeyContext.cs`). Our emitter skips context generation when there are no serializable models.

6. **Union auth only applies first auth policy**: In the union (api-key + oauth2) scenario, our emitter only adds the ApiKeyAuthenticationPolicy to the pipeline, not the BearerTokenAuthenticationPolicy. The legacy emitter applies both policies or selects based on constructor used.

## Design Decisions

### Multipart contentType parameter (Task 9.1.2)
**Chosen approach**: Add synthetic `contentType: string` parameter for multipart/form-data operations in both `buildProtocolParams()` and `buildMethodParams()`. Use the `contentType` variable in `buildRequestBody()` for the Content-Type header.

**Rejected approach**: Letting the Content-Type header parameter through `isImplicitContentTypeHeader` for multipart operations. This was rejected because the legacy emitter adds a synthetic parameter (`ScmKnownParameters.ContentType`) rather than using the actual header parameter, and the naming/doc would differ.

**Detection**: Use `bodyParam.contentTypes?.includes("multipart/form-data")` via `isMultipartFormData()` helper (defined in both ProtocolMethod.tsx and RestClientFile.tsx).

**Why dynamic**: Multipart Content-Type includes the boundary string generated at runtime by `MultiPartFormDataBinaryContent`. Hardcoding "multipart/form-data" would cause server rejections.

## Async method signature line wrapping

When Alloy generates async C# methods with 3+ parameters, the parameters wrap across multiple lines:
```csharp
public virtual async Task<ClientResult> UploadAsync(
    BinaryContent content,
    string contentType,
    RequestOptions options
)
```
In tests, use fragment matching (`toContain("UploadAsync(")`) rather than full single-line signature matching, which will fail due to line breaks.

## detectMultipartOperations must use getAllClients()

The `detectMultipartOperations()` function in `HttpClientCSharpOutput.tsx` must scan ALL clients (root + sub-clients) using `getAllClients()`, not just `sdkPackage.clients` which only contains root-level clients. Sub-clients accessed via `client.children` may have multipart operations that require the `MultiPartFormDataBinaryContent.cs` infrastructure file.

## Scenario Test Struct Limitation (2026-03-03)

The scenario test framework's tree-sitter C# extractor only supports extracting `class_declaration`, `interface_declaration`, `enum_declaration`, and `local_function_statement` node types. **Struct declarations (`struct_declaration`) cannot be extracted** using the current `nodeKindMapping`. This means extensible enum structs (like `DogKind`) cannot be validated via scenario tests — use dedicated unit tests instead (e.g., `test/extensible-enum.test.ts`).

## Design Decisions

### Model Validation Approach (Task 10.1.2)
**Chosen approach:** Create markdown scenario files that validate the emitter's **current actual output**, rather than using golden file expectations that would cause immediate test failures.

**Rationale:** The emitter output has known differences from Spector golden files (see below). Creating tests with current output provides regression protection now, while differences are tracked as separate issues. This is preferable to creating failing tests that would mask real regressions.

**Rejected approach:** Using Spector golden file expectations directly — this would cause immediate failures due to known gaps (inheritance constructor chains, collection types, access modifiers).

### Known Differences: Emitter vs Spector Golden Files (2026-03-03)

1. **Not-discriminated inheritance constructors**: Emitter produces derived class constructors with only own properties (e.g., `Cat(int age)`) while golden files include all ancestor required properties (e.g., `Cat(string name, int age) : base(name)`). This is a gap in constructor chain propagation.

2. **Collection types for optional polymorphic properties**: Emitter produces `Bird[]` and `IDictionary<string, Bird>` while golden files use `IList<Bird>` and `IDictionary<string, Bird>`. The `Eagle.Friends` property should be `IList<Bird>` not `Bird[]`.

3. **Discriminator enum access modifiers**: Emitter produces `public` access for `DogKind` struct and `SnakeKind` enum, while golden files use `internal` access for discriminator enums.

4. **Constructor access modifier order**: Emitter produces `protected private` while golden files use `private protected`. Both are semantically identical in C# but the order differs.

### Paging method response type is the item type, not the page wrapper

For `SdkPagingServiceMethod`, `method.response.type` returns the individual item type (e.g., `Thing`), NOT the page wrapper model (e.g., `PageThing`). To get the page wrapper, you must inspect `method.operation.responses[].type`. This is critical when doing type reachability analysis — missing the operation-level responses will cause page wrapper models to be classified as unreachable and removed/internalized.

### SdkMethod has no clientaccessor kind in current TCGC version

`SdkMethod<T> = SdkServiceMethod<T>` — there is no `SdkClientAccessor` variant. All methods in `client.methods` are service methods with `kind: "basic" | "paging" | "lro" | "lropaging"`. All have `parameters`, `response`, and `operation` properties. Do not check for `kind === "clientaccessor"`.

### Operation-level types complement method-level types

When collecting all types used by an operation, check BOTH:
1. Method-level: `method.parameters[].type`, `method.response.type`, `method.exception.type`
2. Operation-level: `method.operation.bodyParam.type`, `method.operation.responses[].type`, `method.operation.exceptions[].type`

The method-level types represent the SDK API surface (what users see), while operation-level types include internal types like page wrappers that are still emitted as C# models.
