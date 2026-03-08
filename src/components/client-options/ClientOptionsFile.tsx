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
import { AzureCore } from "../../builtins/azure.js";
import { SystemClientModelPrimitives } from "../../builtins/system-client-model.js";
import { System } from "../../builtins/system.js";
import type { ResolvedCSharpEmitterOptions } from "../../options.js";
import { getSimpleClientName } from "../../utils/clients.js";
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
 * The base class depends on the emitter flavor:
 * - `"azure"` → `Azure.Core.ClientOptions`
 * - `"unbranded"` → `System.ClientModel.Primitives.ClientPipelineOptions`
 *
 * For versioned services (with API versions), the generated class inherits
 * from the appropriate base class and contains:
 * - A nested `ServiceVersion` enum with a monotonic ordinal for each API version
 * - A `LatestVersion` const field pointing to the latest enum member
 * - A constructor that maps each `ServiceVersion` member to its string value
 *   via a switch expression
 * - An internal `Version` string property exposing the resolved version string
 *
 * For non-versioned services (no API versions), the generated class is an
 * empty partial class that simply extends `ClientPipelineOptions`. This
 * provides a dedicated per-client options type that consumers can customize
 * via partial class extensions.
 *
 * This matches the legacy generator's `ClientOptionsProvider` output format,
 * which generates per-client options types for all specs regardless of
 * versioning.
 *
 * The file is placed at `src/Generated/{OptionsClassName}.cs`.
 *
 * @example Generated output for a versioned service:
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
 *
 * @example Generated output for a non-versioned service:
 * ```csharp
 * public partial class MyClientOptions : ClientPipelineOptions
 * {
 * }
 * ```
 */
export function ClientOptionsFile(props: ClientOptionsFileProps) {
  const { client, options } = props;
  const apiVersions = getEffectiveApiVersions(client);

  const header = getLicenseHeader(options);
  const namePolicy = useCSharpNamePolicy();

  // Azure clients extend Azure.Core.ClientOptions; unbranded clients extend
  // System.ClientModel.Primitives.ClientPipelineOptions.
  const baseType =
    options.flavor === "azure"
      ? AzureCore.ClientOptions
      : SystemClientModelPrimitives.ClientPipelineOptions;

  const clientName = namePolicy.getName(
    getSimpleClientName(client.name),
    "class",
  );
  const optionsClassName = `${clientName}Options`;

  // Non-versioned services get an empty options class extending the appropriate base.
  // This matches the legacy emitter which generates per-client options for all specs.
  if (apiVersions.length === 0) {
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
            baseType={baseType}
          />
        </Namespace>
      </SourceFile>
    );
  }

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
          baseType={baseType}
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

/**
 * Returns the effective API versions for a client.
 *
 * For single-service clients, this is simply `client.apiVersions`.
 * For multi-service clients (e.g., `@client({ service: [A, B] })`), the
 * combined client's `apiVersions` is typically empty because TCGC does not
 * merge children's versions onto the parent. In that case, we collect all
 * unique API versions from the client's direct children so the generated
 * options class includes a `ServiceVersion` enum and `Version` property.
 *
 * Without this, the root client constructor would reference `options.Version`
 * on an empty options class, causing a C# compilation error.
 */
function getEffectiveApiVersions(
  client: SdkClientType<SdkHttpOperation>,
): string[] {
  if (client.apiVersions.length > 0) {
    return client.apiVersions;
  }

  // Multi-service: collect unique apiVersions from direct children.
  const childVersions: string[] = [];
  for (const child of client.children ?? []) {
    for (const v of child.apiVersions) {
      if (!childVersions.includes(v)) {
        childVersions.push(v);
      }
    }
  }

  return childVersions;
}
