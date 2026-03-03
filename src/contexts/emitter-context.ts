import {
  type ComponentContext,
  createContext,
  useContext,
} from "@alloy-js/core";
import type {
  SdkHttpOperation,
  SdkPackage,
} from "@azure-tools/typespec-client-generator-core";
import type {
  LicenseOptions,
  ResolvedCSharpEmitterOptions,
} from "../options.js";

/**
 * Carries resolved emitter options and derived state through the component tree.
 *
 * This context eliminates the need to thread `options`, `packageName`, and
 * `sdkPackage` as props through every level of the component hierarchy.
 * Components access it via the {@link useEmitterContext} hook.
 *
 * Derived boolean flags (`needsXmlSerialization`, `hasDynamicModels`,
 * `hasMultipartOperations`) are pre-computed once in the root component so
 * downstream consumers do not need to re-scan the SdkPackage.
 */
export interface EmitterContextType {
  /** Resolved package name for the generated library (e.g. "MyService"). */
  packageName: string;

  /** Resolved emitter options with defaults applied. */
  options: ResolvedCSharpEmitterOptions;

  /** License configuration, if provided by the user. */
  license?: LicenseOptions;

  /** Whether any model in the package uses XML serialization. */
  needsXmlSerialization: boolean;

  /** Whether any model in the package uses the `@dynamicModel` decorator. */
  hasDynamicModels: boolean;

  /** Whether any operation uses multipart/form-data content type. */
  hasMultipartOperations: boolean;

  /** The TCGC SDK package containing all clients, models, and enums. */
  sdkPackage: SdkPackage<SdkHttpOperation>;
}

/**
 * Alloy ComponentContext for the C# HTTP client emitter.
 *
 * Provided by {@link HttpClientCSharpOutput} at the root of the component tree
 * and consumed anywhere below via {@link useEmitterContext}.
 */
export const EmitterContext: ComponentContext<EmitterContextType> =
  createContext<EmitterContextType>();

/**
 * Retrieves the emitter context from the component tree.
 *
 * Must be called inside a component rendered within an
 * {@link HttpClientCSharpOutput} tree. Throws if the context has not been
 * provided (i.e. the component is rendered outside the expected tree).
 *
 * @returns The current {@link EmitterContextType} value.
 * @throws Error if EmitterContext is not available in the component tree.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const ctx = useEmitterContext();
 *   return <Namespace name={ctx.packageName}>...</Namespace>;
 * }
 * ```
 */
export function useEmitterContext(): EmitterContextType {
  const context = useContext(EmitterContext);
  if (!context) {
    throw new Error(
      "EmitterContext is not set. Ensure the component is rendered inside an HttpClientCSharpOutput tree.",
    );
  }
  return context;
}
