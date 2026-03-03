import { createCSharpNamePolicy, type CSharpElements } from "@alloy-js/csharp";
import { createNamePolicy, type Children } from "@alloy-js/core";
import type {
  SdkContext,
  SdkHttpOperation,
} from "@azure-tools/typespec-client-generator-core";
import { type Program } from "@typespec/compiler";
import { Output } from "@typespec/emitter-framework";
import { CustomCodeContext } from "../contexts/custom-code-context.js";
import {
  EmitterContext,
  type EmitterContextType,
} from "../contexts/emitter-context.js";
import { getAllClients } from "../utils/clients.js";
import type { CustomCodeModel } from "../utils/custom-code-model.js";
import type {
  CSharpEmitterOptions,
  ResolvedCSharpEmitterOptions,
} from "../options.js";

/**
 * Props for the root HttpClientCSharpOutput component.
 */
export interface HttpClientCSharpOutputProps {
  /** The TypeSpec compiler program instance. */
  program: Program;
  /** Resolved emitter options with defaults applied. */
  options: ResolvedCSharpEmitterOptions;
  /** TCGC SDK context containing the processed client model (SdkPackage). */
  sdkContext: SdkContext<CSharpEmitterOptions, SdkHttpOperation>;
  /** Resolved package name for the generated library. */
  packageName: string;
  /**
   * Custom code model describing user-written partial classes and their
   * CodeGen attributes. When provided, components use this to filter or
   * rename generated members that conflict with custom code.
   */
  customCode?: CustomCodeModel;
  /** Optional children to render inside the output. */
  children?: Children;
}

/**
 * Root output component for the C# HTTP client emitter.
 *
 * Configures the Alloy rendering context with:
 * - TypeSpec program access via TspContext (provided by emitter-framework Output)
 * - C# name policy: PascalCase for types/public members, camelCase for parameters/variables
 * - Format options: 4-space indentation, 120-character print width
 * - EmitterContext provider exposing options, packageName, sdkPackage, and
 *   derived feature flags to the entire component tree via `useEmitterContext()`
 *
 * All child components rendered inside this tree can use `useTsp()` to access
 * the TypeSpec program, `useCSharpNamePolicy()` for naming conventions, and
 * `useEmitterContext()` for emitter configuration and SDK package data.
 */
export function HttpClientCSharpOutput(props: HttpClientCSharpOutputProps) {
  const emitterCtx: EmitterContextType = {
    packageName: props.packageName,
    options: props.options,
    license: props.options.license,
    needsXmlSerialization: detectXmlSerialization(props.sdkContext),
    hasDynamicModels: false, // Future: detect @dynamicModel decorator usage
    hasMultipartOperations: detectMultipartOperations(props.sdkContext),
    sdkPackage: props.sdkContext.sdkPackage,
  };

  return (
    <Output
      program={props.program}
      namePolicy={createHttpClientNamePolicy()}
      tabWidth={4}
      printWidth={120}
    >
      <EmitterContext.Provider value={emitterCtx}>
        {props.customCode ? (
          <CustomCodeContext.Provider value={props.customCode}>
            {props.children}
          </CustomCodeContext.Provider>
        ) : (
          props.children
        )}
      </EmitterContext.Provider>
    </Output>
  );
}

/**
 * Scans all model properties in the SDK package for XML serialization options.
 *
 * Returns `true` if any property has `serializationOptions.xml` defined,
 * indicating the generated code needs XML serialization support.
 */
function detectXmlSerialization(
  sdkContext: SdkContext<CSharpEmitterOptions, SdkHttpOperation>,
): boolean {
  for (const model of sdkContext.sdkPackage.models) {
    for (const prop of model.properties) {
      if (prop.kind === "property" && prop.serializationOptions?.xml) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Scans all client operations for multipart/form-data content type usage.
 *
 * Returns `true` if any operation has a body parameter whose content type
 * includes `"multipart/form-data"`.
 */
function detectMultipartOperations(
  sdkContext: SdkContext<CSharpEmitterOptions, SdkHttpOperation>,
): boolean {
  const allClients = getAllClients(sdkContext.sdkPackage.clients);
  for (const client of allClients) {
    for (const method of client.methods) {
      if (method.kind === "basic") {
        const httpOp = method.operation;
        if (httpOp.bodyParam?.contentTypes?.includes("multipart/form-data")) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Type-level naming contexts where TCGC may provide already-cased names.
 *
 * TCGC (TypeSpec Client Generator Core) provides type names that are already
 * in the correct C# casing, including proper handling of acronyms like
 * `ISO8601`. The standard `changecase.pascalCase()` breaks these acronyms
 * (e.g., `ISO8601DurationProperty` → `Iso8601DurationProperty`).
 *
 * For type-level contexts, names that already start with an uppercase letter
 * are assumed to be correctly cased by TCGC and are returned as-is. Names
 * starting with a lowercase letter (e.g., method names passed with "class"
 * context for PascalCase conversion) are still transformed normally.
 */
const typeContexts: ReadonlySet<string> = new Set<CSharpElements>([
  "class",
  "struct",
  "enum",
  "interface",
  "record",
]);

/**
 * Creates a C# naming policy that preserves TCGC-provided type names.
 *
 * TCGC provides type names (models, enums, clients, etc.) in the correct
 * C# casing, including acronyms like `ISO8601`. The standard Alloy C# naming
 * policy applies `changecase.pascalCase()` which incorrectly converts
 * `ISO8601DurationProperty` to `Iso8601DurationProperty`.
 *
 * This policy detects names that are already correctly cased (starting with
 * an uppercase letter) in type-level contexts and preserves them. Names
 * starting with a lowercase letter are still transformed to PascalCase,
 * which handles cases like method names being PascalCased for C#.
 */
function createHttpClientNamePolicy() {
  const base = createCSharpNamePolicy();
  return createNamePolicy<CSharpElements>((name, element) => {
    // For type-level contexts, preserve names that are already correctly cased
    // (start with uppercase). TCGC provides type names in correct C# casing.
    // Names starting with lowercase (e.g., method names) still need PascalCase.
    if (typeContexts.has(element) && /^[A-Z]/.test(name)) {
      return name;
    }
    return base.getName(name, element);
  });
}
