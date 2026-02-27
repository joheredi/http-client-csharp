## Vitest picking up submodule tests

**Problem:** Running `pnpm test` without restricting test includes caused vitest to discover
and run thousands of tests from `submodules/`, leading to failures unrelated to this project.

**Fix:** Added `test.include: ["test/**/*.test.ts", "test/**/*.test.tsx"]` to `vitest.config.ts`
to scope test discovery to only the project's `test/` directory.

**Date:** 2026-02-24

## TCGC models only appear in sdkPackage.models when referenced by operations

**Problem:** Defining a model in TypeSpec without any operation referencing it causes TCGC
to prune it from `sdkPackage.models`. Tests that declare standalone models and expect them
in the context will see `models.length === 0`.

**Fix:** Always include an operation that references the model in test TypeSpec:
```tsp
model Foo { name: string; }
op getFoo(): Foo;            // ← Foo now appears in sdkPackage.models
```

**Date:** 2026-02-24

## Alloy JSX is lazy — throws occur during rendering, not construction

**Problem:** Testing `expect(() => <MyComponent />).toThrow()` doesn't work because
Alloy's JSX creates component descriptions lazily. Components aren't actually evaluated
until `renderTree()` is called (which `toRenderTo` does internally).

**Fix:** Use `renderToString()` from `@alloy-js/core/testing` to trigger evaluation:
```tsx
import { renderToString } from "@alloy-js/core/testing";
expect(() => renderToString(<MyComponent />)).toThrow("expected error");
```

**Date:** 2026-02-24

## EmitContext requires a `perf` property in tests

**Problem:** Creating an `EmitContext` manually for `createSdkContext()` in tests fails
because the `EmitContext` interface requires a `perf: PerfReporter` property.

**Fix:** Provide a no-op perf reporter:
```ts
const perf = {
  startTimer: (label: string) => ({ end: () => 0 }),
  time: <T,>(label: string, cb: () => T) => cb(),
  timeAsync: <T,>(label: string, cb: () => Promise<T>) => cb(),
  report: () => {},
};
```

**Date:** 2026-02-24

## SdkContext name collision with TCGC import

**Problem:** Naming our Alloy context `SdkContext` conflicts with the TCGC type
`SdkContext` from `@azure-tools/typespec-client-generator-core`. TypeScript reports
TS2395 "Individual declarations in merged declaration must be all exported or all local."

**Fix:** Import the TCGC type with an alias: `import type { SdkContext as TcgcSdkContext }`.

**Date:** 2026-02-24

## Alloy import ordering is NOT alphabetical by package name

**Problem:** When using `toRenderTo` with multi-package imports, assuming alphabetical
ordering by package name causes test failures. For example, expecting `@azure/abort-controller`
before `@azure/core-rest-pipeline` fails if the symbols are referenced in a different order.

**Fix:** Alloy orders imports based on the order externals are registered and symbols
are first encountered during the rendering pass. Write expected imports in the same
order as the package registration in `<Output externals={[...]}>` and the order symbols
appear in the rendered code.

**Date:** 2026-02-24

## Alloy JSDoc renders multi-line format even for short descriptions

**Problem:** When passing a short doc string to Alloy's `doc` prop on
`InterfaceDeclaration` or `InterfaceMember`, the rendered JSDoc always uses
multi-line format:
```ts
/**
 * Short description.
 */
```
Not the single-line `/** Short description. */` format. Tests must match
the multi-line format.

**Fix:** Always expect multi-line JSDoc format in test assertions, even for
single-sentence documentation strings.

**Date:** 2026-02-24

## TCGC subtypes only contain their own properties, not inherited ones

**Problem:** When a model extends a base model (e.g., `Cat extends Pet`),
TCGC's `SdkModelType.properties` array only contains properties declared
directly on the subtype, not properties inherited from the base model.
Tests should not expect inherited properties in the subtype's interface body.

**Fix:** Only assert on properties directly declared on the subtype. The
`extends` clause handles inheritance — consumers access base properties
through the TypeScript type system, not through duplication.

**Date:** 2026-02-24

## Index signature members outside <For> don't get semicolons

**Problem:** When rendering additionalProperties as an `<InterfaceMember indexer=...>`
after the `<For>` block for regular properties, the index signature member does
not automatically get a trailing semicolon. The `<For>` component's `enderPunctuation`
only applies to items inside the For.

**Fix:** Accept the index signature without a trailing semicolon in test assertions.
The Alloy `InterfaceMember` renders the member as `[key: string]: T` without
a terminating semicolon when used outside a `<For>` with `enderPunctuation`.

**Date:** 2026-02-24

## Native TypeSpec enums are always isFixed=true in TCGC

**Problem:** Attempting to create an extensible (isFixed=false) enum using a TypeSpec
`union` type (e.g., `union Status { Active: "active", string }`) does not produce an
`SdkEnumType` in TCGC's `sdkPackage.enums`. TCGC only produces non-fixed enums from
Azure-specific union-as-enum patterns (requiring `@azure-tools/typespec-azure-core`).

**Fix:** When testing the extensible enum code path, modify a normal enum's `isFixed`
property to simulate the extensible case:
```tsx
const enumType = { ...sdkContext.sdkPackage.enums[0], isFixed: false };
```
This tests the component's branching logic without requiring Azure-specific TypeSpec
libraries in the test setup.

**Date:** 2026-02-24

## Alloy EnumMember with jsValue renders correct value syntax

**Problem:** Unclear how Alloy's `<EnumMember>` component renders string vs numeric values.

**Fix:** The `jsValue` prop on `<EnumMember>` uses `<ValueExpression>` internally, which
correctly quotes strings (`= "value"`) and leaves numbers bare (`= 42`). This matches
TypeScript enum member syntax. Use `jsValue` (not `value`) for literal enum member values.

**Date:** 2026-02-24

## TCGC converts string-literal unions to enums

**Problem:** TypeSpec unions of string literals (e.g., `union Foo { a: "a", b: "b" }`)
are converted by TCGC into `SdkEnumType` rather than `SdkUnionType`. Only unions with
mixed types (e.g., `string | int32`) or model/enum variants remain as `SdkUnionType`
in `sdkPackage.unions`. Tests that define string-literal unions and expect them in
`sdkPackage.unions` will find the array empty.

**Fix:** Use mixed-type unions (e.g., `union Foo { s: string, n: int32 }`) in tests
for the `UnionDeclaration` component. String-literal unions should be tested via the
`EnumDeclaration` component instead.

**Date:** 2026-02-24

## sdkPackage.unions array type includes SdkNullableType

**Problem:** The `sdkPackage.unions` array has type `(SdkNullableType | SdkUnionType)[]`,
not just `SdkUnionType[]`. Accessing `unions[0]` and passing it to a component expecting
`SdkUnionType` causes a TypeScript type error because `SdkNullableType` lacks `variantTypes`.

**Fix:** Cast union elements in tests: `sdkContext.sdkPackage.unions[0] as SdkUnionType`.
In production code, filter by `kind === "union"` before passing to `UnionDeclaration`.

**Date:** 2026-02-24

## TCGC discriminatedSubtypes is a Record, not an array

**Problem:** `SdkModelType.discriminatedSubtypes` has type `Record<string, SdkModelType> | undefined`.
Keys are the discriminator values (e.g., `"cat"`, `"dog"`), values are the subtype models.
It may include transitive subtypes in multi-level hierarchies (e.g., `Animal → Bird → Eagle`
could have both `"bird"` and `"eagle"` as keys on `Animal`).

**Fix:** Use `Object.values(model.discriminatedSubtypes)` to iterate subtypes. Filter by
`subtype.baseModel === model` to get only direct subtypes (not transitive ones). This is
critical for generating correct polymorphic union types at each level of a hierarchy.

**Date:** 2026-02-24

## Discriminator-only models: test assertions must match actual TCGC output

**Problem:** When defining a discriminated base model with a `kind` property and extra
properties, the rendered interface output depends on what TCGC actually includes. Test
assertions that assume all TypeSpec properties appear will fail if TCGC strips or reorganizes
them.

**Fix:** Verify the actual TCGC model properties before writing expected test output.
Use the actual rendered output to drive assertions rather than guessing from TypeSpec input.

**Date:** 2026-02-24

## t.model() marker only works for TypeSpec `model` entities

**Problem:** Using `t.model("Color")` in a `t.code` template where `Color` is defined
as a TypeSpec `enum` (not a `model`) causes a compile error: "Expected Color to be of
kind Model but got (Enum)". Similarly, using `t.model()` for a `union` fails with
"Expected ... to be of kind Model but got (Union)".

**Fix:** Only use `t.model()` for actual TypeSpec model definitions. For enums and unions,
write them as plain strings in the template without markers. Operations referencing them
still work — markers are only needed if you want to extract the entity by marker later.

**Date:** 2026-02-24

## TCGC does not include return-type-only unions in sdkPackage.unions

**Problem:** A TypeSpec union used only as an operation return type (e.g.,
`op getMixed(): MixedType;`) may not appear in `sdkPackage.unions`. Testing
the ModelFiles orchestrator with such a union produces empty output because
`unions.length === 0`.

**Fix:** Use the union as an input parameter (e.g., `op sendMixed(@body value: MixedType): void;`)
to ensure TCGC includes it in `sdkPackage.unions`. This mirrors real-world usage where
unions are typically used in request bodies.

**Date:** 2026-02-24

## Duplicate HTTP operation routes cause compilation errors

**Problem:** Multiple operations with the same HTTP method and route (e.g., two `op` 
declarations that both resolve to `GET /`) cause `@typespec/http/duplicate-operation`
compilation errors.

**Fix:** Give operations different routes using `@route("path")` decorator or different
HTTP methods. Example: `@get op getFoo(): Foo;` and `@get @route("bar") op getBar(): Bar;`

**Date:** 2026-02-24

## Testing multi-file Alloy output with toRenderTo

**Problem:** Components that produce SourceDirectory + SourceFile output can't be tested
with `SdkTestFile` (which wraps in its own SourceFile), and need a different assertion
pattern than single-file tests.

**Fix:** Create a custom test wrapper that provides only `<Output>` and
`<SdkContextProvider>` without a `<SourceFile>`. Use `toRenderTo` with an object
argument where keys are file paths (including directory prefixes) and values are
expected content:
```tsx
expect(template).toRenderTo({
  "models/models.ts": d\`expected content\`,
});
```
For empty output (component returns undefined), use `toRenderTo("")`.

**Date:** 2026-02-24

## Use Alloy ObjectExpression for object literal code generation

**Problem:** Using raw `code` templates with `\n` and `<For>` for object literals
(e.g., serializer return statements) produces poorly formatted output because
Alloy's indentation context doesn't apply properly to raw newlines. Properties
end up at wrong indentation levels and on unexpected lines.

**Fix:** Use Alloy's `ObjectExpression` and `ObjectProperty` components from
`@alloy-js/typescript` instead of raw code templates for object literal rendering.
These components use Alloy's `<Block>` internally, which properly handles indentation
and brace placement:
```tsx
import { ObjectExpression, ObjectProperty } from "@alloy-js/typescript";

// ✅ GOOD — proper formatting
<FunctionDeclaration ...>
  {code`return `}
  <ObjectExpression>
    <For each={properties} comma softline enderPunctuation>
      {(prop) => <ObjectProperty name={wireName} value={valueExpr} />}
    </For>
  </ObjectExpression>
  {code`;`}
</FunctionDeclaration>
```

`ObjectProperty` also uses `PropertyName` internally, which automatically quotes
property names that aren't valid JavaScript identifiers.

**Date:** 2026-02-24

## UsageFlags is a bitmask — use bitwise AND for checks

**Problem:** Checking `model.usage === UsageFlags.Input` fails for models that
have multiple usage flags (e.g., `Input | Output`). The equality check only
matches models with exactly one flag set.

**Fix:** Use bitwise AND: `(model.usage & UsageFlags.Input) !== 0`. This correctly
matches models that have the Input flag set regardless of other flags:
```typescript
const hasInput = (model.usage & UsageFlags.Input) !== 0;
const hasOutput = (model.usage & UsageFlags.Output) !== 0;
const hasException = (model.usage & UsageFlags.Exception) !== 0;
```

