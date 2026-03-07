import { CsprojFile } from "@alloy-js/csharp";
import {
  AssemblyTitle,
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
