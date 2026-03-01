import {
  ClassDeclaration,
  EnumDeclaration,
  EnumMember,
  Namespace,
  Property,
  SourceFile,
  useCSharpNamePolicy,
} from "@alloy-js/csharp";
import { code, For, namekey } from "@alloy-js/core";
import type {
  SdkClientType,
  SdkHttpOperation,
} from "@azure-tools/typespec-client-generator-core";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { System } from "../../builtins/system.js";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getLicenseHeader } from "../../utils/header.js";
import { toApiVersionMemberName } from "../../utils/version.js";

/**
 * Props for the {@link ClientOptionsFile} component.
 */
export interface ClientOptionsFileProps {
  /** The TCGC SDK client type for which to generate options. */
  client: SdkClientType<SdkHttpOperation>;
  /** Resolved emitter options used for generating the file header. */
  options: ResolvedCSharpEmitterOptions;
}

/**
 * Generates a C# source file containing the client options class.
 *
 * The generated class inherits from `ClientPipelineOptions` and contains:
 * - A nested `ServiceVersion` enum with a monotonic ordinal for each API version
 * - A `LatestVersion` const field pointing to the latest enum member
 * - A constructor that maps each `ServiceVersion` member to its string value
 *   via a switch expression
 * - An internal `Version` string property exposing the resolved version string
 *
 * This matches the legacy generator's `ClientOptionsProvider` output format.
 * The file is placed at `src/Generated/{OptionsClassName}.cs`.
 *
 * If the client has no API versions, no file is generated (returns `false`).
 *
 * @example Generated output:
 * ```csharp
 * public partial class MyClientOptions : ClientPipelineOptions
 * {
 *     private const ServiceVersion LatestVersion = ServiceVersion.V2024_01_01;
 *
 *     public MyClientOptions(ServiceVersion version = LatestVersion)
 *     {
 *         Version = version switch
 *         {
 *             ServiceVersion.V2024_01_01 => "2024-01-01",
 *             _ => throw new NotSupportedException()
 *         };
 *     }
 *
 *     internal string Version { get; }
 *
 *     public enum ServiceVersion
 *     {
 *         /// <summary> V2024_01_01. </summary>
 *         V2024_01_01 = 1
 *     }
 * }
 * ```
 */
export function ClientOptionsFile(props: ClientOptionsFileProps) {
  const { client, options } = props;
  const apiVersions = client.apiVersions;

  // Don't generate options file if the client has no API versions
  if (apiVersions.length === 0) {
    return false;
  }

  const header = getLicenseHeader(options);
  const namePolicy = useCSharpNamePolicy();

  const clientName = namePolicy.getName(client.name, "class");
  const optionsClassName = `${clientName}Options`;

  // Build version member metadata: name, ordinal, and original string value
  const versionMembers = apiVersions.map((version, index) => ({
    name: toApiVersionMemberName(version),
    ordinal: index + 1,
    value: version,
  }));

  const latestMember = versionMembers[versionMembers.length - 1];

  // Build switch arms for the constructor: ServiceVersion.Vxxx => "xxx"
  const switchArms = versionMembers
    .map((m) => `        ServiceVersion.${m.name} => "${m.value}"`)
    .join(",\n");

  return (
    <SourceFile path={`src/Generated/${optionsClassName}.cs`}>
      {header}
      {"\n\n"}
      <Namespace name={client.namespace}>
        {`/// <summary> Client options for <see cref="${clientName}"/>. </summary>`}
        {"\n"}
        <ClassDeclaration
          public
          partial
          name={optionsClassName}
          baseType={SystemClientModelPrimitives.ClientPipelineOptions}
        >
          {code`private const ServiceVersion LatestVersion = ServiceVersion.${latestMember.name};`}
          {"\n\n"}
          {`/// <summary> Initializes a new instance of ${optionsClassName}. </summary>`}
          {"\n"}
          {`/// <param name="version"> The service version. </param>`}
          {"\n"}
          {code`public ${optionsClassName}(ServiceVersion version = LatestVersion)`}
          {"\n{\n"}
          {"    Version = version switch\n"}
          {"    {\n"}
          {switchArms}
          {",\n"}
          {code`        _ => throw new ${System.NotSupportedException}()`}
          {"\n    };\n"}
          {"}"}
          {"\n\n"}
          {`/// <summary> Gets the Version. </summary>`}
          {"\n"}
          <Property internal name="Version" type="string" get />
          {"\n\n"}
          {`/// <summary> The version of the service to use. </summary>`}
          {"\n"}
          <EnumDeclaration public name="ServiceVersion">
            <For each={versionMembers} joiner={",\n"}>
              {(member) => (
                <>
                  {`/// <summary> ${member.name}. </summary>`}
                  {"\n"}
                  <EnumMember
                    name={namekey(member.name, { ignoreNamePolicy: true })}
                  />
                  {` = ${member.ordinal}`}
                </>
              )}
            </For>
          </EnumDeclaration>
        </ClassDeclaration>
      </Namespace>
    </SourceFile>
  );
}
