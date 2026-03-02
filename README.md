# http-client-csharp

A [TypeSpec](https://typespec.io) emitter that generates C# HTTP client libraries using the [Alloy framework](https://github.com/alloy-framework/alloy). It compiles TypeSpec API definitions directly into production-ready C# source files in a single pass — no intermediate code model or .NET tooling required at generation time.

## Overview

This emitter replaces the legacy two-phase pipeline (TypeSpec → JSON → C# generator) with a single-phase TypeScript emitter that uses JSX components to produce C# code. Each TypeSpec construct (models, enums, operations, clients) maps to a JSX component that renders the corresponding C# output.

```
TypeSpec API Definition
  → TypeSpec Compiler
  → $onEmit (emitter entry point)
  → JSX component tree (Alloy + @alloy-js/csharp)
  → C# source files (.cs, .csproj, .sln)
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 24.x or later
- [pnpm](https://pnpm.io/) 10.x (managed via `packageManager` in `package.json`)
- [.NET SDK](https://dotnet.microsoft.com/) 9.0+ (only required for smoke tests)

### Installation

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Usage

Add the emitter to your `tspconfig.yaml`:

```yaml
emit:
  - http-client-csharp

options:
  http-client-csharp:
    package-name: MyService
    generate-protocol-methods: true
    generate-convenience-methods: true
```

Then compile your TypeSpec:

```bash
tsp compile .
```

### Emitter Options

| Option                         | Type      | Default                 | Description                                              |
| ------------------------------ | --------- | ----------------------- | -------------------------------------------------------- |
| `api-version`                  | `string`  | `"latest"`              | Target API version for `@versioned` specs                |
| `generate-protocol-methods`    | `boolean` | `true`                  | Generate low-level protocol methods                      |
| `generate-convenience-methods` | `boolean` | `true`                  | Generate high-level convenience methods                  |
| `unreferenced-types-handling`  | `string`  | `"removeOrInternalize"` | How to handle types not referenced by operations         |
| `new-project`                  | `boolean` | `false`                 | Overwrite `.csproj` if it already exists                 |
| `save-inputs`                  | `boolean` | `false`                 | Save intermediate emitter inputs alongside output        |
| `disable-xml-docs`             | `boolean` | `false`                 | Disable XML doc comments on generated types              |
| `package-name`                 | `string`  | _(from TypeSpec)_       | Package name for the generated library                   |
| `license`                      | `object`  | _(none)_                | License info (`name`, `company`, `link`, `header`, etc.) |

## Generated Output

The emitter produces a complete C# client library:

```
src/Generated/
├── MyServiceClient.cs              # Client class with convenience + protocol methods
├── MyServiceRestClient.cs          # Low-level REST client (HTTP pipeline)
├── MyServiceClientOptions.cs       # Client configuration options
├── Models/
│   ├── Widget.cs                   # Model classes
│   ├── WidgetSerialization.cs      # JSON serialization
│   ├── Color.cs                    # Fixed enums
│   ├── Format.cs                   # Extensible enums (readonly partial struct)
│   └── MyServiceModelFactory.cs    # Model factory for testing
├── Internal/
│   ├── Argument.cs                 # Parameter validation helpers
│   ├── Optional.cs                 # Optional value tracking
│   ├── ChangeTrackingList.cs       # Collection change tracking
│   └── ...                         # Other infrastructure files
├── MyService.csproj
└── MyService.sln
```

## Architecture

### Project Structure

```
src/
├── emitter.tsx          # $onEmit entry point — orchestrates the full render
├── lib.ts               # TypeSpec library definition (diagnostics, emitter name)
├── options.ts           # Emitter options interface, schema, defaults
├── index.ts             # Public exports
├── builtins/            # Alloy library definitions for System.ClientModel types
├── components/          # JSX components that produce C# code
│   ├── clients/         # Client and RestClient generation
│   ├── models/          # Model classes, constructors, discriminators
│   ├── enums/           # Fixed and extensible enum generation
│   ├── serialization/   # JSON read/write, property serializers
│   ├── infrastructure/  # Project scaffolding and helper files
│   ├── model-factory/   # Test model factory generation
│   ├── client-options/  # Client options class
│   └── collection-results/ # Paging support
├── testing/             # Test library registration
└── utils/               # Shared utilities (collections, naming, refkeys)

test/
├── test-host.ts         # Tester setup (createTester/Tester/HttpTester)
├── *.test.ts            # Unit tests
├── scenarios.test.ts    # Scenario tests (markdown-based expected output)
├── smoke.test.ts        # Smoke tests (dotnet build validation)
├── scenarios/           # Scenario markdown files
└── fixtures/            # TypeSpec fixture files
```

### JSX for Code Generation

This project uses JSX not for UI rendering, but for **code generation**. Components in `.tsx` files return Alloy elements that render to C# source text:

```tsx
<ClassDeclaration public name="MyClient">
  <Property public name="BaseUrl" type="string" get set />
</ClassDeclaration>
```

Cross-file references are handled automatically via `refkey()` — Alloy resolves symbols and generates `using` directives.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, conventions, and how to add new features.

## License

See [LICENSE](LICENSE) for details.
