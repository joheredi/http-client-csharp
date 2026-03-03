import { createCSharpNamePolicy } from "@alloy-js/csharp";
import { type Children } from "@alloy-js/core";
import type {
  SdkContext,
  SdkHttpOperation,
} from "@azure-tools/typespec-client-generator-core";
import { type Program } from "@typespec/compiler";
import { Output } from "@typespec/emitter-framework";
import {
  EmitterContext,
  type EmitterContextType,
} from "../contexts/emitter-context.js";
import { getAllClients } from "../utils/clients.js";
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
      namePolicy={createCSharpNamePolicy()}
      tabWidth={4}
      printWidth={120}
    >
      <EmitterContext.Provider value={emitterCtx}>
        {props.children}
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
