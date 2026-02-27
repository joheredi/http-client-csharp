/**
 * Alloy library declarations for System.ClientModel types.
 *
 * These builtins enable generated C# code to reference System.ClientModel
 * types with automatic `using` statement generation. Import the library
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
export {
  SystemClientModel,
  SystemClientModelPrimitives,
} from "./system-client-model.js";
