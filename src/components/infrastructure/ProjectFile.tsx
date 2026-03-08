import { CsprojFile } from "@alloy-js/csharp";
import type { Children } from "@alloy-js/core";
import {
  AssemblyTitle,
  Compile,
  Description,
  GenerateDocumentationFile,
  ItemGroup,
  LangVersion,
  PackageReference,
  PackageTags,
  PropertyGroup,
  TargetFrameworks,
  Version,
} from "@alloy-js/msbuild/components";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";

/**
 * Azure.Core shared source files that must be compiled into every Azure-flavored project.
 *
 * These files are internal to the Azure.Core NuGet package and cannot be referenced
 * directly. The Azure SDK uses a "shared source" pattern: each generated project compiles
 * its own copy of these files from the Azure.Core source tree. The MSBuild variable
 * `$(AzureCoreSharedSources)` points to the shared source directory.
 *
 * This list matches the base set from the legacy emitter's `NewAzureProjectScaffolding.cs`
 * (`_operationSharedFiles`). All Azure projects that have operations need these files.
 *
 * @see https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/core/Azure.Core/src/Shared/
 */
const AZURE_SHARED_SOURCE_FILES = [
  "RawRequestUriBuilder.cs",
  "TypeFormatters.cs",
  "RequestHeaderExtensions.cs",
  "AppContextSwitchHelper.cs",
  "ClientDiagnostics.cs",
  "DiagnosticScopeFactory.cs",
  "DiagnosticScope.cs",
  "HttpMessageSanitizer.cs",
  "TrimmingAttribute.cs",
  "HttpPipelineExtensions.cs",
  "Utf8JsonRequestContent.cs",
];

/**
 * Azure.Core shared source files for LRO (Long Running Operation) support.
 *
 * These files provide the polling infrastructure that LRO operations depend on:
 * ProtocolOperationHelpers (creates and manages Operation<T>), OperationPoller
 * (polling loop), OperationInternal (state tracking), and supporting types.
 *
 * Included when the service has LRO operations (`method.kind === "lro"`) or
 * when generating management (ARM) projects (which always have LRO operations).
 *
 * This list matches the legacy emitter's `_lroSharedFiles` from
 * `NewAzureProjectScaffolding.cs`, minus `HttpPipelineExtensions.cs` which is
 * already in the base `AZURE_SHARED_SOURCE_FILES`.
 *
 * @see https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/core/Azure.Core/src/Shared/
 */
const AZURE_LRO_SHARED_SOURCE_FILES = [
  "AsyncLockWithValue.cs",
  "FixedDelayWithNoJitterStrategy.cs",
  "IOperationSource.cs",
  "NextLinkOperationImplementation.cs",
  "OperationFinalStateVia.cs",
  "OperationInternal.cs",
  "OperationInternalBase.cs",
  "OperationInternalOfT.cs",
  "OperationPoller.cs",
  "ProtocolOperation.cs",
  "ProtocolOperationHelpers.cs",
  "SequentialDelayStrategy.cs",
  "TaskExtensions.cs",
  "VoidValue.cs",
];

/**
 * Additional Azure.Core shared source files required only by ARM (management) projects.
 *
 * These are ARM-specific infrastructure types not needed by regular Azure LRO projects:
 * ForwardsClientCallsAttribute (ARM extension methods), NoValueResponseOfT (void ARM ops),
 * OperationHelpers (ARM operation utilities), Page/PageableHelpers (ARM paging).
 *
 * @see https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/core/Azure.Core/src/Shared/
 */
const ARM_EXTRA_SHARED_SOURCE_FILES = [
  "ForwardsClientCallsAttribute.cs",
  "NoValueResponseOfT.cs",
  "OperationHelpers.cs",
  "Page.cs",
  "PageableHelpers.cs",
];

/**
 * Type-safe wrapper for the MSBuild `<Compile>` element with `LinkBase` attribute support.
 *
 * The `@alloy-js/msbuild` Compile component doesn't include `LinkBase` in its typed props,
 * but `makeTag` renders ALL props as XML attributes at runtime. This cast makes `LinkBase`
 * available without losing type safety on `Include`.
 */
const CompileWithLinkBase = Compile as unknown as (props: {
  Include: string;
  LinkBase: string;
  children?: Children;
}) => Children;

/**
 * Props for the ProjectFile component.
 */
