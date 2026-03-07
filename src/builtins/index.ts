/**
 * Alloy library declarations for .NET BCL and System.ClientModel types.
 *
 * These builtins enable generated C# code to reference .NET types
 * with automatic `using` statement generation. Import the library
 * objects and use their members as refkeys in JSX components.
 *
 * @example
 * ```tsx
 * import { SystemClientModel, SystemClientModelPrimitives } from "./builtins/index.js";
 *
 * <Property name="Pipeline" type={SystemClientModelPrimitives.ClientPipeline} get />
 * <Property name="Result" type={SystemClientModel.ClientResult} get />
 * ```
 */
export { Azure, AzureCore, AzureCorePipeline } from "./azure.js";
export { System } from "./system.js";
export { SystemComponentModel } from "./system-component-model.js";
export { SystemIO } from "./system-io.js";
export { SystemNet } from "./system-net.js";
export { SystemThreading, SystemThreadingTasks } from "./system-threading.js";
export { SystemText } from "./system-text.js";
export { SystemTextJson } from "./system-text-json.js";
export { SystemTextJsonSerialization } from "./system-text-json-serialization.js";
export { SystemXml } from "./system-xml.js";
export { SystemXmlLinq } from "./system-xml-linq.js";
export {
  SystemClientModel,
  SystemClientModelPrimitives,
} from "./system-client-model.js";
export {
  SystemDiagnostics,
  SystemDiagnosticsCodeAnalysis,
} from "./system-diagnostics.js";
export {
  AzureResourceManager,
  AzureResourceManagerResources,
} from "./azure-arm.js";
