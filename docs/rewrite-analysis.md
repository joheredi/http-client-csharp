# Comprehensive Study: C# HTTP Client Code Generator — Rewrite Analysis

## Executive Summary

This document provides a deep technical analysis of the legacy C# code generator (`submodules/typespec/packages/http-client-csharp`) and the Alloy C# framework (`submodules/alloy/packages/csharp`) to inform a rewrite as a purely TypeScript-based TypeSpec emitter. The study covers every subsystem of the legacy generator — from the TypeScript emitter that serializes the intermediate model, through the C# code generator's architecture, to the Alloy framework's JSX-based code generation capabilities.

---

## 1. Legacy System Architecture Overview

The current system is a **two-phase pipeline**:

```
TypeSpec Source
    ↓ (TypeSpec compiler)
$onEmit(EmitContext) — TypeScript emitter
    ↓
createSdkContext() → TCGC SdkPackage
    ↓
createModel() → CodeModel (TypeScript objects)
    ↓
Serialize to tspCodeModel.json (JSON with $id/$ref dedup)
+ Configuration.json
    ↓
dotnet Microsoft.TypeSpec.Generator.dll (out-of-process C# generator)
    ↓ (JSON-RPC over stdout for diagnostics)
Generated C# code in src/Generated/
```

### Phase 1: TypeScript Emitter

The TypeScript emitter converts TypeSpec types through the TCGC (TypeSpec Client Generator Core) SDK into an intermediate `CodeModel` object. Key modules:

- **`emitter.ts`**: Entry point (`$onEmit`). Resolves options, creates SDK context, builds code model, serializes to JSON, spawns the C# generator process.
- **`type-converter.ts`**: Converts TCGC `SdkType` → `InputType` hierarchy (models, enums, primitives, arrays, dicts, unions, nullable, datetime, duration). Uses a `SdkTypeCache` for memoization and circular reference breaking.
- **`client-converter.ts`**: Converts SDK clients to `InputClient` objects with recursive hierarchy, endpoint parameters, and lazy caching.
- **`operation-converter.ts`**: Converts operations to `InputOperation` (HTTP details) + `InputServiceMethod` (client API abstraction). Handles basic, paging, LRO, and LRO+paging method kinds.
- **`code-model-writer.ts`**: Serializes the `CodeModel` to JSON with `$id`/`$ref` reference deduplication. Objects with `crossLanguageDefinitionId` or `kind` get unique IDs; subsequent references become `{ "$ref": "id" }`.

The intermediate model (`tspCodeModel.json`) contains:
- `name`, `apiVersions`
- `enums[]`, `constants[]`, `models[]`
- `clients[]` (hierarchical, with methods, operations, parameters)
- `auth` (API key + OAuth2)

### Phase 2: C# Code Generator

The C# generator is a .NET console application that reads the JSON intermediate model and produces C# source files. It uses:

- **MEF (Managed Extensibility Framework)** for plugin discovery
- **Roslyn** for custom code awareness, syntax rewriting, dead code elimination, and formatting
- **A rich AST-like object model** (Expressions, Statements, Snippets) for programmatic code construction

---

## 2. C# Generator Core Architecture

### 2.1 Entry Point & Plugin System

The generator starts as a console app with arguments: `<outputDirectory> -g <generatorName> [--new-project] [--debug]`.

**MEF composition** discovers generators (`CodeModelGenerator` subclasses) and plugins (`GeneratorPlugin`) from DLLs. Plugins can add visitors, rewriters, metadata references, or shared source directories. The selected generator becomes the singleton `CodeModelGenerator.Instance`.

### 2.2 Generation Pipeline (`CSharpGen.ExecuteAsync`)

```
1. Initialize GeneratedCodeWorkspace (Roslyn AdhocWorkspace)
2. Load custom code compilation (user-written partial classes)
3. Build SourceInputModel (merges custom + generated symbol info)
4. Build OutputLibrary → lazily creates all TypeProvider objects
5. EnsureBuilt() all TypeProviders (forces member materialization)
6. Run LibraryVisitors → can transform/filter the entire output
7. Filter members overridden by custom code
8. For each TypeProvider → CodeWriter.Write() → add to workspace
9. PostProcess (dead code elimination, Roslyn Simplifier/Formatter)
10. Write generated files to disk
11. Optional: scaffold new project (.csproj, .sln)
```

### 2.3 Core Abstractions

#### TypeProvider (Abstract Base Class)
The central abstraction for any generated C# type. Uses a **lazy-cached builder** pattern where every property calls a `Build*()` virtual method once and caches the result. Key members:

- **Identity**: `Name`, `Namespace`, `Type` (CSharpType), `DeclarationModifiers`
- **Members**: `Properties[]`, `Methods[]`, `Fields[]`, `Constructors[]`, `Implements[]`
- **Hierarchy**: `BaseType`, `NestedTypes[]`, `SerializationProviders[]`
- **Views**: `CustomCodeView` (hand-written partial class), `SpecView` (unfiltered), `CanonicalView` (merged), `LastContractView` (previous version for compat)
- **Mutability**: `Update()` replaces specific members; `Reset()` forces rebuild

#### TypeFactory
Central factory with aggressive caching. Maps `InputType` → `CSharpType` and creates typed providers (models, enums, clients). All methods are `virtual` for extensibility.

Key type mappings:
- `InputModelType` → `ModelProvider`
- `InputEnumType` → `FixedEnumProvider` or `ExtensibleEnumProvider`
- `InputArrayType` → `IList<T>`
- `InputDictionaryType` → `IDictionary<string, T>`
- `InputPrimitiveType` → `bool`, `int`, `string`, `DateTimeOffset`, `BinaryData`, `Uri`, etc.
- `InputNullableType` → wrapped type with `.WithNullable(true)`