export interface ProjectFileProps {
  /** Package name used for csproj filename and metadata. */
  packageName: string;
  /** Resolved emitter options. */
  options: ResolvedCSharpEmitterOptions;
  /**
   * Whether the service has LRO (Long Running Operation) methods.
   * When true, LRO shared source files (ProtocolOperationHelpers, OperationPoller, etc.)
   * are included in the project. ARM projects always include LRO files regardless.
   */
  hasLroOperations?: boolean;
}

/**
 * Generates the `{PackageName}.csproj` project file.
 *
 * Matches the legacy `NewProjectScaffolding` / `NewAzureProjectScaffolding` output:
 * - `Microsoft.NET.Sdk`
 * - `netstandard2.0;net8.0` target frameworks
 * - Standard package metadata
 *
 * Package reference is flavor-aware:
 * - `flavor="unbranded"` → `System.ClientModel` 1.9.0
 * - `flavor="azure"` → `Azure.Core` 1.51.1 (transitively includes System.ClientModel
 *   with ModelReaderWriterContext/ModelReaderWriterBuildable support)
 * - `management=true` → additionally references `Azure.ResourceManager` 1.14.0
 *
 * Azure projects also include shared source files from Azure.Core (ClientDiagnostics,
 * DiagnosticScope, etc.) via `$(AzureCoreSharedSources)` MSBuild variable. These are
 * internal types that must be compiled directly into each project. This matches the
 * legacy emitter's `NewAzureProjectScaffolding` behavior.
 */
export function ProjectFile(props: ProjectFileProps) {
  const { packageName } = props;
  const disableXmlDocs = props.options["disable-xml-docs"];
  const isAzure = props.options.flavor === "azure";
  const isManagement = props.options.management === true;
  // ARM projects always have LRO operations (create/update/delete are LRO).
  const needsLro = props.hasLroOperations === true || isManagement;

  // Azure.Core 1.51.1 is required for all Azure flavors:
  // - Transitively includes System.ClientModel with ModelReaderWriterContext support
  // - Matches legacy emitter's NewAzureProjectScaffolding version
  // - Meets Azure.ResourceManager 1.14.0 minimum requirement (for management)
  const azureCoreVersion = "1.51.1";

  return (
    <CsprojFile path={`src/${packageName}.csproj`}>
      <PropertyGroup>
        <Description>
          {`This is the ${packageName} client library for developing .NET applications with rich experience.`}
        </Description>
        <AssemblyTitle>{`SDK Code Generation ${packageName}`}</AssemblyTitle>
        <Version>1.0.0-beta.1</Version>
        <PackageTags>{packageName}</PackageTags>
        <TargetFrameworks>netstandard2.0;net8.0</TargetFrameworks>
        <LangVersion>latest</LangVersion>
        {!disableXmlDocs ? (
          <GenerateDocumentationFile>true</GenerateDocumentationFile>
        ) : undefined}
      </PropertyGroup>
      {"\n"}
      {isAzure ? (
        <>
          <ItemGroup>
            {AZURE_SHARED_SOURCE_FILES.map((file) => (
              <CompileWithLinkBase
                Include={`$(AzureCoreSharedSources)${file}`}
                LinkBase="Shared/Core"
              />
            ))}
            {needsLro
              ? AZURE_LRO_SHARED_SOURCE_FILES.map((file) => (
                  <CompileWithLinkBase
                    Include={`$(AzureCoreSharedSources)${file}`}
                    LinkBase="Shared/Core"
                  />
                ))
              : undefined}
            {isManagement
              ? ARM_EXTRA_SHARED_SOURCE_FILES.map((file) => (
                  <CompileWithLinkBase
                    Include={`$(AzureCoreSharedSources)${file}`}
                    LinkBase="Shared/Core"
                  />
                ))
              : undefined}
          </ItemGroup>
          {"\n"}
        </>
      ) : undefined}
      <ItemGroup>
        {isAzure ? (
          <PackageReference Include="Azure.Core" Version={azureCoreVersion} />
        ) : (
          <PackageReference Include="System.ClientModel" Version="1.9.0" />
        )}
        {isManagement ? (
          <PackageReference Include="Azure.ResourceManager" Version="1.14.0" />
        ) : undefined}
      </ItemGroup>
    </CsprojFile>
  );
}
