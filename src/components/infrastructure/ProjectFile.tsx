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
 * Additional Azure.Core shared source files required by ARM (management) projects.
 *
 * Management SDKs use LRO infrastructure (ProtocolOperationHelpers, OperationFinalStateVia),
 * argument validation (Argument), paging helpers (Page, PageableHelpers), and resource
 * collection patterns (NoValueResponseOfT, ForwardsClientCallsAttribute).
 *
 * This list matches the shared source includes from the Azure SDK's
 * `Directory.Build.Common.targets` for management libraries.
 */
const ARM_SHARED_SOURCE_FILES = [
  "AsyncLockWithValue.cs",
  "FixedDelayWithNoJitterStrategy.cs",
  "ForwardsClientCallsAttribute.cs",
  "IOperationSource.cs",
  "NextLinkOperationImplementation.cs",
  "NoValueResponseOfT.cs",
  "OperationFinalStateVia.cs",
  "OperationHelpers.cs",
  "OperationInternal.cs",
  "OperationInternalBase.cs",
  "OperationInternalOfT.cs",
  "OperationPoller.cs",
  "Page.cs",
  "PageableHelpers.cs",
  "ProtocolOperation.cs",
  "ProtocolOperationHelpers.cs",
  "SequentialDelayStrategy.cs",
  "TaskExtensions.cs",
  "VoidValue.cs",
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
            {isManagement
              ? ARM_SHARED_SOURCE_FILES.map((file) => (
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
