import { type EmitContext, type JSONSchemaType } from "@typespec/compiler";

/**
 * License configuration for the generated C# client library.
 *
 * Controls the license information emitted into generated source files.
 * The `name` field is required; all other fields are optional.
 */
export interface LicenseOptions {
  /** The SPDX license identifier or license name (e.g., "MIT"). */
  name: string;
  /** The company or organization that holds the copyright. */
  company?: string;
  /** URL to the full license text. */
  link?: string;
  /** Short license header to include at the top of generated files. */
  header?: string;
  /** A longer description of the license terms. */
  description?: string;
}

/**
 * Emitter options for the C# HTTP client emitter.
 *
 * These options are declared in the TypeSpec library definition and can be
 * set by users in their `tspconfig.yaml` under the `http-client-csharp` emitter.
 *
 * Options that are specific to the legacy two-phase C# generator pipeline
 * (debug, generator-name, emitter-extension-path, update-code-model,
 * sdk-context-options, logLevel) are intentionally excluded because the
 * rewritten emitter produces C# directly without an intermediate code model.
 */
export interface CSharpEmitterOptions {
  /**
   * Controls whether the emitter generates Azure SDK code or unbranded
   * System.ClientModel code. When set to `"azure"`, the emitter produces
   * Azure-branded clients using Azure.Core types. Defaults to `"unbranded"`.
   */
  flavor?: "azure" | "unbranded";

  /**
   * For TypeSpec files using the `@versioned` decorator, set this option to
   * the API version that the emitter should generate against.
   * Defaults to `"latest"`.
   */
  "api-version"?: string;

  /**
   * Whether to generate protocol methods (low-level methods that work with
   * raw request/response types). Defaults to `true`.
   */
  "generate-protocol-methods"?: boolean;

  /**
   * Whether to generate convenience methods (high-level methods that work
   * with strongly-typed model parameters and return types). Defaults to `true`.
   */
  "generate-convenience-methods"?: boolean;

  /**
   * Strategy for handling types that are not referenced by any operation.
   *
   * - `"removeOrInternalize"` — remove or make internal (default)
   * - `"internalize"` — make internal but keep in output
   * - `"keepAll"` — emit all types regardless of references
   */
  "unreferenced-types-handling"?:
    | "removeOrInternalize"
    | "internalize"
    | "keepAll";

  /**
   * Set to `true` to overwrite the `.csproj` file if it already exists.
   * Defaults to `false`.
   */
  "new-project"?: boolean;

  /**
   * Set to `true` to save intermediate emitter inputs (e.g., configuration
   * files) alongside the generated output. Defaults to `false`.
   */
  "save-inputs"?: boolean;

  /**
   * Set to `true` to disable XML documentation comment generation on
   * emitted C# types and members. Defaults to `false`.
   */
  "disable-xml-docs"?: boolean;

  /**
   * Package name for the generated library. If not specified, the first
   * namespace defined in the TypeSpec is used as the package name.
   */
  "package-name"?: string;

  /**
   * License information for the generated client library. When provided,
   * the emitter includes license headers and metadata in the output.
   */
  license?: LicenseOptions;
}

/**
 * JSON Schema for {@link CSharpEmitterOptions}.
 *
 * Used by the TypeSpec compiler to validate emitter configuration in
 * `tspconfig.yaml` and to power IDE auto-completion for option names.
 */
export const CSharpEmitterOptionsSchema: JSONSchemaType<CSharpEmitterOptions> =
  {
    type: "object",
    additionalProperties: false,
    properties: {
      flavor: {
        type: "string",
        enum: ["azure", "unbranded"],
        nullable: true,
        description:
          "Controls whether Azure SDK code or unbranded System.ClientModel code is generated. " +
          "The default value is `unbranded`.",
      },
      "api-version": {
        type: "string",
        nullable: true,
        description:
          "For TypeSpec files using the `@versioned` decorator, " +
          "set this option to the version that should be used to generate against.",
      },
      "generate-protocol-methods": {
        type: "boolean",
        nullable: true,
        description:
          "Set to `false` to skip generation of protocol methods. The default value is `true`.",
      },
      "generate-convenience-methods": {
        type: "boolean",
        nullable: true,
        description:
          "Set to `false` to skip generation of convenience methods. The default value is `true`.",
      },
      "unreferenced-types-handling": {
        type: "string",
        enum: ["removeOrInternalize", "internalize", "keepAll"],
        nullable: true,
        description:
          "Defines the strategy on how to handle unreferenced types. " +
          "The default value is `removeOrInternalize`.",
      },
      "new-project": {
        type: "boolean",
        nullable: true,
        description:
          "Set to `true` to overwrite the csproj if it already exists. The default value is `false`.",
      },
      "save-inputs": {
        type: "boolean",
        nullable: true,
        description:
          "Set to `true` to save intermediate emitter inputs alongside the generated output. " +
          "The default value is `false`.",
      },
      "disable-xml-docs": {
        type: "boolean",
        nullable: true,
        description:
          "Set to `true` to disable XML documentation generation. The default value is `false`.",
      },
      "package-name": {
        type: "string",
        nullable: true,
        description:
          "Define the package name. If not specified, the first namespace defined in the " +
          "TypeSpec is used as the package name.",
      },
      license: {
        type: "object",
        additionalProperties: false,
        nullable: true,
        required: ["name"],
        properties: {
          name: { type: "string", nullable: false },
          company: { type: "string", nullable: true },
          link: { type: "string", nullable: true },
          header: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
        },
        description: "License information for the generated client code.",
      },
    },
    required: [],
  };

/**
 * Default values for emitter options.
 *
 * These defaults are applied when the user does not specify a value in their
 * `tspconfig.yaml`. The defaults match the legacy emitter behavior.
 */
export const defaultOptions: Required<
  Pick<
    CSharpEmitterOptions,
    | "flavor"
    | "api-version"
    | "generate-protocol-methods"
    | "generate-convenience-methods"
    | "unreferenced-types-handling"
    | "new-project"
    | "save-inputs"
  >
> = {
  flavor: "unbranded",
  "api-version": "latest",
  "generate-protocol-methods": true,
  "generate-convenience-methods": true,
  "unreferenced-types-handling": "removeOrInternalize",
  "new-project": false,
  "save-inputs": false,
};

/**
 * Emitter options with defaults applied for fields that have default values.
 *
 * Fields covered by {@link defaultOptions} (`flavor`, `api-version`,
 * `generate-protocol-methods`, `generate-convenience-methods`,
 * `unreferenced-types-handling`, `new-project`, `save-inputs`) are
 * guaranteed to be present. All other fields remain optional.
 */
export type ResolvedCSharpEmitterOptions = typeof defaultOptions &
  CSharpEmitterOptions;

/**
 * Merges user-provided emitter options with {@link defaultOptions} to produce
 * the final resolved configuration used throughout the emitter.
 *
 * @param context - The TypeSpec emit context containing user-specified options.
 * @returns The fully resolved emitter options.
 */
export function resolveOptions(
  context: EmitContext<CSharpEmitterOptions>,
): ResolvedCSharpEmitterOptions {
  const emitterOptions = context.options;
  return { ...defaultOptions, ...emitterOptions };
}