#### OutputLibrary
Assembles all `TypeProvider` objects:
- Models (from `InputNamespace.Models`)
- Enums (from `InputNamespace.Enums`)
- Clients + RestClients + ClientOptions
- Infrastructure types (ChangeTrackingList/Dictionary, Argument, Optional, etc.)
- Serialization helpers (ModelSerializationExtensions, TypeFormatters, ClientUriBuilder, etc.)
- Model factory, MRW context, codegen attributes

### 2.4 Code Representation: Expressions, Statements, and Snippets

The legacy generator uses a **three-layer code representation system** rather than string templates:

#### Expressions (37 types, all `record`)
Root: `ValueExpression` (abstract). Provides a fluent API for composition:
- **Literals**: `LiteralExpression`, `TypeReferenceExpression`, `TypeOfExpression`
- **Operators**: `BinaryOperatorExpression`, `UnaryOperatorExpression`, `AssignmentExpression`
- **Access**: `MemberExpression`, `IndexerExpression`, `NullConditionalExpression`
- **Invocation**: `InvokeMethodExpression` (the most complex — handles async, ConfigureAwait, extension methods)
- **Creation**: `NewInstanceExpression`, `NewArrayExpression`, `ObjectInitializerExpression`
- **Control**: `TernaryConditionalExpression`, `SwitchExpression`, `FuncExpression`
- **Collections**: `ListExpression`, `DictionaryExpression`, `KeyValuePairExpression`

#### Statements (26 types)
Root: `MethodBodyStatement` (abstract). Implements `IEnumerable<MethodBodyStatement>`:
- **Control flow**: `IfStatement`, `IfElseStatement`, `ForStatement`, `ForEachStatement`, `WhileStatement`, `SwitchStatement`, `TryCatchFinallyStatement`
- **Declarations**: `DeclareLocalFunctionStatement`, `UsingScopeStatement`, `AttributeStatement`
- **XML docs**: `XmlDocSummaryStatement`, `XmlDocParamStatement`, `XmlDocReturnsStatement`, `XmlDocExceptionStatement`
- **Preprocessor**: `IfElsePreprocessorStatement`, `PragmaWarningDisableStatement`

#### Snippets (30+ static classes)
Type-safe code generation helpers using `ScopedApi<T>` generic wrappers:
- `StringSnippets`, `IntSnippets`, `BoolSnippets`, `ListSnippets`, `DictionarySnippets`
- `Utf8JsonWriterSnippets`, `Utf8JsonReaderSnippets`, `JsonElementSnippets`
- `HttpRequestApiSnippets`, `HttpResponseApiSnippets`, `ClientPipelineApiSnippets`
- `TypeFormattersSnippets`, `OptionalSnippets`, `BinaryContentHelperSnippets`

The snippet pattern: extension methods on `ScopedApi<T>` produce `ValueExpression` or `MethodBodyStatement` nodes. E.g., `writer.WriteStartObject()` generates `writer.WriteStartObject();` in the output.

### 2.5 CodeWriter — The Text Emitter

The `CodeWriter` converts the AST to C# source text:
- **Buffer**: Custom `UnsafeBufferSequence` (high-performance `IBufferWriter<char>`)
- **Scoping**: `Stack<CodeScope>` manages indentation (4 spaces/level), identifier tracking, and brace matching via `IDisposable`
- **Type rendering**: Fully-qualified names with `global::` prefix, C# keyword aliases (`int` for `System.Int32`), nullable handling
- **Format specifiers in interpolated strings**: `:D` (declaration), `:I` (identifier with `@` escaping), `:L` (literal), `:C` (XML doc cref)
- **Using tracking**: Namespaces collected during writing, materialized at `ToString()` time with `System.*` sorted first

### 2.6 LibraryVisitor & LibraryRewriter

**LibraryVisitor** operates on the **semantic model** (TypeProvider tree) before code emission:
- Pre-visit hooks: `PreVisitModel`, `PreVisitEnum`, `PreVisitProperty` (during TypeFactory creation)
- Visit hooks: `VisitType`, `VisitMethod`, `VisitConstructor`, `VisitProperty`, `VisitField`
- Statement/Expression visitors for deep AST transformation
- `PostVisitType` for post-member processing

**LibraryRewriter** operates on **Roslyn syntax trees** after code emission:
- Extends `CSharpSyntaxRewriter` with injected `SemanticModel`
- Runs during `GeneratedCodeWorkspace.ProcessDocument()`

---

## 3. Generated Output: What the C# Generator Produces

### 3.1 Model Types

For each `InputModelType`, the generator produces:

**Model class** (`{Name}.cs`):
- **Two constructors**: Public initialization (required params) + internal serialization (all params)
- **Properties**: Auto-properties with computed getters/setters based on required/readonly/nullable
- **Fields**: `_additionalBinaryDataProperties` (raw data), backing fields for polymorphic overrides
- **Discriminator handling**: Abstract base types, virtual/override discriminator properties, unknown discriminator variants
- **Backward compatibility**: Maintains API surface from previous contract versions

**Serialization** (`{Name}.Serialization.cs`):
- Implements `IJsonModel<T>` and `IPersistableModel<T>`
- `JsonModelWriteCore()`: Property-by-property JSON serialization with format-aware handling
- `DeserializeXxx()`: Property-by-property deserialization with `foreach (var prop in element.EnumerateObject())`
- Cast operators: `implicit operator BinaryContent` (input), `explicit operator T(ClientResult)` (output)
- Optional XML serialization (`XmlModelWriteCore`, `DeserializeXxx(XElement)`)
- Dynamic model support (JsonPatch-aware serialization for merge-patch)

### 3.2 Enum Types

