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
 * Matches the legacy `NewProjectScaffolding` output:
 * - `Microsoft.NET.Sdk`
 * - `netstandard2.0;net8.0` target frameworks
 * - `System.ClientModel` 1.9.0 dependency
 * - Standard package metadata
 */
export function ProjectFile(props: ProjectFileProps) {
  const { packageName } = props;
  const disableXmlDocs = props.options["disable-xml-docs"];

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
        <PackageReference Include="System.ClientModel" Version="1.9.0" />
      </ItemGroup>
    </CsprojFile>
  );
}