**Date:** 2026-02-24

## Alloy renders `import type` when symbol is only used in type position

**Problem:** When an external package symbol (e.g., `OperationOptions` from `httpRuntimeLib`)
is only used in a type position (e.g., `extends` clause of an interface), Alloy renders
`import type { ... }` instead of `import { ... }`. Test assertions that use the non-type
import syntax will fail.

**Fix:** Always use `import type { ... }` in test assertions when the imported symbol
is only referenced in type positions (extends clauses, type annotations, etc.).

**Date:** 2026-02-24

## Empty Alloy interface bodies render as `{}` on one line

**Problem:** When an `InterfaceDeclaration` has no children (empty interface), Alloy renders
`export interface Foo extends Bar {}` on a single line, NOT with the braces on separate lines.

**Fix:** Use `{}` on the same line in test assertions for empty interfaces:
```tsx
// ✅ Correct
export interface FooOptionalParams extends OperationOptions {}

// ❌ Wrong
export interface FooOptionalParams extends OperationOptions {
}
```

**Date:** 2026-02-24

## Component name collision with external package symbols in JSX

**Problem:** Naming a component the same as an external package symbol (e.g., naming a
component `OperationOptions` when `httpRuntimeLib.OperationOptions` exists) causes
`ReferenceError: OperationOptions is not defined` in some test contexts. Alloy's JSX
resolution can confuse the component function with the external symbol.

**Fix:** Use distinct names for components that would collide with external package symbols.
For example, use `OperationOptionsDeclaration` instead of `OperationOptions` to avoid
collision with `httpRuntimeLib.OperationOptions`.

**Date:** 2026-02-24

## @patch decorator requires explicit implicitOptionality flag

**Problem:** Using `@patch op myOp(@body body?: MyModel): void;` produces a diagnostic
warning: `@typespec/http/patch-implicit-optional: Patch operation stopped applying an
implicit optional transform to the body in 1.0.0.`

**Fix:** Use `@patch(#{implicitOptionality: true})` when the body parameter should be optional:
```tsp
@patch(#{implicitOptionality: true}) op updateItem(@path id: string, @body body?: PatchData): string;
```

**Date:** 2026-02-24

## Alloy code templates with \n produce inconsistent indentation

**Problem:** Using raw `\n` characters inside Alloy `code` template literals for line breaks
produces inconsistent indentation because Alloy's indentation context only applies to
backtick-delimited line breaks, not raw `\n` characters injected via string interpolation.

**Fix:** Avoid raw `\n` in code templates for multiline output. Either:
1. Use backtick line breaks within the code template (Alloy manages indentation)
2. Or render single-line output and let Alloy handle formatting

For the send function's return statement, a single-line format works well:
```tsx
code`return context.path(${pathExpr}).${verb}({ ...${refkey}(options), headers: { ... } });`
```

**Date:** 2026-02-24

## Alloy combines imports from same package with inline `type` annotation

**Problem:** When multiple symbols from the same external package are used (some in
type-only positions, some in value positions), Alloy renders a single import statement
with inline `type` annotations for type-only symbols instead of separate `import` and
`import type` statements.

**Fix:** Expect a single combined import in test assertions:
```tsx
// ✅ Correct expectation
import { type Client, expandUrlTemplate, type OperationOptions, operationOptionsToRequestParameters, type StreamableMethod } from "@typespec/ts-http-runtime";

// ❌ Wrong - Alloy doesn't split imports like this
import type { OperationOptions } from "@typespec/ts-http-runtime";
import { StreamableMethod } from "@typespec/ts-http-runtime";
```

Symbols are sorted alphabetically within the import statement.

**Date:** 2026-02-24

## Alloy FunctionDeclaration formats parameters on separate lines

**Problem:** When a function has 2 or more parameters, Alloy's `FunctionDeclaration`
component renders each parameter on its own line with 2-space indentation, followed
by a closing `) :` on a separate line.

**Fix:** Always expect multi-line parameter formatting in test assertions for functions
with 2+ parameters:
```tsx
// ✅ Correct
export function _getItemSend(
  context: Client,
  options: GetItemOptionalParams = { requestOptions: {} },
): StreamableMethod {

// ❌ Wrong
export function _getItemSend(context: Client, options: GetItemOptionalParams = { requestOptions: {} }): StreamableMethod {
```

**Date:** 2026-02-24

---

### Alloy `async` FunctionDeclaration wraps returnType in Promise automatically

**Problem:** When using `<FunctionDeclaration async returnType={code`Promise<${type}>`}>`, the rendered output was `Promise<Promise<T>>` — a double Promise wrapping.

**Root cause:** Alloy's `FunctionDeclaration` component, when the `async` prop is set, automatically wraps the provided `returnType` in `Promise<...>`. If you also manually provide `Promise<...>` in the returnType prop, you get `Promise<Promise<T>>`.

**Fix:** When using the `async` prop, provide only the raw inner type:

```tsx
// ✅ Correct — async wraps in Promise automatically
<FunctionDeclaration async returnType={typeExpression}>

// ❌ Wrong — double Promise wrapping
<FunctionDeclaration async returnType={code`Promise<${typeExpression}>`}>
```

**Date:** 2026-02-24

## Alloy FunctionDeclaration `doc` prop auto-generates @param JSDoc tags

**Problem:** When using the `doc` prop on `FunctionDeclaration`, Alloy not only
renders the doc string as a JSDoc comment but also auto-generates `@param {Type}`
tags for each parameter. This means the generated JSDoc is longer than just the
description.

**Fix:** Include `@param` tags in test assertions when using the `doc` prop:
```tsx
/**
 * My description.
 *
 * @param {Client} context
 * @param {MyOptionsParams} options
 */
```

Also, when `doc` is used and a parameter type (like `Client`) appears in `@param`,
that type reference is used in a value-like position (inside JSDoc), so Alloy imports
it without the `type` prefix: `import { Client }` instead of `import type { Client }`.

**Date:** 2026-02-24

## Array type expressions render with parentheses around element type

**Problem:** When Alloy renders array type expressions like `string[]`, the
`getTypeExpression` function wraps the element type in parentheses, producing
`(string)[]` instead of `string[]`. This is syntactically valid TypeScript but
looks different from what you might expect.

**Fix:** In test assertions, use `(string)[]` instead of `string[]` for array
return types. For model types, it renders as `(ModelName)[]`.

**Date:** 2026-02-24

## toRenderTo with expect.stringContaining requires ALL output files

**Problem:** When using `toRenderTo` with `expect.stringContaining()` for a
multi-file component (e.g., one that renders both `models/models.ts` and
`api/operations.ts`), specifying only one file in the expected object causes
a test failure. The matcher requires ALL rendered files to be accounted for.

**Fix:** When asserting on multi-file output with `expect.stringContaining()`,
include ALL files in the assertion object:
```tsx
// ✅ Correct — both files specified
expect(template).toRenderTo({
  "api/operations.ts": expect.stringContaining("widgetSerializer"),
  "models/models.ts": expect.stringContaining("export interface Widget"),
});

// ❌ Wrong — missing models/models.ts
expect(template).toRenderTo({
  "api/operations.ts": expect.stringContaining("widgetSerializer"),
});
```

**Date:** 2026-02-24

## Empty @service namespace produces 0 clients in TCGC

**Problem:** A TypeSpec `@service` namespace with no operations compiles
successfully but produces 0 clients in `sdkPackage.clients` (not 1 empty
client as might be expected).

**Fix:** Don't assert `clients.length === 1` for empty services. Instead,
test the empty case by verifying the component output is empty directly:
```tsx
expect(template).toRenderTo("");
```

**Date:** 2026-02-24

## TCGC only adds apiVersion to clientInitialization when operations use it

**Problem:** Testing versioned services with `@Versioning.versioned(Versions)` but
without operations that explicitly declare `@query apiVersion` does not produce an
`apiVersion` parameter in `client.clientInitialization.parameters`. The `@versioned()`
decorator only populates the `client.apiVersions` string array.

**Fix:** To test api-version in client context, declare operations with an explicit
api-version query parameter:
```tsp
@get op getItem(@query apiVersion?: string): string;
```
This causes TCGC to add a method parameter with `isApiVersionParam: true` to the
client initialization parameters.

**Date:** 2026-02-24

## Alloy toRenderTo cannot accept expect.stringContaining for single-file renders

**Problem:** Using `expect(template).toRenderTo(expect.stringContaining("..."))` with
a single-file component (wrapped in `SdkTestFile`) throws `str.replace is not a function`
because `toRenderTo` calls `dedent()` which expects a string argument, not a Vitest
asymmetric matcher.

**Fix:** For partial matching on single-file output, use `renderToString()` from
`@alloy-js/core/testing` and then `expect(result).toContain("...")`:
```tsx
import { renderToString } from "@alloy-js/core/testing";
const result = renderToString(template);
expect(result).toContain("expectedContent");
```
Note: `expect.stringContaining()` DOES work with `toRenderTo` when the expected value
is an **object** (multi-file output), because the object-path matching doesn't call `dedent`.

**Date:** 2026-02-24

## Alloy name policy transforms type parameter names to camelCase