**Fixed enums** (C# `enum`):
- Enum members with values
- Serialization extension class with `ToSerialString()` and `ToEnumName()` methods

**Extensible enums** (`readonly partial struct : IEquatable<T>`):
- Private const fields + public static properties
- Constructor, equality operators, implicit conversion from underlying type
- `ToString()`, `Equals()`, `GetHashCode()` implementations

### 3.3 Client Types

**Client class** (`{Name}.cs`):
- Fields: endpoint, auth credentials, sub-client caches, API version
- Public/internal constructors with pipeline creation
- Service operation methods (protocol + convenience, sync + async)
- Sub-client factory methods with thread-safe lazy caching

**REST client** (`{Name}.RestClient.cs`):
- `CreateXxxRequest()` methods building HTTP requests
- URI construction via `ClientUriBuilder`
- Path/query/header parameter serialization
- Response status code classifiers

**Client options** (`{Name}Options.cs`):
- Extends `ClientPipelineOptions`
- Nested `ServiceVersion` enum
- Latest version constant, version-to-string mapping

### 3.4 Infrastructure Types

12+ internal helper classes:
- `TypeFormatters` (value→string for query/path/header)
- `BinaryContentHelper` (collection→BinaryContent)
- `Utf8JsonBinaryContent` (JSON request body wrapper)
- `ModelSerializationExtensions` (JSON/XML extension methods)
- `ClientUriBuilder` (fluent URI construction)
- `MultiPartFormDataBinaryContent` (multipart content)
- `ClientPipelineExtensions` (ProcessMessage, ProcessHeadAsBoolMessage)
- `PipelineRequestHeadersExtensions` (SetDelimited, Add prefix headers)
- `CancellationTokenExtensions` (ToRequestOptions bridge)
- `ErrorResult<T>` (error response wrapper)
- `CollectionResult<T>` / `AsyncCollectionResult<T>` (paging)
- `Optional` (IsDefined, IsCollectionDefined)
- `ChangeTrackingList<T>` / `ChangeTrackingDictionary<TKey,TValue>`
- `Argument` (parameter validation)
- `ModelReaderWriterContext` (MRW type registration)
- `SerializationFormat` enum

### 3.5 Paging Collections

Per-operation paging classes with three strategies:
- **Single page**: One request, one yield return
- **Next link**: Loop extracting next-link URL from response body/header
- **Continuation token**: Loop replacing token in subsequent requests

### 3.6 Project Scaffolding

- `.csproj` with `netstandard2.0;net8.0` targets, `System.ClientModel` dependency
- `.sln` file
- License headers, auto-generated markers, `#nullable disable`

---

## 4. Alloy C# Framework

The Alloy framework (`@alloy-js/csharp`) provides a **JSX/TSX component model** for generating C# code. Instead of the legacy generator's imperative AST construction, the rewrite will use declarative JSX templates.

### 4.1 Core Architecture

```
┌─────────────────────────────────┐
│  Consumer Code (JSX templates)  │  ← Generated by the emitter
├─────────────────────────────────┤
│  Components (30+ JSX functions) │  ← ClassDeclaration, SourceFile, etc.
├─────────────────────────────────┤
│  Symbols (CSharpSymbol tree)    │  ← Reactive symbol model with modifiers
├─────────────────────────────────┤
│  Scopes (nested scope chain)    │  ← Namespace > SourceFile > Class > Method
├─────────────────────────────────┤
│  Name Policy (PascalCase, etc.) │  ← Automatic casing per element type
├─────────────────────────────────┤
│  @alloy-js/core                 │  ← Binder, rendering, reactivity, refkeys
└─────────────────────────────────┘
```

### 4.2 Available Components

**Type Declarations:**
- `ClassDeclaration` — full class with access, modifiers, base type, interfaces, type parameters, primary constructor, attributes, doc
- `StructDeclaration` — struct with readonly, ref, partial modifiers
- `RecordDeclaration` — record with primary constructor
- `InterfaceDeclaration` — interface with type parameters
- `EnumDeclaration` + `EnumMember` — enum with member scope

**Member Declarations:**
- `Method` — with parameters, return type, async, expression body, type parameters, doc, attributes
- `Property` — with get/set/init, nullable, initializer, required
- `Field` — with modifiers (static, readonly, volatile, const)
- `Constructor` — auto-derives name from enclosing type
- `Parameters` + `Parameter` — with in/out/ref modifiers, defaults, attributes

**File Structure:**
- `SourceFile` — manages using statements (auto + explicit), file-scoped/block namespaces, header
- `Namespace` — creates namespace scope, supports nesting
- `CsprojFile` — MSBuild project file generation

**Expressions & Statements:**
- `InvocationExpression` — method/function calls with type args
- `AccessExpression` — member access chains (`.Property?.Method()[0]`)
- `VarDeclaration` — variable declarations with type inference
- `IfStatement` / `ElseIfClause` / `ElseClause`

**Documentation & Metadata:**
- `DocComment` + tag components (`DocSummary`, `DocParam`, `DocReturns`, `DocException`, `DocSee`, etc.)
- `DocFromMarkdown` — converts Markdown to XML doc comments
- `Attributes` / `AttributeList`
- `Region` — `#region`/`#endregion`

**Utilities:**
- `LexicalScope` / `MethodScope` — block and method scope management
- `Name` / `Reference` — declaration name rendering and cross-referencing

### 4.3 Symbol & Scope System

**Symbols** represent C# declarations in a reactive tree:
- `CSharpSymbol` — base, carries access/modifier metadata
- `NamedTypeSymbol` — classes, interfaces, enums, structs, records
- `NamespaceSymbol` — namespace with `getFullyQualifiedName()`
- `MethodSymbol` — methods and constructors

**Scopes** form a hierarchy:
- `CSharpScope` → `CSharpLexicalScope` → `CSharpSourceFileScope`, `CSharpMethodScope`
- `CSharpNamedTypeScope` → `CSharpClassScope`, `CSharpNamespaceScope`

**Key feature**: When a symbol from namespace A is referenced in a file with namespace B, the framework automatically adds `using A;` to the source file.

### 4.4 `createLibrary()` — External Type Registration

Declares external .NET types (BCL, NuGet packages) for type-safe referencing:

```typescript
const System = createLibrary("System", {
  String: { kind: "struct", members: { ... } },
  Int32: { kind: "struct", members: { ... } },
  // ... 4000+ lines of BCL type definitions
});
```

The builtins package pre-declares `System.*` and `Microsoft.*` namespaces covering Collections, IO, Linq, Net, Text.Json, Threading, and more.

### 4.5 Testing

Tests use **exact string comparison** (not snapshots):
```tsx
expect(
  <TestNamespace>
    <ClassDeclaration public name="Foo" />
  </TestNamespace>
).toRenderTo(`public class Foo;`);
```

The `d` tagged template strips indentation. The `toSourceText()` helper renders a full namespace-scoped file.

---

## 5. Current State of the Rewrite

The new project (`/src`) is at **scaffolding stage** — a working build/test pipeline that emits a "Hello world!" text file. No C# code generation logic exists yet.

**Dependencies configured**: `@alloy-js/core`, `@alloy-js/csharp`, `@typespec/emitter-framework`

**Infrastructure working**: JSX compilation (via `@alloy-js/rollup-plugin`), vitest testing, TypeSpec emitter registration

---

## 6. Mapping Legacy Generator → Alloy Components

This section maps each major generated output from the legacy C# generator to the Alloy framework components that would be used in the rewrite.

### 6.1 Model Generation

| Legacy (C# Generator) | Rewrite (Alloy JSX) |
|---|---|
| `ModelProvider` → `TypeProviderWriter.WriteType()` | `<ClassDeclaration>` or `<StructDeclaration>` with children |
| `BuildProperties()` → `PropertyProvider` | `<Property>` with get/set/init/nullable/required |
| `BuildFields()` → `FieldProvider` | `<Field>` with static/readonly/const |
| `BuildConstructors()` → `ConstructorProvider` | `<Constructor>` with `<Parameters>` |
| `BuildSerializationProviders()` → `MrwSerializationTypeDefinition` | Separate `<SourceFile>` with partial class implementing IJsonModel |
| `XmlDocProvider` | `<DocComment>` with `<DocSummary>`, `<DocParam>` etc. |
| `AttributeStatement` | `<Attributes>` |
| Discriminator handling | `abstract` prop on `<ClassDeclaration>`, override patterns |

### 6.2 Enum Generation

| Legacy | Rewrite |
|---|---|
| `FixedEnumProvider` → C# `enum` | `<EnumDeclaration>` with `<EnumMember>` children |
| `ExtensibleEnumProvider` → `readonly struct` | `<StructDeclaration readonly>` with manually built members |
| `FixedEnumSerializationProvider` → extension class | `<ClassDeclaration static>` with `<Method>` for ToSerial/ToEnum |
| `ExtensibleEnumSerializationProvider` → partial struct | Partial `<StructDeclaration>` with serialization methods |

### 6.3 Client Generation

| Legacy | Rewrite |
|---|---|
| `ClientProvider` | `<ClassDeclaration>` with fields, constructors, methods |
| `RestClientProvider` (partial) | `<ClassDeclaration partial>` in separate `<SourceFile>` |
| `ClientOptionsProvider` | `<ClassDeclaration>` extending options base type |
| `ScmMethodProviderCollection` (4 methods per operation) | 4x `<Method>` components per operation |
| Pipeline/HTTP abstraction APIs | Direct code generation using `<InvocationExpression>`, `<AccessExpression>` |

### 6.4 Infrastructure Types

Most infrastructure types are **static helper classes** that could be:
1. Generated as `<ClassDeclaration static>` with `<Method>` children (same approach, different syntax)
2. Pre-written as static `.cs` files included via project scaffolding (since their content is mostly fixed)
3. Defined via `createLibrary()` as builtins if they come from a NuGet package

### 6.5 Serialization

The most complex part. JSON serialization requires generating detailed method bodies with:
- `<Method>` for `Write`/`JsonModelWriteCore`/`DeserializeXxx`
- Property-by-property serialization using inline code (`code` tagged template or nested JSX)
- `<IfStatement>` for null/optional checks
- `<InvocationExpression>` for `writer.WritePropertyName()`, `writer.WriteStringValue()`, etc.

---

## 7. Key Challenges for the Rewrite

### 7.1 No AST Library — Direct String Generation

The legacy generator uses a rich expression/statement AST that the `CodeWriter` serializes. The rewrite uses Alloy's JSX components which render directly to strings via the component tree. This means:

- **No intermediate AST manipulation** — must get the output right in the JSX tree
- **No post-hoc visitor transformation** — must use component composition and props instead
- **No Roslyn simplification/formatting** — must produce correctly formatted output directly

### 7.2 Serialization Complexity

MRW serialization is the most complex part (~3000 lines of C# generation logic). Each model property requires type-specific serialization/deserialization code with:
- 15+ primitive type handlers
- Collection (list/dict) handling with nested element serialization
- Nullable wrapping/unwrapping
- Format-aware encoding (RFC3339, Unix timestamps, Base64URL, etc.)
- Additional properties (typed and untyped)
- Raw data field for unknown properties
- Discriminator dispatch tables

### 7.3 Custom Code Integration

The legacy generator supports hand-written partial classes that merge with generated code via:
- `[CodeGenType]`, `[CodeGenMember]`, `[CodeGenSuppress]`, `[CodeGenSerialization]` attributes
- Roslyn-based analysis of custom code compilation
- Automatic filtering of generated members that conflict with custom code

The rewrite will need an alternative strategy since Roslyn won't be available.

### 7.4 Backward Compatibility

The legacy generator maintains API compatibility with previous contract versions:
- NuGet package download of previous versions
- Signature comparison for methods/constructors
- Property type/access compatibility checking
- Auto-generation of backward-compatible overloads

### 7.5 Dead Code Elimination

The legacy generator uses Roslyn's semantic model to:
- Build reference maps via `SymbolFinder`
- BFS traversal from root types (clients, custom code)
- Internalize or remove unreferenced types

### 7.6 Pipeline Abstraction

The legacy `ClientPipelineApi`/`HttpRequestApi`/etc. abstraction layer enables swapping between Azure SDK and plain System.ClientModel. The rewrite needs equivalent extensibility.

---

## 8. Recommended Approach for the Rewrite

### 8.1 Direct TypeSpec-to-C# Pipeline

```
TypeSpec Source → TCGC SdkPackage → JSX Component Tree → C# Source Files
```

Eliminate the intermediate JSON serialization step entirely. Read TypeSpec types directly and produce JSX component trees that render to C# files.

### 8.2 Component Architecture

Build a library of higher-level components specific to HTTP client generation:

```
<HttpClientLibrary>           ← Root component, iterates clients/models/enums
  <ModelFile model={...}>     ← Generates model class + serialization
  <ClientFile client={...}>   ← Generates client class
  <RestClientFile client={...}> ← Generates REST client partial
  <EnumFile enum={...}>       ← Generates enum + serialization
  <InfrastructureFiles>       ← Generates helper classes
  <ProjectFile>               ← Generates .csproj
</HttpClientLibrary>
```

### 8.3 Leverage Alloy's Strengths

- **Automatic `using` management** — reference builtins via `createLibrary()` symbols
- **Name policy** — PascalCase/camelCase handled automatically
- **Reactive references** — cross-file type references resolved automatically
- **Component composition** — build small, testable components that compose into complex output

### 8.4 Define C# SDK Builtins

Create `createLibrary()` definitions for:
- `System.ClientModel` (already in Alloy builtins)
- `System.Text.Json` (already in Alloy builtins)
- `System.Net.Http` (already in Alloy builtins)
- Any Azure-specific SDK types needed

The `System.ClientModel` builtin should be organized into logical groups:
- **Core types**: `ClientResult`, `ClientResult<T>`, `ClientPipeline`, `BinaryContent`, `PipelineMessage`, `PipelineRequest`, `PipelineResponse`, `PipelinePolicy`, `PipelineMessageClassifier`
- **Options & errors**: `ClientPipelineOptions`, `RequestOptions`, `ClientResultException`, `ApiKeyCredential`, `ApiKeyAuthenticationPolicy`
- **Paging**: `CollectionResult`, `AsyncCollectionResult`, `CollectionResult<T>`, `AsyncCollectionResult<T>`, `ContinuationToken`
- **Serialization primitives**: `ModelReaderWriterOptions`, `ModelReaderWriterContext`, `IJsonModel<T>`, `IPersistableModel<T>`, `ModelReaderWriter`, `PersistableModelProxyAttribute`, `ModelReaderWriterBuildableAttribute`
- **Auth & policy**: `BearerTokenPolicy`, `UserAgentPolicy`, `AuthenticationTokenProvider`, `ClientErrorBehaviors`
- **Merge-patch**: `JsonPatch` and experimental serialization types (for dynamic model support)

### 8.5 Testing Strategy

Use Alloy's `toRenderTo` pattern for unit testing each component:
- Test individual property/method rendering
- Test model class generation end-to-end
- Test serialization method generation for each type variant
- Compare output against known-good legacy generator output

---

## 9. Inventory of Generated Artifacts

### Files Generated Per Model
1. `src/Generated/Models/{Name}.cs` — Model class
2. `src/Generated/Models/{Name}.Serialization.cs` — Serialization implementation

### Files Generated Per Enum
1. `src/Generated/Models/{Name}.cs` — Enum definition
2. `src/Generated/Models/{Name}.Serialization.cs` — Serialization extension methods

### Files Generated Per Client
1. `src/Generated/{Name}.cs` — Client class
2. `src/Generated/{Name}.RestClient.cs` — REST client (partial)
3. `src/Generated/{Name}Options.cs` — Client options (may be shared singleton)

### Fixed Infrastructure Files
1. `src/Generated/Internal/Argument.cs`
2. `src/Generated/Internal/ChangeTrackingDictionary.cs`
3. `src/Generated/Internal/ChangeTrackingList.cs`
4. `src/Generated/Internal/Optional.cs`
5. `src/Generated/Internal/ModelSerializationExtensions.cs`
6. `src/Generated/Internal/TypeFormatters.cs`
7. `src/Generated/Internal/ClientUriBuilder.cs`
8. `src/Generated/Internal/Utf8JsonBinaryContent.cs`
9. `src/Generated/Internal/BinaryContentHelper.cs`
10. `src/Generated/Internal/ClientPipelineExtensions.cs`
11. `src/Generated/Internal/PipelineRequestHeadersExtensions.cs`
12. `src/Generated/Internal/CancellationTokenExtensions.cs`
13. `src/Generated/Internal/ErrorResult.cs`
14. `src/Generated/Internal/SerializationFormat.cs`
15. `src/Generated/Internal/MultiPartFormDataBinaryContent.cs` (conditional)
16. `src/Generated/Models/{Context}Context.cs` — ModelReaderWriterContext
17. `src/Generated/Models/{ServiceName}ModelFactory.cs` — Model factory
18. `src/Generated/Internal/CodeGenTypeAttribute.cs`
19. `src/Generated/Internal/CodeGenMemberAttribute.cs`
20. `src/Generated/Internal/CodeGenSuppressAttribute.cs`
21. `src/Generated/Internal/CodeGenSerializationAttribute.cs`

### Project Scaffolding (--new-project)
1. `src/{PackageName}.csproj`
2. `{PackageName}.sln`

---

## 10. Summary Statistics

| Component | Files | Lines (approx) |
|---|---|---|
| TypeScript Emitter | 39 TS files | ~5,000 |
| C# Generator Core | ~90 CS files | ~15,000 |
| C# Generator ClientModel | ~95 CS files | ~20,000 |
| C# Generator Input Model | ~110 CS files | ~8,000 |
| **Total Legacy C# Generator** | **~295 CS files** | **~43,000** |
| Alloy C# Framework | ~150 TS/TSX files | ~12,000 |
| New Project (current state) | 6 files | ~100 |

The rewrite will need to replicate the behavior of ~43,000 lines of C# code using TypeScript + JSX, leveraging the ~12,000-line Alloy framework as the foundation.

**Estimated rewrite scope by phase:**

| Phase | Tasks | Complexity |
|-------|-------|------------|
| 0. Foundation | 15 | Low |
| 1. Types (Models + Enums) | 36 | Medium |
| 2. JSON Serialization | 30 | High |
| 3. Clients | 27 | High |
| 4. Paging/LRO | 18 | Medium |
| 5. Infrastructure | 21 | Low-Medium |
| 6. XML (conditional) | 11 | Medium |
| 7. Merge-Patch (conditional) | 13 | High |
| 8. Scaffolding | 5 | Low |
| 9. Multipart (conditional) | 4 | Low |
| 10. Integration Testing | 15 | Medium |
| **Total** | **~195** | |

**Phase dependency graph:**

```
Phase 0 (Foundation)
    ↓
Phase 1 (Types: Models + Enums)  ──→  Phase 2 (JSON Serialization)
    ↓                                       ↓
Phase 5 (Infrastructure)          Phase 3 (Clients)
    ↓                                  ↓
Phase 6 (XML — conditional)      Phase 4 (Paging/LRO)
Phase 7 (Merge-Patch — cond.)         ↓
    ↓                             Phase 9 (Multipart — cond.)
Phase 8 (Project Scaffolding)          ↓
                                  Phase 10 (Integration Testing)
```

Phases 1–5 can be developed in parallel tracks (types vs clients vs infrastructure). Phases 6, 7, and 9 are conditional features that can be deferred. Phase 10 validates everything end-to-end.

---

## Appendix: Deep Study — Frameworks, Generated Output Patterns, and Test Infrastructure

This appendix provides a detailed reference for the three framework layers (emitter-framework, Alloy core, Alloy C#), the exact output patterns the rewrite must reproduce, and the test infrastructure available for validation.

---

### A. @typespec/emitter-framework

#### A.1 Core Module

The emitter-framework bridges TypeSpec's type system to Alloy's rendering pipeline. An emitter's `$onEmit` calls a single function:

- **`writeOutput(program, rootComponent, emitterOutputDir)`** — renders the Alloy component tree and writes the resulting files to disk.
- **`Output` component** — wraps Alloy's `Output`, injecting a `TspContext` (containing the TypeSpec `program` and `Typekit`) via Alloy's context system.
- **`useTsp()` hook** — components call this to access the TypeSpec program, types, and Typekit utilities.
- **`typeDependencyConnector` + `SCCSet`** — performs topological ordering of type declarations with cycle handling via Tarjan's strongly connected components algorithm.
- **`TransformNamePolicy`** — language-specific naming transforms providing `getTransportName` and `getApplicationName`.
- **Component Override system (Experimental)** — allows emitter consumers to replace or wrap the rendering of specific TypeSpec types.

#### A.2 C# Module (`@typespec/emitter-framework/csharp`)

Pre-built components that map TypeSpec types directly to C# constructs:

| Component | Input | Output |
|---|---|---|
| `ClassDeclaration` | TypeSpec `Model` or `Interface` | C# class with properties, base types, doc comments, JSON attributes |
| `EnumDeclaration` | TypeSpec `Union` or `Enum` | C# enum with members |
| `Property` | TypeSpec model property | C# property handling nullable unions, inheritance (`override`/`new`/`virtual`), `[JsonPropertyName]`, `[JsonConverter]` |
| `TypeExpression` | TypeSpec type reference | C# type name with full scalar mapping |

**Scalar type mapping** (TypeExpression):

| TypeSpec Scalar | C# Type |
|---|---|
| `string` | `string` |
| `int32` | `int` |
| `int64` | `long` |
| `float32` | `float` |
| `float64` | `double` |
| `boolean` | `bool` |
| `utcDateTime` | `DateTimeOffset` |
| `duration` | `TimeSpan` |
| `bytes` | `byte[]` |
| `decimal` | `decimal` |
| `url` | `Uri` |

**JSON Converter system:**
- `JsonConverter` component — generates converter classes for types requiring custom JSON serialization.
- `JsonConverterResolver` — deduplicates and centralizes converter registrations.

**Utilities:** `getDocComments`, `getNullableUnionInnerType`, `efRefkey`, `declarationRefkeys`.

#### A.3 Testing (Emitter-Framework)

The emitter-framework uses **markdown-driven scenario testing**:

1. **Scenario files** are `.md` files containing `` ```tsp `` spec blocks and `` ```cs `` expected output blocks.
2. **`executeScenarios()`** auto-generates vitest test suites from these markdown files.
3. **tree-sitter-based snippet extraction** — `createCSharpExtractorConfig()` enables comparing specific declarations rather than full files.
4. **Snapshot update mode** — set `RECORD=true` environment variable to update golden files.

---

### B. @alloy-js/core

#### B.1 Rendering Pipeline

The pipeline has three stages:

```
1. Component Tree (JSX)
     → renderTree()
   Rendered Text Tree (string | PrintHook arrays)
     → printTree()
   Final string (formatted via Prettier)

2. render(children) / renderAsync(children) → OutputDirectory

3. writeOutput(output, basePath) → filesystem
```

#### B.2 Core Components

**Root & File Structure:**

| Component | Purpose |
|---|---|
| `Output` | Root component; sets up binder, name policy, externals |
| `SourceFile` | Creates file in output tree; each file rendered independently; props: `filetype`, `reference`, `header` |
| `SourceDirectory` | Directory node in output tree |

**Code Structure:**

| Component | Purpose |
|---|---|
| `Block` | Indented block with configurable open/close delimiters |
| `Indent` | Indentation with break types: hardline, softline, line, nobreak |
| `List` | Joins children with separators: comma, semicolon, space, line variants |
| `For<T>` | Collection iteration with list features; supports Array, Map, Set, reactive refs |
| `StatementList` | Semicolon + hardline joins |
| `Prose` | Word-wrapping text |
| `Wrap` | Conditional wrapping |

**Declarations:**

| Component | Purpose |
|---|---|
| `Declaration` / `Name` | Declare symbols, render declaration names |
| `MemberDeclaration` / `MemberName` / `MemberScope` | Member-level declaration system |
| `Scope` | Lexical scope establishment |

**Control Flow:**

| Component | Purpose |
|---|---|
| `Show` | Conditional rendering |
| `Switch` + `Match` | Pattern-based conditional rendering |

**File Manipulation:**

| Component | Purpose |
|---|---|
| `CopyFile` | Copy file to output |
| `AppendFile` | Append to existing file |
| `TemplateFile` | Template-based file generation |
| `UpdateFile` | Modify existing output file |

#### B.3 Intrinsic JSX Elements (Prettier-Style)

These map directly to Prettier IR for fine-grained formatting control:

`<line/>`, `<hardline/>`, `<softline/>`, `<group>`, `<indent>`, `<dedent>`, `<fill>`, `<ifBreak>`, `<breakParent/>`, `<align>`, `<indentIfBreak>`, `<lineSuffix>`

#### B.4 Symbol System

The symbol system provides reactive cross-file reference resolution:

- **Binder** — central registry; `resolveDeclarationByKey()` returns a reactive `Ref<ResolutionResult>` with `pathUp`/`pathDown`/`commonScope`/`memberPath`.
- **Refkeys** — stable identity tokens:
  - `refkey()` — unique identity
  - `namekey(name)` — name-based identity
  - `memberRefkey(base, members...)` — composite member identity
- **OutputSymbol** — reactive named entity with refkeys, scopes, member spaces, alias support, type system.
- **OutputScope** — tree structure with parent/children, declaration spaces.
- **SymbolTable** — reactive set indexed by refkey and name.
- **SymbolFlow** — `emitSymbol()` for bottom-up propagation, `takeSymbols()` for collection.
- **SymbolSlot** — capture point for emitted symbols.
- **LibrarySymbolReference** — external library types referenced via `REFKEYABLE` + `TO_SYMBOL` protocols.

#### B.5 Utilities

- **`code` / `text` tagged templates** — structured code generation with automatic indentation handling.
- **Reactivity** — built on `@vue/reactivity`: `ref`, `computed`, `watch`, `effect`, `memo`, `untrack`, `onCleanup`.
- **Context system** — 10+ built-in contexts: Binder, Scope, Declaration, MemberDeclaration, FormatOptions, NamePolicy, SourceFile, SourceDirectory, Assignment, MemberScope.
- **`createNamePolicy(namer)`** — language-specific naming conventions.
- **STC (Static Template Components)** — functional API alternative to JSX.
- **Content slots** — track emptiness for conditional rendering.
- **Props combinators** — `mergeProps`, `splitProps`, `defaultProps`.
- **Resources** — async data fetching integrated with the scheduler.
- **Tap system** — child→parent context inversion.

---

### C. Generated Output Patterns (from Test Projects)

This section documents the exact C# patterns the rewrite must reproduce, derived from the legacy generator's test output.

#### C.1 File Header Convention

Every generated file starts with:

```csharp
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT License.

// <auto-generated/>

#nullable disable
```

#### C.2 Model Class Structure

All model classes follow `public partial class` with this member layout:

1. **Fields:** `private IDictionary<string, BinaryData> _additionalBinaryDataProperties`
2. **Public constructor:** required parameters with `Argument.AssertNotNull()` validation
3. **Internal constructor:** all parameters including `additionalBinaryDataProperties`
4. **Properties:**
   - Output-only models: get-only properties
   - Input+Output models: get/set properties
   - Optional collections initialized to `ChangeTrackingList<T>` or `ChangeTrackingDictionary<TKey, TValue>`

#### C.3 Serialization (.Serialization.cs)

Partial class implementing `IJsonModel<T>` and `IPersistableModel<T>`. Members appear in strict order:

1. Parameterless constructor (private/internal)
2. `PersistableModelCreateCore`
3. `PersistableModelWriteCore`
4. Explicit interface implementations
5. Implicit/explicit cast operators
6. `IJsonModel.Write`
7. `JsonModelWriteCore` (virtual)
8. `IJsonModel.Create`
9. `JsonModelCreateCore`
10. `DeserializeXxx` (static)

**Property serialization patterns:**

| Pattern | Code |
|---|---|
| Property name | `writer.WritePropertyName("name"u8)` (UTF-8 literal) |
| Optional guard | `Optional.IsDefined(property)` / `Optional.IsCollectionDefined(collection)` |
| Required nullable | `writer.WriteNull("name"u8)` explicitly |
| Raw data | Written only when `options.Format != "W"`, with `#if NET6_0_OR_GREATER` guard for `WriteRawValue` |

#### C.4 Enum Patterns

**Fixed Enum:**
- C# `enum` declaration + serialization extension class
- Extension class provides `ToSerialString()` and `ToEnumName()` methods
- Int-backed enums need no `ToSerial` method (cast suffices); string-backed use switch expressions

**Extensible Enum:**
- `readonly partial struct : IEquatable<T>`
- Private `const` values + public `static` properties
- Implicit operator from underlying type

#### C.5 Client Structure

Each client is a partial class split across two files:

| File | Content |
|---|---|
| `{Name}.cs` | Constructors, fields, operation methods, sub-client accessors |
| `{Name}.RestClient.cs` | HTTP request builder methods |

**Four methods per operation:**

| Method | Parameters | Returns |
|---|---|---|
| Protocol sync | `BinaryContent` + `RequestOptions` | `ClientResult` |
| Protocol async | `BinaryContent` + `RequestOptions` | `Task<ClientResult>` |
| Convenience sync | Typed params + `CancellationToken` | `ClientResult<T>` |
| Convenience async | Typed params + `CancellationToken` | `Task<ClientResult<T>>` |

**Sub-client pattern:** Thread-safe lazy caching via `Volatile.Read` + `Interlocked.CompareExchange`.

**Operation naming conventions:**
- `List` → `GetAll` (bare "list" becomes "get all")
- `ListXxx` → `GetXxx` (prefixed "list" becomes "get")
- Async methods get `Async` suffix (e.g., `GetWidget` → `GetWidgetAsync`)

#### C.6 RestClient Request Building

Request construction follows a 5-step pattern:

```csharp
// 1. Build URI
ClientUriBuilder uri = new();
uri.Reset(endpoint);
uri.AppendPath("/route", false);
uri.AppendQuery("param", value, true);

// 2. Create message
PipelineMessage message = pipeline.CreateMessage(uri.ToUri(), "GET", classifier);

// 3. Set headers
message.Request.Headers.Set("Accept", "application/json");

// 4. Set content
message.Request.Content = content;

// 5. Apply options
message.Apply(options);
```

#### C.7 Paging Collections

Four classes per paging operation (sync/async × protocol/convenience):

| Strategy | Description |
|---|---|
| Next-link | URI extracted from response body |
| Continuation-token | Token extracted from response body or header |

Uses iterator pattern with `yield return` for lazy page enumeration. Typed extraction via `GetValuesFromPage` / `GetValuesFromPageAsync`.

#### C.8 Polymorphic Models

| Element | Pattern |
|---|---|
| Base class | Abstract with `private protected` constructor, `internal` discriminator property |
| Derived class | Passes literal discriminator value to base constructor |
| Unknown variant | Internal class with null-guard on discriminator |
| Deserialization | `[PersistableModelProxy(typeof(UnknownXxx))]` on base; `Deserialize` reads discriminator and switches to correct subclass |

#### C.9 Encoding Patterns

| Format | DateTime | Duration | Bytes |
|---|---|---|---|
| RFC3339 | `"O"` format | — | — |
| RFC7231 | `"R"` format | — | — |
| Unix | `WriteNumberValue(ToUnixTimeSeconds)` | — | — |
| ISO8601 | — | `"P"` via `XmlConvert` | — |
| Seconds | — | `TotalSeconds` | — |
| Milliseconds | — | `TotalMilliseconds` | — |
| Base64 | — | — | `"D"` (built-in) |
| Base64URL | — | — | `"U"` (custom `TypeFormatters`) |

#### C.10 XML Serialization

- Implements `IPersistableModel<T>` only (not `IJsonModel`).
- Uses `XmlWriter` for writing, `XElement` (LINQ to XML) for reading.
- Attributes via `WriteStartAttribute`/`WriteEndAttribute`.
- Elements via `WriteStartElement`/`WriteEndElement`.
- Namespace support with prefix/URI pairs.
- Dual JSON+XML models dispatch via Content-Type sniffing.

#### C.11 JSON Merge Patch (Dynamic Models)

- `JsonPatch` field + ref-return `Patch` property (`[Experimental]`, `[JsonIgnore]`).
- **Three-tier serialization:**
  1. `Patch.Contains("$")` short-circuit
  2. Per-property `Contains`/`IsRemoved` checks
  3. `Patch.WriteTo` flush
- `SetPropagators` links parent↔child patches for nested dynamic models.
- Deserialization stores unknown properties via `patch.Set()` instead of dictionary.

#### C.12 Versioning

- `ServiceVersion` enum with monotonic ordinals across the version history.
- `@added`: types/operations included from introduction version onward.
- `@removed`: types/operations excluded from removal version onward.
- Version flows as a server URL template parameter, not visible in method signatures.

#### C.13 Usage Direction Impact

| Direction | Public Constructor | Properties | Operators |
|---|---|---|---|
| Input-only | Yes | Read-only | `implicit → BinaryContent` |
| Output-only | No | Read-only | `explicit ← ClientResult` |
| Input+Output | Yes | Get/Set | Both operators |

---

### D. Test Infrastructure

#### D.1 Spector Test Suite

The primary integration test suite for the generated C# clients:

- **Generated stubs** in `TestProjects/Spector/` — 1068 `.cs` files across 50+ scenarios.
- **Runtime tests** in `Spector.Tests/` — launch `SpectorServer` (Node.js mock server), execute HTTP calls through generated clients.
- **`SpectorTestAttribute`** — auto-skips stub tests by checking for `=> throw null;` patterns via Roslyn syntax analysis.
- **Server pooling** via `TestServerSessionBase` for efficient test execution across the suite.
- **Coverage tracking** — results written to `tsp-spector-coverage-csharp-standard.json`.

#### D.2 Local/Sample-TypeSpec

Full (non-stub) implementations that serve as golden reference files:

- TypeSpec input defined in `docs/samples/client/csharp/SampleService/main.tsp`.
- Custom code integration demonstrated via 4 files in `src/Custom/` using `CodeGenType`/`CodeGenMember` attributes.
- **Demonstrates:** versioning, auth (API key + OAuth2), sub-clients, paging, discriminators, XML serialization, dynamic models.

#### D.3 Emitter-Framework Scenario Tests

Markdown-driven testing specifically for the `@typespec/emitter-framework` C# components:

1. Scenario files are `.md` with `` ```tsp `` input blocks and `` ```cs `` expected output blocks.
2. **tree-sitter** for C# snippet extraction and targeted comparison of specific declarations.
3. **`executeScenarios()`** auto-generates vitest test suites from the scenario files.
4. **`RECORD=true`** mode for updating golden files when expected output changes intentionally.
