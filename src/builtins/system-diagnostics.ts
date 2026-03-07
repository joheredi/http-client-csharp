import { createLibrary } from "@alloy-js/csharp";

/**
 * Alloy library declaration for types in the System.Diagnostics namespace.
 *
 * Provides the ConditionalAttribute used on ARM resource ValidateResourceId
 * methods to compile them only in DEBUG builds.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics
 */
export const SystemDiagnostics = createLibrary("System.Diagnostics", {
  /**
   * Indicates to compilers that a method call or attribute should be ignored
   * unless a specified conditional compilation symbol is defined.
   * Used on ValidateResourceId with `[Conditional("DEBUG")]`.
   *
   * @see https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.conditionalattribute
   */
  ConditionalAttribute: {
    kind: "class",
    members: {},
  },
});

/**
 * Alloy library declaration for types in the System.Diagnostics.CodeAnalysis namespace.
 *
 * These are .NET diagnostic attributes used to mark experimental or
 * conditionally-included APIs. Referencing these symbols in Alloy JSX
 * components automatically generates the correct
 * `using System.Diagnostics.CodeAnalysis;` directive.
 *
 * @see https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.codeanalysis
 */
export const SystemDiagnosticsCodeAnalysis = createLibrary(
  "System.Diagnostics.CodeAnalysis",
  {
    /**
     * Marks an API as experimental, generating a compiler diagnostic when used.
     * Applied to JsonPatch fields and properties on dynamic models with diagnostic
     * ID "SCME0001" to indicate the merge-patch API is under evaluation.
     *
     * @example `[Experimental("SCME0001")]`
     *
     * @see https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.codeanalysis.experimentalattribute
     */
    ExperimentalAttribute: {
      kind: "class",
      members: {},
    },
  },
);
