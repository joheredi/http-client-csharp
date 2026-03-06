# Azure E2E Test & Code Generation Plan

## Overview

This document describes the plan to bring Azure-specific e2e tests and code generation into the new Alloy-based emitter. The Azure SDK for .NET submodule (`azure-sdk-for-net/eng/packages/`) contains two packages that extend the base `http-client-csharp` emitter:

- **`http-client-csharp`** — Azure data plane: Azure.Core types, LRO `Operation<T>`, HttpPipeline, distributed tracing, special headers (27 Azure-specific Spector test files)
- **`http-client-csharp-mgmt`** — Azure management/ARM: resource detection, CRUD clients, resource scopes, property flattening (31 TypeSpec test files)

### Current State

- The e2e pipeline (`emit-e2e.ts`) already discovers and compiles Azure specs from `@azure-tools/azure-http-specs`, but **9+ specs are ignored** in `.testignore`.
- Test files are linked only from the base `typespec/packages/http-client-csharp` submodule. **No Azure-specific test files are linked**.
- Azure specs compile with `System.ClientModel` types — Azure.Core types (`Operation<T>`, `HttpPipeline`, `AzureLocation`, etc.) are **not yet generated**.

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Flavor architecture** | Emitter option `flavor: "azure" \| "unbranded"` (default: `"unbranded"`) | Single emitter entry point; components check flavor to toggle Azure-specific output |
| **Azure.Core dependency** | NuGet package reference in generated `.csproj` | Matches Azure SDK production pattern; simpler than linking source files |
| **Test file strategy** | Link from Azure submodule | Mirrors current approach for base tests; avoids test file duplication |

---

## Phase 16: Azure Data Plane E2E Test Infrastructure

Set up the test infrastructure to run Azure-specific Spector tests against the new emitter.

### 16.1 — Add `flavor` emitter option

Add a `flavor` option to `src/options.ts` that controls whether the emitter generates Azure SDK code (`"azure"`) or unbranded System.ClientModel code (`"unbranded"`). This is the foundational toggle for all Azure-specific behavior.

### 16.2 — Update emit-e2e.ts for Azure flavor

Modify `eng/scripts/emit-e2e.ts` to pass `--option http-client-csharp.flavor=azure` when compiling specs sourced from `@azure-tools/azure-http-specs`. Also add Azure versioned specs (`azure/versioning/previewVersion`) to `VERSIONED_SPECS`.

### 16.3 — Configure Spector.Tests for Azure

Modify `test/e2e/Spector.Tests/Spector.Tests.csproj`:
- Add `<PackageReference Include="Azure.Core" />`
- Add `AzureTestRoot` property pointing to the Azure submodule's `Spector.Tests/`
- Link Azure-specific test files: `$(AzureTestRoot)Http/Azure/**/*.cs`
- Link shared Azure.Core source files needed by test infrastructure (RawRequestUriBuilder, ClientDiagnostics, etc.)

### 16.4 — Enable Azure specs and track failures

Remove Azure data plane specs from `.testignore` as they become compilable. Update `.expected-failures` and `.expected-skips` to track progress.

---

## Phase 17: Azure Data Plane Code Generation

Implement Azure-specific code generation features, gated by `flavor: "azure"`.

### 17.1 — Azure.Core built-in type mappings

Map TypeSpec Azure types to C# Azure.Core types:

| TypeSpec Type | C# Type | Namespace |
|---|---|---|
| `Azure.Core.azureLocation` | `AzureLocation` | `Azure` |
| `Azure.Core.armResourceIdentifier` | `ResourceIdentifier` | `Azure.Core` |
| `Azure.Core.eTag` | `ETag` | `Azure` |
| `Azure.ResponseError` | `ResponseError` | `Azure` |
| `Azure.Core.ipV4Address` / `ipV6Address` | `IPAddress` | `System.Net` |

Reference: `AzureTypeFactory.cs` in Azure submodule, `KnownAzureTypes.cs`.

### 17.2 — Azure.Core PackageReference in generated .csproj

When `flavor: "azure"`, the scaffolded `.csproj` should include `<PackageReference Include="Azure.Core" />` instead of (or in addition to) `System.ClientModel`.

Reference: `NewAzureProjectScaffolding.cs`.

### 17.3 — Replace ClientPipeline with HttpPipeline

Azure SDKs use `Azure.Core.Pipeline.HttpPipeline` instead of `System.ClientModel.ClientPipeline`. Make the `Pipeline` property virtual.

Reference: `PipelinePropertyVisitor.cs`, `HttpPipelineProvider.cs`.

