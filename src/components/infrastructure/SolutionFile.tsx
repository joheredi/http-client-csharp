import { type Children, SourceFile } from "@alloy-js/core";

/**
 * Props for the SolutionFile component.
 */
export interface SolutionFileProps {
  /** Package name used for solution filename and project reference. */
  packageName: string;
}

const PROJECT_GUID = "{28FF4005-4467-4E36-92E7-DEA27DEB1519}";
const CSHARP_PROJECT_TYPE_GUID = "{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}";

/**
 * Generates the `{PackageName}.sln` Visual Studio solution file.
 *
 * Follows the legacy `NewProjectScaffolding` format:
 * VS 2022 solution with Debug/Release configurations.
 */
export function SolutionFile(props: SolutionFileProps): Children {
  const { packageName } = props;

  const content = [
    `Microsoft Visual Studio Solution File, Format Version 12.00`,
    `# Visual Studio Version 17`,
    `VisualStudioVersion = 17.0.31903.59`,
    `MinimumVisualStudioVersion = 10.0.40219.1`,
    `Project("${CSHARP_PROJECT_TYPE_GUID}") = "${packageName}", "src\\${packageName}.csproj", "${PROJECT_GUID}"`,
    `EndProject`,
    `Global`,
    `\tGlobalSection(SolutionConfigurationPlatforms) = preSolution`,
    `\t\tDebug|Any CPU = Debug|Any CPU`,
    `\t\tRelease|Any CPU = Release|Any CPU`,
    `\tEndGlobalSection`,
    `\tGlobalSection(ProjectConfigurationPlatforms) = postSolution`,
    `\t\t${PROJECT_GUID}.Debug|Any CPU.ActiveCfg = Debug|Any CPU`,
    `\t\t${PROJECT_GUID}.Debug|Any CPU.Build.0 = Debug|Any CPU`,
    `\t\t${PROJECT_GUID}.Release|Any CPU.ActiveCfg = Release|Any CPU`,
    `\t\t${PROJECT_GUID}.Release|Any CPU.Build.0 = Release|Any CPU`,
    `\tEndGlobalSection`,
    `EndGlobal`,
    ``,
  ].join("\n");

  return (
    <SourceFile path={`${packageName}.sln`} filetype="text/plain">
      {content}
    </SourceFile>
  );
}