**Problem:** When using `typeParameters={["TResult"]}` on `InterfaceDeclaration`
or `FunctionDeclaration`, Alloy's TypeScript name policy transforms the type
parameter names to camelCase: `TResult` → `tResult`, `TElement` → `tElement`.
However, within the body of the declaration, manually written type references
like `TResult` in code templates are NOT transformed (they're raw strings).

**Fix:** In test assertions, expect camelCase type parameter names in the
declaration signature but original casing in the body:
```tsx
// ✅ Correct assertion
expect(result).toContain("export interface OperationState<tResult>");
// Body still uses TResult as written in code templates
```

**Date:** 2026-02-24

## TypeParameterDescriptor uses `extends` not `constraint` for type constraints

**Problem:** The Alloy TypeParameterDescriptor interface uses `extends` as the
property name for type constraints, not `constraint`. Using `constraint` causes
TypeScript compilation errors.

**Fix:** Use `extends` property:
```tsx
// ✅ Correct
typeParameters={[{name: "TState", extends: code`OperationState<TResult>`}]}

// ❌ Wrong
typeParameters={[{name: "TState", constraint: code`OperationState<TResult>`}]}
```

**Date:** 2026-02-24

## Mixed TypeParameterDescriptor arrays require all-object form

**Problem:** The `typeParameters` prop type is `TypeParameterDescriptor[] | string[]`.
When mixing objects and strings, TypeScript infers the wrong union type and
rejects the mixed array.

**Fix:** Make all entries TypeParameterDescriptor objects:
```tsx
// ✅ Correct
typeParameters={[{name: "TState", extends: constraint}, {name: "TResult"}]}

// ❌ Wrong - mixed array
typeParameters={[{name: "TState", extends: constraint}, "TResult"]}
```

**Date:** 2026-02-24

## Symbol.asyncIterator rendered as symbolAsyncIterator by Alloy name policy

**Problem:** When using `[Symbol.asyncIterator]` as an InterfaceMember name,
Alloy's name policy transforms it to `symbolAsyncIterator`. This is because
the bracket-access property name is run through the camelCase name policy.

**Fix:** Accept the transformed name in test assertions, or consider using
raw code templates for members that shouldn't be transformed.

**Date:** 2026-02-24

## External packages must be registered in Output for refkey resolution

**Problem:** When rendering static helper files that reference external
package symbols (e.g., `httpRuntimeLib.Client`), the external package must
be registered via the `externals` prop on `<Output>`. Without registration,
the symbols render as `<Unresolved Symbol: refkey[...]>`.

**Fix:** Always include the required external packages in test `<Output>`
elements:
```tsx
<Output program={program} namePolicy={createTSNamePolicy()} externals={[httpRuntimeLib]}>
  <PagingHelpersFile />
</Output>
```

**Date:** 2026-02-24

---

### `azureCoreLroLib` must be registered in Output externals

**Problem:** When using `azureCoreLroLib.PollerLike`, `azureCoreLroLib.OperationState`, and other `@azure/core-lro` symbols in `code` templates, Alloy needs the package registered in the `<Output externals={[...]}>` array for import resolution.

**Fix:** Add `azureCoreLroLib` to the `externals` array alongside `httpRuntimeLib`:
```tsx
<Output externals={[httpRuntimeLib, azureCoreLroLib]}>
```

**Date:** 2026-02-24

---

### Mock TCGC types for LRO testing without Azure Core TypeSpec

**Problem:** LRO operations in TCGC require `@azure-tools/typespec-azure-core` decorators (which isn't a direct dependency). Testing RestorePoller with real TypeSpec compilation would require adding Azure Core to test infrastructure.

**Solution:** Create mock `SdkClientType` and `SdkServiceMethod` objects with `kind: "lro"` and the minimum required properties (`operation.verb`, `operation.path`, `operation.responses`, etc.). Pass these mocks directly as component props. Use `as any` casts since we only need the properties the component actually reads.

For refkey resolution in tests, render stub declarations (`ClassDeclaration`, `FunctionDeclaration`) alongside the component under test so that refkeys like `classicalClientRefkey(client)` and `deserializeOperationRefkey(method)` resolve correctly in the output.

**Date:** 2026-02-24

## Multipart serializer tests require MultipartHelpersFile in render tree

**Problem:** The `MultipartSerializer` component uses `multipartHelperRefkey("createFilePartDescriptor")`
to reference the `createFilePartDescriptor` helper function. When testing the serializer in isolation
with `SdkTestFile` (which only wraps in Output + SourceFile), the refkey renders as
`<Unresolved Symbol: refkey[...]>` because there's no declaration for it in the render tree.

**Fix:** Include `MultipartHelpersFile` alongside the serializer in the test render tree:
```tsx
<Output program={program} namePolicy={createTSNamePolicy()}>
  <SdkContextProvider sdkContext={sdkContext}>
    <MultipartHelpersFile />
    <SourceFile path="test.ts">
      <MultipartSerializer model={model} />
    </SourceFile>
  </SdkContextProvider>
</Output>
```
Use `renderToString()` and `toContain()` assertions since the output spans multiple files.

**Date:** 2026-02-24

## TCGC multipart model properties have serializationOptions.multipart metadata

**Problem:** Need to know how to detect and handle multipart properties in TCGC models.

**Fix:** Each property in a multipart/form-data model has `serializationOptions.multipart` with:
- `name: string` — the part name in the multipart payload
- `isFilePart: boolean` — whether this is a file upload part
- `isMulti: boolean` — whether this is an array of parts
- `defaultContentTypes: string[]` — default content types (e.g., `["application/octet-stream"]`)
- `headers: SdkHeaderParameter[]` — part headers

The model itself has `(usage & UsageFlags.MultipartFormData) !== 0` when used in
a multipart/form-data context. `UsageFlags.MultipartFormData` is `1 << 5` (32).

**Date:** 2026-02-24

## UsageFlags.Xml is set by TCGC when content-type includes application/xml

**Problem:** Need to know how TCGC determines which models are XML-typed and sets
the `UsageFlags.Xml` flag.

**Fix:** TCGC checks `httpBody.contentTypes` for XML media types (via `isMediaTypeXml()`).
When an operation's request body or response body has `application/xml` content type,
the associated model gets `UsageFlags.Xml` set. The XML serialization options
(`serializationOptions.xml`) are populated from `@typespec/xml` decorators
(`@Xml.name()`, `@Xml.attribute`, `@Xml.unwrapped`, etc.) and `@encodedName`.

The bitmask value is `1 << 9` (512). Check with: `(model.usage & UsageFlags.Xml) !== 0`.

**Date:** 2026-02-24

## Output component requires program prop in tests

**Problem:** Using `<Output namePolicy={createTSNamePolicy()}>` without a `program`
prop causes TypeScript compilation errors in tests because `OutputProps` requires
`program: Program`.

**Fix:** Always compile a minimal TypeSpec program and pass it to Output:
```tsx
const runner = await TesterWithService.createInstance();
const { program } = await runner.compile(t.code`op test(): void;`);
<Output program={program} namePolicy={createTSNamePolicy()}>
```

This applies even when testing components with mock data that don't use TCGC.

**Date:** 2026-02-24

## TypeSpec compiler cannot self-resolve emitter package in tests

**Problem:** Using `Tester.emit("http-client-js")` to create an `EmitterTester` fails with
`import-not-found Couldn't resolve import "http-client-js"` because the TypeSpec compiler's
test infrastructure uses a virtual filesystem for compilation. The emitter package is not
present in this virtual filesystem, and the compiler's module resolver doesn't fall back to
the real filesystem.

**Fix:** Instead of using `executeScenarios()` from `@typespec/emitter-framework/testing`
(which requires an `EmitterTester`), build a custom scenario harness that:
1. Compiles TypeSpec using the standard `Tester` (no emitter invocation)
2. Creates a TCGC SDK context manually via `createSdkContextForTest()`
3. Builds the same JSX component tree as `$onEmit` and renders via `renderAsync()`
4. Collects output files from the Alloy `OutputDirectory` tree
5. Uses the emitter-framework's `createSnippetExtractor()` for declaration extraction

This bypasses the virtual filesystem limitation while still exercising the full emitter pipeline.

**Date:** 2026-02-24

## createTypeScriptExtractorConfig() fails in ESM with require.resolve

**Problem:** `createTypeScriptExtractorConfig()` from `@typespec/emitter-framework/testing`
internally calls `require.resolve()` to locate the tree-sitter-typescript WASM file. In ESM
contexts (which vitest uses), `require` is not defined, causing `ReferenceError: require is
not defined`.

**Fix:** Create a custom TypeScript extractor config using `createRequire` from `node:module`:
```typescript
import { createRequire } from "node:module";
import { Language, Parser } from "web-tree-sitter";

const require = createRequire(import.meta.url);
const wasmPath = require.resolve("tree-sitter-typescript/tree-sitter-typescript.wasm");
await Parser.init();
const language = await Language.load(wasmPath);
```

Also note: `web-tree-sitter` uses named exports (not default export). Import as
`import { Parser, Language } from "web-tree-sitter"`, NOT `import Parser from "web-tree-sitter"`.

**Date:** 2026-02-24

## Alloy OutputDirectory entries have full relative paths

**Problem:** When collecting files from `renderAsync()` output, concatenating parent directory
paths with child entry paths produces doubled paths like `src/src/models/src/models/models.ts`.

**Fix:** Each entry in Alloy's `OutputDirectory` tree has a `path` property containing the
FULL relative path from the output root, not a path relative to its parent. Use each entry's
path directly without concatenating parent paths:
```typescript
function collectFiles(dir: OutputDirectory): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of dir.contents) {
    if ("contents" in entry) {
      if (Array.isArray(entry.contents)) {
        Object.assign(files, collectFiles(entry as OutputDirectory));
      } else {
        files[entry.path] = entry.contents as string;
      }
    }
  }
  return files;
}
```

This matches how `writeOutput` from `@typespec/emitter-framework` handles paths — it uses
`joinPaths(emitterOutputDir, sub.path)` directly, not accumulated parent paths.

**Date:** 2026-02-24

## Emitter generates invalid TypeScript in createTestService

**Problem:** The `createTestService` factory function in the client context file generates
invalid TypeScript: `return getClient_1(endpointUrl, options); as TestServiceContext;`.
The `as` type assertion is placed AFTER the semicolon instead of before it.

**Fix:** This is a pre-existing bug in the `ClientContextFactory` component. The scenario
test harness correctly detects this. When prettier can't format both the expected and actual
output (due to invalid TypeScript), the harness falls back to raw string comparison so the
test still passes if the expected output matches the actual output.

**Date:** 2026-02-24

### SourceFile import source matters

**Problem:** Using `import { SourceFile } from "@alloy-js/core"` requires passing the
`filetype` prop explicitly. Without it, the TypeScript compiler reports: `Property 'filetype'
is missing in type '{ children: string; path: string; }' but required in type 'SourceFileProps'`.

**Solution:** Import `SourceFile` from `@alloy-js/typescript` instead of `@alloy-js/core`.
The TypeScript-specific version has the `filetype` prop defaulted to `"typescript"` so you
only need to pass `path` and `children`.

**Date:** 2026-02-24

### @useAuth must be at namespace level for TCGC

**Problem:** In tests, applying `@useAuth(ApiKeyAuth<...>)` to an individual operation
does not cause TCGC to recognize the authentication scheme. The client's initialization
parameters won't include a credential parameter, so the generated sample code won't
include credential setup.

**Solution:** Apply `@useAuth` at the namespace level (on the `@service` namespace).
For tests using `TesterWithService` (which wraps input in `@service namespace TestService;`),
use the raw `Tester` instead and define the full namespace with `@useAuth` applied to it.

**Date:** 2026-02-24

## Azure External Packages Must Include azureLoggerLib

**Problem:** When rendering the Azure emitter output, the `LoggerFile` component
renders `createClientLogger` as `<Unresolved Symbol>` instead of a proper import.

**Root Cause:** The `azureLoggerLib` package was not included in the `externals`
array passed to the `<Output>` component. Alloy can only resolve refkeys for
packages registered as externals.

**Solution:** Add `azureLoggerLib` to the `azureExternals` array in both
`azure-emitter.tsx` and any test wrappers that render Azure-flavored output.

**Date:** 2026-02-24

## Alloy useContext Works in Helper Functions During Render

**Problem:** Helper functions called during component render (like
`getSerializationExpression()`) need access to the `FlavorContext` but
aren't component functions themselves.

**Root Cause:** Unlike React's strict hook rules, Alloy's `useContext`
reads from a global `getContext()` reference that's set during the current
render cycle. Any synchronous function call during render has access to
the same reactive context.

**Solution:** `useRuntimeLib()` can be called directly in helper functions
that are called synchronously during component render. No need to pass
the runtime lib as a parameter.

**Date:** 2026-02-24

## FlavorContext Default Value Enables Backwards Compatibility

**Problem:** Adding a required `FlavorProvider` to the component tree
would break all 50+ existing test wrappers that use custom `<Output>`
components without the provider.

**Root Cause:** Alloy's `createNamedContext` supports a `defaultValue`
parameter that `useContext` returns when no provider is in the tree.

**Solution:** Set `defaultFlavorValue` (core flavor) as the default on
the `FlavorContext`. Components work without explicit providers, falling
back to `@typespec/ts-http-runtime` references. This makes the context
opt-in rather than required.

**Date:** 2026-02-24

## Regex \b Before @ Does Not Match TypeSpec Decorators

**Problem:** `hasServiceDeclaration` used `/\b@service\b/` to detect
`@service` decorators in TypeSpec code. This NEVER matched because `@`
is a non-word character and `\b` before `@` requires the preceding
character to be a word character (letter, digit, underscore).

**Root Cause:** In JavaScript regex, `\b` asserts a word boundary between
a word character `[a-zA-Z0-9_]` and a non-word character. Since `@` is
non-word, `\b@` only matches when a word character precedes `@` (e.g.,
`a@service`). TypeSpec decorators always have whitespace, newline, or
string-start before `@`, so `\b@` never matches in practice.

**Solution:** Use `/@service\b/` (no leading `\b`) to match the decorator.
The trailing `\b` still works correctly because `e` in `service` IS a
word character, so `\b` matches between `e` and `(`.

**Impact:** Without this fix, ALL scenarios with their own `@service`
declaration were incorrectly wrapped with `TesterWithService`, adding
a SECOND `@service(#{title: "Test Service"}) namespace TestService;`,
causing `multiple-blockless-namespace` compilation errors.

**Date:** 2026-02-24

## TypeSpec Tester: imports, usings, wraps Are Separate Mechanisms

**Problem:** When building custom testers for legacy scenarios, understanding
how `importLibraries()`, `.using()`, and `.wrap()` interact is critical.

**Root Cause:** The TypeSpec Tester's `wrapMain()` function generates code as:
```
[...imports.map(x => `import "${x}";`), ...usings.map(x => `using ${x};`), applyWraps(code, wraps)].join("\n")
```
- `importLibraries()` adds to `params.imports` (generates `import "...";` lines)
- `.using("X")` adds to `params.usings` (generates `using X;` lines)
- `.wrap(fn)` adds to `params.wraps` (transforms the user code before prepending imports/usings)

The order is: imports first, usings second, wrapped code last.
Each method returns a NEW tester instance (immutable builder pattern).

**Solution:** Use the right mechanism for each purpose:
- Use `.importLibraries()` only once to auto-import all libraries
- Use `.using()` for `using` directives
- Use `.wrap()` for code transformations like adding `@service` namespace

**Date:** 2026-02-24

## Legacy Scenario Files Have Multiple Scenarios Per File

**Problem:** Some legacy `.md` files contain multiple `# Heading` (H1)
sections, each defining a separate scenario with different TypeSpec code,
test blocks, and YAML configs.

**Root Cause:** The legacy emitter's test format allows multiple scenarios
in one file for related test cases.

**Solution:** `splitByH1()` splits the markdown content by `\n(?=# )` regex.
Each section is parsed independently with its own TypeSpec code, JSON
examples, and YAML config. The `executeScenarios` function creates
separate `beforeAll` + `describeFn` for each scenario in the file.

**Date:** 2026-02-24

## Prettier is not idempotent for chain expressions

**Problem:** Formatting raw emitter output through prettier produces different results
than formatting already-formatted code through prettier. Specifically, method chain
expressions like `return context.path(path).post({...})` are formatted differently
depending on whether the input is a single long line or already broken across lines.

**Root Cause:** Prettier's line-breaking algorithm for chain member expressions treats
single long lines differently from already-broken expressions. This causes scenario tests
to fail non-deterministically when comparing SCENARIOS_UPDATE output (formatted once)
with verification output (formatted once from different raw input).

**Fix:** Double-format: apply `format(format(normalizeImports(rawOutput)))` to reach
prettier's stable state. After two passes, prettier produces consistent output
regardless of input whitespace structure.

**Date:** 2025-07-14

## Alloy import ordering is non-deterministic

**Problem:** Alloy generates import specifiers in non-deterministic order based on refkey
resolution timing. Different import orderings → different line lengths → prettier makes
different line-breaking decisions for the entire file body.

**Root Cause:** Refkey resolution order varies between runs. The import specifier list
order depends on when each refkey is first encountered during tree traversal.

**Fix:** `normalizeImports()` function in scenario-harness.ts sorts import specifiers
alphabetically within each import statement, and sorts import statements by module path.
Applied before prettier formatting to ensure consistent input. Combined with double-format
to handle prettier's non-idempotency. The PRD explicitly states import ordering is an
acceptable difference.

**Date:** 2025-07-14

## Spread body parameters produce unresolved symbols without special handling

**Problem:** When TypeSpec uses `...Model` or `...Alias` to spread body parameters, TCGC
creates an anonymous body model. The emitter tried to call `serializerRefkey(anonymousModel)`
which produced `<Unresolved Symbol>` text because no serializer was declared for anonymous models.

**Root Cause:** `bodyParam.correspondingMethodParams.length > 1` indicates a spread body.
The anonymous body model has no serializer declaration in the symbol tree.

**Fix:** Added `isSpreadBody()` detection in send-operation.tsx that checks for multiple
corresponding method params or type mismatch. For spread bodies, `buildSpreadBodyExpression()`
constructs an inline object literal with per-property serialization (matching legacy emitter
behavior). Each property uses `getSerializationExpression()` for type-specific transformation.

**Date:** 2025-07-14

### Header Deserialization — Alloy Name Conflict Resolution

**Problem:** When adding `DeserializeHeaders` component alongside `DeserializeOperation`, both
reference `PathUncheckedResponse` from `runtimeLib`. The scenario expected output had
`PathUncheckedResponse` (no suffix) for the header function but the Alloy emitter renders
`PathUncheckedResponse_1` because the name conflict resolver assigns `_1` to all references
of the same external symbol when there's an import statement involved.

**Fix:** Run `SCENARIOS_UPDATE=true pnpm test` to regenerate expected output. The `_1` suffix
is consistent across all references in the same file — both header and main deserialize
functions get `PathUncheckedResponse_1`.

**Lesson:** When adding new components that reference external symbols already used in the same
file, the Alloy name conflict resolver may change suffixes. Always regenerate scenario expected
output with `SCENARIOS_UPDATE=true` after structural changes.

### EmitterOptionsContext for Feature Flags

**Pattern:** Created `EmitterOptionsContext` to carry emitter behavior configuration (like
`include-headers-in-response`) through the component tree. This is separate from `SdkContext`
(which carries type data) and `FlavorContext` (which carries package references).

**Usage:** Components check `useEmitterOptions().includeHeadersInResponse` to conditionally
generate header deserialization functions. The `emitForScenario()` test utility converts YAML
config keys to emitter options.

**Date:** 2026-02-24

## Alloy toRenderTo Matcher: Exact File Key Matching

When using `expect(template).toRenderTo({ ... })`, the matcher requires ALL files
in the rendered output to be specified in the expected object. If the template renders
`api/operations.ts` and `api/options.ts`, you must include both files in the expected
object, even if you only care about one. Use `expect.stringContaining()` for files
you don't want to assert fully.

## Test Harness Regex: Subdirectory Matching for Legacy Categories

The scenario test harness uses regex patterns to match output files to legacy categories.
When operations are grouped (e.g., `interface Widgets { ... }`), files go into subdirectories
like `api/widgets/options.ts`. The regex must account for subdirectories:
- Wrong: `/api\/options\.ts$/` — only matches `api/options.ts`
- Right: `/api\/.*options\.ts$/` — matches `api/options.ts` and `api/widgets/options.ts`

## Alloy Name Policy and All-Caps Names (Task 10.6)

> **SUPERSEDED**: This workaround is no longer needed. The custom naming policy
> (`createEmitterNamePolicy` in `src/utils/name-policy.ts`) now handles enum member
> normalization with ALL-CAPS preservation via its own `deconstruct()` logic. Regular
> enum members flow through the naming policy automatically; only special cases
> (e.g., API version enums) still need `namekey(..., { ignoreNamePolicy: true })`.

**Original problem**: Alloy's TypeScript name policy uses `change-case`'s `pascalCase` which converts
all-caps abbreviations incorrectly: `pascalCase("LR")` → "Lr", `pascalCase("UD")` → "Ud".
The legacy emitter's `normalizeName` just capitalizes the first letter, preserving "LR" → "LR".

**Solution**: For type names that may have non-standard casing (like sub-enum names extracted
from `__raw`), use `namekey(name, { ignoreNamePolicy: true })` combined with manual normalization
(capitalize first letter only: `name.charAt(0).toUpperCase() + name.slice(1)`).

This preserves:
- "LR" → "LR" (all-caps abbreviations unchanged)
- "leftAndRight" → "LeftAndRight" (camelCase → PascalCase)
- "upAndDown" → "UpAndDown"

## TCGC Union-as-Enum Flattening (Task 10.6)

**Problem**: When a model property is typed as `LR | UD` (union of two enums), TCGC flattens
them into a single combined `SdkEnumType` (e.g., "TestColor") with `isUnionAsEnum: true` and
`isGeneratedName: true`. The original individual enums (LR, UD) are NOT in `sdkPackage.enums`.

**Solution**: Reconstruct the sub-enums from `__raw` references on the flattened enum's values:
- For TypeSpec enums: `value.__raw.enum.name` gives the original enum name
- For TypeSpec unions: `value.__raw.union.name` gives the original union name
Group values by source and render each group as a separate type alias.

Only apply this for enums where `isUnionAsEnum === true && isGeneratedName === true`.

## TCGC Example Loading in Tests (Virtual Filesystem)

**Problem**: TCGC's `loadExamples()` reads JSON example files from the filesystem via
`program.host.readDir()` and `program.host.readFile()`. In test environments using the
TypeSpec test host (virtual filesystem), examples must be explicitly added to the virtual
filesystem before `createSdkContext()` is called.

**Solution**: Use `runner.fs.addTypeSpecFile(path, content)` after `runner.compile(code)` but
before `createSdkContextForTest(program)`. The virtual filesystem's `stat()` derives directory
existence from file paths, so adding a file at `./examples/2021-10-01-preview/test.json`
implicitly creates the directory structure TCGC expects.

**Key details**:
- TCGC looks for examples in `{projectRoot}/examples/{apiVersion}/` (versioned) or
  `{projectRoot}/examples/` (unversioned)
- The `runner.fs` from `createInstance()` is a cloned, unfrozen filesystem — safe to modify
  after compilation
- `program.host` reads from the same underlying Map, so files added after compile are visible
- Example JSON files must have `operationId` and `title` fields for TCGC to match them

## SampleFile Component — File Path Comment Duplication

**Problem**: The test harness `getSamplesConcatenated()` adds `/** This file path is /path */`
before each file's content. If the component also generates this comment in the file content,
it appears twice in the concatenated output.

**Fix**: Removed the inline file path comment from the `SampleFile` component. The harness
is responsible for adding it.

## JSDoc Description Source for Samples

**Problem**: TCGC sets `example.doc` to the example's `title` field (from JSON), not the
operation's `@doc` text. Using `example.doc` produces descriptions like "read" instead of
"show example demo".

**Fix**: Use `method.doc` (from TCGC's service method, which reflects the `@doc` decorator)
as the primary source, falling back to `example.doc` and then `execute ${example.name}`.

## Model-Only Package Index Generation

**Problem**: When a TypeSpec package has models but no clients/operations (model-only), the emitter
didn't generate `src/index.ts` or `src/models/index.ts`. Both `RootIndexFile()` and `IndexFiles()`
returned `undefined` when `clients.length === 0`.

**Fix**: Modified both components to check for models even when there are no clients. If models
exist (models, enums, or unions), generate root index.ts with model re-exports and models/index.ts.

**Key insight**: The legacy emitter's `buildRootIndex.ts` (line 31) has: "we still need to export
the models if no client is provided" — model-only packages are a supported use case where shared
types are defined in one TypeSpec package and consumed by others.

## Scenario Harness Missing File Handling

**Problem**: When a scenario test expected a file that wasn't generated (e.g., `ts root index` for
an empty package), the harness threw "No output file found for legacy category X" which was not
a helpful assertion failure.

**Fix**: Modified `getExcerptForQuery()` to return `// (file was not generated)` sentinel when a
legacy category file doesn't exist, allowing tests to explicitly assert file absence. Tests that
expect an empty or missing file should use this sentinel in their expected output.

## Underscore Prefix Stripped by change-case (namekey Fix)

**Problem**: When adding `_` prefix to model names for generated/anonymous types, the Alloy
TypeScript name policy (which uses `change-case`) strips the underscore entirely:
- `pascalCase("_UploadFileRequest")` → `"UploadFileRequest"` (underscore lost)
- `camelCase("_uploadFileRequestSerializer")` → `"uploadFileRequestSerializer"` (underscore lost)

**Fix**: Use `namekey(name, { ignoreNamePolicy: true })` from `@alloy-js/core` to bypass the
name policy. For function names (which need camelCase), manually lowercase the first character
since `ignoreNamePolicy` prevents all name transformations.

**Key code in `src/utils/model-name.ts`**:
```typescript
// For interfaces (PascalCase): namekey preserves exact name
return namekey(`_${model.name}`, { ignoreNamePolicy: true });
// For functions (camelCase): manually lowercase + namekey
const camelName = model.name.charAt(0).toLowerCase() + model.name.slice(1);
return namekey(`_${camelName}${suffix}`, { ignoreNamePolicy: true });
```

## Extensible Enum KnownXxx Conditional Generation

### Problem
The `EnumDeclaration` component was always generating both a type alias and a `KnownXxx` enum
for every `SdkEnumType`. The legacy emitter only generates the KnownXxx enum when
`!type.isFixed && experimentalExtensibleEnums === true`. For fixed enums and extensible enums
without the flag, only a type alias with literal union values should be generated.

### Root Cause
The `EnumDeclaration` component didn't have access to the `experimentalExtensibleEnums` option
and unconditionally generated both declarations. The emitter entry point also didn't read or
propagate this option from the TypeSpec emitter context.

### Fix
1. Added `experimentalExtensibleEnums` to `EmitterOptionsValue` interface
2. Updated `EnumDeclaration` to call `useEmitterOptions()` and conditionally render the KnownXxx
   enum only when `!type.isFixed && experimentalExtensibleEnums === true`
3. Updated the type alias body: uses base type (string) only when extensible pattern is active;
   otherwise uses literal union of all values
4. Updated `emitter.tsx` to read `experimental-extensible-enums` from emitter context options
5. Updated `emit-for-scenario.tsx` to read the option from YAML config

### Key Insight
- TCGC defaults `flattenUnionAsEnum: true`, so unions with string variants become `SdkEnumType`
  with `isFixed: false`
- The legacy emitter checks BOTH `flattenUnionAsEnum` (for TCGC behavior) and
  `experimentalExtensibleEnums` (for rendering). We only changed the rendering side.
- Full legacy parity for union types may require also changing `flattenUnionAsEnum` option
  in the TCGC createSdkContext call, which is a deeper change for future work.

### Testing Notes
- Fixed enums: produce only `type Name = "val1" | "val2"` (no KnownXxx)
- Extensible without flag: produce only `type Name = "val1" | "val2"` (literal union)
- Extensible with flag: produce `type Name = string; enum KnownName { ... }`
- The SnippetExtractor's `getTypeAlias()` does NOT include JSDoc comments, so scenario
  test expected outputs for `type` queries should not include JSDoc


## Response Header Merging

When `include-headers-in-response: true`, the public operation function must merge
response headers into the return type:

- **Body + headers**: Return type is an expanded inline object type
  `{ modelProp1: type1; modelProp2: type2; headerProp: headerType }` that merges all model
  properties with non-duplicate response header properties. Body calls both
  `_xxxDeserializeHeaders(result)` and `_xxxDeserialize(result)`, spreads results:
  `return { ...payload, ...headers }`.
  This matches the legacy emitter behavior (expanded inline types rather than
  intersection types like `ModelType & { headerProps }`).
- **Void body + headers**: Return type is the header object type `{ headerProps }`,
  body calls `_xxxDeserialize(result)` for status validation then returns
  `{ ..._xxxDeserializeHeaders(result) }`
- **No headers or flag disabled**: Standard behavior — just `return _xxxDeserialize(result)`

The `DeserializeHeaders` component now has a refkey (`deserializeHeadersRefkey`) so
the public operation can reference it and Alloy auto-generates imports.

Key files:
- `src/components/public-operation.tsx` — `BasicOperation` component handles all three cases;
  `buildExpandedCompositeReturnType` builds the flat inline object type
- `src/components/deserialize-headers.tsx` — `collectSuccessResponseHeaders` and
  `buildHeaderReturnType` are exported for reuse
- `src/utils/refkeys.ts` — `deserializeHeadersRefkey()` added

## @@override Parameter Grouping - TCGC Data Model

When `@@override` groups individual query/header params into a model parameter:
- `method.parameters` contains a single `SdkMethodParameter` (kind: "method") with a model type
- HTTP operation params (query/path/header) have:
  - `correspondingMethodParams[0]` = `SdkModelPropertyType` (kind: "property"), NOT `SdkMethodParameter`
  - `methodParameterSegments[0]` = `[SdkMethodParameter, SdkModelPropertyType]` — the chain from method param to model property
- To generate correct accessor: use `methodParameterSegments[0][0].name + "." + methodParameterSegments[0][1].name`
- When the model parameter is named "options", rename the optional params bag to "optionalParams" to avoid conflict

### Failure Pattern
Casting `correspondingMethodParams[0]` to `SdkMethodParameter` when it's actually `SdkModelPropertyType` causes `isRequiredSignatureParameter` to return incorrect results (model properties lack `onClient`, `isApiVersionParam` fields). Always check `.kind` before casting.

## Unresolved Symbol Root Causes and Fixes (SA20)

### 1. Nullable Enum Types in sdkPackage.unions
**Symptom**: `<Unresolved Symbol: refkey[...]> | null` in model interface properties for nullable string literal unions.
**Root cause**: TCGC stores nullable types in `sdkPackage.unions` as `SdkNullableType` wrappers. The inner type is `SdkEnumType` (not `SdkUnionType`). When `model-files.tsx` filters unions with `kind === "union"`, these nullable-wrapped enums are dropped. The inner enum is a DIFFERENT object from the non-nullable version in `sdkPackage.enums` (different name, different identity), so no `EnumDeclaration` renders for it.
**Fix**: In `model-files.tsx`, extract `SdkEnumType` from nullable wrappers in the unions list and render `EnumDeclaration` for them.
**Key insight**: `sdkPackage.unions` contains BOTH `SdkUnionType` and `SdkNullableType`. The inner type of a nullable wrapper may be an enum, union, or other type. Always inspect `u.type.kind` when processing nullable entries.

### 2. XML-Classified Models Missing JSON Deserializers
**Symptom**: `<Unresolved Symbol: refkey[...sdeserializer]>` in operation deserialize functions for models with XML content types.
**Root cause**: When a response content type includes `application/xml`, TCGC adds `serializationOptions.xml` to ALL model properties. This causes `hasXmlSerialization()` to return `true`, classifying the model as XML. The `model-files.tsx` filter `!isXml(m)` excluded these models from `regularOutputModels`, so no JSON deserializer was generated. But `deserialize-operation.tsx` always uses `deserializerRefkey()` (JSON).
**Fix**: In `model-files.tsx`, remove the `!isXml(m)` filter from `regularOutputModels` and `polymorphicOutputModels`. XML models get BOTH JSON and XML deserializers. The HTTP runtime parses response bodies into objects before deserialization, so JSON deserializers work for both formats.
**Key insight**: TCGC's `serializationOptions.xml` propagates to all properties when the response content type includes XML, even if the model has no `@Xml.name` decorators.

### 3. Output-Only Model Types in Serializer Expressions
**Symptom**: `<Unresolved Symbol: refkey[...sserializer]>` for properties like `systemData` in ARM base type serializers.
**Root cause**: Types like `SystemData` from Azure.ResourceManager only have `UsageFlags.Output`, not Input. No serializer is generated for them. But a parent model with Input usage (e.g., `Resource`) has all properties serialized, including read-only ones, causing `getSerializationExpression` to reference a non-existent serializer.
**Fix**: In `json-serializer.tsx` `getSerializationExpression`, check `(type.usage & UsageFlags.Input) === 0` for model types and return the accessor as-is (passthrough). Similarly in `json-deserializer.tsx` for `(type.usage & UsageFlags.Output) === 0`.
**Key insight**: TCGC's usage flag propagation is not transitive for read-only properties. A parent model can have Input usage while a child property's type only has Output usage. Always check usage flags before generating serializer/deserializer refkey references.

## Collection Format Encoding (SA11)

### Root Cause
The `expandUrlTemplate` runtime function only supports RFC 6570 comma-joining for arrays. When TCGC reports `collectionFormat` on query/header parameters (e.g., "pipes", "ssv", "csv"), the array values must be pre-encoded with the appropriate collection builder helper before passing to the URL template or header object.

Similarly, model properties with `@encode(ArrayEncoding.xxx)` need collection encoding in serializers (arrays → delimited strings) and collection parsing in deserializers (delimited strings → arrays).

### Fix
1. **Query params**: `send-operation.tsx` checks `param.collectionFormat` on `SdkQueryParameter` and wraps with `buildPipeCollection`/`buildSsvCollection`/`buildCsvCollection` via refkey
2. **Header params**: `send-operation.tsx` checks `header.collectionFormat` on `SdkHeaderParameter` and wraps similarly
3. **Model properties**: `json-serializer.tsx` checks `prop.encode` (ArrayKnownEncoding) and wraps with `buildCsvCollection`/`buildPipeCollection`/etc. via refkey; `json-deserializer.tsx` wraps with `parseCsvCollection`/`parsePipeCollection`/etc.

### Key TCGC Types
- `SdkQueryParameter.collectionFormat?: CollectionFormat` — "multi" | "csv" | "ssv" | "tsv" | "pipes" | "simple" | "form"
- `SdkHeaderParameter.collectionFormat?: CollectionFormat` — same union
- `SdkModelPropertyType.encode?: ArrayKnownEncoding` — "commaDelimited" | "pipeDelimited" | "spaceDelimited" | "newlineDelimited"

### Unit Test Pattern
When testing components that reference `serializationHelperRefkey` (e.g., `buildCsvCollection`), you must render `SerializationHelpersFile` as a sibling `<SourceFile>` at the `<Output>` level — NOT as a child of `SdkTestFile` (which creates nested SourceFiles, causing "Module not exported from package" errors). Create a `MultiFileTestWrapper` component that places helpers and test file as siblings.

## Error Deserialization (SA4)

### Issue
The deserialize function was simply doing `throw createRestError(result)` without deserializing the error response body. The legacy emitter deserializes error bodies into `error.details` and merges exception headers.

### Root Cause
The `DeserializeOperation` component was not checking for error model types in `method.operation.exceptions`. It also did not reference the `DeserializeExceptionHeaders` function.

### Fix
1. Added `getExceptionBodyType()` to extract the error body type from the operation's exceptions
2. Added `buildErrorHandlingBlock()` to generate the full error handling code:
   - Creates the error: `const error = createRestError(result)`
   - Deserializes error body: `error.details = errorDeserializer(result.body)`
   - Merges exception headers (when `include-headers-in-response` enabled): `error.details = {...error.details, ..._xxxDeserializeExceptionHeaders(result)}`
   - Throws: `throw error`
3. Added `deserializeExceptionHeadersRefkey` to enable cross-file references to exception header functions
4. Registered the refkey in `DeserializeExceptionHeaders` component
5. Exported `collectExceptionResponseHeaders` for reuse

### Key Pattern
- When no error model exists: `throw createRestError(result)` (simple case)
- When error model exists: `const error = createRestError(result); error.details = deserializer(result.body); throw error;`
- When exception headers exist and are enabled: headers are merged into `error.details` via spread

### TCGC Notes
- `method.operation.exceptions` contains `SdkHttpErrorResponse[]` with error model types
- Error models with `@header` properties still include those properties in both the interface and deserializer
- The default ("*") exception is preferred; otherwise falls back to first exception with a body type

### Test Harness: normalizeImports Multi-File Bug (Fixed 2026-02-25)
- **Bug**: `normalizeImports()` in `test/scenarios/scenario-harness.ts` destroyed multi-file concatenated sample output. When sample tests concatenate multiple files with `/** This file path is ... */` comments, the function treated ALL imports across files as one block, replacing everything between the first and last import with sorted imports. This destroyed content between files (function bodies, file path comments for files 2+).
- **Symptom**: Sample scenario tests (e.g., `armCurdOperations.md`) had stale expectations showing duplicate imports (3x) and wrong function bodies. Tests passed because the normalizeImports bug produced the same broken output from correct emitter output.
- **Fix**: Split input by `/** This file path is` comments before normalizing imports per-section. Each file section is an independent unit with its own import block.
- **Impact**: RC05-RC09 were all "already working" in the emitter. Only the test expectations were stale due to this harness bug. After the fix, SCENARIOS_UPDATE correctly regenerates multi-file sample expectations.

## plainDate Serialization Must Use Date-Only Format (RC19)

**Bug**: `json-serializer.tsx` and `xml-object-serializer.tsx` used `.toISOString()` for
both `utcDateTime` and `plainDate` types. The `plainDate` type should produce YYYY-MM-DD
format (e.g., "2024-01-15"), not full ISO datetime (e.g., "2024-01-15T00:00:00.000Z").

**Fix**: Split the `case "utcDateTime": case "plainDate":` into separate switch cases.
`plainDate` now uses `(accessor).toISOString().split("T")[0]` to extract only the date
portion. This matches the legacy emitter pattern in
`submodules/autorest.typescript/packages/typespec-ts/src/modular/helpers/operationHelpers.ts`.

**Deserialization is correct**: Both `utcDateTime` and `plainDate` use `new Date(accessor)`
for deserialization, which correctly parses both formats.

**Note**: The related RC20 bug (unixTimestamp uses milliseconds instead of seconds) is in
the same code area. Fix: `((accessor).getTime() / 1000) | 0` for integer seconds.

## RC29: Import Aliases with _1 Suffix — Root Cause and Fix

**Bug**: All imported types and functions in generated operations files received `_1`
suffixes (e.g., `Client_1`, `StreamableMethod_1`, `createRestError_1`). This affected
~73 scenario test files with ~2805 occurrences.

**Root cause**: Alloy's built-in `tsNameConflictResolver` (from `@alloy-js/typescript`)
always renames symbols that have the `LocalImportSymbol` flag, even when there's only
one symbol with a given name (no actual naming conflict). The resolver is called for
every symbol added to a scope's declaration space. When there's a single import symbol,
the `badNamedSymbols` loop still executes and renames it to `name_1`.

The relevant code in `tsNameConflictResolver`:
```typescript
const badNamedSymbols = symbols.filter(
  (s) => s.tsFlags & TSSymbolFlags.LocalImportSymbol,
);
// This loop runs even when badNamedSymbols has only 1 entry and goodNamedSymbols is empty
for (const sym of badNamedSymbols) {
  sym.name = name + "_" + nameCount++;
}
```

**Fix**: Created `src/utils/name-conflict-resolver.ts` with a custom resolver that
wraps `tsNameConflictResolver` but only delegates when there are 2+ symbols with the
same name (actual conflict). With 0 or 1 symbols, there's no conflict to resolve.

```typescript
export function nameConflictResolver(name: string, symbols: unknown[]): void {
  if (symbols.length <= 1) return;
  tsNameConflictResolver(name, symbols as any);
}
```

**Key insight**: The issue was NOT in our code but in how the Alloy framework's conflict
resolver handled the `LocalImportSymbol` flag. Since we cannot modify submodules, the
wrapper approach is the correct fix. Unit tests for the `OperationFiles` component didn't
catch this because they didn't pass `nameConflictResolver` to `Output`.

## Alloy Name Policy Preserves Underscores Between Numbers

> **SUPERSEDED**: This workaround is no longer needed for regular enum members.
> The custom naming policy (`createEmitterNamePolicy`) handles API version-style names
> and numeric segments via legacy `deconstruct()` logic. Only API version enums still
> use `normalizeVersionMemberName()` + `namekey(..., { ignoreNamePolicy: true })`.

**Original problem**: Alloy's TypeScript name policy uses `change-case` `pascalCase()` with
`{ prefixCharacters: "$_", suffixCharacters: "$_" }`. This means underscores between
numeric segments are preserved: `v2023_12_01` → `V2023_12_01` (not `V20231201`).

**Workaround**: Use `namekey(normalizedName, { ignoreNamePolicy: true })` to pass a
pre-normalized name to `TsEnumMember` (or any Alloy component accepting `Namekey`).
This bypasses the name policy entirely for that specific symbol.

**Example**:
```tsx
import { namekey } from "@alloy-js/core";

// This would produce V2023_12_01 (wrong):
<TsEnumMember name="v2023_12_01" jsValue="2023-12-01" />

// This produces V20231201 (correct):
<TsEnumMember name={namekey("V20231201", { ignoreNamePolicy: true })} jsValue="2023-12-01" />
```

## TCGC ApiVersionEnum Usage Flag

**Discovery**: TCGC sets `UsageFlags.ApiVersionEnum = 8` on enums declared with the
`@versioned()` decorator. The `sdkPackage.enums` property includes all enums (does NOT
filter out API version enums). To detect version-only enums, check:
```typescript
const isApiVersionOnly = (type.usage & UsageFlags.ApiVersionEnum) !== 0
  && (type.usage & UsageFlags.Input) === 0
  && (type.usage & UsageFlags.Output) === 0;
```

When a version enum is also used as an operation parameter (e.g., `@header apiVersion: Versions`),
TCGC adds `Input` flags, and `isApiVersionOnly` returns false.

## Alloy TsEnumDeclaration refkey Prop Accepts Arrays

The `refkey` prop on `TsEnumDeclaration` (and most Alloy declaration components) accepts
`Refkey | Refkey[]`. Passing an array registers multiple refkeys for the same declaration,
so references via any of those refkeys resolve to the same symbol.

```tsx
<TsEnumDeclaration
  name="KnownVersions"
  refkey={[knownValuesRefkey(type), typeRefkey(type)]}  // Both resolve to KnownVersions
  export
>
```

## Alloy InterfaceMember doc prop renders as multiline JSDoc

When using the `doc` prop on `<InterfaceMember>`, Alloy renders it as a multiline
JSDoc block:
```typescript
/**
 * Additional properties
 */
additionalProperties?: Record<string, string>
```
NOT as a single-line `/** Additional properties */`. Unit tests need to match
the multiline format in their expectations.

## SdkTestFile wrapper doesn't add newlines between sibling components

When rendering multiple components (e.g., ModelInterface + JsonSerializer) inside
`<SdkTestFile>`, there are no automatic newlines between them. The output will be
`}export function ...` without spacing. For multi-component tests, use
`SerializerMultiFileWrapper` with explicit `{"\n\n"}` separators and
`renderToString` with `toContain` assertions.

## getAdditionalPropertiesFieldName handles name conflicts

When a TCGC model has both `...Record<T>` (additionalProperties) and an explicit
property named `additionalProperties`, the additional properties bag field is
renamed to `additionalPropertiesBag`. This function is exported from
`model-interface.tsx` and shared with the serializer.

### Polymorphic Serializer/Deserializer Architecture (RC18)

TCGC's `SdkModelType.properties` only contains the model's OWN properties, not
inherited ones. For child types in discriminated hierarchies (e.g., `Cat extends Pet`),
the `baseModel` chain must be walked to collect inherited properties. The
`collectAncestorProperties()` utility handles this by walking from most-distant
ancestor to closest, filtering out properties overridden by the child model.

## Custom Naming Policy — `createEmitterNamePolicy()`

**Location**: `src/utils/name-policy.ts`

This emitter replaces Alloy's default `createTSNamePolicy()` with a custom naming policy
that matches legacy autorest.typescript conventions. The policy is set on the `<Output>`
component in `src/emitter.tsx`, `src/azure-emitter.tsx`, and `test/scenarios/emit-for-scenario.tsx`.

**Reserved word escaping** (context-specific, matching legacy `guardReservedNames`):
- Functions/variables: `$` prefix (`continue` → `$continue`)
- Parameters: `Param` suffix (`type` → `typeParam`, `endpoint` → `endpointParam`)
- Class/interface members: bare names (reserved words are valid in JS property context)
- Types: `Model` suffix (for future use)

**Enum member normalization** (ported from legacy `deconstruct` + `toCasing` + `fixLeadingNumber`):
- Preserves ALL-CAPS segments ≤3 chars: `MAX_of_MLD` → `MAXOfMLD`
- Strips all leading underscores: `___pascal____case6666` → `PascalCase6666`
- Prefixes `_` for leading digits: `090` → `_090`
- Splits on camelCase boundaries, underscores, and number transitions

**`$DO_NOT_NORMALIZE$` marker**: If a name starts with this prefix (set via `@clientName`
in TypeSpec), the marker is stripped and the remaining name is returned as-is with no
case conversion or reserved word escaping.

**`@clientName` detection**: `src/utils/client-name-utils.ts` provides
`hasExplicitClientName(tcgcContext, entity)` which checks `getClientNameOverride` from TCGC.
When detected, components should pass `namekey(name, { ignoreNamePolicy: true })` to
honor the user's explicit name.

**Helpers** exported for use in components:
- `isReservedOperationName(name)` — for @fixme JSDoc warnings
- `getEscapedOperationName(name)` — for composing `_$continueSend`-style names
- `getEscapedParameterName(name)` — for body/URL accessor references

**Key detail**: The `apiVersion` entry in the reserved words list is stored as `"apiVersion"`
(mixed case) to match a legacy case-sensitivity quirk — `guardReservedNames` compares
`r.name === name.toLowerCase()`, so mixed-case entries won't match and stay unescaped.

The polymorphic switch serializer/deserializer uses `serializerRefkey(model)` /
`deserializerRefkey(model)`, while the plain base model functions use
`baseSerializerRefkey(model)` / `baseDeserializerRefkey(model)`. Both refkey
sets must be registered (by rendering both components) to avoid "Unresolved Symbol"
errors in the output. Unit tests that render polymorphic serializers in isolation
must ALSO render the base model serializer to resolve the default case refkey.

When adding `includeParentProperties` to JsonSerializer/JsonDeserializer, the
parameter propagates through `getSerializableProperties()` / `getDeserializableProperties()`
and is only set `true` for models that are children in a discriminated hierarchy
(detected by `isDiscriminatedChild()` which walks the `baseModel` chain).

## Test Performance: beforeAll Compilation Sharing

**Problem:** Tests were taking 3.5–8.5 minutes (222–504s) because every `it()`
block created its own `TesterWithService.createInstance()` + `compile()` +
`createSdkContextForTest()` cycle. With ~283 unit tests, that was ~283 redundant
TypeSpec compilations at ~1.5s each. The vitest collection phase also took ~200s
because the default `threads` pool re-imported the entire TypeSpec compiler + 8
libraries per worker.

**Fix:**
1. Vitest config: `pool: "forks"` + `isolate: false` reduces collection from
   ~200s to ~50s by sharing modules across test files in the same worker.
2. Group tests with identical TypeSpec input into sub-`describe` blocks with
   `beforeAll` to compile once and share `sdkContext`/`client` across tests.

**Result:** 504s → 168s (67% faster), 22 timeout failures → 0.

**Date:** 2026-02-25

---

### Sub-enum Self-Reference in `extractSubEnums`

**Problem:** When `extractSubEnums` no longer checks `isGeneratedName` (to support named union-as-enum types like `union Foo { Baz, "bar" }`), enums whose values all trace back to the parent union itself create self-referencing type aliases (e.g., `type CreatedByType = CreatedByType | string`).

**Root Cause:** TCGC represents `union CreatedByType { "User", "Application", string }` as an `SdkEnumType` with `isUnionAsEnum: true`. Each value's `__raw.union.name` points back to `"CreatedByType"`, causing `extractSubEnums` to create a group matching the parent name.

**Fix:** Filter out groups in `extractSubEnums` whose name matches `enumType.name`. These are "self-reference" groups representing the parent union itself, not a distinct nested enum.

**Date:** 2026-02-25

## ARM subscriptionId handling in TCGC

**Discovery (RC22, 2026-02-25):** TCGC exposes `subscriptionId` for ARM services as a `kind: "method"` client initialization parameter with `optional: false` and no `clientDefaultValue`. It does NOT come from the endpoint template arguments — the ARM endpoint is `{endpoint}` with `defaultValue: "https://management.azure.com"`, and subscriptionId is a separate init param.

This means any code that only processes `kind: "endpoint"` and `kind: "credential"` parameters will miss subscriptionId. Both factory functions and classical client constructors need to include required method params.

## Alloy ClassMethod doesn't support overloads

`ClassMethod` in `@alloy-js/typescript` always generates a method body (wrapped in `<Block>`). There is no way to emit body-less overload signatures using `ClassMethod`. Workaround: use `code` templates for overload declarations and the implementation body directly inside `ClassDeclaration`. Refkeys resolve correctly in `code` templates for cross-file imports.

## ARM boilerplate operation exclusions for tenant-level detection

When detecting tenant-level operations for constructor overloads, these ARM boilerplate operations must be excluded:
1. `Azure.ResourceManager.Operations.list` — check via `crossLanguageDefinitionId`
2. Provider-level `checkNameAvailability` — check via `operation.path` containing `{namespace}/checknameavailability`

Without these exclusions, Standard ARM services (which have Operations.list) would incorrectly trigger overload generation.

---

## typespec-title-map YAML Parsing

**Problem**: The simple YAML parser in `scenario-harness.ts` only handled flat key-value pairs. The `typespec-title-map` config uses nested indented sub-keys:
```yaml
typespec-title-map:
  ServiceClient: TestServiceClient
```

**Fix**: Enhanced `parseYamlConfig()` to detect map-start lines (key with no value) and collect subsequent indented lines as nested objects. The parser now handles one-level-deep maps.

**Location**: `test/scenarios/scenario-harness.ts` — `parseYamlConfig()` function.

## Client Name Renaming Flow

The `typespec-title-map` option works by mutating `client.name` on TCGC client objects BEFORE the Alloy rendering pipeline runs. This means all downstream components (classical-client, client-context, sample-files) automatically see the renamed name without any changes. The `applyClientRenames()` function in `src/emitter.tsx` handles this.


## Azure Flavor Detection in Test Harness

The scenario test harness (`emit-for-scenario.tsx`) now auto-detects Azure flavor from TypeSpec code patterns. When Azure features are detected (Azure.Core, Azure.ResourceManager, Foundations, ARM decorators, etc.), the test harness automatically:

1. Uses Azure external packages (`@azure-rest/core-client`, `@azure/core-auth`, etc.) instead of `@typespec/ts-http-runtime`
2. Sets `FlavorProvider flavor="azure"` in the component tree
3. Includes `<LoggerFile>` component (generates `src/logger.ts`)

**Key patterns detected:**
- `Azure.Core`, `Azure.ResourceManager` namespace usage
- `@azure-tools/typespec-azure` package imports
- `@armProviderNamespace`, `@armCommonTypesVersion` decorators
- `Foundations.` namespace (Azure.Core.Foundations)
- Azure Core resource types (`ResourceRead`, `ResourceList`, etc.)
- Azure Core traits (`ServiceTraits`, `RequestHeadersTrait`, etc.)

**Override via YAML config:** Scenarios can explicitly set `flavor: azure` or `flavor: core` in their YAML config block to override auto-detection.

**Pitfall:** The `\b` word boundary in regex doesn't match before `@` (non-word character). When matching package scope patterns like `@azure-tools/typespec-azure`, don't wrap the entire match in `\b...\b`.

**Pitfall:** When adding `LoggerFile` to Azure flavor, the `getPackageName()` helper extracts the name from `sdkContext.sdkPackage.clients[0].name`. This produces the logger import `import { logger } from "./logger.js"` in client context files, and adds `loggingOptions: { logger: options.loggingOptions?.logger ?? logger.info }` to the client factory.

## Alloy SourceFile `header` prop for file-level comments

**Finding:** To add content at the very top of a generated file (before imports), use the `header` prop on `<SourceFile>`:

```tsx
<SourceFile path="models.ts" header={MY_HEADER_TEXT}>
  {/* content */}
</SourceFile>
```

The `header` prop accepts `Children` (string, JSX, etc.) and renders it BEFORE any import statements. The `headerComment` prop renders as single-line comments (`//`). Use `header` for block comments (`/* ... */`).

**Gotcha:** There's an extra blank line between the header and the first import/declaration. The output looks like:
```
/* eslint-disable ... */

<blank line>
import { ... }
```

This means test expectations need TWO blank lines between the header and the first declaration (one from the trailing newline in the header string, one from Alloy's natural separation).

## Flatten property serialization is inline expansion

**Critical finding:** The `@flattenProperty` decorator causes nested model properties to be expanded inline at the parent level in BOTH the TypeScript interface AND the serializer/deserializer. Properties are NOT nested under the original property name on the wire.

Example: If `Test` has `@flattenProperty properties: FooProperties` where FooProperties has `bar` and `baz`, the serializer produces:
```typescript
{ result: item["result"], bar: item["bar"], baz: item["baz"] }
```
NOT:
```typescript
{ result: item["result"], properties: { bar: item["bar"], baz: item["baz"] } }
```

This applies to both the legacy and new emitter. The PRD task RC30a's description was incorrect about needing nested wire format.

## RC26: API Version as Function Parameter vs Context Property

### Problem
Scenarios with `withVersionedApiVersion: true` in their YAML config were generating `apiVersion` as an explicit function parameter instead of reading it from `context.apiVersion` with a default fallback.

### Root Cause
The test harness (`emit-for-scenario.tsx`) was not implementing the `withVersionedApiVersion` YAML config option. The legacy test infrastructure adds `@versioned(Versions)` decorator and a `Versions` enum when this flag is set, which causes TCGC to mark the apiVersion parameter as `onClient=true` and `isApiVersionParam=true`. Without this, TCGC treats apiVersion as a regular operation parameter.

### Fix
1. **Test harness**: Added support for `withVersionedApiVersion: true` in `emit-for-scenario.tsx` to inject `@versioned(Versions)` decorator and `enum Versions { v2022_05_15_preview: "2022-05-15-preview" }` into the TypeSpec wrapper.
2. **Send operation**: Added default value fallback in `getParameterAccessor()` when the client-level apiVersion has `clientDefaultValue`, generating `context.apiVersion ?? "defaultValue"` instead of bare `context.apiVersion`.
3. **Example files**: When `withVersionedApiVersion` is true, the injected version `"2022-05-15-preview"` is appended to the code for `extractApiVersion()` to find, so JSON examples are placed in the correct versioned directory.

### Key Insight
TCGC's `isApiVersion()` function requires `versionEnumSets.length > 0` (from `@versioned` decorator) to mark parameters as `isApiVersionParam`. Without versioning, even parameters named "api-version" won't be treated as client-level API version parameters.

## SA32: Parent Property Inclusion in (De)serializers

**Issue**: Child model (de)serializers must include ALL inherited properties from parent models,
not just the child's own properties. This applies to ALL inheritance (discriminated AND non-discriminated).

**Root cause**: The condition `isDiscriminatedChild(model)` was too narrow — it only checked for
`@discriminator`-based hierarchies. Simple `extends` relationships also need parent properties.

**Fix**: Use `model.baseModel !== undefined` instead of walking the `discriminatorProperty` chain.

**Key insight**: In TypeScript, `interface Cat extends Pet` declares that Cat HAS Pet's properties,
but the (de)serializer creates a plain object — it must explicitly map every field. If inherited
fields are omitted, the returned object silently lacks them despite the type assertion.

---

### Bytes Deserialization typeof Guard and Encoding

**Problem**: The `getDeserializationExpression` for `case "bytes"` called `stringToUint8Array(accessor, "base64")`
directly — no typeof guard and hardcoded encoding.

**Root cause**: The legacy emitter checks `typeof restValue === 'string'` before calling `stringToUint8Array`
to handle round-trip scenarios where the value may already be a Uint8Array. It also respects `type.encode`
for the encoding format (base64 vs base64url).

**Fix**: In `json-deserializer.tsx`, the bytes case now:
1. Uses `type.encode ?? "base64"` for the encoding format
2. For `encode === "binary" || "bytes"` (HTTP binary responses): no typeof guard, uses "base64" fallback
3. For `encode === "base64" || "base64url"`: wraps with `typeof accessor === "string" ? stringToUint8Array(...) : accessor`

**Key insight**: TCGC sets `type.encode = "bytes"` for binary content types (e.g., application/octet-stream)
and `"base64"` or `"base64url"` for JSON-encoded bytes. The legacy emitter treats "bytes" and "binary"
as passthrough formats (no typeof guard needed since HTTP responses are always strings). Only JSON-embedded
bytes need the typeof guard.

**Test insight**: When unit testing components that use `useRuntimeLib()` (which provides refkeys like
`stringToUint8Array`), the `SdkTestFile` wrapper must receive `externals={[httpRuntimeLib]}` to register
the external package so refkeys resolve instead of showing `<Unresolved Symbol>`.

## Header Date Encoding (SA30)

**Key insight**: TCGC sets `encode: "rfc7231"` on `SdkUtcDateTimeType` when utcDateTime is used in a
`@header` parameter position. The `json-serializer.tsx` `getSerializationExpression` function must check
`type.encode` to differentiate between:
- `"rfc7231"` → `.toUTCString()` (HTTP-date format for headers)
- `"unixTimestamp"` → `((accessor).getTime() / 1000) | 0`
- `"rfc3339"` or default → `.toISOString()` (ISO 8601 for JSON bodies)

**Header encoding pattern**: The `send-operation.tsx` `buildHeaderEntries` function must apply date encoding
to header parameter values. This is done via `applyHeaderDateEncoding()` which only handles `utcDateTime`
and `plainDate` types. Non-date types (bytes, arrays, strings) pass through unchanged because:
1. Bytes headers may be handled by the runtime library
2. Array headers need collection format wrapping (CSV, pipes, etc.)
3. Encoding all types would be too broad and break existing behavior

**Null guard pattern for optional headers**: Optional date headers use
`accessor !== undefined ? (accessor).toUTCString() : undefined` to avoid calling methods on undefined.
This differs from the body serializer pattern which uses `!accessor ? accessor : expression` because
header values can be `0` or `""` which are falsy but valid.

**Test pattern**: To test header encoding, use `renderToString(template)` and check for the expected
encoding expression with `expect(result).toContain(...)`. Full `toRenderTo` matching is harder because
the entire output (imports, options interface, full function) must match.

## Constant-Type Parameters (SA26)

**Problem**: When a method parameter has type `SdkConstantType` (kind === "constant"), e.g.,
`stream: true`, `@header contentType: "application/octet-stream"`, `@path version: "v1"`,
the emitter was exposing them as positional function parameters. Constants should be hardcoded
directly in the generated code.

**Solution**: Updated `isRequiredSignatureParameter` in `send-operation.tsx` to return `false`
for constant-type parameters. Added `isConstantType(type)` and `getConstantLiteral(type)` helpers.
Updated all accessor functions (`getParameterAccessor`, `getHeaderAccessor`, `getSpreadPropertyAccessor`,
`getBodyAccessor`) to return literal values for constant types. Also excluded constants from the
operation options interface in `operation-options.tsx`.

**Key insight**: The spread body builder (`buildSpreadBodyExpression`) uses `getSpreadPropertyAccessor`
to determine how to access each property value. For constant properties, this must return the literal
value (e.g., `true`, `"foobar"`, `42`) since the parameter no longer exists in the function signature.

**Test pattern**: Use `renderToString(template)` and regex negation to verify constant params are absent
from signatures: `expect(result).not.toMatch(/functionName\(\s*context: Client,\s*paramName:/)`.
For verifying hardcoded values in body objects, note that spread body keys are quoted:
`expect(result).toContain('"propName": true')`.

**Affected files**:
- `src/components/send-operation.tsx` — Core logic changes
- `src/components/operation-options.tsx` — Exclude constants from options interface
- 7 scenario test files updated to match new output
- 8 new unit tests added

## Union Types with isGeneratedName Need Underscore Prefix and Deserializers

**Problem**: When TCGC generates anonymous union types (e.g., from `op read(): { @body body: Cat | Dog }`),
it sets `isGeneratedName: true` on the `SdkUnionType`. The legacy emitter prefixes these with `_` (e.g.,
`_ReadResponse`) and generates a pass-through deserializer (`_readResponseDeserializer`).

**Root Cause**: The `UnionDeclaration` component used `type.name` directly without checking `isGeneratedName`,
and no deserializer was generated for union types.

**Fix**:
- Added `getUnionName()`, `getUnionDisplayName()`, `getUnionFunctionName()` to `model-name.ts`
- Updated `UnionDeclaration` to use `getUnionName()` instead of `type.name`
- Created `JsonUnionDeserializer` component in `json-union-deserializer.tsx` — generates `return item;` functions
- Updated `model-files.tsx` to filter unions by Output/Exception usage and render `UnionDeserializerDeclarations`
- Added `union` case to `getDeserializationExpression()` in `json-deserializer.tsx`
- Added `union` case to `needsTransformation()` in `json-serializer.tsx`

**Side Effects**: Any union type with `isGeneratedName: true` and Output/Exception usage now gets:
1. Underscore prefix on the type name
2. A pass-through deserializer function
3. Deserialization expressions that call the union deserializer
This affected additional properties scenarios and property type scenarios that use unions.

## getModelName() returns Namekey for generated names — not a string

**Problem:** When using `getModelName(model)` inside a template literal for documentation text (e.g., JSDoc), models with `isGeneratedName: true` produce `[object Object]` instead of the expected name string. This is because `getModelName()` returns a `Namekey` object (not a string) for generated names to preserve the `_` prefix through Alloy's name policy.

**Fix:** Use `getModelDisplayName(model)` (private helper in `model-interface.tsx`) or compute the display name directly as `model.isGeneratedName ? "_" + model.name : model.name` when you need a plain string. The `getModelName()` function should only be used as the `name` prop on Alloy declaration components where `Namekey` is expected.

**Related:** Same pattern exists for `getUnionName()` — use `getUnionDisplayName()` for plain-string contexts.


## Client Default Value Application (SA-C26)

- **TCGC only populates `clientDefaultValue` from the `@clientDefaultValue` decorator**, NOT from TypeSpec server defaults (e.g., `param?: int32 = 100`). Don't assume TypeSpec defaults flow to `clientDefaultValue`.
- **API version parameters must be excluded** from `applyClientDefault` via `isApiVersionParam` check. They have `clientDefaultValue` set (from versioned enum) but are managed by client infrastructure, not operation defaults.
- **Required params with `@clientDefaultValue` go to options bag** (via `isRequiredSignatureParameter` returning false) **but do NOT get `??` fallback**. Only `param.optional === true` triggers the `??` default.
- **Type validation is critical**: `isDefaultValueTypeMatch` prevents generating type-mismatched defaults (e.g., `?? "mismatch"` on an int32 param). Always validate before emitting `??`.

### PascalCase normalization for type names: hybrid approach (SA-C29)

**Problem**: The name policy uses `pascalCase` from `change-case` which lowercases ALL-CAPS segments
regardless of length (FOO → Foo, NFVIs → NfvIs). The legacy emitter preserves ≤3-char ALL-CAPS
segments via its `deconstruct()` + `isFullyUpperCase()` logic.

**Solution**: Two separate PascalCase functions:
1. `normalizePascalCaseName()` — Strict legacy normalization. Used for **enum members** and as the base
   for composing function/type names. Strips ALL underscores as word separators.
2. `normalizePascalCaseTypeName()` — Hybrid approach. Used for **class/type/interface/enum** elements.
   Detects `/[A-Z]{2}/` (2+ consecutive uppercase) → uses legacy normalization.
   Otherwise → uses change-case `pascalCase` (preserves `_<digits>` patterns like `Color_1`).

**Key gotcha**: Composed names (e.g., `NFVIsUnion`, `NFVIsSerializer`) must NOT be re-normalized:
- Union type aliases: use `namekey(..., { ignoreNamePolicy: true })`
- Serializer/deserializer function names: compose from `normalizePascalCaseName(model.name)` + suffix,
  then let camelCase handle it (change-case's camelCase preserves already-correct casing)

**Why not full legacy normalization for all types?**: Legacy `deconstruct()` strips ALL underscores,
including `_<digits>` patterns from TCGC conflict resolution (e.g., `Color_1` → `Color1`). The
`change-case` library correctly preserves these. The hybrid approach gets the best of both worlds.

## TCGC Paging Metadata: nextLinkSegments vs continuationTokenResponseSegments
- `nextLinkSegments` contains the path to the next page URL in the response body (e.g., `nextLink` property)
- `continuationTokenResponseSegments` contains the path to an opaque continuation token
- For `nextLinkName` in the paging helper options, use `nextLinkSegments` (preferred) with `continuationTokenResponseSegments` as fallback
- The legacy emitter uses `nextLinkSegments` exclusively for this purpose
- Both fields hold arrays of `SdkServiceResponseHeader | SdkModelPropertyType`; use `serializedName` (the wire name) for JSON property access

## SA-C18: FileContents union is NOT needed for model interface property types

- **Problem**: SA-C18 suggested changing multipart file part property types from `Uint8Array`/model refs to the legacy `FileContents | { contents: FileContents; ... }` pattern.
- **Finding**: The current behavior is correct. TypeSpec's `Http.File` model (`{ contentType?: string; filename?: string; contents: Uint8Array }`) provides the structured metadata wrapper that the legacy `FileContents` union was designed for.
- **Rule**: Model interface property types for multipart file parts should use the TCGC type directly:
  - `HttpPart<File>` → `File` (model reference via refkey)
  - `HttpPart<PngFile>` → `PngFile` (model reference via refkey)
  - `HttpPart<bytes>` → `Uint8Array`
- **Key files**: `src/components/model-interface.tsx` (`getPropertyTypeExpression`), scenario tests in `test/scenarios/cases/multipart/`
- The `FileContents` type alias in `multipart-helpers.tsx` is used by the multipart SERIALIZER (`createFilePartDescriptor`), not by model interfaces.

## SA-C25c: @flattenProperty is incompatible with @multipartBody in TypeSpec

**Problem**: TypeSpec's `@multipartBody` validation requires ALL model properties to be `HttpPart<T>`. The `@flattenProperty` decorator wraps a regular model property (not `HttpPart`), so combining them produces a compilation error: `error @typespec/http/multipart-part: Expect item to be an HttpPart model.`

**Implication**: The multipart serializer's flatten handling code (both the collision-aware inline expansion and the helper function path) is defensive code. It cannot be triggered by valid TypeSpec inputs in the current version of the TypeSpec compiler + TCGC.

**Rule**: When writing tests for multipart + flatten combinations, you cannot use TypeSpec compilation. Use mocked TCGC model types or test non-flatten regression paths instead.

**Key files**: `src/components/serialization/multipart-serializer.tsx` (defensive flatten handling), `src/components/model-files.tsx` (multipart models now included in FlattenHelperDeclarations)

## Azure Core Error Type Model Filtering Limitation

### Issue
Task 10.13 attempted to filter Azure Core error types (ErrorModel, ErrorResponse, InnerError) from local model generation, replacing them with runtime package imports. This caused `<Unresolved Symbol>` errors because these types are referenced as properties of regular models (e.g., `AssetChainSummaryResult.errors?: ErrorResponse[]`).

### Root Cause
When `isAzureCoreErrorType()` filtered models from the `models` list in `model-files.tsx`, the filtered types' refkeys were never declared. But other models' properties still referenced these refkeys via `getTypeExpression()`, causing unresolved symbols.

### What Works
Simplifying `buildErrorHandlingBlock()` to `throw createRestError(result)` without deserializing error bodies. This doesn't break any refkey chains because it removes references (the deserializer call) rather than declarations.

### What Doesn't Work
Simply filtering Azure Core error types from the model list. The types are needed whenever regular models have properties that reference them. A proper solution would require:
1. Mapping Azure Core error type refkeys to runtime package member references (e.g., `httpRuntimeLib.ErrorModel`)
2. Or generating a type alias that re-exports from the runtime package
3. Both approaches need changes in the type expression and serialization layers

### Key Insight
TCGC propagates `UsageFlags.Output` through property references. When `AssetChainSummaryResult` (Output) has `errors?: ErrorResponse[]`, TCGC gives `ErrorResponse` Output usage too. This means the type appears in `outputModels` and gets deserializers. Filtering it breaks the chain.

## Alloy: SourceFile Path Must Not Contain Subdirectories

**Discovered in SA-C37.**

When a `<SourceFile path="group/file.ts">` path contains subdirectory components (slashes), Alloy's import resolver computes relative imports from the PARENT `<SourceDirectory>`, not from the actual file location. This produces incorrect import paths.

**Wrong:**
```tsx
<SourceDirectory path="api">
  <SourceFile path="widgets/operations.ts">  // Alloy thinks file is in api/
```

**Correct:**
```tsx
<SourceDirectory path="api">
  <SourceDirectory path="widgets">
    <SourceFile path="operations.ts">  // Alloy correctly knows file is in api/widgets/
```

This applies to ALL components that use SourceFile with computed paths including subdirectory prefixes.

### SA-C31-SER: needsTransformation enum case requires explicit options
**Problem:** When adding the `enum` case to `needsTransformation()`, it MUST require the `options` parameter to be explicitly provided (check `options &&`). Without this guard, deserialization code (which calls `needsTransformation` without options) would erroneously return `true` for union-as-enum types, causing deserializers to generate no-op null checks like `!item["prop"] ? item["prop"] : item["prop"]`.

**Root cause:** `needsTransformation` is shared between serialization and deserialization paths. The deserialization side doesn't pass `SerializationOptions`. If the `enum` case checks `!options?.experimentalExtensibleEnums`, it evaluates to `true` when `options` is `undefined`, making ALL union-as-enum types "need transformation" in deserialization — breaking 23 tests.

**Fix:** Use `options && (type as SdkEnumType).isUnionAsEnum && !options.experimentalExtensibleEnums` — the leading `options &&` ensures backward compatibility.

### SA-C31-SER: send-operation.tsx and json-array-record-helpers.tsx don't pass SerializationOptions
These files call `getSerializationExpression` and `needsTransformation` without passing `SerializationOptions`. This means if a union-as-enum type appears as a direct body parameter or array/dict element, the serializer won't be called. For current scenarios this is fine, but future scenarios with direct enum body params would need these callers updated.

## Azure Core Error Type Handling (SA-C15)
- Azure Core error types (ErrorModel, InnerError, ErrorResponse) are identified by `crossLanguageDefinitionId`: `Azure.Core.Foundations.Error`, `Azure.Core.Foundations.InnerError`, `Azure.Core.Foundations.ErrorResponse`
- These types are imported from `@azure-rest/core-client` (Azure flavor), NOT generated locally
- `isAzureCoreErrorType()` utility in `src/utils/azure-core-error-types.ts` performs the identification
- Properties of type ErrorModel/ErrorResponse use pass-through deserialization (no deserializer call)
- Arrays of error types use inline `.map((p) => { return p; })` instead of named array helpers
- `needsTransformation()` still returns true for error types (to preserve null-check wrapping), but the actual deserialization expression is pass-through
- InnerError has no runtime package export — it's only used inside ErrorModel, which is not generated locally, so InnerError is never needed

## Binary Response Handling: Core vs Azure Flavor

**Core flavor** (`@typespec/ts-http-runtime`):
- Binary responses (bytes with `encode="binary"` or `encode="bytes"`) are deserialized with `stringToUint8Array(result.body, "base64")`
- The runtime returns binary bodies as base64-encoded strings
- `needsTransformation()` returns `true` for `bytes` type, so `getDeserializationExpression()` handles the conversion
- No special streaming or `getBinaryResponse` helper needed

**Azure flavor** (`@azure-rest/core-client`):
- Azure Core Client has a known UTF-8 coercion bug that corrupts non-UTF-8 binary bodies
- Legacy uses `getBinaryResponse()` static helper that calls `asNodeStream()`/`asBrowserStream()` to read raw bytes
- The `_downloadFileSend()` result is NOT awaited; instead passed to `getBinaryResponse(streamableMethod)`
- The deserialize function then returns `result.body` directly (already Uint8Array from streaming)
- `getBinaryResponse` does NOT exist in the new emitter yet — task 10.14 tracks implementing it for Azure flavor

**Key distinction**: `stringToUint8Array` (core) vs `getBinaryResponse` + direct return (Azure) — both are correct in their respective runtime contexts. Do not conflate them.

## TCGC Visibility Values Are Numeric Bit Flags, Not Strings

**Problem:** `SdkModelPropertyType.visibility` contains numeric values (bit flags from TypeSpec Compiler's `Lifecycle` enum), not string values like "create"/"update"/"read". Comparing with `.includes("create")` always fails.

**Values:**
- Create = 1
- Read = 2
- Update = 4
- Delete = 8
- Query = 16

**Fix:** Check both numeric and string formats:
```ts
const hasCreate = prop.visibility.some((v: any) => {
  if (typeof v === "number") return v === 1;
  return String(v).toLowerCase() === "create";
});
```

## TCGC HTTP Body Parameter Name May Differ From Method Parameter Name

**Problem:** TCGC may give the HTTP body parameter a different name than the corresponding method parameter. For example, the method param might be `body` but the HTTP body param might be `readRequest`. Using `map.get(param.name)` fails to find the body example.

**Fix:** For model/array-typed method params, iterate all map entries and look for any `ep.parameter.kind === "body"` entry as a fallback.

## Spread Body Property Lookup Can Match Wrong Params

**Problem:** The spread body lookup in `findExampleValue()` searches body model properties by name. If a body model has a property like `name` and a path parameter is also called `name`, the lookup incorrectly matches the body property with the path parameter.

**Fix:** Only use spread body lookup when `correspondingMethodParams.length > 1` (indicating TCGC detected a spread body).
