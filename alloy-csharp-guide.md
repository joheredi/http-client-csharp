# Alloy C# Emitter Guide

> Reference guide for building a C# client emitter with the Alloy code generation framework.
> Based on patterns from `flight-instructor/src/csharp/` and `@alloy-js/csharp`.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Concepts](#core-concepts)
3. [Project Setup](#project-setup)
4. [Alloy Core Rendering Primitives](#alloy-core-rendering-primitives)
5. [Alloy C# Component Reference](#alloy-c-component-reference)
6. [Emitter Framework (TypeSpec Integration)](#emitter-framework-typespec-integration)
7. [Building an Emitter: Patterns from flight-instructor](#building-an-emitter-patterns-from-flight-instructor)
8. [Rendering Pipeline](#rendering-pipeline)
9. [Working with Symbols and References](#working-with-symbols-and-references)
10. [Scopes and Namespaces](#scopes-and-namespaces)
11. [Built-in .NET Type References](#built-in-net-type-references)
12. [External Library Definitions](#external-library-definitions)
13. [MSBuild / .csproj Generation](#msbuild--csproj-generation)
14. [Naming Policies](#naming-policies)
15. [Context Pattern](#context-pattern)
16. [STC (Statically Typed Components)](#stc-statically-typed-components)
17. [Testing Patterns](#testing-patterns)
18. [Complete Examples](#complete-examples)

---

## Architecture Overview

The Alloy framework uses a **React/Solid.js-inspired component model** where C# code is generated using JSX syntax. Instead of writing string templates, you compose components that represent C# language constructs.

### High-Level Flow

```
TypeSpec API Definition
  ↓
TypeSpec Compiler (parses spec into Program)
  ↓
Emitter ($onEmit entry point)
  ↓
Renderer (orchestrates JSX component tree)
  ↓
renderAsync() → produces RenderedTextTree
  ↓
Output files (.cs, .csproj)
```

### Key Architecture Layers

```
┌─────────────────────────────────────────────────┐
│  Emitter Entry Point ($onEmit)                  │
│  - Reads TypeSpec Program                       │
│  - Configures options                           │
│  - Delegates to Renderer                        │
├─────────────────────────────────────────────────┤
│  Renderer                                       │
│  - Creates JSX component tree                   │
│  - Calls renderAsync() with <Output> wrapper    │
│  - Returns directory of generated files         │
├─────────────────────────────────────────────────┤
│  Custom Components (your emitter logic)         │
│  - RestClient, OperationGroup, Models, etc.     │
│  - Use Alloy C# components internally           │
│  - Share state via React-like Contexts          │
├─────────────────────────────────────────────────┤
│  Alloy C# Components (@alloy-js/csharp)        │
│  - ClassDeclaration, Method, Property, etc.     │
│  - Handle C# syntax, formatting, scoping        │
│  - Automatic using statements & references      │
├─────────────────────────────────────────────────┤
│  Alloy Core (@alloy-js/core)                    │
│  - Rendering engine, reactivity, refkeys        │
│  - SourceDirectory, For, Show, code tag         │
│  - Binder, scopes, symbol resolution            │
└─────────────────────────────────────────────────┘
```

---

## Core Concepts

### JSX for Code Generation

Alloy uses JSX to define code structure. Components map directly to C# constructs:

```tsx
// This JSX...
<ClassDeclaration public name="MyClient">
  <Property public name="BaseUrl" type="string" get set />
  <Method public async name="GetAsync" returns="Task<string>">
    return await httpClient.GetStringAsync(BaseUrl);
  </Method>
</ClassDeclaration>

// ...generates this C#:
// public class MyClient
// {
//     public string BaseUrl { get; set; }
//     public async Task<string> GetAsync()
//     {
//         return await httpClient.GetStringAsync(BaseUrl);
//     }
// }
```

### Refkeys (Reference Keys)

Refkeys are unique identifiers that enable **cross-file symbol referencing**. When you create a refkey for a declaration, you can reference it from anywhere — Alloy automatically resolves the reference and generates proper `using` statements.

```tsx
import { refkey, namekey } from "@alloy-js/core";

// Create a refkey to identify a declaration
const myClassKey = refkey("MyClass");

// Declare it somewhere
<ClassDeclaration name="MyClass" refkey={myClassKey} />

// Reference it elsewhere (even in a different file)
<Property name="Instance" type={myClassKey} get set />
// Alloy resolves the refkey to the class name and adds `using` if needed
```

### Namekeys

Namekeys are similar to refkeys but carry a name that participates in naming policy:

```tsx
const propName = namekey("my-property");
// Renders as "MyProperty" with C# naming policy (PascalCase)
```

### Children

`Children` is the type for any renderable content in Alloy — strings, numbers, JSX elements, arrays, functions, refkeys, etc.

```tsx
// All of these are valid Children:
<Method returns="string">       {/* string literal */}
<Method returns={myRefkey}>     {/* refkey reference */}
<Method returns={<>Task<string></>}> {/* JSX fragment */}
```

### The `code` Template Tag

The `code` template tag from `@alloy-js/core` is used to create inline code expressions with interpolated values (refkeys, components, etc.). This is the primary way to embed dynamic C# expressions in component bodies:

```tsx
import { code, refkey } from "@alloy-js/core";
import { TypeExpression } from "@typespec/emitter-framework/csharp";

const tokenCredentialKey = refkey();
const scopesKey = refkey();
const cancellationTokenKey = refkey();

// Interpolate refkeys into code expressions
code`await ${tokenCredentialKey}.GetTokenAsync(
  new TokenRequestContext(${scopesKey}), ${cancellationTokenKey})`

// Interpolate JSX components (like TypeExpression)
code`Task<${(<TypeExpression type={returnType} />)}>`

// Interpolate string values
code`queryParams.Add($"apiVersion=${versionValue}");`
```

The `code` tag produces `Children` that can be used anywhere — as method bodies, property initializers, expression arguments, etc.

### Import Cheat Sheet

| Symbol | Import From |
|--------|-------------|
| `ClassDeclaration`, `Method`, `Property`, `Field`, `Constructor`, `SourceFile`, `Attribute`, etc. | `@alloy-js/csharp` |
| `SourceDirectory`, `refkey`, `namekey`, `code`, `For`, `Show`, `List`, `Switch`, `Match`, `Block`, `renderAsync`, `createContext`, `useContext` | `@alloy-js/core` |
| `Output`, `writeOutput`, `useTsp`, `TransformNamePolicy` | `@typespec/emitter-framework` |
| `TypeExpression`, `efRefkey` | `@typespec/emitter-framework/csharp` |
| `createLibrary`, `createCSharpNamePolicy`, `access` | `@alloy-js/csharp` |

---

## Project Setup

### Dependencies

```json
{
  "dependencies": {
    "@alloy-js/core": "latest",
    "@alloy-js/csharp": "latest",
    "@typespec/compiler": "latest",
    "@typespec/emitter-framework": "latest"
  }
}
```

### TSConfig for JSX

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@alloy-js/core"
  }
}
```

### Emitter Entry Point

```tsx
// src/emitter.tsx
import { EmitContext } from "@typespec/compiler";
import { Output, writeOutput } from "@typespec/emitter-framework";
import { SourceFile } from "@alloy-js/csharp";
import { SourceDirectory } from "@alloy-js/core";
import { createCSharpNamePolicy } from "@alloy-js/csharp";
import { MyRestClient } from "./components/rest-client.jsx";

export async function $onEmit(context: EmitContext) {
  const output = (
    <Output program={context.program} namePolicy={createCSharpNamePolicy()}>
      <SourceDirectory path=".">
        <MyRestClient program={context.program} />
      </SourceDirectory>
    </Output>
  );

  await writeOutput(context.program, output, context.emitterOutputDir);
}
```

---

## Alloy Core Rendering Primitives

Before diving into C#-specific components, understand the core Alloy primitives that control layout and rendering. These are the building blocks used inside and alongside C# components.

### Intrinsic Layout Elements

These are low-level JSX elements that control document formatting:

```tsx
// Line breaks
<br />          // Conditional: breaks if exceeds print width, else renders as space
<hbr />         // Hard break: always breaks
<sbr />         // Soft break: breaks if exceeds width, else renders as nothing
<lbr />         // Literal break: always breaks, ignores indentation

// Indentation
<indent>{children}</indent>           // Increases indent level
<dedent>{children}</dedent>           // Decreases indent level

// Grouping (tries to fit on one line, breaks all softlines if too wide)
<group>{content}</group>

// Fill (word-wrap: breaks only before the segment exceeding width)
<fill>{wordContent}</fill>

// Force parent group to break
<breakParent />

// Conditional on break state
<ifBreak groupId={groupSymbol}>
  {brokenContent}
  <flatContents>{flatContent}</flatContents>
</ifBreak>
```

### High-Level Components

#### For — Iteration

```tsx
import { For } from "@alloy-js/core";

// Iterate over arrays
<For each={items}>
  {(item, index) => <Property name={item.name} type={item.type} get set />}
</For>

// With joiners
<For each={items} comma space>
  {(item) => item.name}
</For>

// Over Maps
<For each={new Map([["key", "value"]])}>
  {(key, value) => <>{key}: {value}</>}
</For>

// Skip falsy for conditional rendering
<For each={items} skipFalsy hardline>
  {(item) => item.isPublic ? <Method name={item.name} /> : undefined}
</For>
```

#### Show — Conditional Rendering

```tsx
import { Show } from "@alloy-js/core";

<Show when={hasAuth}>
  <Field private readonly name="credential" type="TokenCredential" />
</Show>
```

#### List — Array Rendering with Separators

```tsx
import { List } from "@alloy-js/core";

// Comma-separated
<List comma space>
  {parameterExpressions}
</List>

// Statement list (semicolons + hardlines)
<List semicolon hardline enderPunctuation>
  {statements}
</List>
```

**BaseListProps options:** `comma`, `semicolon`, `space`, `hardline`, `softline`, `doubleHardline`, `joiner` (custom), `ender`, `enderPunctuation`

#### Block — Indented Code Block

```tsx
import { Block } from "@alloy-js/core";

// Standard block
<Block newline>
  {classBody}
</Block>
// Renders: \n{ \n  classBody \n}

// Custom delimiters
<Block opener="[" closer="]">
  {arrayContent}
</Block>
```

#### Indent — Manual Indentation

```tsx
import { Indent } from "@alloy-js/core";

<Indent hardline trailingBreak>
  {indentedContent}
</Indent>
```

#### Wrap — Conditional Wrapping

```tsx
import { Wrap } from "@alloy-js/core";

<Wrap when={needsRegion} with={Region} props={{ name: "Methods" }}>
  {methodDeclarations}
</Wrap>
```

#### Switch / Match — Multi-Conditional

```tsx
import { Switch, Match } from "@alloy-js/core";

<Switch>
  <Match when={type.kind === "Model"}>
    <ClassDeclaration name={type.name} />
  </Match>
  <Match when={type.kind === "Enum"}>
    <EnumDeclaration name={type.name} />
  </Match>
  <Match else>
    <StructDeclaration name={type.name} />
  </Match>
</Switch>
```

#### StatementList — Semicolon-Separated Statements

```tsx
import { StatementList } from "@alloy-js/core";

<StatementList>
  <VarDeclaration name="x">42</VarDeclaration>
  <VarDeclaration name="y">x + 1</VarDeclaration>
  return y
</StatementList>
// Renders:
// var x = 42;
// var y = x + 1;
// return y;
```

#### Prose — Word-Wrapped Text

```tsx
import { Prose } from "@alloy-js/core";

<Prose>
  This is a long paragraph that will be wrapped at word boundaries
  when it exceeds the configured print width.
</Prose>
```

### File & Directory Components

```tsx
// SourceFile comes from @alloy-js/csharp (C#-specific wrapper with using management)
import { SourceFile } from "@alloy-js/csharp";
// SourceDirectory comes from @alloy-js/core
import { SourceDirectory } from "@alloy-js/core";

<SourceDirectory path="models">
  <SourceFile path="Widget.cs">
    {content}
  </SourceFile>
</SourceDirectory>
```

> **Important:** Always import `SourceFile` from `@alloy-js/csharp`, not `@alloy-js/core`. The C# version wraps the core `SourceFile` with automatic `using` directive management and C#-specific scoping.

---

## Emitter Framework (TypeSpec Integration)

The `@typespec/emitter-framework` package bridges TypeSpec and Alloy, providing components and hooks for TypeSpec-aware code generation.

### Output Component

The root wrapper that provides TypeSpec program context and name policies:

```tsx
import { Output } from "@typespec/emitter-framework";
import { renderAsync } from "@alloy-js/core";

const directory = await renderAsync(
  <Output
    program={context.program}           // TypeSpec Program instance
    namePolicy={createCSharpNamePolicy()} // Naming convention policy
  >
    <MyRestClient />
  </Output>
);
```

### writeOutput — Emit to Disk

```tsx
import { writeOutput } from "@typespec/emitter-framework";

export async function $onEmit(context: EmitContext) {
  const output = (
    <Output program={context.program}>
      <SourceDirectory path=".">
        <SourceFile path="Client.cs" filetype="csharp">
          <MyClientComponent />
        </SourceFile>
      </SourceDirectory>
    </Output>
  );

  await writeOutput(context.program, output, context.emitterOutputDir);
}
```

### useTsp — Access TypeSpec Program & Typekit

```tsx
import { useTsp } from "@typespec/emitter-framework";

function MyComponent() {
  const { $ } = useTsp(); // $ = Typekit utilities

  // Type inspection
  const isExtensibleEnum = $.union.is(type) && $.union.isExtensible(type);
  const isModel = $.model.is(type);
}
```

### TypeExpression — TypeSpec Type → C# Type

Renders TypeSpec types as C# type references, handling scalar mapping, arrays, records, nullables, and model references:

```tsx
import { TypeExpression } from "@typespec/emitter-framework/csharp";

// In property type
<Property name="Items" type={<TypeExpression type={propType} />} get set />

// In return type
<Method name="GetWidget" returns={<>Task&lt;<TypeExpression type={returnType} />&gt;</>} />

// In attribute arguments
<Attribute name="JsonSerializable"
  args={[<>typeof(<TypeExpression type={modelType} />)</>]} />
```

**Type mappings:**
| TypeSpec Type | C# Type |
|---|---|
| `string` | `string` |
| `boolean` | `bool` |
| `int32` | `int` |
| `int64` | `long` |
| `float32` | `float` |
| `float64` | `double` |
| `bytes` | `byte[]` |
| `plainDate` | `DateOnly` |
| `utcDateTime` | `DateTime` |
| `duration` | `TimeSpan` |
| `uuid` | `Guid` |
| Array types | `T[]` |
| Record types | `IDictionary<string, T>` |
| Nullable unions | `T?` |
| Model types | Class name (via refkey) |

### efRefkey — TypeSpec Type References

```tsx
import { efRefkey } from "@typespec/emitter-framework/csharp";

// Create a refkey tied to a TypeSpec type (auto-generated, deterministic)
const typeRef = efRefkey(myTypeSpecType);

// Use in declarations and references
<ClassDeclaration name="Widget" refkey={efRefkey(widgetType)} />

// Reference elsewhere
<Property name="Widget" type={efRefkey(widgetType)} get set />
```

### TransformNamePolicy — Wire/Application Name Mapping

```tsx
import { createTransformNamePolicy, TransformNamePolicyContext } from "@typespec/emitter-framework";

const policy = createTransformNamePolicy({
  transportNamer: (type) => type.name,              // Wire format name (JSON key)
  applicationNamer: (type) => pascalCase(type.name), // C# property name
});

<TransformNamePolicyContext.Provider value={policy}>
  {/* Children can access wire names for [JsonPropertyName] attributes */}
</TransformNamePolicyContext.Provider>
```

### SCCSet — Dependency Ordering (Tarjan's Algorithm)

For ordering type declarations to avoid forward references:

```tsx
import { SCCSet, typeDependencyConnector } from "@typespec/emitter-framework";

const sccSet = new SCCSet(typeDependencyConnector);
sccSet.add(typeA, typeB, typeC); // Auto-discovers transitive deps

for (const component of sccSet.components) {
  // Emit types in dependency order
  // Circular dependencies grouped in same component
}
```

---

### Source Structure Components

#### SourceFile

Creates a C# source file. Automatically manages `using` directives.

```tsx
import { SourceFile, Namespace, ClassDeclaration } from "@alloy-js/csharp";

<SourceFile path="Models/Widget.cs" headerComment="Auto-generated code">
  <Namespace name="MyApp.Models">
    <ClassDeclaration public name="Widget" />
  </Namespace>
</SourceFile>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `path` | `string` | Output file path |
| `using` | `string[]` | Explicit using directives |
| `header` | `Children` | Content after usings |
| `headerComment` | `string` | Doc comment at file top |
| `printWidth` | `number` | Line width (default: 120) |
| `tabWidth` | `number` | Indent size (default: 4) |

#### Namespace

Declares a C# namespace. Supports nested/dotted namespaces.

```tsx
// File-scoped namespace
<Namespace name="MyApp.Models">
  <ClassDeclaration name="Widget" />
</Namespace>
// Renders: namespace MyApp.Models { class Widget { } }

// Nested via array
<Namespace name={["MyApp", "Models"]}>
  <ClassDeclaration name="Widget" />
</Namespace>
```

#### SourceDirectory

Organizes output into directory structures (from `@alloy-js/core`):

```tsx
import { SourceDirectory } from "@alloy-js/core";

<SourceDirectory path="models">
  <SourceFile path="Widget.cs">...</SourceFile>
  <SourceFile path="Order.cs">...</SourceFile>
</SourceDirectory>
```

### Type Declaration Components

#### ClassDeclaration

```tsx
<ClassDeclaration
  public
  sealed
  name="HttpClient"
  refkey={httpClientKey}
  baseType="BaseClient"
  interfaceTypes={["IDisposable", "IAsyncDisposable"]}
  typeParameters={["T"]}
  attributes={[<Attribute name="Serializable" />]}
  doc="HTTP client for API operations"
>
  {/* fields, properties, methods, constructors */}
</ClassDeclaration>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `name` | `string \| Namekey` | Class name |
| `refkey` | `Refkey` | Symbol reference key |
| `public/private/internal` | `boolean` | Access modifier |
| `abstract/sealed/static/partial` | `boolean` | Class modifiers |
| `baseType` | `Children` | Base class |
| `interfaceTypes` | `Children[]` | Implemented interfaces |
| `typeParameters` | `(string \| TypeParameterProps)[]` | Generics |
| `primaryConstructor` | `ParameterProps[]` | C# 12 primary ctor |
| `attributes` | `AttributesProp` | Class attributes |
| `doc` | `Children` | XML documentation |

#### InterfaceDeclaration

```tsx
<InterfaceDeclaration public name="IApiClient" typeParameters={["T"]}>
  <InterfaceProperty name="BaseUrl" type="string" get set />
  <InterfaceMethod name="GetAsync" returns="Task<T>"
    parameters={[{ name: "id", type: "int" }]} />
</InterfaceDeclaration>
```

#### StructDeclaration

```tsx
<StructDeclaration public readonly name="Point"
  interfaceTypes={["IEquatable<Point>"]}>
  <Field public readonly name="X" type="double" />
  <Field public readonly name="Y" type="double" />
</StructDeclaration>
```

**Additional modifiers:** `ref`, `readonly`, `new`, `partial`

#### EnumDeclaration / EnumMember

```tsx
<EnumDeclaration public name="HttpMethod">
  <EnumMember name="Get" />,
  <EnumMember name="Post" />,
  <EnumMember name="Put" />,
  <EnumMember name="Delete" />
</EnumDeclaration>
```

#### RecordDeclaration

```tsx
<RecordDeclaration public name="ApiResponse"
  primaryConstructor={[
    { name: "statusCode", type: "int" },
    { name: "body", type: "string" }
  ]}>
  <Property name="Timestamp" type="DateTime" get init />
</RecordDeclaration>
```

### Member Components

#### Method

```tsx
<Method
  public
  async
  name="FetchDataAsync"
  returns="Task<string>"
  parameters={[
    { name: "url", type: "string" },
    { name: "cancellationToken", type: "CancellationToken", default: "default" }
  ]}
  typeParameters={["T"]}
  attributes={[<Attribute name="Obsolete" args={['"Use V2"']} />]}
  doc="Fetches data from the specified URL"
>
  var response = await httpClient.GetAsync(url, cancellationToken);
  return await response.Content.ReadAsStringAsync();
</Method>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `name` | `string \| Namekey` | Method name |
| `returns` | `Children` | Return type (default: "void", or "Task" if async) |
| `parameters` | `ParameterProps[]` | Parameters |
| `async` | `boolean` | Async method |
| `expression` | `boolean` | Expression body (`=>`) |
| `abstract/virtual/override/static/sealed` | `boolean` | Modifiers |
| `typeParameters` | `(string \| TypeParameterProps)[]` | Generics |
| `attributes` | `AttributesProp` | Method attributes |
| `doc` | `Children` | XML documentation |

#### Constructor

```tsx
<Constructor public parameters={[
  { name: "httpClient", type: "HttpClient" },
  { name: "endpoint", type: "string" }
]}>
  this.httpClient = httpClient;
  this.endpoint = endpoint;
</Constructor>
```

Name is automatically derived from the enclosing class.

#### Property

```tsx
<Property
  public
  name="Name"
  type="string"
  get set
  nullable
  initializer={`"default"`}
  attributes={[<Attribute name="JsonPropertyName" args={['"name"']} />]}
/>
// Renders: [JsonPropertyName("name")]
//          public string? Name { get; set; } = "default";
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `name` | `string \| Namekey` | Property name |
| `type` | `Children` | Property type |
| `get/set/init` | `boolean` | Accessors |
| `nullable` | `boolean` | Adds `?` to type |
| `initializer` | `Children` | Default value |
| `required` | `boolean` | Required modifier (C# 11) |
| `virtual/abstract/override/static` | `boolean` | Modifiers |

#### Field

```tsx
<Field private readonly name="httpClient" type="HttpClient" />
// Renders: private readonly HttpClient _httpClient;
```

**Note:** Private fields auto-prefix with `_` per C# naming policy.

#### Parameters

```tsx
// Parameters are typically passed as props to Method/Constructor:
parameters={[
  { name: "request", type: "HttpRequestMessage" },
  { name: "body", type: "Stream", ref: true },
  { name: "timeout", type: "int", default: "30" },
  { name: "token", type: "CancellationToken", optional: true },
  { name: "data", type: "byte[]", attributes: [<Attribute name="FromBody" />] }
]}
```

**ParameterProps:**
| Prop | Type | Description |
|------|------|-------------|
| `name` | `string \| Namekey` | Parameter name |
| `type` | `Children` | Parameter type |
| `optional` | `boolean` | Adds `?` to type |
| `default` | `Children` | Default value |
| `in/out/ref/refReadonly` | `boolean` | Pass-by modifiers (mutually exclusive) |
| `attributes` | `AttributesProp` | Parameter attributes |
| `refkey` | `Refkey` | For referencing the parameter elsewhere |

### Expression & Statement Components

#### VarDeclaration

```tsx
const responseKey = refkey();

<VarDeclaration name="response" refkey={responseKey}>
  await httpClient.GetAsync(url)
</VarDeclaration>
// Renders: var response = await httpClient.GetAsync(url);

// With explicit type
<VarDeclaration name="count" type="int">42</VarDeclaration>
// Renders: int count = 42;

// Using statement
<VarDeclaration name="stream" type="Stream" using>
  File.OpenRead("data.json")
</VarDeclaration>
// Renders: using Stream stream = File.OpenRead("data.json");
```

#### IfStatement / ElseIfClause / ElseClause

```tsx
<IfStatement condition={<>{responseKey}.StatusCode == 200</>}>
  return {responseKey}.Content;
</IfStatement>
<ElseIfClause condition={<>{responseKey}.StatusCode == 404</>}>
  throw new NotFoundException();
</ElseIfClause>
<ElseClause>
  throw new ApiException();
</ElseClause>
```

#### InvocationExpression

```tsx
<InvocationExpression
  target="JsonSerializer.Deserialize"
  typeArgs={["MyModel"]}
  args={["responseBody", "serializerOptions"]}
/>
// Renders: JsonSerializer.Deserialize<MyModel>(responseBody, serializerOptions)
```

#### AccessExpression (Member Access Chains)

Build complex member access expressions using `AccessExpression.Part`:

```tsx
<AccessExpression>
  <AccessExpression.Part id="response" />
  <AccessExpression.Part id="Content" />
  <AccessExpression.Part id="ReadAsStringAsync" args />
</AccessExpression>
// Renders: response.Content.ReadAsStringAsync()
```

Or use the **fluent builder API** (often more convenient):

```tsx
import { access } from "@alloy-js/csharp";

// Simple member access
access("response").member("Content").member("Headers")
// Renders: response.Content.Headers

// Conditional (null-safe) access
access("user").member("Address", { conditional: true }).member("City")
// Renders: user?.Address.City

// Method calls
access("client").member("GetAsync").call(["url", "token"])
// Renders: client.GetAsync(url, token)

// Indexer
access("items").index([0]).member("Name")
// Renders: items[0].Name

// Complex chains
access("JsonSerializer")
  .member("Deserialize")
  .call(["body", "options"])
  .member("Results")
  .index([0])
// Renders: JsonSerializer.Deserialize(body, options).Results[0]
```

### Attributes

```tsx
// Single attribute
<Attribute name="Serializable" />
// Renders: [Serializable]

// With arguments
<Attribute name="JsonPropertyName" args={['"my_field"']} />
// Renders: [JsonPropertyName("my_field")]

// Attribute list on a declaration
<ClassDeclaration name="MyModel" attributes={[
  <Attribute name="JsonSerializable" />,
  <Attribute name="Obsolete" args={['"Use V2"', "true"]} />
]}>
  ...
</ClassDeclaration>
```

### XML Documentation

```tsx
import { DocComment, DocSummary, DocParam, DocReturns, DocFromMarkdown } from "@alloy-js/csharp";

<DocComment>
  <DocSummary>Fetches data from the API endpoint.</DocSummary>
  <DocParam name="url">The endpoint URL to query</DocParam>
  <DocParam name="token">Cancellation token</DocParam>
  <DocReturns>The response data as a string</DocReturns>
</DocComment>

// Or convert from Markdown:
<DocFromMarkdown markdown="# Summary\nThis method **fetches** data." />
```

**Available Doc Components:**
- `DocSummary`, `DocRemarks`, `DocExample`, `DocReturns`, `DocValue`
- `DocParam`, `DocTypeParam`, `DocException`, `DocPermission`
- `DocSee`, `DocSeeAlso`, `DocParamRef`, `DocTypeParamRef`
- `DocCode` (multiline), `DocC` (inline), `DocPara` (paragraph)
- `DocList`, `DocInclude`

### Region

```tsx
<Region name="Public Methods">
  <Method public name="Start" />
  <Method public name="Stop" />
</Region>
// Renders:
// #region Public Methods
// public void Start() { }
// public void Stop() { }
// #endregion
```

### CsprojFile

```tsx
import { CsprojFile } from "@alloy-js/csharp";

<CsprojFile path="MyProject.csproj" sdk="Microsoft.NET.Sdk">
  {`<PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>`}
</CsprojFile>
```

### Type Parameters & Constraints

```tsx
<ClassDeclaration name="Repository"
  typeParameters={[
    { name: "T", constraints: ["class", "new()"] },
    { name: "TKey", constraints: "IComparable<TKey>" }
  ]}>
  ...
</ClassDeclaration>
// Renders:
// class Repository<T, TKey>
//     where T : class, new()
//     where TKey : IComparable<TKey>
// { }
```

---

## Building an Emitter: Patterns from flight-instructor

### Pattern 1: Component Tree Architecture

The flight-instructor organizes its emitter as a **tree of composable components**, each responsible for a specific part of the output:

```
RestClient (root component)
├── TypeOverrides (wraps children with type mappings)
├── SourceDirectory path="models"
│   └── ModelFiles
│       └── For each type → SourceFile → Model (Class | Enum | ExtensibleEnum)
├── SourceDirectory path="operations"
│   └── OperationGroupFiles
│       └── For each group → SourceFile → OperationGroup
│           ├── Fields (httpClient, endpoint, credentials)
│           ├── Constructor (dependency injection)
│           └── For each operation → Operation
│               ├── Doc (XML comments)
│               ├── UriTemplateSerializer (URI + query params)
│               └── CallHttpOperation (HTTP request/response)
└── SerializationFile (JsonSerializerContext)
```

### Pattern 2: Root Component with Context

The root component sets up contexts and organizes output directories:

```tsx
// components/rest-client.tsx
interface RestClientProps {
  operations: OperationDescriptor[];
  authSchemes: AuthScheme[];
  endpoint: string;
  endpointParams: Map<string, ModelProperty>;
  codegenOptions: CodegenOptions;
}

export function RestClient(props: RestClientProps) {
  const ctx = createRestClientContext(/* ... */);

  return (
    <RestClientContext.Provider value={ctx}>
      <TypeOverrides typeMapping={ctx.typeMapping}>
        <SourceDirectory path="models">
          <ModelFiles />
        </SourceDirectory>
        <SourceDirectory path="operations">
          <OperationGroupFiles />
        </SourceDirectory>
        <SerializationFile />
      </TypeOverrides>
    </RestClientContext.Provider>
  );
}
```

### Pattern 3: Model Generation

Generate C# classes from TypeSpec model types:

```tsx
function ModelFiles() {
  const ctx = useContext(RestClientContext);

  return (
    <>
      {ctx.allTypes.map((type) => (
        <SourceFile path={`${getTypeName(type)}.cs`}>
          <Namespace name={ctx.namespace}>
            <Model type={type} name={getTypeName(type)} />
          </Namespace>
        </SourceFile>
      ))}
    </>
  );
}

function Model({ type, name }: { type: Type; name: string }) {
  if (type.kind === "Model") {
    return (
      <ClassDeclaration internal sealed name={name}>
        {[...type.properties.values()].map((prop) => (
          <Property
            public
            required
            name={prop.name}
            type={mapTypeToCs(prop.type)}
            get set
            attributes={[
              <Attribute name="JsonPropertyName" args={[`"${prop.name}"`]} />
            ]}
          />
        ))}
      </ClassDeclaration>
    );
  }

  if (type.kind === "Enum") {
    return (
      <EnumDeclaration public name={name}>
        {[...type.members.values()].map((m) => (
          <EnumMember name={m.name} />
        ))}
      </EnumDeclaration>
    );
  }
}
```

### Pattern 4: Operation Group Generation

Group HTTP operations into classes with dependency injection:

```tsx
function OperationGroup({ group }: { group: GroupDescriptor }) {
  const httpClientField = refkey();
  const endpointField = refkey();

  const ogContext = createOperationGroupContext(group, httpClientField, endpointField);

  return (
    <OperationGroupContext.Provider value={ogContext}>
      <SourceFile path={`${group.name}Operations.cs`}>
        <Namespace name={ctx.namespace}>
          <ClassDeclaration public name={`${group.name}Operations`}>
            {/* Fields */}
            <Field private readonly name="httpClient" type="HttpClient"
              refkey={httpClientField} />
            <Field private readonly name="endpoint" type="string"
              refkey={endpointField} />

            {/* Constructor */}
            <Constructor public parameters={[
              { name: "httpClient", type: "HttpClient" },
              { name: "endpoint", type: "string" }
            ]}>
              this.httpClient = httpClient;
              this.endpoint = endpoint;
            </Constructor>

            {/* Operations */}
            {group.operations.map((op) => (
              <Operation operation={op} />
            ))}
          </ClassDeclaration>
        </Namespace>
      </SourceFile>
    </OperationGroupContext.Provider>
  );
}
```

### Pattern 5: Individual Operation Methods

Each HTTP operation becomes an async method:

```tsx
function Operation({ operation }: { operation: OperationDescriptor }) {
  const cancellationTokenKey = refkey();
  const requestUriKey = refkey();

  const parameters = operation.parameters.map((p) => ({
    name: p.name,
    type: mapTypeToCs(p.type),
  }));

  // Add CancellationToken as last parameter with default
  parameters.push({
    name: "cancellationToken",
    type: "CancellationToken",
    default: "default",
    refkey: cancellationTokenKey,
  });

  return (
    <Method
      public
      async
      name={operation.name}
      returns={<>Task&lt;{mapTypeToCs(operation.returnType)}&gt;</>}
      parameters={parameters}
    >
      <Doc descriptor={operation} />
      <UriTemplateSerializer
        httpOperation={operation.httpOp}
        requestUriRefkey={requestUriKey}
      />
      <CallHttpOperation
        httpMethod={operation.httpMethod}
        refkeyUri={requestUriKey}
        returnType={operation.returnType}
        refkeyCancellationToken={cancellationTokenKey}
      />
    </Method>
  );
}
```

### Pattern 6: HTTP Call Generation

Generate the actual HTTP request/response handling:

```tsx
function CallHttpOperation(props: CallHttpProps) {
  const ogCtx = useContext(OperationGroupContext);

  return (
    <>
      {/* Build request */}
      <VarDeclaration name="request" using>
        new HttpRequestMessage(HttpMethod.{props.httpMethod}, {props.refkeyUri})
      </VarDeclaration>

      {/* Send request */}
      <VarDeclaration name="response" using>
        await {ogCtx.httpClientField}.SendAsync(
          request, {props.refkeyCancellationToken})
      </VarDeclaration>

      {/* Validate response */}
      response.EnsureSuccessStatusCode();

      {/* Deserialize */}
      <VarDeclaration name="content">
        await response.Content.ReadAsStringAsync()
      </VarDeclaration>

      return JsonSerializer.Deserialize&lt;{mapTypeToCs(props.returnType)}&gt;(
        content, SerializationContext.Default.Options);
    </>
  );
}
```

### Pattern 7: Descriptors (Metadata Abstraction)

Transform TypeSpec types into structured descriptors before rendering:

```tsx
// descriptors/descriptor.ts
export interface GroupDescriptor {
  name: string;
  path: string[];
  operations: OperationDescriptor[];
  allOperations: OperationDescriptor[];  // flattened
  subGroups: GroupDescriptor[];
}

export interface OperationDescriptor {
  originalOp: Operation;          // TypeSpec source of truth
  op: Operation;                  // Processed/tool view
  id: string;                     // snake_case id: "widgets_get_widget"
  path: string[];                 // hierarchical path
  implementationOp: Operation;    // What code must implement
  parentGroup: GroupDescriptor;
}

// descriptors/descriptor-resolver.tsx
export function resolveOperationGroup(
  program: Program,
  container: Namespace | Interface,
  operationFilter: (op: Operation) => boolean,
  namePolicy: NamePolicy<CSharpElements>,
  path: string[],
): GroupDescriptor {
  // Recursively walks TypeSpec hierarchy
  // Builds descriptor tree
  // Flattens allOperations
}
```

### Pattern 8: Extensible Enums (Structs)

For union types that represent extensible enums, generate readonly structs:

```tsx
function ExtensibleEnumDeclaration({ type, name }: Props) {
  const variants = [...type.variants.values()];

  return (
    <StructDeclaration public readonly name={name}
      interfaceTypes={[`IEquatable<${name}>`]}>
      {/* Private value field */}
      <Field private readonly name="value" type="string" />

      {/* Constructor */}
      <Constructor private parameters={[{ name: "value", type: "string" }]}>
        this.value = value;
      </Constructor>

      {/* Static properties for each variant */}
      {variants.map((v) => (
        <Property public static name={v.name} type={name}
          get initializer={`new ${name}("${v.value}")`} />
      ))}

      {/* Equality, GetHashCode, ToString */}
      <Method public override name="Equals"
        parameters={[{ name: "obj", type: "object", optional: true }]}
        returns="bool" expression>
        obj is {name} other &amp;&amp; Equals(other)
      </Method>

      <Method public name="Equals"
        parameters={[{ name: "other", type: name }]}
        returns="bool" expression>
        string.Equals(value, other.value, StringComparison.OrdinalIgnoreCase)
      </Method>

      <Method public override name="GetHashCode" returns="int" expression>
        value?.GetHashCode() ?? 0
      </Method>

      <Method public override name="ToString" returns="string" expression>
        value
      </Method>
    </StructDeclaration>
  );
}
```

---

## Rendering Pipeline

### renderAsync

The main rendering function. Wraps your component tree in `<Output>`:

```tsx
import { renderAsync } from "@alloy-js/core";
import { Output } from "@typespec/emitter-framework";
import { createCSharpNamePolicy } from "@alloy-js/csharp";

const directory = await renderAsync(
  <Output program={program} namePolicy={createCSharpNamePolicy()}>
    <CodegenOptionsContext.Provider value={options}>
      <RestClient operations={ops} endpoint={endpoint} />
    </CodegenOptionsContext.Provider>
  </Output>
);
```

### Output Component

`<Output>` from `@typespec/emitter-framework` provides:
- TypeSpec `program` context for type resolution
- Name policy for consistent naming
- Binder for symbol management

### Multi-Phase Rendering

flight-instructor uses a pattern where the same tree can be rendered once and filtered for different output:

```tsx
class CSharpRenderer extends Renderer {
  async renderRestClientOperation(options: RenderOperationOptions) {
    return await renderAsync(
      <Output program={this.serviceInfo.program}
        namePolicy={createCSharpNamePolicy()}>
        <RestClient operations={options.operations} />
      </Output>
    );
  }

  // Filter for just models
  async renderForModels(options) {
    const dir = await this.renderRestClientOperation(options);
    return filterFiles(dir, "models/**");
  }

  // Filter for just operations
  async renderForCall(options) {
    const dir = await this.renderRestClientOperation(options);
    return filterFiles(dir, "operations/**");
  }
}
```

---

## Working with Symbols and References

### Creating and Using Refkeys

Refkeys enable **cross-file references** with automatic `using` statement generation:

```tsx
import { refkey, namekey } from "@alloy-js/core";

// Create refkeys for declarations
const widgetClassKey = refkey("Widget");
const orderClassKey = refkey("Order");

// File 1: Declare Widget
<SourceFile path="Models/Widget.cs">
  <Namespace name="MyApp.Models">
    <ClassDeclaration public name="Widget" refkey={widgetClassKey}>
      <Property public name="Id" type="int" get set />
    </ClassDeclaration>
  </Namespace>
</SourceFile>

// File 2: Reference Widget (auto-generates `using MyApp.Models;`)
<SourceFile path="Services/WidgetService.cs">
  <Namespace name="MyApp.Services">
    <ClassDeclaration public name="WidgetService">
      <Method public name="GetWidget" returns={widgetClassKey}
        parameters={[{ name: "id", type: "int" }]}>
        // Alloy renders "Widget" here and adds "using MyApp.Models;" at top
      </Method>
    </ClassDeclaration>
  </Namespace>
</SourceFile>
```

### Refkey with Parameters

Refkeys can reference parameters within methods:

```tsx
const nameParam = refkey();

<Method name="Greet" parameters={[
  { name: "name", type: "string", refkey: nameParam }
]}>
  Console.WriteLine($"Hello, {{{nameParam}}}!");
</Method>
```

### Member Refkeys

Reference members of types:

```tsx
import { memberRefkey } from "@alloy-js/core";

const classKey = refkey("MyClass");
const methodKey = memberRefkey(classKey, refkey("MyMethod"));
// Resolves to: MyClass.MyMethod
```

---

## Scopes and Namespaces

### Scope Hierarchy

Alloy C# maintains a scope hierarchy that mirrors C# semantics:

```
CSharpScope (base)
├── CSharpSourceFileScope (file level, tracks usings)
├── CSharpNamespaceScope (namespace containment)
├── CSharpClassScope (class members)
├── CSharpMethodScope (method body, parameters, locals)
└── CSharpLexicalScope (block scope, local variables)
```

### Automatic Scope Management

Components automatically create appropriate scopes:
- `<SourceFile>` → `CSharpSourceFileScope`
- `<Namespace>` → `CSharpNamespaceScope`
- `<ClassDeclaration>` → `CSharpClassScope`
- `<Method>` → `CSharpMethodScope`

### Manual Scope Access

```tsx
import { useCSharpScope, useMethodScope, useNamespace } from "@alloy-js/csharp";

function MyComponent() {
  const scope = useCSharpScope();      // Current scope
  const method = useMethodScope();      // Nearest method scope
  const ns = useNamespace();           // Nearest namespace
  // ...
}
```

---

## Built-in .NET Type References

The `@alloy-js/csharp` package includes built-in references for the entire .NET standard library:

```tsx
import { System, Microsoft } from "@alloy-js/csharp/builtins";

// Reference System types (auto-generates using statements)
<Property name="Items" type={<>{System.Collections.Generic.List}<string></>} get set />

// IO types
<VarDeclaration name="reader">
  new {System.IO.BinaryReader}(stream)
</VarDeclaration>

// Text.Json
<InvocationExpression
  target={System.Text.Json.JsonSerializer.Deserialize}
  typeArgs={[modelRefkey]}
  args={["json", "options"]}
/>
```

**Available Namespaces:**
- `System` (Collections, Collections.Generic, IO, Net, Net.Http, Text, Text.Json, Threading.Tasks, Linq, Reflection, Security, etc.)
- `Microsoft` (CSharp, Win32)

---

## External Library Definitions

Define external .NET library types that your emitter references:

```tsx
import { createLibrary } from "@alloy-js/csharp";

// Define Azure.Core types
const AzureCore = createLibrary("Azure.Core", {
  TokenCredential: {
    kind: "class",
    members: {},
  },
  TokenRequestContext: {
    kind: "struct",
    members: {},
  },
});

// Use in generated code
<Field private readonly name="credential" type={AzureCore.TokenCredential} />

<VarDeclaration name="tokenContext">
  new {AzureCore.TokenRequestContext}(scopes)
</VarDeclaration>
```

### Library Descriptor Types

```tsx
createLibrary("Namespace", {
  MyClass: {
    kind: "class",
    members: {
      DoSomething: { kind: "method" },
      Value: { kind: "property" },
      Count: { kind: "field" },
      StaticMethod: { kind: "method", isStatic: true },
    },
  },
  MyInterface: {
    kind: "interface",
    members: {},
  },
  MyEnum: {
    kind: "enum",
    members: {
      OptionA: { kind: "field" },
      OptionB: { kind: "field" },
    },
  },
  MyStruct: {
    kind: "struct",
    members: {},
  },
  SubNamespace: {
    kind: "namespace",
    members: {
      InnerClass: { kind: "class", members: {} },
    },
  },
});
```

### Features of Libraries

- **Lazy symbol creation**: Symbols created only when accessed
- **Binder-aware caching**: Each binder context gets its own symbol instances
- **Automatic using generation**: Referencing a library type adds the `using` directive
- **Type-safe**: Full TypeScript generics ensure correct member access

---

## MSBuild / .csproj Generation

The `@alloy-js/msbuild` package provides type-safe JSX components for generating MSBuild project files.

### CsprojFile Component

```tsx
import { CsprojFile } from "@alloy-js/csharp";

<CsprojFile path="MyProject.csproj" sdk="Microsoft.NET.Sdk">
  {`<PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="System.Text.Json" Version="8.0.0" />
  </ItemGroup>`}
</CsprojFile>
```

**Supported SDKs:** `Microsoft.NET.Sdk`, `Microsoft.NET.Sdk.Web`, `Microsoft.NET.Sdk.Worker`, `Microsoft.NET.Sdk.Razor`, `Microsoft.NET.Sdk.BlazorWebAssembly`, `Aspire.AppHost.Sdk`, `MSTest.Sdk`

### MSBuild Components (Typed XML)

For more structured .csproj generation, use the typed MSBuild components:

```tsx
import { Project, PropertyGroup, ItemGroup, PackageReference,
  OutputType, TargetFramework } from "@alloy-js/msbuild/components";

<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Azure.Core" Version="1.38.0" />
    <PackageReference Include="System.Text.Json" Version="8.0.0" />
  </ItemGroup>
</Project>
```

These components render to valid XML and support all standard MSBuild properties, item types, and targets.

---

## Naming Policies

### Default C# Naming Policy

```tsx
import { createCSharpNamePolicy, CSharpElements } from "@alloy-js/csharp";

const namePolicy = createCSharpNamePolicy();
// Applies these conventions:
// class, interface, enum, namespace → PascalCase
// class-method, class-property     → PascalCase
// variable, parameter              → camelCase
// class-member-private             → _camelCase (underscore prefix)
// enum-member                      → PascalCase
// constant                         → CONSTANT_CASE
```

### Extended Naming Policy

flight-instructor extends the default policy with custom rules:

```tsx
import { createNamePolicy } from "@alloy-js/core";
import { createCSharpNamePolicy, CSharpElements } from "@alloy-js/csharp";

type CSharpElementsEx = CSharpElements | "id";

export function createCSharpNamingPolicyEx(
  options: { keepUnderscore?: boolean } = {}
): NamePolicy<CSharpElementsEx> {
  const basePolicty = createCSharpNamePolicy();

  return createNamePolicy((name, element) => {
    // Custom handling for operator names
    if (element === "class-method" && name.startsWith("operator ")) {
      const operatorName = name.slice("operator ".length);
      if (isKnownOperator(operatorName)) {
        return `operator ${operatorName}`;
      }
      // Implicit conversion operator
      return `implicit operator ${basePolicy.getName(operatorName, "class")}`;
    }

    // Custom handling for IDs (snake_case)
    if (element === "id") {
      return toSnakeCase(name);
    }

    // Underscore preservation option
    if (options.keepUnderscore) {
      return name.split("_")
        .map((word) => basePolicy.getName(word, element))
        .join("_");
    }

    return basePolicy.getName(name, element);
  });
}
```

### Using Name Policies

Pass the name policy via `<Output>`:

```tsx
<Output program={program} namePolicy={createCSharpNamingPolicyEx()}>
  {/* All nested components use this naming policy */}
</Output>
```

Or access it in components:

```tsx
import { useCSharpNamePolicy } from "@alloy-js/csharp";

function MyComponent() {
  const namePolicy = useCSharpNamePolicy();
  const formattedName = namePolicy.getName("myProperty", "class-property");
  // Returns "MyProperty"
}
```

---

## Context Pattern

### Creating Custom Contexts

Use React-style contexts to pass shared data through the component tree:

```tsx
import { ComponentContext, createContext, useContext } from "@alloy-js/core";

// Define context type
interface RestClientContextType {
  namespace: string;
  endpoint: string;
  operations: OperationDescriptor[];
  allTypes: Type[];
  authSchemes: AuthScheme[];
}

// Create typed context
const RestClientContext: ComponentContext<RestClientContextType> = createContext();

// Create a typed hook with validation (recommended pattern from flight-instructor)
function useRestClientContext(): RestClientContextType {
  const context = useContext(RestClientContext);
  if (!context) {
    throw new Error("RestClientContext is not set");
  }
  return context;
}

// Provider in parent component
function RestClient(props: RestClientProps) {
  const ctx: RestClientContextType = {
    namespace: "MyApp.Client",
    endpoint: props.endpoint,
    operations: props.operations,
    allTypes: discoverTypes(props.operations),
    authSchemes: props.authSchemes,
  };

  return (
    <RestClientContext.Provider value={ctx}>
      <ModelFiles />
      <OperationFiles />
    </RestClientContext.Provider>
  );
}

// Consumer in child component (any depth)
function ModelFiles() {
  const ctx = useRestClientContext(); // typed, throws if missing

  return (
    <>
      {ctx.allTypes.map((type) => (
        <SourceFile path={`${type.name}.cs`}>
          <Model type={type} />
        </SourceFile>
      ))}
    </>
  );
}
```

### Nested Contexts

flight-instructor uses nested contexts for operation group-specific data:

```tsx
interface OperationGroupContextType {
  httpClientField: Refkey;        // refkey to the HttpClient field
  endpointField: Refkey;          // refkey to the endpoint field
  credential: AuthCredential[];   // auth credentials for this group
}

const OperationGroupContext = createContext<OperationGroupContextType>();

function OperationGroup({ group }: { group: GroupDescriptor }) {
  const httpClientKey = refkey();
  const endpointKey = refkey();

  const ogCtx = {
    httpClientField: httpClientKey,
    endpointField: endpointKey,
    credential: resolveCredentials(group),
  };

  return (
    <OperationGroupContext.Provider value={ogCtx}>
      <ClassDeclaration public name={`${group.name}Operations`}>
        <Field private readonly name="httpClient" type="HttpClient"
          refkey={httpClientKey} />
        <Field private readonly name="endpoint" type="string"
          refkey={endpointKey} />
        {group.operations.map((op) => <Operation operation={op} />)}
      </ClassDeclaration>
    </OperationGroupContext.Provider>
  );
}

// Operations can access both contexts
function Operation({ operation }: { operation: OperationDescriptor }) {
  const restCtx = useContext(RestClientContext);
  const ogCtx = useContext(OperationGroupContext);

  return (
    <Method public async name={operation.name}>
      // Use ogCtx.httpClientField to reference the HTTP client
      await {ogCtx.httpClientField}.SendAsync(request);
    </Method>
  );
}
```

---

## STC (Statically Typed Components)

STC is an alternative API for composing Alloy components using a **fluent builder pattern** instead of JSX. It's useful when you want clean, chainable syntax for code generation.

### How It Works

```tsx
import * as stc from "@alloy-js/csharp/stc";
import { code } from "@alloy-js/core";

// STC style (fluent builder)
stc.ClassDeclaration({ public: true, name: "MyClient" }).children(
  stc.Field({ private: true, readonly: true, name: "httpClient", type: "HttpClient" }),
  stc.Constructor({ public: true, parameters: [{ name: "httpClient", type: "HttpClient" }] })
    .code`this.httpClient = httpClient;`,
  stc.ClassMethod({ public: true, async: true, name: "GetAsync", returns: "Task<string>" })
    .code`return await httpClient.GetStringAsync(BaseUrl);`
)

// Equivalent JSX style
<ClassDeclaration public name="MyClient">
  <Field private readonly name="httpClient" type="HttpClient" />
  <Constructor public parameters={[{ name: "httpClient", type: "HttpClient" }]}>
    this.httpClient = httpClient;
  </Constructor>
  <Method public async name="GetAsync" returns="Task<string>">
    return await httpClient.GetStringAsync(BaseUrl);
  </Method>
</ClassDeclaration>
```

### Available STC Components

- `stc.ClassDeclaration` — wraps ClassDeclaration
- `stc.Constructor` — wraps Constructor
- `stc.Field` — wraps Field
- `stc.ClassMethod` — wraps Method
- `stc.EnumDeclaration` — wraps EnumDeclaration
- `stc.EnumMember` — wraps EnumMember
- `stc.Parameter` — wraps Parameter
- `stc.StructDeclaration` — wraps StructDeclaration

### Chaining Methods

- `.code\`template\`` — Add code block via tagged template literal
- `.text\`template\`` — Add text content
- `.children(...children)` — Add child components

### When to Use

| Use STC When | Use JSX When |
|---|---|
| Simple code generation pipelines | Complex conditional rendering |
| Template-heavy code output | Lots of `<Show>`, `<For>`, `<Switch>` |
| Prefer builder pattern style | Prefer declarative markup |
| Working outside .tsx files | Working in .tsx files |

---

## Testing Patterns

### Test Setup

```tsx
// test/test-host.ts
import { createTester } from "@typespec/compiler/testing";

const ApiTester = createTester(resolvePath(import.meta.dirname, ".."), {
  libraries: ["http-client-csharp"],
});

export const Tester = ApiTester.emit("http-client-csharp");
```

### Basic Emitter Test

```tsx
import { describe, it, expect } from "vitest";
import { Tester } from "./test-host.js";

describe("models", () => {
  it("generates model class from TypeSpec model", async () => {
    const [{ outputs }, diagnostics] = await Tester.compileAndDiagnose(`
      model Widget {
        name: string;
        id: int32;
      }
      @route("/test") interface Test {
        @get op getWidget(): Widget;
      }
    `);

    expect(diagnostics).toHaveLength(0);
    expect(outputs["models/Widget.cs"]).toContain("class Widget");
    expect(outputs["models/Widget.cs"]).toContain("public string Name { get; set; }");
  });
});
```

### Component-Level Testing with Alloy

Use `createCSharpTestWrapper()` for unit-testing individual components:

```tsx
import { createCSharpTestWrapper } from "@alloy-js/csharp/testing";
import { d } from "@alloy-js/core/testing";

describe("ClassDeclaration", () => {
  it("renders a simple class", () => {
    const { Wrapper } = createCSharpTestWrapper();

    expect(
      <Wrapper>
        <ClassDeclaration public name="MyClass">
          <Property name="Id" type="int" get set />
        </ClassDeclaration>
      </Wrapper>
    ).toRenderTo(d`
      public class MyClass
      {
          int Id { get; set; }
      }
    `);
  });
});
```

### Testing with Context

```tsx
import { renderAsync } from "@alloy-js/core";
import { Output } from "@typespec/emitter-framework";

async function renderComponent(program: Program, component: Children): Promise<string> {
  const ctx = createTestContext();

  const tree = (
    <Output program={program}>
      <RestClientContext.Provider value={ctx}>
        <SourceFile path="test.cs">
          {component}
        </SourceFile>
      </RestClientContext.Provider>
    </Output>
  );

  const directory = await renderAsync(tree);
  return extractFileContent(directory, "test.cs");
}

it("renders operation method", async () => {
  const program = await compileTypeSpec(`
    op getWidget(@path id: string): Widget;
  `);

  const descriptor = resolveOperationDescriptor(program);
  const output = await renderComponent(
    program,
    <Operation operation={descriptor} />
  );

  expect(output).toContain("async Task<Widget> GetWidget");
  expect(output).toContain("string id");
  expect(output).toContain("CancellationToken cancellationToken = default");
});
```

### Testing Utilities

```tsx
// From @alloy-js/csharp test utilities
import { TestNamespace, toSourceText, testRender, findFile } from "./utils.jsx";

// Wrap content in a test source file + namespace
function TestNamespace({ children }) {
  return (
    <SourceFile path="test.cs">
      <Namespace name="TestNamespace">
        {children}
      </Namespace>
    </SourceFile>
  );
}

// Render to string for assertions
const text = toSourceText(<MyComponent />);
expect(text).toContain("expected output");

// Full render with file lookup
const dir = testRender(<MyRootComponent />);
const file = findFile(dir, "Models/Widget.cs");
expect(file).toBeDefined();
```

---

## Complete Examples

### Example 1: Simple REST Client Generator

```tsx
// components/simple-client.tsx
import { SourceFile, Namespace, ClassDeclaration, Method, Constructor,
  Field, Property, VarDeclaration, Attribute } from "@alloy-js/csharp";
import { SourceDirectory, refkey } from "@alloy-js/core";

interface SimpleClientProps {
  serviceName: string;
  namespace: string;
  operations: { name: string; path: string; method: string; returnType: string }[];
}

export function SimpleClient(props: SimpleClientProps) {
  const httpClientKey = refkey();
  const baseUrlKey = refkey();

  return (
    <SourceDirectory path="generated">
      <SourceFile path={`${props.serviceName}Client.cs`}>
        <Namespace name={props.namespace}>
          <ClassDeclaration public name={`${props.serviceName}Client`}>
            <Field private readonly name="httpClient" type="HttpClient"
              refkey={httpClientKey} />
            <Field private readonly name="baseUrl" type="string"
              refkey={baseUrlKey} />

            <Constructor public parameters={[
              { name: "httpClient", type: "HttpClient" },
              { name: "baseUrl", type: "string" }
            ]}>
              this.httpClient = httpClient;
              this.baseUrl = baseUrl;
            </Constructor>

            {props.operations.map((op) => (
              <ClientOperation
                operation={op}
                httpClientKey={httpClientKey}
                baseUrlKey={baseUrlKey}
              />
            ))}
          </ClassDeclaration>
        </Namespace>
      </SourceFile>
    </SourceDirectory>
  );
}

function ClientOperation({ operation, httpClientKey, baseUrlKey }) {
  return (
    <Method public async name={operation.name}
      returns={`Task<${operation.returnType}>`}
      parameters={[
        { name: "cancellationToken", type: "CancellationToken", default: "default" }
      ]}>
      <VarDeclaration name="url">
        $"{{{baseUrlKey}}}{operation.path}"
      </VarDeclaration>
      <VarDeclaration name="response" using>
        await {httpClientKey}.GetAsync(url, cancellationToken)
      </VarDeclaration>
      response.EnsureSuccessStatusCode();
      <VarDeclaration name="content">
        await response.Content.ReadAsStringAsync()
      </VarDeclaration>
      return JsonSerializer.Deserialize&lt;{operation.returnType}&gt;(content)!;
    </Method>
  );
}
```

### Example 2: Model with JSON Serialization

```tsx
import { SourceFile, Namespace, ClassDeclaration, Property,
  Attribute, DocComment, DocSummary } from "@alloy-js/csharp";

function JsonModel({ name, properties }) {
  return (
    <ClassDeclaration public sealed name={name}
      attributes={[
        <Attribute name="JsonSerializable" />
      ]}>
      <DocComment>
        <DocSummary>Represents a {name} resource.</DocSummary>
      </DocComment>

      {properties.map((prop) => (
        <Property
          public
          required={!prop.optional}
          name={prop.name}
          type={prop.csType}
          nullable={prop.optional}
          get set
          attributes={[
            <Attribute name="JsonPropertyName"
              args={[`"${prop.serializedName}"`]} />
          ]}
        />
      ))}
    </ClassDeclaration>
  );
}

// Usage
<SourceFile path="Models/Widget.cs">
  <Namespace name="MyApp.Models">
    <JsonModel name="Widget" properties={[
      { name: "Id", csType: "int", serializedName: "id", optional: false },
      { name: "Name", csType: "string", serializedName: "name", optional: false },
      { name: "Description", csType: "string", serializedName: "description", optional: true },
    ]} />
  </Namespace>
</SourceFile>

// Generates:
// using System.Text.Json.Serialization;
//
// namespace MyApp.Models
// {
//     /// <summary>Represents a Widget resource.</summary>
//     [JsonSerializable]
//     public sealed class Widget
//     {
//         [JsonPropertyName("id")]
//         public required int Id { get; set; }
//
//         [JsonPropertyName("name")]
//         public required string Name { get; set; }
//
//         [JsonPropertyName("description")]
//         public string? Description { get; set; }
//     }
// }
```

### Example 3: Interface + Implementation

```tsx
const interfaceKey = refkey("IWidgetService");

// Interface file
<SourceFile path="IWidgetService.cs">
  <Namespace name="MyApp.Services">
    <InterfaceDeclaration public name="IWidgetService" refkey={interfaceKey}>
      <InterfaceMethod name="GetWidgetAsync"
        returns="Task<Widget>"
        parameters={[{ name: "id", type: "int" }]} />
      <InterfaceMethod name="CreateWidgetAsync"
        returns="Task<Widget>"
        parameters={[{ name: "widget", type: "Widget" }]} />
    </InterfaceDeclaration>
  </Namespace>
</SourceFile>

// Implementation file (auto-generates `using` for IWidgetService)
<SourceFile path="WidgetService.cs">
  <Namespace name="MyApp.Services.Impl">
    <ClassDeclaration public name="WidgetService"
      interfaceTypes={[interfaceKey]}>
      <Method public async name="GetWidgetAsync"
        returns="Task<Widget>"
        parameters={[{ name: "id", type: "int" }]}>
        // implementation
      </Method>
      <Method public async name="CreateWidgetAsync"
        returns="Task<Widget>"
        parameters={[{ name: "widget", type: "Widget" }]}>
        // implementation
      </Method>
    </ClassDeclaration>
  </Namespace>
</SourceFile>
```

---

## Key Patterns Summary

| Pattern | Description | Example |
|---------|-------------|---------|
| **Component Tree** | Organize output as nested JSX components | `<RestClient> → <ModelFiles> → <Model>` |
| **Context Providers** | Share state without prop drilling | `<Context.Provider value={ctx}>` |
| **Refkeys** | Cross-file symbol references | `refkey()` + `refkey={key}` |
| **Descriptors** | Abstract TypeSpec types into generation metadata | `GroupDescriptor`, `OperationDescriptor` |
| **Name Policies** | Consistent naming conventions | `createCSharpNamePolicy()` |
| **Library Definitions** | Reference external .NET types | `createLibrary("Azure.Core", {...})` |
| **Source Directories** | Organize output file structure | `<SourceDirectory path="models">` |
| **Multi-Phase Render** | Generate once, filter for specific output | `renderAsync()` → filter by path |
| **Type Mapping** | Map TypeSpec types to C# types | `mapTypeToCs()` helpers |
| **Extensible Enums** | Union types as readonly structs | `<StructDeclaration readonly>` with static props |

---

## File Organization Recommendations

```
src/
├── emitter.tsx              # $onEmit entry point
├── index.ts                 # Public exports
├── lib.ts                   # TypeSpec library definition
├── renderer.tsx             # Renderer class (orchestrates rendering)
├── name-policy.ts           # Custom naming policy
├── components/
│   ├── rest-client.tsx      # Root component
│   ├── models.tsx           # Model generation
│   ├── operation-group.tsx  # Operation group classes
│   ├── operation.tsx        # Individual operation methods
│   ├── call-http.tsx        # HTTP request/response handling
│   ├── serialization.tsx    # JSON serialization context
│   └── doc.tsx              # XML documentation
├── contexts/
│   ├── rest-client-context.ts
│   └── operation-group-context.ts
├── descriptors/
│   ├── descriptor.ts        # Type definitions
│   └── descriptor-resolver.tsx
├── libraries/
│   └── external-libs.ts     # External .NET type definitions
├── utils/
│   ├── type-mapping.ts      # TypeSpec → C# type mapping
│   └── helpers.ts           # General utilities
└── testing/
    └── index.ts             # Test library setup
```