### 17.4 — Azure client options base class

Azure client options should extend from Azure-specific base classes. HttpMessage/HttpRequest/HttpResponse should use Azure.Core equivalents.

Reference: `AzureTypeFactory.cs` provider instances (lines 30-51).

### 17.5 — LRO Operation<T> return types

For methods with `kind: "lro"` or `kind: "lropaging"`, generate `Operation<T>` return type. Generate polling infrastructure.

Reference: `LroVisitor.cs` (Azure submodule).

### 17.6 — Distributed tracing (ClientDiagnostics)

Add `ClientDiagnostics` property to generated clients. Wrap operations with diagnostic scope.

Reference: `DistributedTracingVisitor.cs`.

### 17.7 — Azure special headers

- **x-ms-client-request-id**: Automatically add to requests (ref: `ClientRequestIdHeaderVisitor.cs`)
- **ETag / If-Match / If-None-Match**: Conditional request support (ref: `MatchConditionsHeadersVisitor.cs`)

### 17.8 — Azure namespace conventions

- Model sub-namespace (`.Models`) when `model-namespace: true`
- Model factory naming conventions

Reference: `NamespaceVisitor.cs`, `ModelFactoryRenamerVisitor.cs`.

### 17.9 — metadata.json generation

Generate `metadata.json` with API version mapping for Azure packages.

Reference: `generateMetadataFile()` in Azure emitter.ts.

### 17.10 — SystemTextJsonConverter support

Support `@useSystemTextJsonConverter` decorator for Azure serialization patterns.

Reference: `SystemTextJsonConverterVisitor.cs`.

---

## Phase 18: Azure Management E2E Test Infrastructure

### 18.1 — Link mgmt test files and configure test project

Similar to Phase 16, but for the mgmt submodule. Link test files from `http-client-csharp-mgmt/generator/TestProjects/`. Add `Azure.ResourceManager` NuGet reference.

### 18.2 — Mgmt emitter options

Support mgmt-specific options: `enable-wire-path-attribute`, `use-legacy-resource-detection`, subscription ID parameter transformation.

---

## Phase 19: Azure Management Code Generation

### 19.1 — ARM resource detection

Port `resource-detection.ts` logic: identify ARM resources from URL path patterns, determine resource scope (Tenant/Subscription/ResourceGroup/ManagementGroup/Extension), identify parent-child relationships.

### 19.2 — CRUD client generation

Generate Resource/Collection client classes with Create/Read/Update/Delete/List methods. Generate mockable wrappers and extension methods.

### 19.3 — Property flattening

Support `@flatten` decorator semantics for ARM models.

### 19.4 — Subscription ID transformation

Transform subscriptionId from client constructor scope to individual method parameters.

### 19.5 — Additional ARM features

Tag operations, singleton resources, extension resources, wire path attributes, non-resource methods.

---

## Dependency Graph

```
Phase 16 (Azure E2E Infra) ← Start here
    ↓
Phase 17 (Azure Code Gen) ← Depends on Phase 16 for validation
    ↓
Phase 18 (Mgmt E2E Infra) ← Depends on Phase 17 core features
    ↓
Phase 19 (Mgmt Code Gen) ← Depends on Phase 18 for validation
```

## Key References

| Resource | Path |
|----------|------|
| Azure emitter | `submodules/azure-sdk-for-net/eng/packages/http-client-csharp/emitter/src/` |
| Azure generator | `submodules/azure-sdk-for-net/eng/packages/http-client-csharp/generator/Azure.Generator/src/` |
| Azure test files | `submodules/azure-sdk-for-net/eng/packages/http-client-csharp/generator/TestProjects/Spector.Tests/Http/Azure/` |
| Azure .csproj | `submodules/azure-sdk-for-net/eng/packages/http-client-csharp/generator/TestProjects/Spector.Tests/TestProjects.Spector.Tests.csproj` |
| Mgmt emitter | `submodules/azure-sdk-for-net/eng/packages/http-client-csharp-mgmt/emitter/src/` |
| Mgmt generator | `submodules/azure-sdk-for-net/eng/packages/http-client-csharp-mgmt/generator/Azure.Generator.Management/src/` |
| Mgmt test specs | `submodules/azure-sdk-for-net/eng/packages/http-client-csharp-mgmt/generator/TestProjects/Local/Mgmt-TypeSpec/` |
| Current emitter options | `src/options.ts` |
| E2E emit script | `eng/scripts/emit-e2e.ts` |
| E2E test project | `test/e2e/Spector.Tests/Spector.Tests.csproj` |
| Test ignore list | `test/e2e/.testignore` |
